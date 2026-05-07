const mongoose = require('mongoose');

const csfiProjectBillSchema = new mongoose.Schema({
  billDate: { type: Date, required: true },
  project: {
    type: String,
    required: true,
    trim: true,
    enum: ['first-bus', 'bio-diversity', 'shikshamitra', 'malnutrition']
  },
  matter: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String, default: '', trim: true }
}, { timestamps: true });

csfiProjectBillSchema.index({ project: 1, billDate: -1 });

module.exports = mongoose.model('CsfiProjectBill', csfiProjectBillSchema);
