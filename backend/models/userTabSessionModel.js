const mongoose = require('mongoose');

const userTabSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: true,
  },
  activeTabId: {
    type: String,
    default: 'tab-1',
  },
  tabs: [
    {
      id: String,
      name: String,
      query: String,
    }
  ],
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

userTabSessionSchema.index({ user: 1, connection: 1 }, { unique: true });

module.exports = mongoose.model('UserTabSession', userTabSessionSchema);
