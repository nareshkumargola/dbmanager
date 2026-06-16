const QueryHistory = require('../models/queryHistoryModel');

// History save karo
exports.saveHistory = async (userId, query, status, rowsAffected, executionTime, error) => {
  try {
    await QueryHistory.create({
      user: userId,
      query,
      status,
      rowsAffected,
      executionTime,
      error,
    });
  } catch (err) {
    console.error('History save nahi hui:', err.message);
  }
};

// User ki poori history dekho
exports.getHistory = async (req, res) => {
  try {
    const history = await QueryHistory.find({ user: req.user.id })
      .sort({ createdAt: -1 })  // Nayi pehle
      .limit(50);               // Max 50

    res.status(200).json({ success: true, history });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Single history delete karo
exports.deleteHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await QueryHistory.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Record nahi mila!' });
    }

    // Sirf apni history delete karo
    if (record.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Permission nahi hai!' });
    }

    await QueryHistory.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Deleted!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Poori history clear karo
exports.clearHistory = async (req, res) => {
  try {
    await QueryHistory.deleteMany({ user: req.user.id });
    res.status(200).json({ success: true, message: 'History clear ho gayi!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};