const mongoose = require('mongoose');

const fetchJobSchema = new mongoose.Schema({
      userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
      },
      collegeCode: { type: String, required: true, trim: true },
      collegeName: { type: String, trim: true },
      university: { type: String, default: 'RGPV' },
      course: { type: String, required: true },
      branch: { type: String, required: true },
      semester: { type: Number, required: true, min: 1, max: 8 },
      examinationYear: { type: String, required: true },
      examinationSession: { type: String, enum: ['June', 'November'], required: true },
      resultType: { type: String, enum: ['Main', 'Revaluation'], default: 'Main' },
      resultMode: { type: String, enum: ['Grading', 'Non-Grading'], default: 'Grading' },
      enrollmentPrefix: { type: String, trim: true },
      startingEnrollment: { type: String, required: true },
      endingEnrollment: { type: String, required: true },
      enrollmentList: [{ type: String }],
      totalStudents: { type: Number, default: 0 },
      completedCount: { type: Number, default: 0 },
      pendingCount: { type: Number, default: 0 },
      passedCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
      missingCount: { type: Number, default: 0 },
      verificationRequiredCount: { type: Number, default: 0 },
      failedRequestsCount: { type: Number, default: 0 },
      currentEnrollment: { type: String },
      status: {
            type: String,
            enum: ['pending', 'running', 'paused', 'completed', 'cancelled', 'failed'],
            default: 'pending',
      },
      errorMessage: { type: String },
      lastProcessedIndex: { type: Number, default: 0 },
      dataSource: { type: String, enum: ['sourceA', 'sourceB', 'mixed', 'demo', null], default: null },
}, {
      timestamps: true,
});

fetchJobSchema.index({ userId: 1, createdAt: -1 });
fetchJobSchema.index({ status: 1 });

module.exports = mongoose.model('FetchJob', fetchJobSchema);
