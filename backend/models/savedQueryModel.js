const mongoose = require('mongoose');

const savedQuerySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: false,
    default: null,
  },
  database: {
    type: String,
    required: false,
    default: '',
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  query: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('SavedQuery', savedQuerySchema);
