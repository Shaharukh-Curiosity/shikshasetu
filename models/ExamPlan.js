const mongoose = require('mongoose');

const examPlanSchema = new mongoose.Schema({
  region: { type: String, required: true, trim: true },
  batchNumber: { type: String, required: true, trim: true },
  theoryDate: { type: String, default: null }, // YYYY-MM-DD
  practicalDate: { type: String, default: null }, // YYYY-MM-DD
  presentationDate: { type: String, default: null }, // YYYY-MM-DD
  certificateDate: { type: String, default: null }, // YYYY-MM-DD
  updatedBy: { type: String, default: '' },
  updatedByName: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

examPlanSchema.index({ region: 1, batchNumber: 1 }, { unique: true });

module.exports = mongoose.model('ExamPlan', examPlanSchema);
