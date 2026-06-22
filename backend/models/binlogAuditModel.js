const mongoose = require('mongoose');

const binlogAuditSchema = new mongoose.Schema({
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: true,
  },
  eventType: {
    type: String,
    enum: ['INSERT', 'UPDATE', 'DELETE', 'DDL', 'OTHER'],
    required: true,
  },
  statement: {
    type: String,
    required: true,
  },
  originalType: {
    type: String,
  },
  pos: {
    type: Number,
  },
  logName: {
    type: String,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  diff: {
    type: mongoose.Schema.Types.Mixed,
  },
  dbUser: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Index for query optimization on dashboard
binlogAuditSchema.index({ connectionId: 1, timestamp: -1 });

module.exports = mongoose.model('BinlogAudit', binlogAuditSchema);
