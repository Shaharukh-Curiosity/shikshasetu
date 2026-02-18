const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  remarks: { type: String, default: '', trim: true }
}, { _id: false });

const inventoryHistorySchema = new mongoose.Schema({
  items: { type: [inventoryItemSchema], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedByName: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const busInventorySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'bus-on-wheels' },
  items: { type: [inventoryItemSchema], default: [] },
  history: { type: [inventoryHistorySchema], default: [] },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedByName: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('BusInventory', busInventorySchema);
