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
  alertThreshold: { type: Number, default: 90 },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Connection', connectionSchema);