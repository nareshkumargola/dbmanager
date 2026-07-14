const mongoose = require('mongoose');

const slowQuerySchema = new mongoose.Schema({
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  query: {
    type: String,
    required: true,
  },
  executionTime: {
    type: Number,  // milliseconds
    required: true,
  },
  rowsExamined: {
    type: Number,
    default: 0,
  },
  suggestion: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('SlowQuery', slowQuerySchema);