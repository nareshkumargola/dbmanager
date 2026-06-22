const mongoose = require('mongoose');

const procedureAuditSchema = new mongoose.Schema({
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: false,
  },
  procedureName: {
    type: String,
    required: true,
  },
  operation: {
    type: String,
    enum: ['CREATE', 'ALTER', 'DROP'],
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  host: {
    type: String,
    default: null,
  },
  sqlText: {
    type: String,
    required: true,
  },
  databaseName: {
    type: String,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ProcedureAudit', procedureAuditSchema);
