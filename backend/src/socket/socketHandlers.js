const crypto = require('crypto');
const logger = require('../utils/logger');
const FetchJob = require('../models/FetchJob');

const fetcherRegistry = new Map();
const workers = new Map();
const jobWorkers = new Map();
const waitingJobs = [];
const queuedJobIds = new Set();
const finishWaiters = new Map();

const CLIENT_RELAY_EVENTS = new Set([
  'progress', 'log', 'tabs_status', 'captcha_required', 'captcha_status', 'job_completed',
]);

function safeSecretMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function registerFetcher(jobId, fetcher) {
  fetcherRegistry.set(String(jobId), fetcher);
}

function unregisterFetcher(jobId) {
  fetcherRegistry.delete(String(jobId));
}

function removeQueuedJob(jobId) {
  const id = String(jobId);
  if (!queuedJobIds.has(id)) return;
  const index = waitingJobs.findIndex((item) => item.jobId === id);
  if (index >= 0) waitingJobs.splice(index, 1);
  queuedJobIds.delete(id);
}


function waitForWorkerJobFinished(jobId, timeoutMs = 90000) {
  const id = String(jobId);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      finishWaiters.delete(id);
      resolve(false);
    }, timeoutMs);
    finishWaiters.set(id, () => {
      clearTimeout(timer);
      finishWaiters.delete(id);
      resolve(true);
    });
  });
}

function cancelWorkerFinishWait(jobId) {
  const id = String(jobId);
  const resolver = finishWaiters.get(id);
  if (resolver) {
    finishWaiters.delete(id);
    resolver();
  }
}

function queueJobForWorker(jobId, demoMode = false) {
  const id = String(jobId);
  if (jobWorkers.has(id) || queuedJobIds.has(id)) return;
  queuedJobIds.add(id);
  waitingJobs.push({ jobId: id, demoMode: Boolean(demoMode) });
  void dispatchWaitingJobs();
}

async function dispatchWaitingJobs() {
  for (const [workerId, worker] of workers.entries()) {
    if (!worker.connected || worker.data.busy || waitingJobs.length === 0) continue;
    const next = waitingJobs.shift();
    queuedJobIds.delete(next.jobId);
    worker.data.busy = true;
    worker.data.activeJobId = next.jobId;
    jobWorkers.set(next.jobId, workerId);
    try {
      await FetchJob.findByIdAndUpdate(next.jobId, { $set: { assignedWorkerId: workerId } });
      worker.emit('worker_job_assigned', next);
      logger.info(`Assigned job ${next.jobId} to cloud worker ${workerId}`);
    } catch (err) {
      worker.data.busy = false;
      worker.data.activeJobId = null;
      jobWorkers.delete(next.jobId);
      logger.error(`Could not assign job ${next.jobId}: ${err.message}`);
    }
  }
}

function sendWorkerCommand(jobId, command, payload = {}) {
  const id = String(jobId);
  const workerId = jobWorkers.get(id);
  const worker = workerId && workers.get(workerId);
  if (!worker || !worker.connected) {
    if (workerId && !workers.has(workerId)) jobWorkers.delete(id);
    return false;
  }
  worker.emit('worker_control', { jobId: id, command, ...payload });
  return true;
}

async function recoverQueuedJobs() {
  const jobs = await FetchJob.find({ status: 'queued' })
    .select('_id dataSource')
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
  for (const job of jobs) queueJobForWorker(job._id, job.dataSource === 'demo');
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    const auth = socket.handshake.auth || {};
    const isWorker = auth.role === 'worker';

    if (isWorker) {
      if (!safeSecretMatch(auth.workerSecret, process.env.WORKER_SHARED_SECRET)) {
        logger.warn(`Rejected unauthenticated worker socket ${socket.id}`);
        socket.disconnect(true);
        return;
      }

      socket.on('worker_ready', async ({ workerId, activeJobId } = {}) => {
        const id = String(workerId || socket.id);
        const previousSocket = workers.get(id);
        if (previousSocket && previousSocket.id !== socket.id) previousSocket.disconnect(true);
        socket.data.workerId = id;
        socket.data.busy = Boolean(activeJobId);
        socket.data.activeJobId = activeJobId ? String(activeJobId) : null;
        workers.set(id, socket);

        if (activeJobId) {
          removeQueuedJob(activeJobId);
          jobWorkers.set(String(activeJobId), id);
        } else {
          for (const [jobId, assignedWorkerId] of jobWorkers.entries()) {
            if (assignedWorkerId === id) jobWorkers.delete(jobId);
          }
          await recoverQueuedJobs().catch((err) => logger.error(`Queued job recovery failed: ${err.message}`));
        }

        logger.info(`Cloud worker ready: ${id}`);
        await dispatchWaitingJobs();
      });

      socket.on('worker_event', ({ jobId, event, data } = {}) => {
        const id = String(jobId || '');
        if (!id || jobWorkers.get(id) !== socket.data.workerId || !CLIENT_RELAY_EVENTS.has(event)) return;
        io.to(`job_${id}`).emit(event, data || {});
      });

      socket.on('worker_job_finished', async ({ jobId } = {}) => {
        const id = String(jobId || '');
        if (!id || jobWorkers.get(id) !== socket.data.workerId) return;
        jobWorkers.delete(id);
        cancelWorkerFinishWait(id);
        socket.data.busy = false;
        socket.data.activeJobId = null;
        logger.info(`Cloud worker released job ${id}`);
        await dispatchWaitingJobs();
      });

      socket.on('worker_heartbeat', () => socket.emit('worker_heartbeat_ack', { at: Date.now() }));
    } else {
      socket.on('join_job', (jobId) => {
        if (!jobId) return;
        socket.join(`job_${jobId}`);
        logger.info(`Socket ${socket.id} joined job_${jobId}`);
        socket.emit('joined', { jobId, message: 'Joined job room' });
      });
      socket.on('leave_job', (jobId) => {
        if (jobId) socket.leave(`job_${jobId}`);
      });
      socket.on('captcha_resolved', ({ jobId, tabId } = {}) => {
        if (!jobId) return;
        const fetcher = fetcherRegistry.get(String(jobId));
        if (fetcher) {
          fetcher.resolveCaptchaWait(tabId || null);
          io.to(`job_${jobId}`).emit('captcha_resolved_ack', { jobId, tabId, message: 'Continuing after CAPTCHA' });
          return;
        }
        const forwarded = sendWorkerCommand(jobId, 'captcha_resolved', { tabId: tabId || null });
        socket.emit('captcha_resolved_ack', {
          jobId, tabId,
          message: forwarded ? 'Verification signal sent to cloud worker' : 'No active worker found for this job',
        });
      });
    }

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
      if (isWorker && socket.data.workerId && workers.get(socket.data.workerId)?.id === socket.id) {
        workers.delete(socket.data.workerId);
        // Preserve jobWorkers until the worker reconnects and reclaims its in-flight job.
      }
    });
    socket.on('error', (err) => logger.error(`Socket error ${socket.id}:`, err));
  });
}

module.exports = {
  setupSocketHandlers,
  registerFetcher,
  unregisterFetcher,
  queueJobForWorker,
  removeQueuedJob,
  sendWorkerCommand,
  waitForWorkerJobFinished,
  recoverQueuedJobs,
};
