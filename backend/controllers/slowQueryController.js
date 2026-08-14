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
    const { connectionId, database, minMs } = req.query;
    const Connection = require('../models/connectionModel');
    const User = require('../models/userModel');

    let allowedConnIds = [];
    let connDatabaseMap = {}; // connId -> array of allowed db names

    const userObj = await User.findById(req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (isAdmin) {
      const allConns = await Connection.find({}, '_id name');
      allowedConnIds = allConns.map(c => c._id.toString());
    } else {
      const dbConns = await Connection.find({
        $or: [{ user: req.user.id }, { allowedUsers: req.user.id }]
      }, '_id name');
      
      const userAllowedConns = userObj?.allowedConnections || [];
      const idSet = new Set(dbConns.map(c => c._id.toString()));
      userAllowedConns.forEach(ac => {
        if (ac.connectionId) {
          idSet.add(ac.connectionId.toString());
          connDatabaseMap[ac.connectionId.toString()] = ac.databases || ['*'];
        }
      });
      
      allowedConnIds = Array.from(idSet).filter(Boolean);
    }

    let filterConnIds = allowedConnIds;
    if (connectionId && connectionId !== 'all') {
      filterConnIds = allowedConnIds.filter(id => id === connectionId);
    }

    if (filterConnIds.length === 0) {
      return res.status(200).json({
        success: true,
        queries: [],
        stats: { totalSlowQueries: 0, avgExecutionTime: 0, slowestTime: 0 }
      });
    }

    const filter = { connection: { $in: filterConnIds } };
    if (minMs !== undefined && minMs !== '' && !isNaN(minMs)) {
      filter.executionTime = { $gte: parseInt(minMs) };
    }

    let queries = await SlowQuery.find(filter)
      .populate('user', 'name email role')
      .populate('connection', 'name type database')
      .sort({ executionTime: -1 })
      .limit(200);

    // Database specific filtering
    if (database && database !== 'all') {
      queries = queries.filter(q => {
        const qDb = q.database || q.connection?.database;
        return !qDb || qDb === database || (q.query && q.query.toLowerCase().includes(database.toLowerCase()));
      });
    }

    // For developer, enforce schema restrictions if defined
    if (!isAdmin) {
      queries = queries.filter(q => {
        const cId = q.connection?._id?.toString();
        const allowedDbs = connDatabaseMap[cId];
        if (!allowedDbs || allowedDbs.includes('*')) return true;
        const qDb = q.database || q.connection?.database;
        return !qDb || allowedDbs.includes(qDb);
      });
    }

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
    res.status(500).json({ message: 'Error fetching slow queries', error: err.message });
  }
};

// Live Running Server Processes (SHOW PROCESSLIST / pg_stat_activity)
exports.getLiveProcesses = async (req, res) => {
  try {
    const { connectionId, database, minMs } = req.query;
    const Connection = require('../models/connectionModel');
    const User = require('../models/userModel');
    const { getConnection } = require('../connections/connectionManager');

    const userObj = await User.findById(req.user.id);
    const isAdmin = req.user.role === 'admin';

    let targetConnections = [];
    let connDatabaseMap = {};

    if (isAdmin) {
      if (connectionId && connectionId !== 'all') {
        targetConnections = await Connection.find({ _id: connectionId });
      } else {
        targetConnections = await Connection.find({});
      }
    } else {
      const dbConns = await Connection.find({
        $or: [{ user: req.user.id }, { allowedUsers: req.user.id }]
      });
      const userAllowedConns = userObj?.allowedConnections || [];
      const allowedIds = new Set(dbConns.map(c => c._id.toString()));
      userAllowedConns.forEach(ac => {
        if (ac.connectionId) {
          allowedIds.add(ac.connectionId.toString());
          connDatabaseMap[ac.connectionId.toString()] = ac.databases || ['*'];
        }
      });

      let allowedList = Array.from(allowedIds);
      if (connectionId && connectionId !== 'all') {
        allowedList = allowedList.filter(id => id === connectionId);
      }
      targetConnections = await Connection.find({ _id: { $in: allowedList } });
    }

    const minThresholdMs = minMs !== undefined && minMs !== '' && !isNaN(minMs) ? parseInt(minMs) : 0;
    let allProcesses = [];

    const results = await Promise.allSettled(
      targetConnections.map(async (connection) => {
        try {
          const { conn, type } = await getConnection(connection);
          let procs = [];
          const connName = connection.name;
          const connId = connection._id.toString();

          if (type === 'mysql') {
            const [rows] = await conn.execute('SHOW FULL PROCESSLIST');
            procs = (rows || []).map(r => ({
              Id: `${connId}-${r.Id}`,
              rawId: r.Id,
              connectionId: connId,
              connectionName: connName,
              User: r.User || 'system',
              Host: r.Host || 'localhost',
              db: r.db || connection.database || null,
              Command: r.Command || 'Query',
              Time: (r.Time || 0) * 1000,
              TimeSec: r.Time || 0,
              State: r.State || null,
              Info: r.Info || null
            }));
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
              WHERE datname = $1 OR $1 IS NULL
            `, [dbName]);

            procs = (result.rows || []).map(r => ({
              Id: `${connId}-${r.Id}`,
              rawId: r.Id,
              connectionId: connId,
              connectionName: connName,
              User: r.User || 'postgres',
              Host: r.Host || 'localhost',
              db: r.db || dbName,
              Command: r.Command || 'client backend',
              Time: Math.max(0, parseInt(r.Time) || 0),
              TimeSec: Math.round((parseInt(r.Time) || 0) / 1000),
              State: r.State || 'active',
              Info: r.Info || null
            }));
          } else if (type === 'mongodb') {
            const dbName = connection.database || 'test';
            try {
              const adminDb = conn.db('admin');
              const opResult = await adminDb.command({ currentOp: 1 });
              procs = (opResult.inprog || []).map(op => {
                const tMs = Math.round((op.microsecs_running || 0) / 1000) || ((op.secs_running || 0) * 1000);
                return {
                  Id: `${connId}-${op.opid}`,
                  rawId: op.opid,
                  connectionId: connId,
                  connectionName: connName,
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
              procs = [];
            }
          }

          if (minThresholdMs > 0) {
            procs = procs.filter(p => p.Time >= minThresholdMs);
          }

          if (database && database !== 'all') {
            procs = procs.filter(p => p.db === database);
          }

          if (!isAdmin) {
            const allowedDbs = connDatabaseMap[connId];
            if (allowedDbs && !allowedDbs.includes('*')) {
              procs = procs.filter(p => !p.db || allowedDbs.includes(p.db));
            }
          }

          return procs;
        } catch (err) {
          console.error(`Failed to fetch live processes for ${connection.name}:`, err.message);
          return [];
        }
      })
    );

    results.forEach(res => {
      if (res.status === 'fulfilled') {
        allProcesses.push(...res.value);
      }
    });

    allProcesses.sort((a, b) => b.Time - a.Time);

    res.status(200).json({
      success: true,
      processes: allProcesses,
      totalCount: allProcesses.length
    });
  } catch (err) {
    console.error('Error fetching live server processes:', err.message);
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