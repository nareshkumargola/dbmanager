const AuditLog = require('../models/auditLogModel');

// The page loads the newest 2000 records. A download may ask for up to 10000.
const DEFAULT_ROW_LIMIT = 2000;
const MAX_ROW_LIMIT = 10000;

// An exact moment such as 2026-11-10T08:30:00.000Z. Empty gives undefined, and bad text gives null.
const parseMoment = (value) => {
  if (value === undefined || value === '') return undefined;
  const time = Date.parse(String(value));
  return Number.isNaN(time) ? null : new Date(time);
};

/**
 * Retrieve all system audit logs (Admin Only)
 */
exports.getSystemAuditLogs = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access only!' });
    }

    const { userId, action, actions, startDate, endDate, from, to, queryType, connectionId, role, countOnly, limit } = req.query;
    const filter = {};

    // 1. Filter by specific user
    if (userId) {
      filter.user = userId;
    }

    // 2. Filter by specific action type, or by a group of actions such as all query actions
    if (action) {
      filter.action = String(action);
    } else if (actions) {
      const actionList = String(actions).split(',').map((item) => item.trim()).filter(Boolean);
      if (actionList.length > 0) filter.action = { $in: actionList };
    }

    // 2.5 Filter by specific database connection target
    if (connectionId) {
      if (connectionId === 'global') {
        filter.connection = null;
      } else {
        filter.connection = connectionId;
      }
    }

    // 3. Filter by date range (from ... to)
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        // Parse start date from start of day
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        // Parse end date to end of day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // 3.5 Exact time window, e.g. 10 Nov 2:00 PM to 6:00 PM. It replaces the day range above.
    const fromMoment = parseMoment(from);
    const toMoment = parseMoment(to);
    if (fromMoment === null || toMoment === null) {
      return res.status(400).json({ message: 'From and To must be valid dates and times.' });
    }
    if (fromMoment && toMoment && fromMoment > toMoment) {
      return res.status(400).json({ message: 'From must be earlier than To.' });
    }
    if (fromMoment || toMoment) {
      filter.createdAt = {};
      if (fromMoment) filter.createdAt.$gte = fromMoment;
      if (toMoment) filter.createdAt.$lte = toMoment;
    }

    // Count only: lets the download box show how many records match before downloading.
    // Query type and role are checked after loading, so those still go the long way.
    const wantsCount = countOnly === '1' || countOnly === 'true';
    if (wantsCount && !queryType && !role) {
      return res.status(200).json({ success: true, count: await AuditLog.countDocuments(filter) });
    }

    const rowLimit = Math.min(MAX_ROW_LIMIT, Math.max(1, Number.parseInt(limit, 10) || DEFAULT_ROW_LIMIT));

    // Retrieve database logs
    let logs = await AuditLog.find(filter)
      .populate('user', 'name email role')
      .populate('connection', 'name type')
      .sort({ createdAt: -1 })
      .limit(rowLimit);

    // 4. Client query statement categorization filter (select, insert, update, delete)
    if (queryType) {
      const typeLower = queryType.toLowerCase();
      logs = logs.filter(log => {
        if (log.action !== 'RUN_QUERY' && log.action !== 'SLOW_QUERY') return false;
        
        const detailsLower = (log.details || '').toLowerCase().trim();
        
        if (typeLower === 'select') {
          return detailsLower.startsWith('select') || detailsLower.includes('select ');
        }
        if (typeLower === 'insert') {
          return detailsLower.startsWith('insert') || detailsLower.includes('insert ');
        }
        if (typeLower === 'update') {
          return detailsLower.startsWith('update') || detailsLower.includes('update ');
        }
        if (typeLower === 'delete') {
          return detailsLower.startsWith('delete') || detailsLower.includes('delete ') || detailsLower.includes('drop ') || detailsLower.includes('truncate ');
        }
        
        return detailsLower.includes(typeLower);
      });
    }

    // 5. Filter by team member role
    if (role) {
      logs = logs.filter(log => log.user && log.user.role === role);
    }

    if (wantsCount) {
      return res.status(200).json({ success: true, count: logs.length });
    }

    res.status(200).json({ success: true, logs, limit: rowLimit });
  } catch (err) {
    console.error('System audit fetch error:', err.message);
    res.status(500).json({ message: 'Error fetching system audit logs', error: err.message });
  }
};
