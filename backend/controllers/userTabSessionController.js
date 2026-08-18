const UserTabSession = require('../models/userTabSessionModel');

exports.getTabSession = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const session = await UserTabSession.findOne({
      user: req.user.id,
      connection: connectionId
    });

    if (!session) {
      return res.status(200).json({ success: true, session: null });
    }

    res.status(200).json({ success: true, session });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching tab session', error: err.message });
  }
};

exports.saveTabSession = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { activeTabId, tabs } = req.body;

    const session = await UserTabSession.findOneAndUpdate(
      { user: req.user.id, connection: connectionId },
      {
        user: req.user.id,
        connection: connectionId,
        activeTabId: activeTabId || 'tab-1',
        tabs: Array.isArray(tabs) ? tabs.map(t => ({ id: t.id, name: t.name, query: t.query || '' })) : [],
        updatedAt: Date.now()
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, session });
  } catch (err) {
    res.status(500).json({ message: 'Error saving tab session', error: err.message });
  }
};
