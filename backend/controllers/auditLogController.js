const AuditLog = require('../models/auditLogModel');

/**
 * Retrieve all system audit logs (Admin Only)
 */
exports.getSystemAuditLogs = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access only!' });
    }

    const { userId, action, startDate, endDate, queryType } = req.query;
    const filter = {};

    // 1. Filter by specific user
    if (userId) {
      filter.user = userId;
    }

    // 2. Filter by specific action type
    if (action) {
      filter.action = action;
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

    // Retrieve database logs
    let logs = await AuditLog.find(filter)
      .populate('user', 'name email role')
      .populate('connection', 'name type')
      .sort({ createdAt: -1 })
      .limit(2000); // Admin limit capping for system overview

    // 4. Client query statement categorization filter (select, insert, update, delete)
    if (queryType) {
      const typeLower = queryType.toLowerCase();
      logs = logs.filter(log => {
        if (log.action !== 'RUN_QUERY') return false;
        
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

    res.status(200).json({ success: true, logs });
  } catch (err) {
    console.error('System audit fetch error:', err.message);
    res.status(500).json({ message: 'Error fetching system audit logs', error: err.message });
  }
};
