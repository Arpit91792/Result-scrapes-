const FetchJob = require('../models/FetchJob');
const StudentResult = require('../models/StudentResult');
const {
  queueJobForWorker,
  removeQueuedJob,
  sendWorkerCommand,
} = require('../socket/socketHandlers');
const logger = require('../utils/logger');

class CloudJobDispatcher {
  constructor(io) {
    this.io = io;
  }

  emitProgress(jobId, job, extra = {}) {
    const pct = job.totalStudents > 0
      ? Math.min(100, Math.round(((job.completedCount || 0) / job.totalStudents) * 100))
      : 0;
    this.io.to(`job_${jobId}`).emit('progress', {
      jobId,
      status: job.status,
      totalStudents: job.totalStudents,
      completedCount: Math.min(job.completedCount || 0, job.totalStudents || 0),
      pendingCount: Math.max(0, job.totalStudents - (job.completedCount || 0)),
      passedCount: job.passedCount || 0,
      failedCount: job.failedCount || 0,
      missingCount: job.missingCount || 0,
      verificationRequiredCount: job.verificationRequiredCount || 0,
      failedRequestsCount: job.failedRequestsCount || 0,
      currentEnrollment: job.currentEnrollment,
      progress: pct,
      activeTabsCount: 0,
      maxTabs: parseInt(process.env.MAX_PARALLEL_TABS || '100', 10),
      processingCount: 0,
      tabs: [],
      ...extra,
    });
  }

  async refreshJobStats(jobId) {
    const results = await StudentResult.find({ jobId })
      .select('fetchStatus resultStatus errorMessage')
      .lean();
    const stats = {
      completedCount: 0,
      passedCount: 0,
      failedCount: 0,
      missingCount: 0,
      verificationRequiredCount: 0,
      failedRequestsCount: 0,
    };

    for (const result of results) {
      if (result.fetchStatus === 'completed' || result.fetchStatus === 'missing') stats.completedCount++;
      if (result.resultStatus === 'PASS' || result.resultStatus === 'PASS WITH GRACE') stats.passedCount++;
      else if (result.resultStatus === 'FAIL') stats.failedCount++;
      if (result.fetchStatus === 'missing' || result.resultStatus === 'NOT_FOUND') stats.missingCount++;
      if (result.fetchStatus === 'verification_required'
        || (result.fetchStatus === 'pending' && result.errorMessage?.includes('CAPTCHA'))) {
        stats.verificationRequiredCount++;
      }
      if (result.fetchStatus === 'network_error' || result.fetchStatus === 'portal_error') {
        stats.failedRequestsCount++;
      }
    }

    const job = await FetchJob.findById(jobId);
    if (!job) return null;
    stats.pendingCount = Math.max(0, job.totalStudents - stats.completedCount);
    return FetchJob.findByIdAndUpdate(jobId, { $set: stats }, { new: true });
  }

  async startJob(jobId, demoMode = false) {
    const job = await FetchJob.findById(jobId);
    if (!job) throw new Error('Job not found');
    if (['running', 'queued'].includes(job.status)) {
      throw new Error(job.status === 'running' ? 'Job already running' : 'Job already queued');
    }

    const refreshedJob = await this.refreshJobStats(jobId);
    if (!refreshedJob) throw new Error('Job not found');

    const finishedDocs = await StudentResult.find({
      jobId,
      fetchStatus: { $in: ['completed', 'missing'] },
    }).select('enrollmentNumber').lean();
    const finishedSet = new Set(finishedDocs.map((doc) => doc.enrollmentNumber));
    const pendingEnrollments = (job.enrollmentList || []).filter((enrollment) => !finishedSet.has(enrollment));

    if (pendingEnrollments.length === 0) {
      job.status = 'completed';
      job.completedCount = finishedSet.size;
      job.pendingCount = 0;
      job.errorMessage = null;
      await job.save();
      this.emitProgress(jobId, job, { message: 'All student results are already available' });
      this.io.to(`job_${jobId}`).emit('job_completed', { jobId });
      return job;
    }

    job.status = 'queued';
    job.completedCount = refreshedJob.completedCount;
    job.pendingCount = pendingEnrollments.length;
    job.errorMessage = null;
    await job.save();

    queueJobForWorker(jobId, demoMode || job.dataSource === 'demo');
    this.emitProgress(jobId, job, {
      message: 'Job queued. Waiting for an available cloud worker...',
      workerStatus: 'queued',
    });
    logger.info(`Job ${jobId} queued for cloud execution (${pendingEnrollments.length} pending)`);
    return job;
  }

  async pauseJob(jobId) {
    const job = await FetchJob.findById(jobId);
    if (!job) throw new Error('Job not found');

    const sent = sendWorkerCommand(jobId, 'pause');
    if (!sent) removeQueuedJob(jobId);
    job.status = 'paused';
    await job.save();
    this.emitProgress(jobId, job, { message: 'Job paused' });
    return job;
  }

  async resumeJob(jobId) {
    const job = await FetchJob.findById(jobId);
    if (!job) throw new Error('Job not found');
    if (job.status === 'completed' || job.status === 'cancelled') {
      throw new Error(`Cannot resume a ${job.status} job`);
    }

    const sent = sendWorkerCommand(jobId, 'resume');
    if (sent) {
      job.status = 'running';
      job.errorMessage = null;
      await job.save();
      this.emitProgress(jobId, job, { message: 'Job resumed on cloud worker' });
      return job;
    }

    job.status = 'queued';
    job.errorMessage = 'Waiting for an available cloud worker to resume this job.';
    await job.save();
    queueJobForWorker(jobId, job.dataSource === 'demo');
    this.emitProgress(jobId, job, { message: 'Job queued for cloud worker resume' });
    return job;
  }

  async cancelJob(jobId) {
    const job = await FetchJob.findById(jobId);
    if (!job) throw new Error('Job not found');

    removeQueuedJob(jobId);
    const sent = sendWorkerCommand(jobId, 'cancel');
    if (!sent) {
      job.status = 'cancelled';
      job.errorMessage = 'Job cancelled before cloud execution.';
      await job.save();
    }
    return job;
  }
}

module.exports = CloudJobDispatcher;
