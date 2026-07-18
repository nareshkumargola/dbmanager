const SlowQuery = require('../models/slowQueryModel');
const { sendSlackNotification, sendEmailNotification, sendDiscordNotification } = require('../services/notificationService');

// Slow query threshold — 100ms se zyada = slow
const SLOW_THRESHOLD = 100;

// Suggestion generate karo
const generateSuggestion = (query, executionTime) => {
  const upperQuery = query.toUpperCase();

  if (upperQuery.includes('SELECT *')) {
    return 'SELECT * ki jagah specific columns use karo — e.g. SELECT id, name';
  }
  if (!upperQuery.includes('WHERE') && upperQuery.includes('SELECT')) {
    return 'WHERE clause add karo — full table scan ho raha hai!';
  }
  if (upperQuery.includes('LIKE') && upperQuery.includes('%')) {
    return 'LIKE "%value%" slow hota hai — Full text search use karo';
  }
  if (upperQuery.includes('JOIN') && executionTime > 500) {
    return 'JOIN pe index check karo — foreign key columns pe index hona chahiye';
  }
  if (upperQuery.includes('ORDER BY') && !upperQuery.includes('LIMIT')) {
    return 'ORDER BY ke saath LIMIT use karo — unnecessary rows mat lao';
  }
  return 'Query optimize karo — EXPLAIN keyword se analysis karo';
};

// Slow query save karo — dbController se call hoga
exports.saveSlowQuery = async (connectionId, userId, query, executionTime, rowsExamined) => {
  try {
    if (!connectionId) return;
    const Connection = require('../models/connectionModel');
    const connection = await Connection.findById(connectionId);
    const threshold = (connection && connection.slowQueryThreshold) !== undefined
      ? connection.slowQueryThreshold
      : SLOW_THRESHOLD;

    if (executionTime >= threshold) {
      const suggestion = generateSuggestion(query, executionTime);
      await SlowQuery.create({
        connection: connectionId,
        user: userId,
        query,
        executionTime,
        rowsExamined,
        suggestion,
      });

      // Send Alert notification if alerts are enabled
      if (connection && connection.alertsEnabled) {
        const alertPayload = {
          connectionName: connection.name,
          type: 'slow_query',
          message: `Query execution took ${executionTime}ms (threshold: ${threshold}ms).\nQuery: \`${query.substring(0, 150)}\`...\nSuggestion: ${suggestion}`,
          severity: 'warning',
          resolved: false
        };
        await sendSlackNotification(connection.alertSlackWebhook, alertPayload);
        await sendDiscordNotification(connection.alertDiscordWebhook, alertPayload);
        
        let recipientEmail = connection.alertEmail;
        if (!recipientEmail) {
          try {
            const User = require('../models/userModel');
            const admins = await User.find({ role: 'admin' }, 'email');
            recipientEmail = admins.map(u => u.email).filter(Boolean).join(',');
          } catch (e) {
            console.error('Failed to resolve fallback admin emails for slow query:', e.message);
          }
        }
        if (recipientEmail) {
          await sendEmailNotification(recipientEmail, alertPayload);
        }
      }
    }
  } catch (err) {
    console.error('Slow query not saved:', err.message);
  }
};

// Slow queries dekho
exports.getSlowQueries = async (req, res) => {
  try {
    const { connectionId } = req.query;
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId parameter required!' });
    }
    const queries = await SlowQuery.find({ user: req.user.id, connection: connectionId })
      .sort({ executionTime: -1 }) // Sabse slow pehle
      .limit(50);

    // Stats calculate karo
    const totalQueries = queries.length;
    const avgTime = totalQueries > 0
      ? Math.round(queries.reduce((sum, q) => sum + q.executionTime, 0) / totalQueries)
      : 0;
    const slowestQuery = queries[0] || null;

    res.status(200).json({
      success: true,
      queries,
      stats: {
        totalSlowQueries: totalQueries,
        avgExecutionTime: avgTime,
        slowestTime: slowestQuery?.executionTime || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Single slow query delete karo
exports.deleteSlowQuery = async (req, res) => {
  try {
    await SlowQuery.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Deleted!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Poori history clear karo
exports.clearSlowQueries = async (req, res) => {
  try {
    const { connectionId } = req.query;
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId parameter required!' });
    }
    await SlowQuery.deleteMany({ user: req.user.id, connection: connectionId });
    res.status(200).json({ success: true, message: 'Query history cleared successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};