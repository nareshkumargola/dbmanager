const QueryHistory = require('../models/queryHistoryModel');
const ProcedureAudit = require('../models/procedureAuditModel');

// History save karo
exports.saveHistory = async (userId, query, status, rowsAffected, executionTime, error, connectionId = null, database = null) => {
  try {
    await QueryHistory.create({
      user: userId,
      query,
      status,
      rowsAffected,
      executionTime,
      error,
      connectionId,
      database,
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

// Sabhi users ki history dekho (for developer activity log)
exports.getAllHistory = async (req, res) => {
  try {
    const history = await QueryHistory.find()
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({ success: true, history });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Stored Procedure audit log save karo
exports.logProcedureAudit = async (userId, query, connectionId, host, databaseName) => {
  try {
    const cleanQuery = query.replace(/`/g, '').replace(/\s+/g, ' ');
    
    let op = null;
    let name = null;

    if (/CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE/i.test(cleanQuery)) {
      op = 'CREATE';
      const match = cleanQuery.match(/CREATE\s+(?:OR\s+REPLACE\s+)?PROCEDURE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_\.]+)/i);
      if (match) name = match[1];
    } else if (/ALTER\s+PROCEDURE/i.test(cleanQuery)) {
      op = 'ALTER';
      const match = cleanQuery.match(/ALTER\s+PROCEDURE\s+([a-zA-Z0-9_\.]+)/i);
      if (match) name = match[1];
    } else if (/DROP\s+PROCEDURE/i.test(cleanQuery)) {
      op = 'DROP';
      const match = cleanQuery.match(/DROP\s+PROCEDURE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_\.]+)/i);
      if (match) name = match[1];
    }

    if (op && name) {
      await ProcedureAudit.create({
        connectionId: connectionId || null,
        procedureName: name,
        operation: op,
        user: userId,
        host: host || 'localhost',
        sqlText: query,
        databaseName: databaseName || null,
      });
      console.log(`Stored Procedure ${op} logged successfully for ${name} in database ${databaseName}`);
    }
  } catch (err) {
    console.error('Procedure audit logging failed:', err.message);
  }
};

// Sabhi procedure audits dekho (for admin audit log)
exports.getProcedureAudits = async (req, res) => {
  try {
    const audits = await ProcedureAudit.find()
      .populate('user', 'name email role')
      .populate('connectionId', 'name type host')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({ success: true, audits });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Developer's queries executed today for a specific connection
exports.getTodayQueriesForConnection = async (req, res) => {
  try {
    const { connectionId, userId } = req.query;
    if (!connectionId || !userId) {
      return res.status(400).json({ message: 'connectionId aur userId specify karo!' });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const queries = await QueryHistory.find({
      connectionId,
      user: userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    })
    .populate('user', 'name email role')
    .populate('connectionId', 'name type host port database')
    .sort({ createdAt: -1 });

    res.status(200).json({ success: true, queries });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};