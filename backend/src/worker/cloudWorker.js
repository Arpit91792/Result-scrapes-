require('dotenv').config();
const os = require('os');
const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const JobProcessor = require('../services/jobProcessor');
const FetchJob = require('../models/FetchJob');
const logger = require('../utils/logger');

const backendUrl = process.env.BACKEND_URL;
const workerSecret = process.env.WORKER_SHARED_SECRET;
const workerId = process.env.WORKER_ID || os.hostname();

if (!backendUrl || !workerSecret || !process.env.MONGODB_URI) {
  throw new Error('BACKEND_URL, WORKER_SHARED_SECRET and MONGODB_URI are required for the cloud worker');
}

const socket = io(backendUrl, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  auth: { role: 'worker', workerSecret, workerId },
});

let processor;
let activeJobId = null;
let monitorTimer = null;

const ioAdapter = {
  to(room) {
    return {
      emit(event, data) {
        const jobId = String(room).startsWith('job_') ? String(room).slice(4) : '';
        if (jobId) socket.emit('worker_event', { jobId, event, data });
      },
    };
  },
};

async function monitorJob(jobId) {
  clearInterval(monitorTimer);
  monitorTimer = setInterval(async () => {
    try {
      const job = await FetchJob.findById(jobId).select('status');
      if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) {
        clearInterval(monitorTimer);
        monitorTimer = null;
        activeJobId = null;
        socket.emit('worker_job_finished', { jobId });
      }
    } catch (err) {
      logger.warn(`Worker monitor failed for job ${jobId}: ${err.message}`);
    }
  }, 2500);
}

socket.on('connect', () => {
  logger.info(`Connected to API as cloud worker ${workerId}`);
  socket.emit('worker_ready', { workerId, activeJobId });
});

socket.on('worker_job_assigned', async ({ jobId, demoMode } = {}) => {
  if (!jobId || activeJobId) return;
  activeJobId = String(jobId);
  processor = new JobProcessor(ioAdapter);
  try {
    await processor.startJob(activeJobId, Boolean(demoMode));
    await monitorJob(activeJobId);
  } catch (err) {
    logger.error(`Could not start cloud job ${activeJobId}: ${err.message}`);
    await FetchJob.findByIdAndUpdate(activeJobId, { $set: { status: 'failed', errorMessage: err.message } }).catch(() => {});
    activeJobId = null;
    socket.emit('worker_job_finished', { jobId: String(jobId) });
  }
});

socket.on('worker_control', async ({ jobId, command, tabId } = {}) => {
  if (!jobId || String(jobId) !== activeJobId || !processor) return;
  try {
    if (command === 'pause') await processor.pauseJob(jobId);
    else if (command === 'resume') await processor.resumeJob(jobId);
    else if (command === 'cancel') await processor.cancelJob(jobId);
    else if (command === 'captcha_resolved') {
      const fetcher = processor.getActiveFetcher(jobId);
      if (fetcher) fetcher.resolveCaptchaWait(tabId || null);
    }
  } catch (err) {
    logger.error(`Worker control ${command} failed for ${jobId}: ${err.message}`);
  }
});

socket.on('disconnect', () => logger.warn('Cloud worker disconnected from API; Socket.IO will reconnect'));
socket.on('connect_error', (err) => logger.error(`Worker connection error: ${err.message}`));

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  logger.info('Cloud worker connected to MongoDB Atlas');
}
start().catch((err) => {
  logger.error(`Cloud worker startup failed: ${err.message}`);
  process.exit(1);
});

async function shutdown() {
  clearInterval(monitorTimer);
  socket.disconnect();
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
