/**
 * SIRT / RGPV Multi-Tab Job Processor
 *
 * Coordinates concurrent multi-tab processing (up to MAX_PARALLEL_TABS tabs in 1 Chrome window),
 * tracks real-time statistics, updates MongoDB immediately upon each student result extraction,
 * and broadcasts live progress and tab statuses to the dashboard via Socket.IO.
 */

const FetchJob = require('../models/FetchJob');
const StudentResult = require('../models/StudentResult');
const ResultFetcherService = require('./resultFetcher');
const { registerFetcher, unregisterFetcher } = require('../socket/socketHandlers');
const logger = require('../utils/logger');

// In-memory: jobId (string) → active ResultFetcherService
const activeJobs = new Map();

class JobProcessor {
      constructor(io) {
            this.io = io;
      }

      emitProgress(jobId, job, extra = {}) {
            const pct = job.totalStudents > 0
                  ? Math.min(100, Math.round((job.completedCount / job.totalStudents) * 100))
                  : 0;

            const payload = {
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
                  activeTabsCount: extra.activeTabsCount || 0,
                  maxTabs: extra.maxTabs || parseInt(process.env.MAX_PARALLEL_TABS || '100', 10),
                  processingCount: extra.processingCount || 0,
                  tabs: extra.tabs || [],
                  ...extra,
            };

            this.io.to(`job_${jobId}`).emit('progress', payload);
      }

      async startJob(jobId, demoMode = false) {
            const job = await FetchJob.findById(jobId);
            if (!job) throw new Error('Job not found');
            if (job.status === 'running') throw new Error('Job already running');

            // Find already-completed records to avoid double counting on resumes
            const finishedDocs = await StudentResult.find({
                  jobId,
                  fetchStatus: { $in: ['completed', 'missing'] },
            }).select('enrollmentNumber');

            const finishedSet = new Set(finishedDocs.map(d => d.enrollmentNumber));
            const alreadyDone = finishedSet.size;

            const pendingEnrollments = (job.enrollmentList || []).filter(en => !finishedSet.has(en));

            const fetcher = new ResultFetcherService(this.io);
            activeJobs.set(String(jobId), fetcher);
            registerFetcher(jobId, fetcher);

            job.status = 'running';
            job.completedCount = alreadyDone;
            job.pendingCount = Math.max(0, job.totalStudents - alreadyDone);

            if (alreadyDone === 0) {
                  job.passedCount = 0;
                  job.failedCount = 0;
                  job.missingCount = 0;
                  job.verificationRequiredCount = 0;
                  job.failedRequestsCount = 0;
            }

            await job.save();
            this.emitProgress(jobId, job, {
                  message: `Job started with ${fetcher.maxTabs} concurrent tabs in 1 Chrome window`,
                  activeTabsCount: Math.min(pendingEnrollments.length, fetcher.maxTabs),
                  maxTabs: fetcher.maxTabs,
            });

            // Fire-and-forget background worker
            this._processJob(jobId, job, fetcher, demoMode, pendingEnrollments).catch(err => {
                  logger.error(`Job ${jobId} crashed: ${err.message}`);
            });

            return job;
      }

      async _processJob(jobId, job, fetcher, demoMode, pendingEnrollments) {
            logger.info(`Job ${jobId}: ${job.totalStudents} total, ${pendingEnrollments.length} pending, ${job.completedCount} already completed`);

            const onResult = async (resultData, tabId, enrollment) => {
                  try {
                        // 1. Immediately save to MongoDB
                        await StudentResult.findOneAndUpdate(
                              { jobId, enrollmentNumber: enrollment },
                              { $set: { ...resultData, jobId, fetchedAt: new Date() } },
                              { upsert: true, new: true }
                        );

                        // 2. Atomic increment of counters to avoid parallel save collisions
                        const incUpdates = { completedCount: 1 };
                        if (resultData.resultStatus === 'PASS') incUpdates.passedCount = 1;
                        else if (resultData.resultStatus === 'FAIL') incUpdates.failedCount = 1;

                        if (resultData.fetchStatus === 'missing' || resultData.resultStatus === 'NOT_FOUND') {
                              incUpdates.missingCount = 1;
                        }
                        if (resultData.fetchStatus === 'verification_required') {
                              incUpdates.verificationRequiredCount = 1;
                        }
                        if (resultData.fetchStatus === 'network_error' || resultData.fetchStatus === 'portal_error') {
                              incUpdates.failedRequestsCount = 1;
                        }

                        const updatedJob = await FetchJob.findByIdAndUpdate(
                              jobId,
                              {
                                    $inc: incUpdates,
                                    $set: { currentEnrollment: enrollment }
                              },
                              { new: true }
                        );

                        if (updatedJob) {
                              updatedJob.pendingCount = Math.max(0, updatedJob.totalStudents - updatedJob.completedCount);
                              await FetchJob.findByIdAndUpdate(jobId, { $set: { pendingCount: updatedJob.pendingCount } });

                              // Keep in-memory reference synced
                              job.completedCount = updatedJob.completedCount;
                              job.pendingCount = updatedJob.pendingCount;
                              job.passedCount = updatedJob.passedCount;
                              job.failedCount = updatedJob.failedCount;
                              job.missingCount = updatedJob.missingCount;
                              job.verificationRequiredCount = updatedJob.verificationRequiredCount;
                              job.failedRequestsCount = updatedJob.failedRequestsCount;
                              job.currentEnrollment = enrollment;

                              // 3. Emit live progress
                              this.emitProgress(jobId, updatedJob, {
                                    tabs: fetcher.getTabsStatus(),
                                    activeTabsCount: fetcher.getActiveTabsCount(),
                                    maxTabs: fetcher.maxTabs,
                                    processingCount: fetcher.getProcessingCount(),
                              });
                        }
                  } catch (e) {
                        logger.error(`Error saving student result [${enrollment}]: ${e.message}`);
                  }
            };

            const onTabUpdate = (tabsStatus) => {
                  const activeTabsCount = fetcher.getActiveTabsCount();
                  const processingCount = fetcher.getProcessingCount();

                  // Broadcast dedicated tabs_status event
                  this.io.to(`job_${jobId}`).emit('tabs_status', {
                        jobId,
                        activeTabsCount,
                        maxTabs: fetcher.maxTabs,
                        processingCount,
                        tabs: tabsStatus,
                        progressStats: {
                              totalStudents: job.totalStudents,
                              completedCount: job.completedCount,
                              processingCount,
                              pendingCount: job.pendingCount,
                              passedCount: job.passedCount || 0,
                              failedCount: job.failedCount || 0,
                              verificationRequiredCount: job.verificationRequiredCount || 0,
                              failedRequestsCount: job.failedRequestsCount || 0,
                              missingCount: job.missingCount || 0,
                        },
                  });

                  // Also emit overall progress
                  this.emitProgress(jobId, job, {
                        tabs: tabsStatus,
                        activeTabsCount,
                        maxTabs: fetcher.maxTabs,
                        processingCount,
                  });
            };

            try {
                  // Execute the 20-tab concurrent queue
                  await fetcher.processConcurrentQueue(
                        job,
                        pendingEnrollments,
                        onResult,
                        onTabUpdate,
                        demoMode
                  );
            } catch (err) {
                  logger.error(`Job ${jobId} execution error: ${err.message}`);
            }

            // ── Finalize Job ─────────────────────────────────────────────────────────
            if (!fetcher.isCancelled) {
                  job.status = 'completed';
                  job.currentEnrollment = null;
                  job.pendingCount = 0;
                  job.completedCount = job.totalStudents;
            } else {
                  job.status = 'cancelled';
            }
            await job.save();

            const finalTabs = fetcher.getTabsStatus();
            this.emitProgress(jobId, job, {
                  message: job.status === 'completed' ? 'All student results fetched successfully!' : 'Job cancelled',
                  tabs: finalTabs,
                  activeTabsCount: 0,
                  processingCount: 0,
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

      getActiveFetcher(jobId) {
            return activeJobs.get(String(jobId));
      }
}

module.exports = JobProcessor;
