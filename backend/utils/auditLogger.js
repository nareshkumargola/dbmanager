const AuditLog = require('../models/auditLogModel');

/**
 * Log a user action on a database connection to the audit trail
 * @param {string} connectionId - Reference Connection ID
 * @param {string} userId - Reference User ID
 * @param {string} action - The action type
 * @param {string} details - Detailed text description or query input
 */
exports.logAuditTrail = async (connectionId, userId, action, details) => {
  try {
    await AuditLog.create({
      connection: connectionId,
      user: userId,
      action,
      details: String(details || '')
    });
  } catch (err) {
    console.error('Failed to write database audit log entry:', err.message);
  }
};
