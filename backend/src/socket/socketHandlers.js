const logger = require('../utils/logger');

// Registry: jobId → active ResultFetcherService instance
const fetcherRegistry = new Map();

function registerFetcher(jobId, fetcher) {
      fetcherRegistry.set(String(jobId), fetcher);
}

function unregisterFetcher(jobId) {
      fetcherRegistry.delete(String(jobId));
}

function setupSocketHandlers(io) {
      io.on('connection', (socket) => {
            logger.info(`Socket connected: ${socket.id}`);

            // Join job room to receive live progress updates
            socket.on('join_job', (jobId) => {
                  socket.join(`job_${jobId}`);
                  logger.info(`Socket ${socket.id} joined job_${jobId}`);
                  socket.emit('joined', { jobId, message: 'Joined job room' });
            });

            socket.on('leave_job', (jobId) => {
                  socket.leave(`job_${jobId}`);
            });

            // User completed CAPTCHA manually — tell the fetcher to continue
            socket.on('captcha_resolved', ({ jobId, tabId }) => {
                  logger.info(`CAPTCHA resolved signal for job ${jobId}${tabId ? `, tab ${tabId}` : ''}`);
                  const fetcher = fetcherRegistry.get(String(jobId));
                  if (fetcher) {
                        fetcher.resolveCaptchaWait(tabId || null);
                        io.to(`job_${jobId}`).emit('captcha_resolved_ack', { jobId, tabId, message: 'Continuing after CAPTCHA' });
                  } else {
                        socket.emit('captcha_resolved_ack', { jobId, message: 'No active fetcher found' });
                  }
            });

            socket.on('disconnect', () => {
                  logger.info(`Socket disconnected: ${socket.id}`);
            });

            socket.on('error', (err) => {
                  logger.error(`Socket error ${socket.id}:`, err);
            });
      });
}

module.exports = { setupSocketHandlers, registerFetcher, unregisterFetcher };
