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
    enum: ['admin', 'developer', 'viewer'],
    default: 'developer',
  },
  permissions: {
    type: {
      backup: { type: Boolean, default: true },
      binlog: { type: Boolean, default: true },
      monitor: { type: Boolean, default: true },
      query: { type: Boolean, default: true },
      history: { type: Boolean, default: true },
      slowQuery: { type: Boolean, default: true },
      auditLogs: { type: Boolean, default: true },
      connections: { type: Boolean, default: true }
    },
    default: {
      backup: true,
      binlog: true,
      monitor: true,
      query: true,
      history: true,
      slowQuery: true,
      auditLogs: true,
      connections: true
    }
  },
  passwordResetToken: {
    type: String,
    default: null,
  },
  passwordResetExpires: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', userSchema);