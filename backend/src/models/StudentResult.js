const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
      subjectCode: String,
      subjectName: String,
      internalMarks: mongoose.Schema.Types.Mixed,
      externalMarks: mongoose.Schema.Types.Mixed,
      practicalMarks: mongoose.Schema.Types.Mixed,
      totalMarks: mongoose.Schema.Types.Mixed,
      credits: mongoose.Schema.Types.Mixed,
      grade: String,
      gradePoints: mongoose.Schema.Types.Mixed,
      status: String,
}, { _id: false });

const studentResultSchema = new mongoose.Schema({
      jobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FetchJob',
            required: true,
      },
      enrollmentNumber: { type: String, required: true, trim: true },
      studentName: { type: String, trim: true },
      collegeCode: { type: String, trim: true },
      collegeName: { type: String, trim: true },
      branch: { type: String, trim: true },
      course: { type: String, trim: true },
      semester: { type: Number },
      examinationYear: { type: String },
      examinationSession: { type: String },
      resultType: { type: String },
      resultMode: { type: String },
      subjects: [subjectSchema],
      sgpa: { type: mongoose.Schema.Types.Mixed },
      cgpa: { type: mongoose.Schema.Types.Mixed },
      totalCredits: { type: mongoose.Schema.Types.Mixed },
      backlogs: { type: Number, default: 0 },
      resultStatus: {
            type: String,
            enum: ['PASS', 'FAIL', 'ABSENT', 'WITHHELD', 'NOT_FOUND', 'PENDING', 'ERROR'],
            default: 'PENDING',
      },
      fetchStatus: {
            type: String,
            enum: ['completed', 'missing', 'verification_required', 'network_error', 'portal_error', 'pending'],
            default: 'pending',
      },
      errorMessage: { type: String },
      source: { type: String, enum: ['sourceA', 'sourceB', 'demo', 'manual'], default: 'sourceB' },
      rawData: { type: mongoose.Schema.Types.Mixed },
      fetchedAt: { type: Date },
}, {
      timestamps: true,
});

// Unique index: one result per enrollment per exam session per job
studentResultSchema.index(
      { enrollmentNumber: 1, examinationYear: 1, examinationSession: 1, semester: 1, jobId: 1 },
      { unique: true }
);
studentResultSchema.index({ jobId: 1, resultStatus: 1 });
studentResultSchema.index({ jobId: 1, enrollmentNumber: 1 });

module.exports = mongoose.model('StudentResult', studentResultSchema);
