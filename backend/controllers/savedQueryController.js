const SavedQuery = require('../models/savedQueryModel');

// ─── GET USER'S SAVED QUERIES ─────────────────────────
exports.getSavedQueries = async (req, res) => {
  try {
    const queries = await SavedQuery.find({ user: req.user.id })
      .populate('connection', 'name type')
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, queries });
  } catch (err) {
    console.error('Error fetching saved queries:', err.message);
    res.status(500).json({ message: 'Failed to fetch saved queries', error: err.message });
  }
};

// ─── SAVE NEW QUERY SCRIPT ───────────────────────────
exports.createSavedQuery = async (req, res) => {
  try {
    const { title, query, connectionId, database, description } = req.body;
    if (!title || !query) {
      return res.status(400).json({ message: 'Title and Query content are required.' });
    }

    const saved = await SavedQuery.create({
      user: req.user.id,
      connection: connectionId || null,
      database: database || '',
      title,
      query,
      description: description || '',
    });

    res.status(201).json({ success: true, savedQuery: saved });
  } catch (err) {
    console.error('Error creating saved query:', err.message);
    res.status(500).json({ message: 'Failed to save query', error: err.message });
  }
};

// ─── UPDATE SAVED QUERY SCRIPT ───────────────────────
exports.updateSavedQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, query, database, description } = req.body;

    const saved = await SavedQuery.findOne({ _id: id, user: req.user.id });
    if (!saved) {
      return res.status(404).json({ message: 'Saved query not found.' });
    }

    if (title) saved.title = title;
    if (query) saved.query = query;
    if (database !== undefined) saved.database = database;
    if (description !== undefined) saved.description = description;
    saved.updatedAt = Date.now();

    await saved.save();
    res.status(200).json({ success: true, savedQuery: saved });
  } catch (err) {
    console.error('Error updating saved query:', err.message);
    res.status(500).json({ message: 'Failed to update saved query', error: err.message });
  }
};

// ─── DELETE SAVED QUERY SCRIPT ───────────────────────
exports.deleteSavedQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SavedQuery.findOneAndDelete({ _id: id, user: req.user.id });

    if (!deleted) {
      return res.status(404).json({ message: 'Saved query not found.' });
    }

    res.status(200).json({ success: true, message: 'Saved query deleted successfully.' });
  } catch (err) {
    console.error('Error deleting saved query:', err.message);
    res.status(500).json({ message: 'Failed to delete saved query', error: err.message });
  }
};
