const AuditLog = require('../models/AuditLog');

async function logAudit({ req, action, entity, entityId, before, after, meta }) {
  try {
    const actorId = req?.user?._id;
    const actorName = req?.user?.name || req?.user?.email;
    await AuditLog.create({
      actorId,
      actorName,
      action,
      entity,
      entityId,
      before,
      after,
      meta
    });
  } catch (error) {
    // Avoid breaking main flow if audit logging fails
    console.error('⚠️ Audit log error:', error.message);
  }
}

module.exports = { logAudit };
