const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, param, query, validationResult } = require('express-validator');
const xlsx = require('xlsx');

const { authenticate } = require('../middleware/auth');
const FetchJob = require('../models/FetchJob');
const StudentResult = require('../models/StudentResult');
const DownloadHistory = require('../models/DownloadHistory');
const { generateEnrollments, deduplicateEnrollments, validateEnrollment } = require('../utils/enrollmentGenerator');
const { generateExcelReport, generateFilteredExcel, generateExcelFile } = require('../services/excelExporter');
const { generateStudentPDF, generateZipArchive } = require('../services/pdfExporter');
const JobProcessor = require('../services/jobProcessor');
const logger = require('../utils/logger');

const router = express.Router();

// Job processors keyed by io instance (singleton per server)
let jobProcessor = null;

function getJobProcessor(req) {
      if (!jobProcessor) {
            jobProcessor = new JobProcessor(req.app.get('io'));
      }
      return jobProcessor;
}

// File upload for enrollment CSV/Excel
const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
            const allowed = ['.csv', '.xlsx', '.xls'];
            const ext = path.extname(file.originalname).toLowerCase();
            if (allowed.includes(ext)) cb(null, true);
            else cb(new Error('Only CSV and Excel files are allowed'));
      },
});

const exportsDir = path.join(__dirname, '../../exports');

// ─── Generate Enrollments ─────────────────────────────────────────────────────
router.post('/generate-enrollments', authenticate, [
      body('startingEnrollment').trim().notEmpty().withMessage('Starting enrollment required'),
      body('endingEnrollment').trim().notEmpty().withMessage('Ending enrollment required'),
], (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { startingEnrollment, endingEnrollment } = req.body;
      const result = generateEnrollments(startingEnrollment, endingEnrollment);

      if (!result.success) {
            return res.status(400).json({ errors: result.errors });
      }

      res.json(result);
});

// ─── Upload Enrollments from CSV/Excel ────────────────────────────────────────
router.post('/upload-enrollments', authenticate, upload.single('file'), (req, res) => {
      try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

            const enrollments = [];
            const invalid = [];

            rows.forEach((row, rowIndex) => {
                  row.forEach((cell) => {
                        const val = String(cell || '').trim().toUpperCase();
                        if (!val) return;
                        if (validateEnrollment(val)) {
                              enrollments.push(val);
                        } else {
                              invalid.push({ row: rowIndex + 1, value: val });
                        }
                  });
            });

            const { unique, duplicates, duplicateCount } = deduplicateEnrollments(enrollments);

            res.json({
                  success: true,
                  enrollments: unique,
                  total: unique.length,
                  duplicateCount,
                  invalidCount: invalid.length,
                  invalid: invalid.slice(0, 20),
            });
      } catch (err) {
            logger.error('Upload error:', err);
            res.status(500).json({ error: 'Failed to parse file' });
      }
});

// ─── Start Fetch Job ──────────────────────────────────────────────────────────
router.post('/start-fetch', authenticate, [
      body('collegeCode').trim().notEmpty(),
      body('course').trim().notEmpty(),
      body('branch').trim().notEmpty(),
      body('semester').isInt({ min: 1, max: 8 }),
      body('examinationYear').trim().notEmpty(),
      body('examinationSession').isIn(['June', 'November']),
      body('startingEnrollment').trim().notEmpty(),
      body('endingEnrollment').trim().notEmpty(),
      body('demoMode').optional().isBoolean(),
], async (req, res, next) => {
      try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

            const {
                  collegeCode, collegeName, university, course, branch, semester,
                  examinationYear, examinationSession, resultType, resultMode,
                  enrollmentPrefix, startingEnrollment, endingEnrollment,
                  customEnrollments, demoMode,
            } = req.body;

            // Generate or use custom enrollment list
            let enrollments;
            if (customEnrollments && Array.isArray(customEnrollments) && customEnrollments.length > 0) {
                  const { unique } = deduplicateEnrollments(customEnrollments);
                  enrollments = unique;
            } else {
                  const genResult = generateEnrollments(startingEnrollment, endingEnrollment);
                  if (!genResult.success) {
                        return res.status(400).json({ errors: genResult.errors });
                  }
                  enrollments = genResult.enrollments;
            }

            const job = new FetchJob({
                  userId: req.user._id,
                  collegeCode,
                  collegeName,
                  university: university || 'RGPV',
                  course,
                  branch,
                  semester: parseInt(semester),
                  examinationYear,
                  examinationSession,
                  resultType: resultType || 'Main',
                  resultMode: resultMode || 'Grading',
                  enrollmentPrefix,
                  startingEnrollment,
                  endingEnrollment,
                  enrollmentList: enrollments,
                  totalStudents: enrollments.length,
                  pendingCount: enrollments.length,
                  dataSource: demoMode ? 'demo' : 'sourceB',
            });

            await job.save();

            // Pre-create pending result records
            const bulkOps = enrollments.map((en) => ({
                  updateOne: {
                        filter: { jobId: job._id, enrollmentNumber: en },
                        update: {
                              $setOnInsert: {
                                    jobId: job._id,
                                    enrollmentNumber: en,
                                    collegeCode,
                                    branch,
                                    semester: parseInt(semester),
                                    examinationYear,
                                    examinationSession,
                                    resultStatus: 'PENDING',
                                    fetchStatus: 'pending',
                                    source: demoMode ? 'demo' : 'sourceB',
                              },
                        },
                        upsert: true,
                  },
            }));

            await StudentResult.bulkWrite(bulkOps);

            // Start processor
            await getJobProcessor(req).startJob(job._id, Boolean(demoMode));

            res.status(201).json({ job, message: 'Fetch job started' });
      } catch (err) {
            next(err);
      }
});

// ─── Get Job Status ───────────────────────────────────────────────────────────
router.get('/job/:jobId', authenticate, async (req, res, next) => {
      try {
            const job = await FetchJob.findOne({ _id: req.params.jobId, userId: req.user._id });
            if (!job) return res.status(404).json({ error: 'Job not found' });
            res.json({ job });
      } catch (err) {
            next(err);
      }
});

// ─── Pause Job ────────────────────────────────────────────────────────────────
router.post('/job/:jobId/pause', authenticate, async (req, res, next) => {
      try {
            const job = await FetchJob.findOne({ _id: req.params.jobId, userId: req.user._id });
            if (!job) return res.status(404).json({ error: 'Job not found' });

            await getJobProcessor(req).pauseJob(req.params.jobId);
            res.json({ message: 'Job paused' });
      } catch (err) {
            next(err);
      }
});

// ─── Resume Job ───────────────────────────────────────────────────────────────
router.post('/job/:jobId/resume', authenticate, async (req, res, next) => {
      try {
            const job = await FetchJob.findOne({ _id: req.params.jobId, userId: req.user._id });
            if (!job) return res.status(404).json({ error: 'Job not found' });

            await getJobProcessor(req).resumeJob(req.params.jobId);
            res.json({ message: 'Job resumed' });
      } catch (err) {
            next(err);
      }
});

// ─── Cancel Job ───────────────────────────────────────────────────────────────
router.post('/job/:jobId/cancel', authenticate, async (req, res, next) => {
      try {
            const job = await FetchJob.findOne({ _id: req.params.jobId, userId: req.user._id });
            if (!job) return res.status(404).json({ error: 'Job not found' });

            await getJobProcessor(req).cancelJob(req.params.jobId);
            res.json({ message: 'Job cancelled' });
      } catch (err) {
            next(err);
      }
});

// ─── Get Job Students ─────────────────────────────────────────────────────────
router.get('/job/:jobId/students', authenticate, async (req, res, next) => {
      try {
            const job = await FetchJob.findOne({ _id: req.params.jobId, userId: req.user._id });
            if (!job) return res.status(404).json({ error: 'Job not found' });

            const { status, branch, search, page = 1, limit = 50, sortBy = 'enrollmentNumber', sortOrder = 'asc' } = req.query;

            const filter = { jobId: req.params.jobId };
            if (status) filter.resultStatus = status;
            if (branch) filter.branch = branch;
            if (search) {
                  filter.$or = [
                        { enrollmentNumber: { $regex: search, $options: 'i' } },
                        { studentName: { $regex: search, $options: 'i' } },
                  ];
            }

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const total = await StudentResult.countDocuments(filter);
            const students = await StudentResult.find(filter)
                  .sort(sort)
                  .skip((parseInt(page) - 1) * parseInt(limit))
                  .limit(parseInt(limit));

            res.json({ students, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
      } catch (err) {
            next(err);
      }
});

// ─── Get Single Student ───────────────────────────────────────────────────────
router.get('/student/:id', authenticate, async (req, res, next) => {
      try {
            const student = await StudentResult.findById(req.params.id).populate('jobId', 'userId');
            if (!student) return res.status(404).json({ error: 'Student not found' });

            if (String(student.jobId.userId) !== String(req.user._id) && req.user.role !== 'admin') {
                  return res.status(403).json({ error: 'Access denied' });
            }

            res.json({ student });
      } catch (err) {
            next(err);
      }
});

// ─── Export Excel ─────────────────────────────────────────────────────────────
router.get('/export/:jobId/excel', authenticate, async (req, res, next) => {
      try {
            const job = await FetchJob.findOne({ _id: req.params.jobId, userId: req.user._id });
            if (!job) return res.status(404).json({ error: 'Job not found' });

            const filter = req.query.filter || 'all'; // 'all' | 'passed' | 'failed'
            const students = await StudentResult.find({ jobId: req.params.jobId });

            const result = await generateExcelFile(job, students, filter, exportsDir);

            await DownloadHistory.create({
                  userId: req.user._id,
                  jobId: job._id,
                  fileName: result.fileName,
                  fileType: 'excel',
                  filePath: result.filePath,
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);

            res.download(result.filePath, result.fileName, (err) => {
                  if (err && !res.headersSent) logger.error('Download error:', err);
            });
      } catch (err) {
            next(err);
      }
});

// ─── Export PDF ───────────────────────────────────────────────────────────────
router.get('/export/:jobId/pdf/:studentId', authenticate, async (req, res, next) => {
      try {
            const student = await StudentResult.findById(req.params.studentId).populate('jobId');
            if (!student) return res.status(404).json({ error: 'Student not found' });

            if (student.jobId && String(student.jobId.userId) !== String(req.user._id) && req.user.role !== 'admin') {
                  return res.status(403).json({ error: 'Access denied' });
            }

            if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

            const safeName = (student.studentName || 'Student').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_').replace(/_+/g, '_');
            const fileName = `${student.enrollmentNumber}_${safeName}_Result.pdf`;
            const diskFileName = `${student.enrollmentNumber}_${Date.now()}.pdf`;
            const filePath = path.join(exportsDir, diskFileName);

            await generateStudentPDF(student.toObject(), filePath, student.jobId ? student.jobId.toObject() : null);

            await DownloadHistory.create({
                  userId: req.user._id,
                  jobId: student.jobId ? student.jobId._id : req.params.jobId,
                  fileName: fileName,
                  fileType: 'pdf',
                  filePath: filePath,
            });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

            res.download(filePath, fileName, (err) => {
                  if (err && !res.headersSent) logger.error('Download error:', err);
            });
      } catch (err) {
            next(err);
      }
});

// ─── Export ZIP ───────────────────────────────────────────────────────────────
router.get('/export/:jobId/zip', authenticate, async (req, res, next) => {
      try {
            const job = await FetchJob.findOne({ _id: req.params.jobId, userId: req.user._id });
            if (!job) return res.status(404).json({ error: 'Job not found' });

            const students = await StudentResult.find({ jobId: req.params.jobId, fetchStatus: 'completed' });

            if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

            const pdfPaths = [];
            for (const student of students.slice(0, 50)) { // limit to 50 PDFs per ZIP
                  const fileName = `result_${student.enrollmentNumber}.pdf`;
                  const filePath = path.join(exportsDir, fileName);
                  await generateStudentPDF(student.toObject(), filePath);
                  pdfPaths.push(filePath);
            }

            const zipName = `RGPV_Results_${job.collegeCode}_${Date.now()}.zip`;
            const zipPath = path.join(exportsDir, zipName);
            await generateZipArchive(pdfPaths, zipPath);

            res.download(zipPath, zipName);
      } catch (err) {
            next(err);
      }
});

// ─── Get All Jobs for User ────────────────────────────────────────────────────
router.get('/jobs', authenticate, async (req, res, next) => {
      try {
            const jobs = await FetchJob.find({ userId: req.user._id })
                  .sort({ createdAt: -1 })
                  .limit(20);
            res.json({ jobs });
      } catch (err) {
            next(err);
      }
});

// ─── Download History ─────────────────────────────────────────────────────────
router.get('/download-history', authenticate, async (req, res, next) => {
      try {
            const history = await DownloadHistory.find({ userId: req.user._id })
                  .sort({ createdAt: -1 })
                  .limit(50)
                  .populate('jobId', 'collegeCode branch semester examinationSession examinationYear');
            res.json({ history });
      } catch (err) {
            next(err);
      }
});

module.exports = router;
