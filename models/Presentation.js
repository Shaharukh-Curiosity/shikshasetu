const mongoose = require('mongoose');

const presentationSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  region: { type: String, required: true },
  batchNumber: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  groupNumber: { type: Number, required: true, min: 1 },
  topic: { type: String, default: '' },
  presentationMarks: { type: Number, default: null },
  evaluation: {
    content: { type: Number, default: null }, // out of 10
    design: { type: Number, default: null }, // out of 5
    communication: { type: Number, default: null } // out of 5
  },
  evaluationLocked: { type: Boolean, default: false },
  markedBy: { type: String },
  markedByName: { type: String },
  markedAt: { type: Date, default: Date.now }
});

presentationSchema.index({ studentId: 1, date: 1 }, { unique: true });
presentationSchema.index({ region: 1, batchNumber: 1, date: 1 });

module.exports = mongoose.model('Presentation', presentationSchema);
