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

const slugifyName = (name) => {
  if (!name) return 'default';
  return name
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const getBinlogAuditModel = (connectionDoc, databaseSchemaName, eventType) => {
  if (!connectionDoc) {
    throw new Error('Connection details are required to resolve binlog audit database!');
  }

  let connId = '';
  let connName = 'default';
  let defaultDb = 'test';

  if (connectionDoc._id || connectionDoc.id) {
    connId = (connectionDoc._id || connectionDoc.id).toString();
    connName = connectionDoc.name || 'default';
    defaultDb = connectionDoc.database || 'test';
  } else {
    connId = connectionDoc.toString();
  }

  const machineName = slugifyName(connName);
  const dbSchemaName = slugifyName(databaseSchemaName || defaultDb);
  const suffix = eventType === 'SP' ? 'sp' : 'table';

  const targetDbName = `${machineName}_${dbSchemaName}_${suffix}`;
  
  const targetDb = mongoose.connection.useDb(targetDbName, { useCache: true });
  const collectionName = 'binlogaudits';
  
  if (targetDb.models['BinlogAudit']) {
    return targetDb.models['BinlogAudit'];
  }
  
  return targetDb.model('BinlogAudit', binlogAuditSchema, collectionName);
};

module.exports = {
  binlogAuditSchema,
  getBinlogAuditModel
};
