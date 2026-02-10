const mongoose = require('mongoose');

const contactLogSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, required: true },
    studentMobile: { type: String, default: '' },
    teacherId: { type: String, required: true, index: true },
    teacherName: { type: String, required: true },
    region: { type: String, index: true },
    schoolName: { type: String, default: '' },
    batchNumber: { type: String, default: '' },
    standard: { type: String, default: '' },
    phoneDialed: { type: String, default: '' },
    source: { type: String, default: 'unknown' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

contactLogSchema.index({ region: 1, batchNumber: 1, createdAt: -1 });

module.exports = mongoose.model('ContactLog', contactLogSchema);
