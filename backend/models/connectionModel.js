const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: []
  }],
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['mysql', 'postgresql', 'mongodb'],
    required: true,
  },
  // MySQL + PostgreSQL ke liye
  host: { type: String, default: null },
  port: { type: Number, default: null },
  username: { type: String, default: null },
  password: { type: String, default: null },
  database: { type: String, default: null },

  // MongoDB ke liye
  connectionString: { type: String, default: null },

  isActive: { type: Boolean, default: true },
  
  // Alerts settings
  alertsEnabled: { type: Boolean, default: false },
  alertEmail: { type: String, default: null },
  alertSlackWebhook: { type: String, default: null },
  alertDiscordWebhook: { type: String, default: null },
  alertThreshold: { type: Number, default: 90 },
  slowQueryThreshold: { type: Number, default: 100 },
  binlogFilterSettings: {
    // DML (Data Changes)
    INSERT: { type: Boolean, default: true },
    UPDATE: { type: Boolean, default: true },
    DELETE: { type: Boolean, default: true },
    REPLACE: { type: Boolean, default: true },
    LOAD_DATA_INFILE: { type: Boolean, default: true },

    // DDL (Schema Changes)
    CREATE_DATABASE: { type: Boolean, default: true },
    DROP_DATABASE: { type: Boolean, default: true },
    ALTER_DATABASE: { type: Boolean, default: true },
    CREATE_TABLE: { type: Boolean, default: true },
    DROP_TABLE: { type: Boolean, default: true },
    ALTER_TABLE: { type: Boolean, default: true },
    TRUNCATE_TABLE: { type: Boolean, default: true },
    RENAME_TABLE: { type: Boolean, default: true },
    CREATE_INDEX: { type: Boolean, default: true },
    DROP_INDEX: { type: Boolean, default: true },
    CREATE_VIEW: { type: Boolean, default: true },
    DROP_VIEW: { type: Boolean, default: true },

    // Stored Program Objects
    CREATE_PROCEDURE: { type: Boolean, default: true },
    ALTER_PROCEDURE: { type: Boolean, default: true },
    DROP_PROCEDURE: { type: Boolean, default: true },
    CREATE_FUNCTION: { type: Boolean, default: true },
    ALTER_FUNCTION: { type: Boolean, default: true },
    DROP_FUNCTION: { type: Boolean, default: true },
    CREATE_TRIGGER: { type: Boolean, default: true },
    DROP_TRIGGER: { type: Boolean, default: true },
    CREATE_EVENT: { type: Boolean, default: true },
    ALTER_EVENT: { type: Boolean, default: true },
    DROP_EVENT: { type: Boolean, default: true },

    // Transactions
    BEGIN: { type: Boolean, default: true },
    START_TRANSACTION: { type: Boolean, default: true },
    COMMIT: { type: Boolean, default: true },
    ROLLBACK: { type: Boolean, default: true },

    // User & Privileges
    CREATE_USER: { type: Boolean, default: true },
    ALTER_USER: { type: Boolean, default: true },
    DROP_USER: { type: Boolean, default: true },
    GRANT: { type: Boolean, default: true },
    REVOKE: { type: Boolean, default: true },
    SET_PASSWORD: { type: Boolean, default: true },

    // Binlog Event Types
    QueryEvent: { type: Boolean, default: true },
    TableMapEvent: { type: Boolean, default: true },
    WriteRowsEvent: { type: Boolean, default: true },
    UpdateRowsEvent: { type: Boolean, default: true },
    DeleteRowsEvent: { type: Boolean, default: true },
    XIDEvent: { type: Boolean, default: true },
    RotateEvent: { type: Boolean, default: true },
    FormatDescriptionEvent: { type: Boolean, default: true },
    GTIDEvent: { type: Boolean, default: true },

    // Fallbacks / general keys
    DDL: { type: Boolean, default: true },
    SP: { type: Boolean, default: true },
    OTHER: { type: Boolean, default: true }
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Connection', connectionSchema);