const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: true,
  },
  type: {
    type: String,
    enum: ['down', 'high_resource', 'slow_queries'],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  severity: {
    type: String,
    enum: ['warning', 'critical'],
    required: true,
  },
  resolved: {
    type: Boolean,
    default: false,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

alertSchema.index(
  { resolvedAt: 1 },
  { expireAfterSeconds: 5 * 24 * 60 * 60 }
);

module.exports = mongoose.model('Alert', alertSchema);
