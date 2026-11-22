const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { authenticate } = require('../middleware/auth');
const { uploadRoot } = require('../services/trConverter/jobStore');
const controller = require('../services/trConverter/controller');

const router = express.Router();
const upload = multer({
      storage: multer.diskStorage({
            destination: (req, file, callback) => {
                  const directory = path.join(uploadRoot, randomUUID());
                  fs.mkdir(directory, { recursive: true }, error => callback(error, directory));
            },
            filename: (req, file, callback) => callback(null, 'input.pdf'),
      }),
      limits: { fileSize: 100 * 1024 * 1024, files: 1 },
      fileFilter: (req, file, callback) => {
            const extension = path.extname(file.originalname).toLowerCase();
            if (extension !== '.pdf' || (file.mimetype !== 'application/pdf' && file.mimetype !== 'application/octet-stream')) {
                  return callback(new Error('Upload a PDF file.'));
            }
            return callback(null, true);
      },
});

router.post('/upload', authenticate, (req, res, next) => {
      upload.single('file')(req, res, error => {
            if (error) {
                  return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
                        .json({ error: error.message || 'PDF upload failed.' });
            }
            return controller.upload(req, res, next);
      });
});
router.get('/jobs', authenticate, controller.getJobs);
router.post('/:jobId/process', authenticate, controller.startProcessing);
router.get('/:jobId/status', authenticate, controller.getStatus);
router.get('/:jobId/preview', authenticate, controller.getPreview);
router.post('/:jobId/export', authenticate, controller.exportWorkbook);
router.delete('/:jobId', authenticate, controller.cancelJob);

module.exports = router;
