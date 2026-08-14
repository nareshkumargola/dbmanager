const SlowQuery = require('../models/slowQueryModel');
const { sendSlackNotification, sendEmailNotification, sendDiscordNotification } = require('../services/notificationService');

// Slow query threshold — 100ms se zyada = slow
const SLOW_THRESHOLD = 100;

// Generate AI optimization suggestions
const generateSuggestion = (query, executionTime) => {
  const upperQuery = query.toUpperCase();

  if (upperQuery.includes('SELECT *')) {
    return 'Avoid SELECT * and specify required columns explicitly — e.g., SELECT id, name.';
  }
  if (!upperQuery.includes('WHERE') && upperQuery.includes('SELECT')) {
    return 'Add a WHERE clause to filter records — current query performs a full table scan!';
  }
  if (upperQuery.includes('LIKE') && upperQuery.includes('%')) {
    return 'Leading wildcards LIKE "%value%" are slow — consider using Full-Text Search indexing.';
  }
  if (upperQuery.includes('JOIN') && executionTime > 500) {
    return 'Check indexes on JOIN conditions — ensure foreign key columns are indexed.';
  }
  if (upperQuery.includes('ORDER BY') && !upperQuery.includes('LIMIT')) {
    return 'Use a LIMIT clause with ORDER BY to restrict returned rows.';
  }
  return 'Optimize query structure — use the EXPLAIN statement to analyze execution plan.';
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
    const { connectionId, minMs } = req.query;
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId parameter required!' });
    }

    const filter = { connection: connectionId };
    if (minMs !== undefined && minMs !== '' && !isNaN(minMs)) {
      filter.executionTime = { $gte: parseInt(minMs) };
    }

    const queries = await SlowQuery.find(filter)
      .populate('user', 'name email role')
      .populate('connection', 'name type')
      .sort({ executionTime: -1 }) // Sabse slow pehle
      .limit(100);

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

// Live Running Server Processes (SHOW PROCESSLIST / pg_stat_activity)
exports.getLiveProcesses = async (req, res) => {
  try {
    const { connectionId, minMs } = req.query;
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId parameter required!' });
    }

    const Connection = require('../models/connectionModel');
    const { getConnection } = require('../connections/connectionManager');
    
    const connection = await Connection.findById(connectionId);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    const { conn, type } = await getConnection(connection);
    let processes = [];
    const minThresholdMs = minMs !== undefined && minMs !== '' && !isNaN(minMs) ? parseInt(minMs) : 0;

    if (type === 'mysql') {
      const [rows] = await conn.execute('SHOW FULL PROCESSLIST');
      processes = (rows || []).map(r => {
        // MySQL Time is in seconds, convert to ms for comparison and display
        const timeMs = (r.Time || 0) * 1000;
        return {
          Id: r.Id,
          User: r.User || 'system',
          Host: r.Host || 'localhost',
          db: r.db || null,
          Command: r.Command || 'Query',
          Time: timeMs,
          TimeSec: r.Time || 0,
          State: r.State || null,
          Info: r.Info || null
        };
      });
    } else if (type === 'postgresql') {
      const dbName = connection.database || 'postgres';
      const result = await conn.query(`
        SELECT 
          pid AS "Id",
          usename AS "User",
          COALESCE(client_addr::text, 'localhost') || ':' || COALESCE(client_port::text, '0') AS "Host",
          datname AS "db",
          COALESCE(backend_type, 'client backend') AS "Command",
          ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000) AS "Time",
          COALESCE(state, 'active') AS "State",
          query AS "Info"
        FROM pg_stat_activity
        WHERE datname = $1
      `, [dbName]);

      processes = (result.rows || []).map(r => {
        const tMs = Math.max(0, parseInt(r.Time) || 0);
        return {
          Id: r.Id,
          User: r.User || 'postgres',
          Host: r.Host || 'localhost',
          db: r.db || dbName,
          Command: r.Command || 'client backend',
          Time: tMs,
          TimeSec: Math.round(tMs / 1000),
          State: r.State || 'active',
          Info: r.Info || null
        };
      });
    } else if (type === 'mongodb') {
      const dbName = connection.database || 'test';
      try {
        const adminDb = conn.db('admin');
        const opResult = await adminDb.command({ currentOp: 1 });
        processes = (opResult.inprog || []).map(op => {
          const tMs = Math.round((op.microsecs_running || 0) / 1000) || ((op.secs_running || 0) * 1000);
          return {
            Id: op.opid,
            User: op.effectiveUsers?.[0]?.user || 'admin',
            Host: op.client || 'localhost',
            db: op.ns || dbName,
            Command: op.op || 'command',
            Time: tMs,
            TimeSec: op.secs_running || 0,
            State: op.desc || op.msg || 'active',
            Info: op.command ? JSON.stringify(op.command) : null
          };
        });
      } catch (mErr) {
        processes = [];
      }
    }

    if (minThresholdMs > 0) {
      processes = processes.filter(p => p.Time >= minThresholdMs);
    }

    // Sort by Time descending (slowest first)
    processes.sort((a, b) => b.Time - a.Time);

    res.status(200).json({
      success: true,
      processes,
      totalCount: processes.length
    });
  } catch (err) {
    console.error('Error fetching live processes:', err.message);
    res.status(500).json({ message: 'Error fetching live server processes', error: err.message });
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