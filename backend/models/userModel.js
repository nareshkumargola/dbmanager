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
  // Raised when the password changes; login tokens carrying an older number stop working
  tokenVersion: { type: Number, default: 0 },
  // Two-step sign-in. Everything except "enabled" and "enabledAt" stays out of normal queries.
  mfa: {
    enabled: { type: Boolean, default: false },
    // MFA is on by default: set up at first sign-in, unless the person turned it off in Settings
    optedOut: { type: Boolean, default: false },
    enabledAt: { type: Date, default: null },
    secret: { type: String, default: null, select: false },
    pendingSecret: { type: String, default: null, select: false },
    backupCodes: { type: [String], default: undefined, select: false },
    lastUsedStep: { type: Number, default: null, select: false },
    failedAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
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
    // Text size across the whole app
    fontSize: { type: String, enum: ['small', 'default', 'large', 'xlarge'], default: 'default' },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);