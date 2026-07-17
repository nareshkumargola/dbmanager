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

const getAuditCheckKey = (statement, originalType) => {
  if (originalType) {
    const cleanType = originalType.trim();
    if (cleanType === 'Query') return 'QueryEvent';
    if (cleanType === 'Table_map') return 'TableMapEvent';
    if (cleanType.includes('Write_rows') || cleanType.includes('Write')) return 'WriteRowsEvent';
    if (cleanType.includes('Update_rows') || cleanType.includes('Update')) return 'UpdateRowsEvent';
    if (cleanType.includes('Delete_rows') || cleanType.includes('Delete')) return 'DeleteRowsEvent';
    if (cleanType === 'Xid') return 'XIDEvent';
    if (cleanType === 'Rotate') return 'RotateEvent';
    if (cleanType === 'Format_desc') return 'FormatDescriptionEvent';
    if (cleanType === 'Gtid') return 'GTIDEvent';
  }

  if (!statement) return 'OTHER';
  const clean = statement.replace(/\/\*.*?\*\//g, '').trim();
  const upper = clean.toUpperCase();

  // Transactions
  if (upper === 'BEGIN') return 'BEGIN';
  if (upper.startsWith('START TRANSACTION')) return 'START_TRANSACTION';
  if (upper === 'COMMIT') return 'COMMIT';
  if (upper === 'ROLLBACK') return 'ROLLBACK';

  // User & Privileges
  if (upper.startsWith('CREATE USER')) return 'CREATE_USER';
  if (upper.startsWith('ALTER USER')) return 'ALTER_USER';
  if (upper.startsWith('DROP USER')) return 'DROP_USER';
  if (upper.startsWith('GRANT')) return 'GRANT';
  if (upper.startsWith('REVOKE')) return 'REVOKE';
  if (upper.startsWith('SET PASSWORD')) return 'SET_PASSWORD';

  // Stored Program Objects
  if (upper.startsWith('CREATE PROCEDURE')) return 'CREATE_PROCEDURE';
  if (upper.startsWith('ALTER PROCEDURE')) return 'ALTER_PROCEDURE';
  if (upper.startsWith('DROP PROCEDURE')) return 'DROP_PROCEDURE';
  if (upper.startsWith('CREATE FUNCTION')) return 'CREATE_FUNCTION';
  if (upper.startsWith('ALTER FUNCTION')) return 'ALTER_FUNCTION';
  if (upper.startsWith('DROP FUNCTION')) return 'DROP_FUNCTION';
  if (upper.startsWith('CREATE TRIGGER')) return 'CREATE_TRIGGER';
  if (upper.startsWith('DROP TRIGGER')) return 'DROP_TRIGGER';
  if (upper.startsWith('CREATE EVENT')) return 'CREATE_EVENT';
  if (upper.startsWith('ALTER EVENT')) return 'ALTER_EVENT';
  if (upper.startsWith('DROP EVENT')) return 'DROP_EVENT';

  // DDL
  if (upper.startsWith('CREATE DATABASE')) return 'CREATE_DATABASE';
  if (upper.startsWith('DROP DATABASE')) return 'DROP_DATABASE';
  if (upper.startsWith('ALTER DATABASE')) return 'ALTER_DATABASE';
  if (upper.startsWith('CREATE TABLE')) return 'CREATE_TABLE';
  if (upper.startsWith('DROP TABLE')) return 'DROP_TABLE';
  if (upper.startsWith('ALTER TABLE')) return 'ALTER_TABLE';
  if (upper.startsWith('TRUNCATE TABLE')) return 'TRUNCATE_TABLE';
  if (upper.startsWith('RENAME TABLE')) return 'RENAME_TABLE';
  if (upper.startsWith('CREATE INDEX')) return 'CREATE_INDEX';
  if (upper.startsWith('DROP INDEX')) return 'DROP_INDEX';
  if (upper.startsWith('CREATE VIEW')) return 'CREATE_VIEW';
  if (upper.startsWith('DROP VIEW')) return 'DROP_VIEW';

  // DML
  if (upper.startsWith('INSERT')) return 'INSERT';
  if (upper.startsWith('UPDATE')) return 'UPDATE';
  if (upper.startsWith('DELETE')) return 'DELETE';
  if (upper.startsWith('REPLACE')) return 'REPLACE';
  if (upper.startsWith('LOAD DATA INFILE') || upper.startsWith('LOAD DATA')) return 'LOAD_DATA_INFILE';

  // Fallbacks
  if (upper.startsWith('CREATE') || upper.startsWith('ALTER') || upper.startsWith('DROP')) return 'DDL';
  if (upper.startsWith('CALL') || upper.startsWith('EXEC') || upper.includes('PROCEDURE') || upper.includes('FUNCTION')) return 'SP';

  return 'OTHER';
};

module.exports = {
  binlogAuditSchema,
  getBinlogAuditModel,
  getAuditCheckKey
};
