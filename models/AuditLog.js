const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: String,
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: String,
  before: Object,
  after: Object,
  meta: Object,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
