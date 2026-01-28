const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: String,  // Store as STRING to avoid conversion issues
  studentName: String,
  schoolName: String,
  batchNumber: String,
  date: String,  // Store as STRING "YYYY-MM-DD" to avoid timezone issues
  status: String,  // "present" or "absent"
  markedBy: String,  // User ID of who marked
  markedByName: String,  // Name of teacher/admin who marked (e.g., "John Admin", "Jane Teacher")
  markedAt: { type: Date, default: Date.now }
});

// Index for fast queries
attendanceSchema.index({ schoolName: 1, batchNumber: 1, date: 1 });
attendanceSchema.index({ markedByName: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
