const QueryHistory = require('../models/queryHistoryModel');
const ProcedureAudit = require('../models/procedureAuditModel');

// Helper function to auto-delete queries older than 10 days
const cleanExpiredHistory = async () => {
  try {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await QueryHistory.deleteMany({ createdAt: { $lt: tenDaysAgo } });
  } catch (err) {
    console.error('Error auto-cleaning expired query history (>10 days):', err.message);
  }
};

// History save karo
exports.saveHistory = async (userId, query, status, rowsAffected, executionTime, error, connectionId = null, database = null) => {
  try {
    await cleanExpiredHistory();
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
    console.error('History not saved:', err.message);
  }
};

// User ki poori history dekho (connection-specific optionally)
exports.getHistory = async (req, res) => {
  try {
    await cleanExpiredHistory();
    const filter = { user: req.user.id };
    if (req.query.connectionId) {
      filter.connectionId = req.query.connectionId;
    }

    const history = await QueryHistory.find(filter)
      .sort({ createdAt: -1 })  // Nayi pehle
      .limit(50);               // Max 50

    res.status(200).json({ success: true, history });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Single history delete (Manual deletion is disabled — 10-day retention policy)
exports.deleteHistory = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Manual deletion of query history is disabled. Queries are automatically retained for 10 days.'
  });
};

// Poori history clear (Manual clearing is disabled — 10-day retention policy)
exports.clearHistory = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Manual clearing of query history is disabled. Queries are automatically retained for 10 days.'
  });
};

// Sabhi users ki history dekho (for developer activity log)
exports.getAllHistory = async (req, res) => {
  try {
    await cleanExpiredHistory();
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
    await cleanExpiredHistory();
    const { connectionId, userId } = req.query;
    if (!connectionId || !userId) {
      return res.status(400).json({ message: 'Please specify connectionId and userId!' });
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