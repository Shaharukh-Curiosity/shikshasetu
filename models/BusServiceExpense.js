const mongoose = require('mongoose');

const busServiceExpenseSchema = new mongoose.Schema({
  busName: { type: String, default: 'Bus On Wheels', trim: true },
  servicePart: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  serviceDate: { type: Date, required: true },
  notes: { type: String, default: '', trim: true },
  garageName: { type: String, default: '', trim: true },
  garageAddress: { type: String, default: '', trim: true },
  garageMobile: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String, default: '', trim: true }
}, { timestamps: true });

module.exports = mongoose.model('BusServiceExpense', busServiceExpenseSchema);
