const mongoose = require('mongoose');

const binlogAuditSchema = new mongoose.Schema({
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: true,
  },
  eventType: {
    type: String,
    enum: ['INSERT', 'UPDATE', 'DELETE', 'DDL', 'SP', 'OTHER'],
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

// Index for query optimization on connection specific collections
binlogAuditSchema.index({ timestamp: -1 });

const getBinlogAuditModel = (connectionId) => {
  if (!connectionId) {
    throw new Error('Connection ID is required to resolve binlog audit collection!');
  }
  const cleanId = connectionId.toString();
  const collectionName = `binlogaudit_${cleanId}`;
  
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName];
  }
  
  return mongoose.model(collectionName, binlogAuditSchema, collectionName);
};

module.exports = {
  binlogAuditSchema,
  getBinlogAuditModel
};
