const { getConnection } = require('../connections/connectionManager');
const Connection = require('../models/connectionModel');
const MonitoringSnapshot = require('../models/monitoringSnapshotModel');
const Alert = require('../models/alertModel');

// ─── HELPER: Group snapshots by hour ──────────────────
const groupByHour = (snapshots) => {
  const grouped = {};
  snapshots.forEach(snap => {
    const hour = new Date(snap.createdAt);
    hour.setMinutes(0, 0, 0);
    const key = hour.toISOString();
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(snap);
  });
  return grouped;
};

// ─── HELPER: Calculate average for hour ──────────────
const getHourlyAverage = (snapshots, includeDate = false) => {
  if (snapshots.length === 0) return null;
  
  const dateObj = new Date(snapshots[0].createdAt);
  const timeLabel = includeDate
    ? dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

  const avg = {
    hour: timeLabel,
    activeConnections: Math.round(snapshots.reduce((sum, s) => sum + s.activeConnections, 0) / snapshots.length),
    maxConnections: snapshots[snapshots.length - 1]?.maxConnections || 0,
    queriesPerSecond: parseFloat((snapshots.reduce((sum, s) => sum + s.queriesPerSecond, 0) / snapshots.length).toFixed(2)),
    slowQueries: Math.round(snapshots.reduce((sum, s) => sum + s.slowQueries, 0) / snapshots.length),
    sizeMB: parseFloat((snapshots.reduce((sum, s) => sum + s.sizeMB, 0) / snapshots.length).toFixed(2)),
    totalTables: snapshots[snapshots.length - 1]?.totalTables || 0,
    bytesSent: Math.round(snapshots.reduce((sum, s) => sum + (s.bytesSent || 0), 0) / snapshots.length),
    bytesReceived: Math.round(snapshots.reduce((sum, s) => sum + (s.bytesReceived || 0), 0) / snapshots.length),
    uptime: snapshots[snapshots.length - 1]?.uptime || 0,
    cacheHitRate: parseFloat((snapshots.reduce((sum, s) => sum + (s.cacheHitRate || 0), 0) / snapshots.length).toFixed(2)),
    commits: snapshots[snapshots.length - 1]?.commits || 0,
    rollbacks: snapshots[snapshots.length - 1]?.rollbacks || 0,
    blocksRead: snapshots[snapshots.length - 1]?.blocksRead || 0,
    blocksHit: snapshots[snapshots.length - 1]?.blocksHit || 0,
    totalCollections: snapshots[snapshots.length - 1]?.totalCollections || 0,
    totalDocuments: snapshots[snapshots.length - 1]?.totalDocuments || 0,
  };
  return avg;
};

exports.getMonitoringData = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection, database);
    let data = {};

    if (type === 'mysql') {
      // Active connections
      const [processes] = await conn.execute('SHOW PROCESSLIST');

      // Global status
      const [status] = await conn.execute('SHOW GLOBAL STATUS');
      const statusMap = {};
      status.forEach(s => { statusMap[s.Variable_name] = s.Value; });

      // Global variables
      const [variables] = await conn.execute('SHOW GLOBAL VARIABLES');
      const varMap = {};
      variables.forEach(v => { varMap[v.Variable_name] = v.Value; });

      let sizeMB = 0;
      let totalTables = 0;
      if (database) {
        const [sizeResult] = await conn.execute(`
          SELECT 
            ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMB
          FROM information_schema.tables
          WHERE table_schema = ?
        `, [database]);

        const [tables] = await conn.execute(
          `SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = ?`,
          [database]
        );

        sizeMB = parseFloat(sizeResult[0]?.sizeMB || 0);
        totalTables = tables.length;
      } else {
        const [sizeResult] = await conn.execute(`
          SELECT 
            ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMB
          FROM information_schema.tables
          WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys')
        `);

        const [tables] = await conn.execute(`
          SELECT TABLE_NAME FROM information_schema.tables
          WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys')
        `);

        sizeMB = parseFloat(sizeResult[0]?.sizeMB || 0);
        totalTables = tables.length;
      }

      const [slowQ] = await conn.execute(
        "SHOW GLOBAL STATUS LIKE 'Slow_queries'"
      );

      const [questions] = await conn.execute(
        "SHOW GLOBAL STATUS LIKE 'Questions'"
      );
      const [uptime] = await conn.execute(
        "SHOW GLOBAL STATUS LIKE 'Uptime'"
      );

      const uptimeSeconds = parseInt(uptime[0]?.Value || 1);
      const totalQueries = parseInt(questions[0]?.Value || 0);
      const qps = (totalQueries / Math.max(uptimeSeconds, 1)).toFixed(2);

      // Calculate cache hit rate
      const innodbHits = parseInt(statusMap['Innodb_buffer_pool_read_requests'] || 0);
      const innodbReads = parseInt(statusMap['Innodb_buffer_pool_reads'] || 0);
      const cacheHitRate = innodbHits > 0 ? (((innodbHits - innodbReads) / innodbHits) * 100).toFixed(2) : 0;

      data = {
        type: 'mysql',
        activeConnections: processes.length,
        maxConnections: parseInt(varMap['max_connections'] || 100),
        totalTables,
        sizeMB,
        slowQueries: parseInt(slowQ[0]?.Value || 0),
        queriesPerSecond: parseFloat(qps),
        uptime: uptimeSeconds,
        bytesSent: parseInt(statusMap['Bytes_sent'] || 0),
        bytesReceived: parseInt(statusMap['Bytes_received'] || 0),
        innodbHits,
        innodbReads,
        cacheHitRate: parseFloat(cacheHitRate),
      };
    }

    else if (type === 'postgresql') {
      const dbName = database || connection.database || 'postgres';
      const connCount = await conn.query(
        'SELECT count(*) FROM pg_stat_activity'
      );
      const maxConn = await conn.query(
        'SHOW max_connections'
      );
      const dbSize = await conn.query(
        `SELECT pg_size_pretty(pg_database_size($1)) AS size`,
        [dbName]
      );
      const tables = await conn.query(`
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public'
      `);
      const stats = await conn.query(`
        SELECT * FROM pg_stat_database WHERE datname = $1
      `, [dbName]);

      data = {
        type: 'postgresql',
        activeConnections: parseInt(connCount.rows[0]?.count || 0),
        maxConnections: parseInt(maxConn.rows[0]?.max_connections || 100),
        size: dbSize.rows[0]?.size || '0',
        totalTables: parseInt(tables.rows[0]?.count || 0),
        commits: stats.rows[0]?.xact_commit || 0,
        rollbacks: stats.rows[0]?.xact_rollback || 0,
        blocksRead: stats.rows[0]?.blks_read || 0,
        blocksHit: stats.rows[0]?.blks_hit || 0,
      };
    }

    else if (type === 'mongodb') {
      const dbName = database || connection.database || 'test';
      const db = conn.db(dbName);
      const serverStatus = await db.command({ serverStatus: 1 });
      const dbStats = await db.stats();
      const collections = await db.listCollections().toArray();

      data = {
        type: 'mongodb',
        activeConnections: serverStatus.connections?.current || 0,
        maxConnections: serverStatus.connections?.available || 0,
        totalCollections: collections.length,
        totalDocuments: dbStats.objects || 0,
        sizeMB: ((dbStats.dataSize || 0) / 1024 / 1024).toFixed(2),
        opCounters: {
          insert: serverStatus.opcounters?.insert || 0,
          query: serverStatus.opcounters?.query || 0,
          update: serverStatus.opcounters?.update || 0,
          delete: serverStatus.opcounters?.delete || 0,
        },
        uptime: serverStatus.uptime || 0,
      };
    }

    else if (type === 'oracle') {
      const sizeResult = await conn.execute(`
        SELECT ROUND(SUM(bytes) / 1024 / 1024, 2) AS SIZEMB FROM user_segments
      `);
      const tablesResult = await conn.execute(`
        SELECT COUNT(*) AS COUNT FROM user_tables
      `);
      
      let activeConnections = 1;
      try {
        const connResult = await conn.execute(`
          SELECT COUNT(*) AS COUNT FROM v$session WHERE status = 'ACTIVE'
        `);
        activeConnections = connResult.rows[0]?.COUNT || connResult.rows[0]?.count || 1;
      } catch (err) {
        // Fallback
      }

      data = {
        type: 'oracle',
        activeConnections,
        maxConnections: 150,
        totalTables: tablesResult.rows[0]?.COUNT || tablesResult.rows[0]?.count || 0,
        sizeMB: sizeResult.rows[0]?.SIZEMB || sizeResult.rows[0]?.sizemb || 0,
        slowQueries: 0,
        queriesPerSecond: 0.1,
        uptime: 3600
      };
    }

    res.status(200).json({ success: true, data, timestamp: new Date() });
  } catch (err) {
    console.error('Monitoring error:', err);
    res.status(500).json({ message: 'Monitoring error', error: err.message });
  }
};

// ─── GET TABLE-WISE SIZE AND ROW COUNT ──────────────
exports.getTableDetails = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection, database);

    let tableData = [];

    if (type === 'mysql' && database) {
      // Get table-wise size and row count sorted by rows descending
      const [tables] = await conn.execute(`
        SELECT 
          TABLE_NAME,
          TABLE_ROWS,
          ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb,
          DATA_LENGTH,
          INDEX_LENGTH
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_ROWS DESC, (DATA_LENGTH + INDEX_LENGTH) DESC
      `, [database]);

      tableData = tables.map(t => ({
        table: t.TABLE_NAME,
        rows: parseInt(t.TABLE_ROWS || 0),
        sizeMB: parseFloat(t.size_mb || 0),
        dataSize: parseInt(t.DATA_LENGTH || 0),
        indexSize: parseInt(t.INDEX_LENGTH || 0),
      }));
    } else if (type === 'postgresql' && database) {
      // For PostgreSQL sorted by size / rows descending
      const tables = await conn.query(`
        SELECT 
          t.tablename AS table,
          t.schemaname AS schema,
          COALESCE(GREATEST(c.reltuples, 0), 0) AS rows,
          ROUND(pg_total_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename)) / 1024.0 / 1024.0, 4) AS "sizeMB",
          pg_size_pretty(pg_total_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename))) AS size
        FROM pg_tables t
        JOIN pg_namespace n ON n.nspname = t.schemaname
        JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = n.oid
        WHERE t.schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY pg_total_relation_size(quote_ident(t.schemaname)||'.'||quote_ident(t.tablename)) DESC, c.reltuples DESC
      `);

      tableData = tables.rows.map(t => ({
        table: t.schema === 'public' ? t.table : `${t.schema}.${t.table}`,
        rows: Math.max(0, Math.round(t.rows || 0)),
        size: t.size,
        sizeMB: parseFloat(t.sizeMB || 0.01),
      }));
    } else if (type === 'mongodb' && database) {
      // For MongoDB collections sorted by rows descending
      const db = conn.db(database);
      const collections = await db.listCollections().toArray();
      const collData = [];
      for (const col of collections) {
        try {
          const count = await db.collection(col.name).countDocuments().catch(() => 0);
          const stats = await db.command({ collStats: col.name }).catch(() => null);
          collData.push({
            table: col.name,
            rows: count,
            sizeMB: stats ? parseFloat((stats.size / 1024 / 1024).toFixed(4)) : 0,
          });
        } catch (e) {
          console.error(`Error loading stats for MongoDB collection ${col.name}:`, e.message);
        }
      }
      collData.sort((a, b) => b.rows - a.rows);
      tableData = collData;
    } else if (type === 'oracle') {
      const tables = await conn.execute(`
        SELECT 
          table_name,
          num_rows,
          ROUND((blocks * 8192) / 1024 / 1024, 2) AS size_mb
        FROM user_tables
        ORDER BY num_rows DESC NULLS LAST
      `);
      const rows = tables.rows || [];
      tableData = rows.map(t => ({
        table: t.TABLE_NAME || t.table_name || Object.values(t)[0],
        rows: parseInt(t.NUM_ROWS !== undefined ? t.NUM_ROWS : (t.num_rows !== undefined ? t.num_rows : Object.values(t)[1] || 0)),
        sizeMB: parseFloat(t.SIZE_MB !== undefined ? t.SIZE_MB : (t.size_mb !== undefined ? t.size_mb : Object.values(t)[2] || 0)),
      }));
    }

    res.status(200).json({ success: true, tables: tableData, timestamp: new Date() });
  } catch (err) {
    console.error('Table details error:', err);
    res.status(500).json({ message: 'Table details error', error: err.message });
  }
};

// ─── GET HISTORICAL MONITORING DATA (5 HOURS) ────────
exports.getMonitoringHistory = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection, database);

    // Get current data
    let currentData = {};
    
    if (type === 'mysql') {
      const [processes] = await conn.execute('SHOW PROCESSLIST');
      const [status] = await conn.execute('SHOW GLOBAL STATUS');
      const statusMap = {};
      status.forEach(s => { statusMap[s.Variable_name] = s.Value; });
      const [variables] = await conn.execute('SHOW GLOBAL VARIABLES');
      const varMap = {};
      variables.forEach(v => { varMap[v.Variable_name] = v.Value; });

      let sizeMB = 0, totalTables = 0;
      if (database) {
        const [sizeResult] = await conn.execute(`
          SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMB
          FROM information_schema.tables WHERE table_schema = ?`, [database]);
        const [tables] = await conn.execute(
          `SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = ?`, [database]);
        sizeMB = parseFloat(sizeResult[0]?.sizeMB || 0);
        totalTables = tables.length;
      }

      const [slowQ] = await conn.execute("SHOW GLOBAL STATUS LIKE 'Slow_queries'");
      const [questions] = await conn.execute("SHOW GLOBAL STATUS LIKE 'Questions'");
      const [uptime] = await conn.execute("SHOW GLOBAL STATUS LIKE 'Uptime'");

      const uptimeSeconds = parseInt(uptime[0]?.Value || 1);
      const totalQueries = parseInt(questions[0]?.Value || 0);
      const qps = (totalQueries / Math.max(uptimeSeconds, 1)).toFixed(2);

      // Calculate cache hit rate
      const innodbHits = parseInt(statusMap['Innodb_buffer_pool_read_requests'] || 0);
      const innodbReads = parseInt(statusMap['Innodb_buffer_pool_reads'] || 0);
      const cacheHitRate = innodbHits > 0 ? (((innodbHits - innodbReads) / innodbHits) * 100).toFixed(2) : 0;

      currentData = {
        type: 'mysql',
        activeConnections: processes.length,
        maxConnections: parseInt(varMap['max_connections'] || 100),
        totalTables,
        sizeMB,
        slowQueries: parseInt(slowQ[0]?.Value || 0),
        queriesPerSecond: parseFloat(qps),
        uptime: uptimeSeconds,
        bytesSent: parseInt(statusMap['Bytes_sent'] || 0),
        bytesReceived: parseInt(statusMap['Bytes_received'] || 0),
        innodbHits,
        innodbReads,
        cacheHitRate: parseFloat(cacheHitRate),
      };
    } else if (type === 'postgresql') {
      const dbName = database || connection.database || 'postgres';
      const connCount = await conn.query('SELECT count(*) FROM pg_stat_activity');
      const maxConn = await conn.query('SHOW max_connections');
      const dbSize = await conn.query(`SELECT pg_size_pretty(pg_database_size($1)) AS size`, [dbName]);
      const tables = await conn.query(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`);
      const stats = await conn.query(`SELECT * FROM pg_stat_database WHERE datname = $1`, [dbName]);

      currentData = {
        type: 'postgresql',
        activeConnections: parseInt(connCount.rows[0]?.count || 0),
        maxConnections: parseInt(maxConn.rows[0]?.max_connections || 100),
        size: dbSize.rows[0]?.size || '0',
        totalTables: parseInt(tables.rows[0]?.count || 0),
        commits: stats.rows[0]?.xact_commit || 0,
        rollbacks: stats.rows[0]?.xact_rollback || 0,
        blocksRead: stats.rows[0]?.blks_read || 0,
        blocksHit: stats.rows[0]?.blks_hit || 0,
      };
    } else if (type === 'mongodb') {
      const dbName = database || connection.database || 'test';
      const db = conn.db(dbName);
      const serverStatus = await db.command({ serverStatus: 1 });
      const dbStats = await db.stats();
      const collections = await db.listCollections().toArray();

      currentData = {
        type: 'mongodb',
        activeConnections: serverStatus.connections?.current || 0,
        maxConnections: serverStatus.connections?.available || 0,
        totalCollections: collections.length,
        totalDocuments: dbStats.objects || 0,
        sizeMB: ((dbStats.dataSize || 0) / 1024 / 1024).toFixed(2),
        opCounters: {
          insert: serverStatus.opcounters?.insert || 0,
          query: serverStatus.opcounters?.query || 0,
          update: serverStatus.opcounters?.update || 0,
          delete: serverStatus.opcounters?.delete || 0,
        },
        uptime: serverStatus.uptime || 0,
      };
    } else if (type === 'oracle') {
      const sizeResult = await conn.execute(`
        SELECT ROUND(SUM(bytes) / 1024 / 1024, 2) AS SIZEMB FROM user_segments
      `);
      const tablesResult = await conn.execute(`
        SELECT COUNT(*) AS COUNT FROM user_tables
      `);
      
      let activeConnections = 1;
      try {
        const connResult = await conn.execute(`
          SELECT COUNT(*) AS COUNT FROM v$session WHERE status = 'ACTIVE'
        `);
        activeConnections = connResult.rows[0]?.COUNT || connResult.rows[0]?.count || 1;
      } catch (err) {
        // Fallback
      }

      currentData = {
        type: 'oracle',
        activeConnections,
        maxConnections: 150,
        totalTables: tablesResult.rows[0]?.COUNT || tablesResult.rows[0]?.count || 0,
        sizeMB: sizeResult.rows[0]?.SIZEMB || sizeResult.rows[0]?.sizemb || 0,
        slowQueries: 0,
        queriesPerSecond: 0.1,
        uptime: 3600
      };
    }

    // Save current snapshot
    try {
      await MonitoringSnapshot.create({
        connection: connection._id,
        database,
        ...currentData,
      });
    } catch (e) {
      console.warn('Snapshot save failed:', e.message);
    }

    const range = req.query.range || 'current';
    const query = {
      connection: connection._id
    };

    if (database) {
      query.$or = [
        { database: database },
        { database: null },
        { database: { $exists: false } }
      ];
    }
    
    let timeAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    let includeDate = false;

    if (range === '1day') {
      timeAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      includeDate = true;
      query.createdAt = { $gte: timeAgo };
    } else if (range === '2day') {
      timeAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      includeDate = true;
      query.createdAt = { $gte: timeAgo };
    } else if (range === '3day') {
      timeAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      includeDate = true;
      query.createdAt = { $gte: timeAgo };
    } else if (range === '4day') {
      timeAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      includeDate = true;
      query.createdAt = { $gte: timeAgo };
    } else if (range === '5day') {
      timeAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      includeDate = true;
      query.createdAt = { $gte: timeAgo };
    } else if (range === 'custom') {
      includeDate = true;
      const start = req.query.startDate ? new Date(req.query.startDate) : null;
      const end = req.query.endDate ? new Date(req.query.endDate) : null;
      if (start || end) {
        query.createdAt = {};
        if (start) query.createdAt.$gte = start;
        if (end) {
          const endOfDay = new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);
          query.createdAt.$lte = endOfDay;
        }
      }
    } else {
      query.createdAt = { $gte: timeAgo };
    }

    const snapshots = await MonitoringSnapshot.find(query).sort({ createdAt: 1 });

    // Group by hour
    const grouped = groupByHour(snapshots);
    const hourlyData = Object.entries(grouped)
      .map(([, snaps]) => getHourlyAverage(snaps, includeDate))
      .filter(Boolean);

    res.status(200).json({
      success: true,
      current: currentData,
      hourly: hourlyData,
      snapshots: snapshots,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Monitoring history error:', err);
    res.status(500).json({ message: 'Monitoring history error', error: err.message });
  }
};

// ─── GET ALERT LOGS FOR CONNECTION ────────────────────
exports.getConnectionAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find({ connection: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.status(200).json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching alerts', error: err.message });
  }
};

// ─── MANUALLY RESOLVE AN ALERT ───────────────────────
exports.resolveAlert = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.alertId);
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found!' });
    }
    alert.resolved = true;
    alert.resolvedAt = new Date();
    await alert.save();
    res.status(200).json({ success: true, message: 'Alert marked as resolved successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error resolving alert', error: err.message });
  }
};

// ─── SAVE CONNECTION ALERT CONFIGURATIONS ────────────
exports.updateAlertSettings = async (req, res) => {
  try {
    const { alertsEnabled, alertEmail, alertSlackWebhook, alertDiscordWebhook, alertThreshold, slowQueryThreshold } = req.body;
    const connection = await Connection.findByIdAndUpdate(
      req.params.id,
      {
        alertsEnabled: !!alertsEnabled,
        alertEmail: alertEmail || null,
        alertSlackWebhook: alertSlackWebhook || null,
        alertDiscordWebhook: alertDiscordWebhook || null,
        alertThreshold: parseInt(alertThreshold) || 90,
        slowQueryThreshold: parseInt(slowQueryThreshold) || 100
      },
      { new: true }
    );

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    res.status(200).json({
      success: true,
      message: 'Alert configurations saved successfully!',
      connection: {
        alertsEnabled: connection.alertsEnabled,
        alertEmail: connection.alertEmail,
        alertSlackWebhook: connection.alertSlackWebhook,
        alertDiscordWebhook: connection.alertDiscordWebhook,
        alertThreshold: connection.alertThreshold,
        slowQueryThreshold: connection.slowQueryThreshold
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error saving settings', error: err.message });
  }
};