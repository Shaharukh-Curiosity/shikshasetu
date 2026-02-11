const mongoose = require('mongoose');

const examAttendanceSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, required: true },
    region: { type: String, required: true },
    batchNumber: { type: String, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    appeared: { type: Boolean, required: true },
    markedBy: { type: String },
    markedByName: { type: String },
    markedAt: { type: Date, default: Date.now }
  }
);

examAttendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
examAttendanceSchema.index({ region: 1, batchNumber: 1, date: 1 });

module.exports = mongoose.model('ExamAttendance', examAttendanceSchema);
