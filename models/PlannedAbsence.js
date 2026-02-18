const mongoose = require('mongoose');

const plannedAbsenceSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  region: { type: String, required: true },
  schoolName: { type: String, default: '' },
  batchNumber: { type: String, required: true },
  fromDate: { type: String, required: true }, // YYYY-MM-DD
  toDate: { type: String, required: true },   // YYYY-MM-DD
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
  createdBy: { type: String, required: true },
  createdByName: { type: String, default: '' },
  cancelledBy: { type: String, default: '' },
  cancelledAt: { type: Date, default: null }
}, {
  timestamps: true
});

plannedAbsenceSchema.index({ studentId: 1, status: 1, fromDate: 1, toDate: 1 });
plannedAbsenceSchema.index({ region: 1, batchNumber: 1, status: 1, fromDate: 1, toDate: 1 });

module.exports = mongoose.model('PlannedAbsence', plannedAbsenceSchema);
