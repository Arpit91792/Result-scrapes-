/**
 * Job Processor - Fixed counter logic
 *
 * Counter invariants:
 *   totalStudents  = enrollmentList.length  (set once at job creation, never changed here)
 *   completedCount = number of enrollments fully processed this run
 *   pendingCount   = totalStudents - completedCount  (always)
 *
 * Rules:
 *   - On resume, seed completedCount from already-finished DB records so we
 *     don't double-count them.
 *   - Each enrollment is processed EXACTLY ONCE per run.
 *   - completedCount increments by 1 after processing (success, error, missing).
 *   - completedCount NEVER increments when skipping already-completed records
 *     (they were counted in a previous run and seeded at startup).
 *   - completedCount is capped at totalStudents via Math.min.
 */

const FetchJob = require('../models/FetchJob');
const StudentResult = require('../models/StudentResult');
const ResultFetcherService = require('./resultFetcher');
const { registerFetcher, unregisterFetcher } = require('../socket/socketHandlers');
const logger = require('../utils/logger');

// In-memory: jobId (string) → active ResultFetcherService
const activeJobs = new Map();

class JobProcessor {
      constructor(io) { this.io = io; }

      emitProgress(jobId, job, extra = {}) {
            const pct = job.totalStudents > 0
                  ? Math.min(100, Math.round((job.completedCount / job.totalStudents) * 100))
                  : 0;
            this.io.to(`job_${jobId}`).emit('progress', {
                  jobId,
                  status: job.status,
                  totalStudents: job.totalStudents,
                  completedCount: Math.min(job.completedCount, job.totalStudents),
                  pendingCount: Math.max(0, job.totalStudents - job.completedCount),
                  passedCount: job.passedCount || 0,
                  failedCount: job.failedCount || 0,
                  missingCount: job.missingCount || 0,
                  verificationRequiredCount: job.verificationRequiredCount || 0,
                  failedRequestsCount: job.failedRequestsCount || 0,
                  currentEnrollment: job.currentEnrollment,
                  progress: pct,
                  ...extra,
            });
      }

      async startJob(jobId, demoMode = false) {
            const job = await FetchJob.findById(jobId);
            if (!job) throw new Error('Job not found');
            if (job.status === 'running') throw new Error('Job already running');

            // Seed completedCount from DB so we don't double-count on resume.
            // Count enrollments that were already fully processed (completed or missing).
            const alreadyDone = await StudentResult.countDocuments({
                  jobId,
                  fetchStatus: { $in: ['completed', 'missing'] },
            });

            const fetcher = new ResultFetcherService(this.io);
            activeJobs.set(String(jobId), fetcher);
            registerFetcher(jobId, fetcher);

            job.status = 'running';
            job.completedCount = alreadyDone;
            job.pendingCount = Math.max(0, job.totalStudents - alreadyDone);

            // Reset outcome counters only for a fresh start (nothing done yet)
            if (alreadyDone === 0) {
                  job.passedCount = 0;
                  job.failedCount = 0;
                  job.missingCount = 0;
                  job.verificationRequiredCount = 0;
                  job.failedRequestsCount = 0;
            }

            await job.save();
            this.emitProgress(jobId, job, { message: 'Job started' });

            // Fire-and-forget — does not block the HTTP response
            this._processJob(jobId, job, fetcher, demoMode).catch(err => {
                  logger.error(`Job ${jobId} crashed: ${err.message}`);
            });

            return job;
      }

      async _processJob(jobId, job, fetcher, demoMode) {
            const enrollments = job.enrollmentList;
            logger.info(`Job ${jobId}: ${enrollments.length} total enrollments, ${job.completedCount} already done`);

            for (let i = 0; i < enrollments.length; i++) {
                  if (fetcher.isCancelled) break;

                  const ok = await fetcher.waitWhilePaused();
                  if (!ok) break;

                  const enrollment = enrollments[i];

                  // ── Skip already-processed (from a previous run) ──────────────────────
                  // These were already seeded into completedCount at startJob — do NOT
                  // increment again.
                  const existing = await StudentResult.findOne({
                        jobId,
                        enrollmentNumber: enrollment,
                        fetchStatus: { $in: ['completed', 'missing'] },
                  });

                  if (existing) {
                        logger.info(`Skip already-done: ${enrollment}`);
                        continue; // counter was already seeded — no increment here
                  }

                  // Mark as current
                  job.currentEnrollment = enrollment;
                  job.lastProcessedIndex = i;
                  await job.save();
                  this.emitProgress(jobId, job, { message: `Processing ${enrollment}` });

                  try {
                        let resultData;

                        if (demoMode) {
                              await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
                              resultData = fetcher.generateDemoResult(enrollment, job);
                        } else {
                              resultData = await fetcher.fetchSingleResult(enrollment, job, jobId);
                              await new Promise(r => setTimeout(r, 2500));
                        }

                        // Upsert result record
                        await StudentResult.findOneAndUpdate(
                              { jobId, enrollmentNumber: enrollment },
                              { $set: { ...resultData, jobId, fetchedAt: new Date() } },
                              { upsert: true, new: true }
                        );

                        // ── Increment counters ONCE per enrollment ──────────────────────
                        job.completedCount = Math.min(job.completedCount + 1, job.totalStudents);
                        job.pendingCount = Math.max(0, job.totalStudents - job.completedCount);

                        if (resultData.resultStatus === 'PASS')
                              job.passedCount = (job.passedCount || 0) + 1;
                        else if (resultData.resultStatus === 'FAIL')
                              job.failedCount = (job.failedCount || 0) + 1;

                        if (resultData.fetchStatus === 'missing' || resultData.resultStatus === 'NOT_FOUND')
                              job.missingCount = (job.missingCount || 0) + 1;
                        if (resultData.fetchStatus === 'verification_required')
                              job.verificationRequiredCount = (job.verificationRequiredCount || 0) + 1;
                        if (resultData.fetchStatus === 'network_error' || resultData.fetchStatus === 'portal_error')
                              job.failedRequestsCount = (job.failedRequestsCount || 0) + 1;

                        await job.save();
                        this.emitProgress(jobId, job);

                  } catch (err) {
                        logger.error(`[${enrollment}] error: ${err.message}`);

                        // Save error result so we don't retry it on next resume
                        await StudentResult.findOneAndUpdate(
                              { jobId, enrollmentNumber: enrollment },
                              {
                                    $set: {
                                          jobId,
                                          enrollmentNumber: enrollment,
                                          fetchStatus: 'network_error',
                                          resultStatus: 'PENDING',
                                          errorMessage: err.message,
                                          fetchedAt: new Date(),
                                    },
                              },
                              { upsert: true, new: true }
                        );

                        // Still counts as one processed attempt
                        job.completedCount = Math.min(job.completedCount + 1, job.totalStudents);
                        job.pendingCount = Math.max(0, job.totalStudents - job.completedCount);
                        job.failedRequestsCount = (job.failedRequestsCount || 0) + 1;
                        await job.save();
                        this.emitProgress(jobId, job);
                  }
            }

            // ── Finalise ─────────────────────────────────────────────────────────────
            if (!fetcher.isCancelled) {
                  job.status = 'completed';
                  job.currentEnrollment = null;
                  job.pendingCount = 0;
                  job.completedCount = job.totalStudents; // ensure exact match
            } else {
                  job.status = 'cancelled';
            }
            await job.save();

            this.emitProgress(jobId, job, {
                  message: job.status === 'completed' ? 'Job completed!' : 'Job cancelled'
            });

            if (job.status === 'completed') {
                  this.io.to(`job_${jobId}`).emit('job_completed', { jobId });
            }

            activeJobs.delete(String(jobId));
            unregisterFetcher(jobId);
            await fetcher.closeBrowser().catch(() => { });
      }

      async pauseJob(jobId) {
            const f = activeJobs.get(String(jobId));
            if (f) f.pause();
            await FetchJob.findByIdAndUpdate(jobId, { status: 'paused' });
      }

      async resumeJob(jobId) {
            const f = activeJobs.get(String(jobId));
            if (f) {
                  f.resume();
                  await FetchJob.findByIdAndUpdate(jobId, { status: 'running' });
            } else {
                  const job = await FetchJob.findById(jobId);
                  if (!job) throw new Error('Job not found');
                  await this.startJob(jobId, job.dataSource === 'demo');
            }
      }

      async cancelJob(jobId) {
            const f = activeJobs.get(String(jobId));
            if (f) f.stop();
            await FetchJob.findByIdAndUpdate(jobId, { status: 'cancelled' });
            activeJobs.delete(String(jobId));
            unregisterFetcher(jobId);
      }

      getActiveFetcher(jobId) { return activeJobs.get(String(jobId)); }
}

module.exports = JobProcessor;
