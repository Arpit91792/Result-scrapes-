const mongoose = require('mongoose');

const downloadHistorySchema = new mongoose.Schema({
      userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
      },
      jobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FetchJob',
            required: true,
      },
      fileName: { type: String, required: true },
      fileType: { type: String, enum: ['excel', 'pdf', 'zip'], required: true },
      fileSize: { type: Number },
      filePath: { type: String },
      downloadCount: { type: Number, default: 1 },
}, {
      timestamps: true,
});

downloadHistorySchema.index({ userId: 1, createdAt: -1 });
downloadHistorySchema.index({ jobId: 1 });

module.exports = mongoose.model('DownloadHistory', downloadHistorySchema);
