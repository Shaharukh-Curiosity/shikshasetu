const mongoose = require('mongoose');

const regionMilestoneSchema = new mongoose.Schema({
  region: { type: String, required: true, trim: true, unique: true },
  projectInaugurationDate: { type: String, default: null }, // YYYY-MM-DD
  updatedBy: { type: String, default: '' },
  updatedByName: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('RegionMilestone', regionMilestoneSchema);
