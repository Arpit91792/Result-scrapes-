const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const {
      uploadRoot,
      createJob,
      getOwnedJob,
      getOwnedJobs,
      hasActiveConversion,
      deleteJob,
      cleanupJobFiles,
} = require('./jobStore');
const { extractPdfPages } = require('./pdfExtractor');
const { parseHeader, mergeMetadata } = require('./headerParser');
const { buildSubjectColumns, buildSubjectColumnsFromCodes } = require('./subjectMapper');
const { createStudentParser } = require('./studentParser');
const { generateWorkbook } = require('./excelGenerator');

function publicJob(job) {
      return {
            jobId: job.id,
            fileName: job.originalName,
            fileSize: job.fileSize,
            createdAt: new Date(job.createdAt).toISOString(),
            status: job.status,
            progress: job.progress,
            metadata: job.metadata,
            error: job.error,
            summary: job.summary,
      };
}

async function upload(req, res, next) {
      if (!req.file) return res.status(400).json({ error: 'Select a PDF file to upload.' });
      let handle;
      try {
            handle = await fs.promises.open(req.file.path, 'r');
            const header = Buffer.alloc(5);
            await handle.read(header, 0, 5, 0);
            await handle.close();
            handle = null;
            if (header.toString('ascii') !== '%PDF-') {
                  await fs.promises.rm(path.dirname(req.file.path), { recursive: true, force: true });
                  return res.status(400).json({ error: 'The uploaded file is not a valid PDF.' });
            }
            const job = createJob(req.user._id, req.file);
            return res.status(201).json(publicJob(job));
      } catch (error) {
            if (handle) await handle.close();
            logger.error('TR Converter upload validation failed:', error);
            return next(error);
      }
}

async function processJob(job) {
      const parser = createStudentParser();
      const pageErrors = [];
      job.status = 'processing';
      try {
            const result = await extractPdfPages(job.filePath, async page => {
                  if (page.error) {
                        pageErrors.push({ page: page.pageNumber, message: page.error });
                  } else {
                        const pageMetadata = parseHeader(page.text);
                        mergeMetadata(job.metadata, pageMetadata);
                        parser.parsePage(page.text, page.pageNumber, page.usedOcr ? page.confidence : 100);
                  }
                  job.progress = {
                        currentPage: page.pageNumber,
                        totalPages: page.pageCount,
                        percentage: Math.round((page.pageNumber / page.pageCount) * 100),
                        pagesProcessed: page.pageNumber - pageErrors.length,
                        pagesFailed: pageErrors.length,
                  };
            });

            if (!result.processedPages) throw new Error('No PDF pages could be processed.');

            // Build master catalog lookup map
            const masterCatalog = new Map();
            for (const s of (job.metadata.subjects || [])) {
                  if (s && s.code && s.name) masterCatalog.set(s.code, s.name);
            }

            // Get groups where students have the exact same subject combination
            const rawGroups = parser.getGroupedStudents();
            job.sheetGroups = rawGroups.map((g, idx) => {
                  const sheetName = `Sheet${idx + 1}`;
                  const subjects = buildSubjectColumnsFromCodes(g.subjectCodes, masterCatalog);
                  return {
                        sheetName,
                        signature: g.signature,
                        subjectCodes: g.subjectCodes,
                        subjects,
                        students: g.students,
                  };
            });

            job.students = parser.getStudents();
            job.subjects = job.sheetGroups[0]?.subjects || buildSubjectColumns(job.metadata.subjects || []);

            const duplicateEnrollmentNumbers = parser.duplicateEnrollmentCount;
            const validStudentRecords = job.students.filter(student =>
                  Boolean(student.enrollmentNumber && student.name)
            ).length;

            job.summary = {
                  totalPages: result.pageCount,
                  pagesProcessed: result.processedPages,
                  pagesFailed: result.failedPages,
                  totalStudents: job.students.length,
                  worksheetsCount: job.sheetGroups.length,
                  sheets: job.sheetGroups.map(g => ({
                        name: g.sheetName,
                        studentCount: g.students.length,
                        subjectCodes: g.subjectCodes,
                  })),
                  validStudentRecords,
                  duplicateEnrollmentNumbers,
                  pageErrors,
            };
            job.status = 'completed';
      } catch (error) {
            job.status = 'failed';
            job.error = error.message;
            logger.error(`TR Converter job ${job.id} failed:`, error);
      }
}

function startProcessing(req, res) {
      const job = getOwnedJob(req.params.jobId, req.user._id);
      if (!job) return res.status(404).json({ error: 'Conversion job not found or expired.' });
      if (job.status !== 'uploaded') {
            return res.status(409).json({ error: 'This conversion job has already been started.' });
      }
      if (hasActiveConversion(job.id)) {
            return res.status(409).json({ error: 'Another TR conversion is already processing. Try again when it finishes.' });
      }
      processJob(job);
      return res.status(202).json(publicJob(job));
}

function getStatus(req, res) {
      const job = getOwnedJob(req.params.jobId, req.user._id);
      if (!job) return res.status(404).json({ error: 'Conversion job not found or expired.' });
      return res.json(publicJob(job));
}

function getJobs(req, res) {
      const jobs = getOwnedJobs(req.user._id).map(publicJob);
      return res.json({ jobs });
}

function getPreview(req, res) {
      const job = getOwnedJob(req.params.jobId, req.user._id);
      if (!job) return res.status(404).json({ error: 'Conversion job not found or expired.' });
      if (!['completed', 'exported'].includes(job.status)) {
            return res.status(409).json({ error: 'Preview is available after processing completes.' });
      }

      // Check requested sheet tab, default to Sheet1
      const reqSheet = (req.query.sheet || 'Sheet1').trim();
      const currentGroup = (job.sheetGroups || []).find(g => g.sheetName.toLowerCase() === reqSheet.toLowerCase())
            || job.sheetGroups?.[0]
            || { sheetName: 'Sheet1', students: job.students, subjects: job.subjects };

      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
      const start = (page - 1) * limit;

      const groupStudents = currentGroup.students || [];

      return res.json({
            summary: job.summary,
            metadata: job.metadata,
            sheetName: currentGroup.sheetName,
            sheets: (job.sheetGroups || []).map(g => ({
                  name: g.sheetName,
                  studentCount: g.students.length,
                  subjectCodes: g.subjectCodes,
            })),
            subjects: currentGroup.subjects || job.subjects,
            records: groupStudents.slice(start, start + limit),
            totalInSheet: groupStudents.length,
            page,
            limit,
            totalPages: Math.ceil(groupStudents.length / limit) || 1,
      });
}

async function exportWorkbook(req, res, next) {
      const job = getOwnedJob(req.params.jobId, req.user._id);
      if (!job) return res.status(404).json({ error: 'Conversion job not found or expired.' });
      if (!['completed', 'exported'].includes(job.status)) {
            return res.status(409).json({ error: 'Excel export is available after processing completes.' });
      }
      if (!job.students || !job.students.length) {
            return res.status(422).json({ error: 'No student records were extracted from this PDF.' });
      }

      try {
            // Keep the generated excel file in the job directory so repeat downloads work smoothly
            const outputDir = job.filePath ? path.dirname(job.filePath) : path.join(path.dirname(job.originalName || ''), job.id);
            const outputPath = job.excelPath || path.join(job.filePath ? path.dirname(job.filePath) : uploadRoot, `RGPV_TR_Converted_${job.id}.xlsx`);

            // If not already generated on disk, generate it now
            if (!job.excelPath || !fs.existsSync(outputPath)) {
                  await generateWorkbook(job, outputPath);
                  job.excelPath = outputPath;
            }

            return res.download(outputPath, 'RGPV_TR_Converted.xlsx', async error => {
                  if (error) {
                        if (!res.headersSent) next(error);
                        return;
                  }
                  job.status = 'exported';
                  job.lastActivityAt = Date.now();
            });
      } catch (error) {
            next(error);
      }
}

async function cancelJob(req, res, next) {
      const job = getOwnedJob(req.params.jobId, req.user._id);
      if (!job) return res.status(404).json({ error: 'Conversion job not found or expired.' });
      if (job.status === 'processing') {
            return res.status(409).json({ error: 'Processing has started and cannot be cancelled from this screen.' });
      }
      try {
            await deleteJob(job);
            return res.json({ success: true });
      } catch (error) {
            next(error);
      }
}

module.exports = {
      upload,
      startProcessing,
      getJobs,
      getStatus,
      getPreview,
      exportWorkbook,
      cancelJob,
};
