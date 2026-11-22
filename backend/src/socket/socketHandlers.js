const logger = require('../utils/logger');
const FetchJob = require('../models/FetchJob');

const fetcherRegistry = new Map();
const workers = new Map();
const jobWorkers = new Map();
const waitingJobs = [];
const queuedJobIds = new Set();

const CLIENT_RELAY_EVENTS = new Set([
  'progress', 'log', 'tabs_status', 'captcha_required', 'captcha_status',
  'job_completed', 'captcha_resolved_ack',
]);

function registerFetcher(jobId, fetcher) {
  fetcherRegistry.set(String(jobId), fetcher);
}

function unregisterFetcher(jobId) {
  fetcherRegistry.delete(String(jobId));
}

function queueJobForWorker(jobId, demoMode = false) {
  const id = String(jobId);
  if (jobWorkers.has(id) || queuedJobIds.has(id)) return;
  queuedJobIds.add(id);
  waitingJobs.push({ jobId: id, demoMode: Boolean(demoMode) });
  dispatchWaitingJobs();
}

function dispatchWaitingJobs() {
  for (const [workerId, worker] of workers.entries()) {
    if (!worker.connected || worker.data.busy || waitingJobs.length === 0) continue;
    const next = waitingJobs.shift();
    queuedJobIds.delete(next.jobId);
    worker.data.busy = true;
    worker.data.activeJobId = next.jobId;
    jobWorkers.set(next.jobId, workerId);
    worker.emit('worker_job_assigned', next);
    logger.info(`Assigned job ${next.jobId} to cloud worker ${workerId}`);
  }
}

function sendWorkerCommand(jobId, command, payload = {}) {
  const workerId = jobWorkers.get(String(jobId));
  const worker = workerId && workers.get(workerId);
  if (!worker || !worker.connected) return false;
  worker.emit('worker_control', { jobId: String(jobId), command, ...payload });
  return true;
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    const auth = socket.handshake.auth || {};
    const isWorker = auth.role === 'worker';

    if (isWorker) {
      const expected = process.env.WORKER_SHARED_SECRET;
      if (!expected || auth.workerSecret !== expected) {
        logger.warn(`Rejected unauthenticated worker socket ${socket.id}`);
        socket.disconnect(true);
        return;
      }

      socket.on('worker_ready', ({ workerId, activeJobId } = {}) => {
        const id = String(workerId || socket.id);
        socket.data.workerId = id;
        socket.data.busy = Boolean(activeJobId);
        socket.data.activeJobId = activeJobId ? String(activeJobId) : null;
        workers.set(id, socket);
        if (activeJobId) jobWorkers.set(String(activeJobId), id);
        logger.info(`Cloud worker ready: ${id}`);
        dispatchWaitingJobs();
      });

      socket.on('worker_event', ({ jobId, event, data } = {}) => {
        const id = String(jobId || '');
        if (!id || jobWorkers.get(id) !== socket.data.workerId || !CLIENT_RELAY_EVENTS.has(event)) return;
        io.to(`job_${id}`).emit(event, data || {});
      });

      socket.on('worker_job_finished', async ({ jobId } = {}) => {
        const id = String(jobId || '');
        if (jobWorkers.get(id) !== socket.data.workerId) return;
        jobWorkers.delete(id);
        socket.data.busy = false;
        socket.data.activeJobId = null;
        logger.info(`Cloud worker released job ${id}`);
        dispatchWaitingJobs();
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
        logger.info(`CAPTCHA resolved signal for job ${jobId}${tabId ? `, tab ${tabId}` : ''}`);
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
      if (isWorker && socket.data.workerId) {
        const workerId = socket.data.workerId;
        // Keep an active job associated with this worker ID so a reconnect can reclaim it.
        workers.delete(workerId);
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
  sendWorkerCommand,
};
