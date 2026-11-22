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
const activeRuns = new Map();

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

            const refreshedJob = await this.refreshJobStats(jobId);
            if (refreshedJob) {
                  job.completedCount = refreshedJob.completedCount;
                  job.pendingCount = refreshedJob.pendingCount;
                  job.passedCount = refreshedJob.passedCount;
                  job.failedCount = refreshedJob.failedCount;
                  job.missingCount = refreshedJob.missingCount;
                  job.verificationRequiredCount = refreshedJob.verificationRequiredCount;
                  job.failedRequestsCount = refreshedJob.failedRequestsCount;
            }

            // Find already-completed records to avoid double counting on resumes
            const finishedDocs = await StudentResult.find({
                  jobId,
                  fetchStatus: { $in: ['completed', 'missing'] },
            }).select('enrollmentNumber');

            const finishedSet = new Set(finishedDocs.map(d => d.enrollmentNumber));
            const alreadyDone = finishedSet.size;

            const pendingEnrollments = (job.enrollmentList || []).filter(en => !finishedSet.has(en));

            if (pendingEnrollments.length === 0) {
                  job.status = 'completed';
                  job.completedCount = alreadyDone;
                  job.pendingCount = 0;
                  job.errorMessage = null;
                  await job.save();
                  this.emitProgress(jobId, job, { message: 'All student results are already available' });
                  this.io.to(`job_${jobId}`).emit('job_completed', { jobId });
                  return job;
            }

            const fetcher = new ResultFetcherService(this.io);
            activeJobs.set(String(jobId), fetcher);
            registerFetcher(jobId, fetcher);

            job.status = 'running';
            job.completedCount = alreadyDone;
            job.pendingCount = Math.max(0, job.totalStudents - alreadyDone);
            job.errorMessage = null;

            await job.save();
            this.emitProgress(jobId, job, {
                  message: `Job started with ${fetcher.maxTabs} concurrent tabs in 1 Chrome window`,
                  activeTabsCount: Math.min(pendingEnrollments.length, fetcher.maxTabs),
                  maxTabs: fetcher.maxTabs,
            });

            // Fire-and-forget background worker
            const run = this._processJob(jobId, job, fetcher, demoMode, pendingEnrollments).catch(err => {
                  logger.error(`Job ${jobId} crashed: ${err.message}`);
                  return FetchJob.findByIdAndUpdate(jobId, {
                        $set: { status: 'failed', errorMessage: err.message }
                  }).catch(updateError => {
                        logger.error(`Could not save failed status for job ${jobId}: ${updateError.message}`);
                  }).finally(() => {
                        const currentFetcher = activeJobs.get(String(jobId)) || fetcher;
                        activeJobs.delete(String(jobId));
                        unregisterFetcher(jobId);
                        return currentFetcher.closeBrowser().catch(closeError => {
                              logger.warn(`Could not close browser for job ${jobId}: ${closeError.message}`);
                        });
                  });
            }).finally(() => {
                  activeRuns.delete(String(jobId));
            });
            activeRuns.set(String(jobId), run);

            return job;
      }

      async refreshJobStats(jobId) {
            const allResults = await StudentResult.find({ jobId }).lean();
            let passedCount = 0;
            let failedCount = 0;
            let missingCount = 0;
            let verificationRequiredCount = 0;
            let failedRequestsCount = 0;
            let completedCount = 0;

            for (const res of allResults) {
                  if (res.fetchStatus === 'completed' || res.fetchStatus === 'missing') {
                        completedCount++;
                  }
                  if (res.resultStatus === 'PASS' || res.resultStatus === 'PASS WITH GRACE') {
                        passedCount++;
                  } else if (res.resultStatus === 'FAIL') {
                        failedCount++;
                  }
                  if (res.fetchStatus === 'missing' || res.resultStatus === 'NOT_FOUND') {
                        missingCount++;
                  }
                  if (res.fetchStatus === 'verification_required' || (res.fetchStatus === 'pending' && res.errorMessage && res.errorMessage.includes('CAPTCHA'))) {
                        verificationRequiredCount++;
                  }
                  if (res.fetchStatus === 'network_error' || res.fetchStatus === 'portal_error') {
                        failedRequestsCount++;
                  }
            }

            const currentJob = await FetchJob.findById(jobId);
            if (!currentJob) return null;

            const pendingCount = Math.max(0, currentJob.totalStudents - completedCount);
            const updatedJob = await FetchJob.findByIdAndUpdate(
                  jobId,
                  {
                        $set: {
                              completedCount,
                              pendingCount,
                              passedCount,
                              failedCount,
                              missingCount,
                              verificationRequiredCount,
                              failedRequestsCount
                        }
                  },
                  { new: true }
            );
            return updatedJob;
      }

      async _processJob(jobId, job, fetcher, demoMode, pendingEnrollments) {
            logger.info(`Job ${jobId}: ${job.totalStudents} total, ${pendingEnrollments.length} pending, ${job.completedCount} already completed`);

            let activeFetcher = fetcher;
            let isRetryRound = false;

            const onResult = async (resultData, tabId, enrollment) => {
                  try {
                        // 1. Immediately save/update to MongoDB
                        await StudentResult.findOneAndUpdate(
                              { jobId, enrollmentNumber: enrollment },
                              { $set: { ...resultData, jobId, fetchedAt: new Date() } },
                              { upsert: true, new: true }
                        );

                        let updatedJob = null;
                        if (isRetryRound) {
                              // During re-fetch passes, recalculate exact stats from database
                              updatedJob = await this.refreshJobStats(jobId);
                        } else {
                              const incUpdates = {};
                              const isFinished = resultData.fetchStatus === 'completed'
                                    || resultData.fetchStatus === 'missing';
                              if (isFinished) {
                                    incUpdates.completedCount = 1;
                                    if (resultData.resultStatus === 'PASS' || resultData.resultStatus === 'PASS WITH GRACE') {
                                          incUpdates.passedCount = 1;
                                    } else if (resultData.resultStatus === 'FAIL') {
                                          incUpdates.failedCount = 1;
                                    }
                              }

                              if (resultData.fetchStatus === 'missing' || resultData.resultStatus === 'NOT_FOUND') {
                                    incUpdates.missingCount = 1;
                              }
                              if (resultData.fetchStatus === 'verification_required' || (resultData.fetchStatus === 'pending' && resultData.errorMessage && resultData.errorMessage.includes('CAPTCHA'))) {
                                    incUpdates.verificationRequiredCount = 1;
                              }
                              if (resultData.fetchStatus === 'network_error' || resultData.fetchStatus === 'portal_error') {
                                    incUpdates.failedRequestsCount = 1;
                              }

                              const updates = {
                                    $set: { currentEnrollment: enrollment }
                              };
                              if (Object.keys(incUpdates).length > 0) {
                                    updates.$inc = incUpdates;
                              }

                              updatedJob = await FetchJob.findByIdAndUpdate(
                                    jobId,
                                    updates,
                                    { new: true }
                              );

                              if (updatedJob) {
                                    updatedJob.pendingCount = Math.max(0, updatedJob.totalStudents - updatedJob.completedCount);
                                    await FetchJob.findByIdAndUpdate(jobId, { $set: { pendingCount: updatedJob.pendingCount } });
                              }
                        }

                        if (updatedJob) {
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
                                    tabs: activeFetcher.getTabsStatus(),
                                    activeTabsCount: activeFetcher.getActiveTabsCount(),
                                    maxTabs: activeFetcher.maxTabs,
                                    processingCount: activeFetcher.getProcessingCount(),
                              });
                        }
                  } catch (e) {
                        logger.error(`Error saving student result [${enrollment}]: ${e.message}`);
                  }
            };

            const onTabUpdate = (tabsStatus) => {
                  const activeTabsCount = activeFetcher.getActiveTabsCount();
                  const processingCount = activeFetcher.getProcessingCount();

                  // Broadcast dedicated tabs_status event
                  this.io.to(`job_${jobId}`).emit('tabs_status', {
                        jobId,
                        activeTabsCount,
                        maxTabs: activeFetcher.maxTabs,
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
                        maxTabs: activeFetcher.maxTabs,
                        processingCount,
                  });
            };

            let executionError = null;
            try {
                  // Keep the browser open until verification-required students are collected.
                  await activeFetcher.processConcurrentQueue(
                        job,
                        pendingEnrollments,
                        onResult,
                        onTabUpdate,
                        demoMode,
                        { keepBrowserOpen: true }
                  );
            } catch (err) {
                  logger.error(`Job ${jobId} execution error: ${err.message}`);
                  executionError = err;
            }

            // Retry unresolved students in the existing browser window.
            isRetryRound = true;
            let retryRound = 1;

            while (!activeFetcher.isCancelled) {
                  const retryDocs = await StudentResult.find({
                        jobId,
                        $or: [
                              { fetchStatus: 'verification_required' },
                              { fetchStatus: 'pending' }
                        ]
                  }).select('enrollmentNumber');

                  if (retryDocs.length === 0) break;

                  const retryEnrollments = retryDocs.map(d => d.enrollmentNumber);
                  const retryMsg = `Found ${retryEnrollments.length} pending student(s) requiring verification. Re-fetching in the existing browser window (Pass ${retryRound})...`;
                  logger.info(`Job ${jobId}: ${retryMsg}`);

                  this.emitProgress(jobId, job, {
                        message: retryMsg,
                        activeTabsCount: Math.min(retryEnrollments.length, activeFetcher.maxTabs),
                        processingCount: 0,
                  });

                  try {
                        await activeFetcher.processConcurrentQueue(
                              job,
                              retryEnrollments,
                              onResult,
                              onTabUpdate,
                              demoMode,
                              { keepBrowserOpen: true, reuseTabs: true }
                        );
                        executionError = null;
                  } catch (retryErr) {
                        logger.error(`Job ${jobId} CAPTCHA retry pass ${retryRound} error: ${retryErr.message}`);
                        executionError = retryErr;
                        await new Promise(resolve => setTimeout(resolve, 3000));
                  }

                  await this.refreshJobStats(jobId);
                  retryRound++;
            }

            // Final stats sync from database
            const finalJobStats = await this.refreshJobStats(jobId);
            if (finalJobStats) {
                  job.completedCount = finalJobStats.completedCount;
                  job.pendingCount = finalJobStats.pendingCount;
                  job.passedCount = finalJobStats.passedCount;
                  job.failedCount = finalJobStats.failedCount;
                  job.missingCount = finalJobStats.missingCount;
                  job.verificationRequiredCount = finalJobStats.verificationRequiredCount;
                  job.failedRequestsCount = finalJobStats.failedRequestsCount;
            }

            // ── Finalize Job ─────────────────────────────────────────────────────────
            if (!activeFetcher.isCancelled && !executionError && job.completedCount >= job.totalStudents) {
                  job.status = 'completed';
                  job.currentEnrollment = null;
                  job.pendingCount = 0;
            } else {
                  job.status = activeFetcher.isCancelled ? 'cancelled' : 'failed';
                  if (executionError) {
                        job.errorMessage = executionError.message;
                  } else if (!activeFetcher.isCancelled) {
                        job.errorMessage = `${job.pendingCount} student result(s) remain unresolved. Resume the job to retry them.`;
                  }
            }
            await job.save();

            const finalTabs = activeFetcher.getTabsStatus();
            this.emitProgress(jobId, job, {
                  message: job.status === 'completed'
                        ? 'All student results fetched successfully!'
                        : job.status === 'cancelled'
                              ? 'Job cancelled'
                              : job.errorMessage || 'Job stopped before all student results were fetched',
                  tabs: finalTabs,
                  activeTabsCount: 0,
                  processingCount: 0,
            });

            if (job.status === 'completed') {
                  this.io.to(`job_${jobId}`).emit('job_completed', { jobId });
            }

            activeJobs.delete(String(jobId));
            unregisterFetcher(jobId);
            await activeFetcher.closeBrowser().catch(() => { });
      }

      async pauseJob(jobId) {
            const f = activeJobs.get(String(jobId));
            if (f) f.pause();
            const updatedJob = await FetchJob.findByIdAndUpdate(jobId, { status: 'paused' }, { new: true });
            if (updatedJob) {
                  this.emitProgress(jobId, updatedJob, {
                        message: 'Job paused',
                        tabs: f ? f.getTabsStatus() : [],
                        activeTabsCount: f ? f.getActiveTabsCount() : 0,
                        maxTabs: f ? f.maxTabs : parseInt(process.env.MAX_PARALLEL_TABS || '100', 10),
                        processingCount: f ? f.getProcessingCount() : 0,
                  });
            }
      }

      async resumeJob(jobId) {
            const f = activeJobs.get(String(jobId));
            if (f && !f.isCancelled) {
                  f.resume();
                  const updatedJob = await FetchJob.findByIdAndUpdate(jobId, { status: 'running' }, { new: true });
                  if (updatedJob) {
                        this.emitProgress(jobId, updatedJob, {
                              message: 'Job resumed',
                              tabs: f.getTabsStatus(),
                              activeTabsCount: f.getActiveTabsCount(),
                              maxTabs: f.maxTabs,
                              processingCount: f.getProcessingCount(),
                        });
                  }
            } else {
                  const activeRun = activeRuns.get(String(jobId));
                  if (activeRun) await activeRun;
                  const job = await FetchJob.findById(jobId);
                  if (!job) throw new Error('Job not found');
                  await this.startJob(jobId, job.dataSource === 'demo');
            }
      }

      async cancelJob(jobId) {
            const f = activeJobs.get(String(jobId));
            const activeRun = activeRuns.get(String(jobId));
            if (f) {
                  f.stop();
            }
            if (activeRun) await activeRun;
            if (f || !activeRun) {
                  await FetchJob.findByIdAndUpdate(jobId, { status: 'cancelled' });
            }
            if (!activeRuns.has(String(jobId))) {
                  activeJobs.delete(String(jobId));
                  unregisterFetcher(jobId);
            }
      }

      getActiveFetcher(jobId) {
            return activeJobs.get(String(jobId));
      }
}

module.exports = JobProcessor;
