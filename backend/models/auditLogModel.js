const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: false,
    default: null,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  action: {
    type: String,
    enum: [
      'RUN_QUERY',
      'RESTORE_BACKUP',
      'EXPORT_BACKUP',
      'CREATE_DB_USER',
      'DELETE_DB_USER',
      'UPDATE_DB_USER',
      'CREATE_CONNECTION',
      'DELETE_CONNECTION',
      'UPDATE_CONNECTION',
      'LOGIN',
      'LOGOUT',
      'UPDATE_USER_PERMISSIONS',
      'CREATE_USER',
      'DELETE_USER'
    ],
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
