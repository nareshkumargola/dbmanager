const mongoose = require('mongoose');

const queryHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  query: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    default: 'success',
  },
  rowsAffected: {
    type: Number,
    default: 0,
  },
  executionTime: {
    type: Number,  // milliseconds mein
    default: 0,
  },
  error: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('QueryHistory', queryHistorySchema);