const mongoose = require('mongoose');

const marksSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  region: { type: String, required: true },
  batchNumber: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  theory: { type: Number, required: true },
  practical: { type: Number, required: true },
  presentation: { type: Number, required: true },
  totalMarks: { type: Number, required: true },
  totalObtained: { type: Number, required: true },
  percentage: { type: Number, required: true },
  markedBy: { type: String },
  markedByName: { type: String },
  markedAt: { type: Date, default: Date.now }
});

marksSchema.index({ studentId: 1, date: 1 }, { unique: true });
marksSchema.index({ region: 1, batchNumber: 1, date: 1 });

module.exports = mongoose.model('Marks', marksSchema);
