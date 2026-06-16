const mongoose = require('mongoose');

const monitoringSnapshotSchema = new mongoose.Schema({
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: true,
  },
  database: {
    type: String,
    default: null,
  },
  type: {
    type: String,
    enum: ['mysql', 'postgresql', 'mongodb'],
    required: true,
  },

  // MySQL fields
  activeConnections: { type: Number, default: 0 },
  maxConnections: { type: Number, default: 0 },
  queriesPerSecond: { type: Number, default: 0 },
  slowQueries: { type: Number, default: 0 },
  sizeMB: { type: Number, default: 0 },
  totalTables: { type: Number, default: 0 },
  bytesSent: { type: Number, default: 0 },
  bytesReceived: { type: Number, default: 0 },
  innodbHits: { type: Number, default: 0 },
  innodbReads: { type: Number, default: 0 },
  cacheHitRate: { type: Number, default: 0 },

  // PostgreSQL fields
  commits: { type: Number, default: 0 },
  rollbacks: { type: Number, default: 0 },
  blocksRead: { type: Number, default: 0 },
  blocksHit: { type: Number, default: 0 },
  size: { type: String, default: null },

  // MongoDB fields
  totalCollections: { type: Number, default: 0 },
  totalDocuments: { type: Number, default: 0 },
  opCounters: {
    insert: { type: Number, default: 0 },
    query: { type: Number, default: 0 },
    update: { type: Number, default: 0 },
    delete: { type: Number, default: 0 },
  },
  uptime: { type: Number, default: 0 },

  // Timestamp
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Auto-delete snapshots older than 7 days
monitoringSnapshotSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 }
);

module.exports = mongoose.model('MonitoringSnapshot', monitoringSnapshotSchema);
