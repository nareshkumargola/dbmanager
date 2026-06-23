const mongoose = require('mongoose');

const binlogStateSchema = new mongoose.Schema({
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: true,
    unique: true
  },
  logFile: {
    type: String,
    required: true
  },
  position: {
    type: Number,
    required: true
  },
  mode: {
    type: String,
    enum: ['real', 'simulation'],
    default: 'real'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('BinlogState', binlogStateSchema);
