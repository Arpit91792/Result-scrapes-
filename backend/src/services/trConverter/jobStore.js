const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const logger = require('../../utils/logger');

const JOB_TTL_MS = 60 * 60 * 1000;
const uploadRoot = path.join(os.tmpdir(), 'rgpv-tr-converter');
const jobs = new Map();

if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

function createJob(ownerId, uploadedFile) {
      const id = randomUUID();
      const job = {
            id,
            ownerId: String(ownerId),
            filePath: uploadedFile.path,
            originalName: uploadedFile.originalname,
            fileSize: uploadedFile.size,
            status: 'uploaded',
            progress: { currentPage: 0, totalPages: 0, percentage: 0 },
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
            metadata: {},
            subjects: [],
            students: [],
            summary: null,
            error: null,
      };
      jobs.set(id, job);
      return job;
}

function getOwnedJob(id, ownerId) {
      const job = jobs.get(id);
      if (!job || job.ownerId !== String(ownerId)) return null;
      job.lastActivityAt = Date.now();
      return job;
}

function getOwnedJobs(ownerId) {
      const owner = String(ownerId);
      return [...jobs.values()]
            .filter(job => job.ownerId === owner)
            .sort((a, b) => b.createdAt - a.createdAt);
}

function hasActiveConversion(exceptId) {
      return [...jobs.values()].some(job => job.id !== exceptId && job.status === 'processing');
}

async function deleteJob(job) {
      if (!job) return;
      jobs.delete(job.id);
      if (!job.filePath) return;
      try {
            await fs.promises.rm(path.dirname(job.filePath), { recursive: true, force: true });
      } catch (error) {
            if (error.code !== 'ENOENT') throw error;
      }
}

async function cleanupJobFiles(job) {
      if (!job?.filePath) return;
      const directory = path.dirname(job.filePath);
      await fs.promises.rm(directory, { recursive: true, force: true });
      job.filePath = null;
}

const cleanupTimer = setInterval(() => {
      const expiredBefore = Date.now() - JOB_TTL_MS;
      for (const job of jobs.values()) {
            if (job.status !== 'processing' && job.lastActivityAt < expiredBefore) {
                  deleteJob(job).catch(error => logger.error('TR Converter temp cleanup failed:', error));
            }
      }
      const activeDirectories = new Set([...jobs.values()]
            .filter(job => job.filePath)
            .map(job => path.dirname(job.filePath)));
      fs.promises.readdir(uploadRoot, { withFileTypes: true })
            .then(entries => Promise.all(entries
                  .filter(entry => entry.isDirectory())
                  .map(async entry => {
                        const directory = path.join(uploadRoot, entry.name);
                        if (activeDirectories.has(directory)) return;
                        const stats = await fs.promises.stat(directory);
                        if (stats.mtimeMs < expiredBefore) {
                              await fs.promises.rm(directory, { recursive: true, force: true });
                        }
                  })))
            .catch(error => logger.error('TR Converter orphan cleanup failed:', error));
}, 10 * 60 * 1000);
cleanupTimer.unref();

module.exports = {
      uploadRoot,
      createJob,
      getOwnedJob,
      getOwnedJobs,
      hasActiveConversion,
      deleteJob,
      cleanupJobFiles,
};
