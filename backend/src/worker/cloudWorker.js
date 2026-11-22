require('dotenv').config();

const os = require('os');
const fs = require('fs');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const MAX_CONFIGURED_TABS = Math.max(1, parseInt(process.env.MAX_PARALLEL_TABS || '100', 10));

function readCgroupMemoryLimit() {
  const candidates = ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes'];
  for (const file of candidates) {
    try {
      const value = fs.readFileSync(file, 'utf8').trim();
      if (value === 'max') continue;
      const bytes = Number(value);
      if (Number.isFinite(bytes) && bytes > 0 && bytes < 1e15) return bytes;
    } catch { /* Try the next cgroup location. */ }
  }
  return os.totalmem();
}

function calculateAdaptiveTabs() {
  if (process.env.DEVICE_EXECUTION_POLICY === 'fixed') return MAX_CONFIGURED_TABS;
  const memoryLimit = readCgroupMemoryLimit();
  const cpuCount = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const reserveBytes = 1024 * MiB;
  const estimatedBytesPerTab = 96 * MiB;
  const memoryCapacity = Math.max(1, Math.floor((memoryLimit - reserveBytes) / estimatedBytesPerTab));
  const cpuCapacity = Math.max(1, cpuCount * 8);
  return Math.max(1, Math.min(MAX_CONFIGURED_TABS, memoryCapacity, cpuCapacity));
}

const adaptiveTabs = calculateAdaptiveTabs();
process.env.MAX_PARALLEL_TABS = String(adaptiveTabs);

const { io: createSocket } = require('socket.io-client');
const FetchJob = require('../models/FetchJob');
const JobProcessor = require('../services/jobProcessor');

const backendUrl = process.env.BACKEND_URL;
const workerSecret = process.env.WORKER_SHARED_SECRET;
const workerId = process.env.WORKER_ID || os.hostname();

if (!backendUrl || !workerSecret || !process.env.MONGODB_URI) {
  throw new Error('BACKEND_URL, WORKER_SHARED_SECRET and MONGODB_URI are required for the cloud worker');
}

let socket = null;
let processor = null;
let activeJobId = null;
let monitorTimer = null;
let heartbeatTimer = null;

const ioAdapter = {
  to(room) {
    return {
      emit(event, data) {
        const value = String(room);
        if (!value.startsWith('job_')) return;
        socket?.emit('worker_event', { jobId: value.slice(4), event, data });
      },
    };
  },
};

async function markInterruptedWorkerJobsForRequeue() {
  const interrupted = await FetchJob.find({ status: 'running', assignedWorkerId: workerId })
    .select('_id').lean();
  for (const item of interrupted) {
    await FetchJob.findByIdAndUpdate(item._id, {
      $set: {
        status: 'queued',
        errorMessage: 'Cloud worker restarted. Job re-queued to resume unfinished students.',
      },
      $unset: { assignedWorkerId: 1 },
    });
  }
  if (interrupted.length) logger.warn(`Re-queued ${interrupted.length} interrupted job(s)`);
}

async function releaseWorker(jobId) {
  clearInterval(monitorTimer);
  monitorTimer = null;
  activeJobId = null;
  socket?.emit('worker_job_finished', { jobId: String(jobId) });
}

async function monitorJob(jobId) {
  clearInterval(monitorTimer);
  monitorTimer = setInterval(async () => {
    try {
      const job = await FetchJob.findById(jobId).select('status');
      if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) await releaseWorker(jobId);
    } catch (err) {
      logger.warn(`Worker monitor failed for job ${jobId}: ${err.message}`);
    }
  }, 2500);
}

function attachSocketHandlers() {
  socket.on('connect', () => {
    logger.info(`Connected as cloud worker ${workerId}; adaptive tabs: ${adaptiveTabs}`);
    socket.emit('worker_ready', { workerId, activeJobId });
  });

  socket.on('worker_job_assigned', async ({ jobId, demoMode } = {}) => {
    if (!jobId || activeJobId) return;
    activeJobId = String(jobId);
    processor = new JobProcessor(ioAdapter);
    try {
      const job = await FetchJob.findById(activeJobId);
      if (!job || job.status !== 'queued') throw new Error('Assigned job is no longer queued');
      job.status = 'running';
      job.errorMessage = null;
      job.assignedWorkerId = workerId;
      await job.save();
      await processor.startJob(activeJobId, Boolean(demoMode));
      await monitorJob(activeJobId);
    } catch (err) {
      logger.error(`Could not start cloud job ${activeJobId}: ${err.message}`);
      await FetchJob.findByIdAndUpdate(activeJobId, {
        $set: { status: 'failed', errorMessage: err.message },
      }).catch(() => {});
      await releaseWorker(activeJobId);
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

  socket.on('disconnect', () => logger.warn('Cloud worker disconnected; Socket.IO will reconnect'));
  socket.on('connect_error', (err) => logger.error(`Worker connection error: ${err.message}`));
}

async function start() {
  await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 10 });
  await markInterruptedWorkerJobsForRequeue();
  socket = createSocket(backendUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    auth: { role: 'worker', workerSecret, workerId },
  });
  attachSocketHandlers();
  heartbeatTimer = setInterval(() => {
    if (socket?.connected) socket.emit('worker_heartbeat');
  }, 10000);
  logger.info(`Cloud worker started. RAM limit: ${(readCgroupMemoryLimit() / GiB).toFixed(2)} GiB; CPUs: ${os.cpus().length}; tabs: ${adaptiveTabs}/${MAX_CONFIGURED_TABS}`);
}

async function shutdown() {
  clearInterval(monitorTimer);
  clearInterval(heartbeatTimer);
  socket?.disconnect();
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
start().catch((err) => {
  logger.error(`Cloud worker startup failed: ${err.message}`);
  process.exit(1);
});
