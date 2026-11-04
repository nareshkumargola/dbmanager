const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'developer'],
    default: 'developer',
  },
  accessMode: {
    type: String,
    enum: ['read', 'readwrite'],
    default: 'read',
  },
  permissions: {
    type: {
      userManagement: { type: Boolean, default: false },
      backup: { type: Boolean, default: false },
      binlog: { type: Boolean, default: true },
      monitor: { type: Boolean, default: true },
      query: { type: Boolean, default: true },
      history: { type: Boolean, default: true },
      slowQuery: { type: Boolean, default: true },
      auditLogs: { type: Boolean, default: true },
      connections: { type: Boolean, default: false }
    },
    default: {
      userManagement: false,
      backup: false,
      binlog: true,
      monitor: true,
      query: true,
      history: true,
      slowQuery: true,
      auditLogs: true,
      connections: false
    }
  },
  allowedConnections: [{
    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Connection'
    },
    databases: [{
      type: String
    }],
    databaseModes: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],
  passwordResetToken: {
    type: String,
    default: null,
  },
  passwordResetExpires: {
    type: Date,
    default: null,
  },
  isFirstLogin: {
    type: Boolean,
    default: true,
  },
  loginOtp: {
    type: String,
    default: null,
  },
  loginOtpExpires: {
    type: Date,
    default: null,
  },
  // Self-service profile details (editable from the Profile page)
  jobTitle: { type: String, trim: true, default: '', maxlength: 80 },
  phone: { type: String, trim: true, default: '', maxlength: 30 },
  bio: { type: String, trim: true, default: '', maxlength: 300 },
  lastLoginAt: { type: Date, default: null },
  // Per-user app settings (Profile → Settings)
  preferences: {
    defaultLanding: { type: String, enum: ['/dashboard', '/connections'], default: '/dashboard' },
    sidebarOpenByDefault: { type: Boolean, default: false },
    reduceMotion: { type: Boolean, default: false },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);