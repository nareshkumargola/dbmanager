const Connection = require('../models/connectionModel');
const Alert = require('../models/alertModel');
const MonitoringSnapshot = require('../models/monitoringSnapshotModel');
const { getConnection } = require('../connections/connectionManager');
const { sendSlackNotification, sendEmailNotification } = require('./notificationService');

const evaluateConnectionHealth = async (connDoc, io) => {
  let dbConnection = null;
  try {
    const { conn, type } = await getConnection(connDoc);
    dbConnection = conn;

    // ─── IF REACHABLE: Resolve database down alerts ───
    const activeDownAlert = await Alert.findOne({ connection: connDoc._id, type: 'down', resolved: false });
    if (activeDownAlert) {
      activeDownAlert.resolved = true;
      activeDownAlert.resolvedAt = new Date();
      await activeDownAlert.save();

      const alertPayload = {
        connectionName: connDoc.name,
        type: 'down',
        message: `Database server connection recovered and is back online!`,
        severity: 'critical',
        resolved: true
      };

      await sendSlackNotification(connDoc.alertSlackWebhook, alertPayload);
      await sendEmailNotification(connDoc.alertEmail, alertPayload);
      io.emit('alert-resolved', { ...activeDownAlert.toJSON(), connectionName: connDoc.name });
    }

    // ─── EVALUATE CAPACITY METRICS ───────────────────
    let activeConn = 0;
    let maxConn = 100;

    if (type === 'mysql') {
      const [processes] = await conn.execute('SHOW PROCESSLIST');
      const [variables] = await conn.execute("SHOW GLOBAL VARIABLES LIKE 'max_connections'");
      activeConn = processes.length;
      maxConn = parseInt(variables[0]?.Value || 100);
    } 
    
    else if (type === 'mongodb') {
      const db = conn.db('admin');
      const serverStatus = await db.command({ serverStatus: 1 });
      activeConn = serverStatus.connections?.current || 0;
      maxConn = (serverStatus.connections?.available || 0) + activeConn || 100;
    } 
    
    else if (type === 'postgresql') {
      const connCount = await conn.query('SELECT count(*) FROM pg_stat_activity');
      const maxConnRes = await conn.query('SHOW max_connections');
      activeConn = parseInt(connCount.rows[0]?.count || 0);
      maxConn = parseInt(maxConnRes.rows[0]?.max_connections || 100);
    }

    const ratio = (activeConn / maxConn) * 100;
    const threshold = connDoc.alertThreshold || 90;

    if (ratio >= threshold) {
      const activeResourceAlert = await Alert.findOne({ connection: connDoc._id, type: 'high_resource', resolved: false });
      if (!activeResourceAlert) {
        const message = `Active connection count (${activeConn}/${maxConn}) has reached ${ratio.toFixed(1)}% which exceeds the threshold of ${threshold}%.`;
        const severity = ratio >= 95 ? 'critical' : 'warning';
        
        const alert = await Alert.create({
          connection: connDoc._id,
          type: 'high_resource',
          message,
          severity
        });

        const alertPayload = {
          connectionName: connDoc.name,
          type: 'high_resource',
          message: alert.message,
          severity: alert.severity,
          resolved: false
        };

        await sendSlackNotification(connDoc.alertSlackWebhook, alertPayload);
        await sendEmailNotification(connDoc.alertEmail, alertPayload);
        io.emit('new-alert', { ...alert.toJSON(), connectionName: connDoc.name });
      }
    } else {
      const activeResourceAlert = await Alert.findOne({ connection: connDoc._id, type: 'high_resource', resolved: false });
      if (activeResourceAlert) {
        activeResourceAlert.resolved = true;
        activeResourceAlert.resolvedAt = new Date();
        await activeResourceAlert.save();

        const alertPayload = {
          connectionName: connDoc.name,
          type: 'high_resource',
          message: `Connection utilization usage has recovered to normal levels (${activeConn}/${maxConn} - ${ratio.toFixed(1)}%).`,
          severity: activeResourceAlert.severity,
          resolved: true
        };

        await sendSlackNotification(connDoc.alertSlackWebhook, alertPayload);
        await sendEmailNotification(connDoc.alertEmail, alertPayload);
        io.emit('alert-resolved', { ...activeResourceAlert.toJSON(), connectionName: connDoc.name });
      }
    }

  } catch (err) {
    console.error(`Health evaluation failed for connection "${connDoc.name}":`, err.message);
    
    // ─── IF UNREACHABLE: Create database down alert ───
    const activeDownAlert = await Alert.findOne({ connection: connDoc._id, type: 'down', resolved: false });
    if (!activeDownAlert) {
      const alert = await Alert.create({
        connection: connDoc._id,
        type: 'down',
        message: `Database server is unreachable: ${err.message}`,
        severity: 'critical'
      });

      const alertPayload = {
        connectionName: connDoc.name,
        type: 'down',
        message: alert.message,
        severity: alert.severity,
        resolved: false
      };

      await sendSlackNotification(connDoc.alertSlackWebhook, alertPayload);
      await sendEmailNotification(connDoc.alertEmail, alertPayload);
      io.emit('new-alert', { ...alert.toJSON(), connectionName: connDoc.name });
    }
  }
};

const recordConnectionSnapshot = async (connDoc) => {
  let conn;
  try {
    const connInfo = await getConnection(connDoc);
    conn = connInfo.conn;
    const type = connInfo.type;

    if (type === 'mysql') {
      const [processes] = await conn.execute('SHOW PROCESSLIST');
      const [status] = await conn.execute('SHOW GLOBAL STATUS');
      const statusMap = {};
      status.forEach(s => { statusMap[s.Variable_name] = s.Value; });
      const [variables] = await conn.execute('SHOW GLOBAL VARIABLES');
      const varMap = {};
      variables.forEach(v => { varMap[v.Variable_name] = v.Value; });

      let sizeMB = 0;
      try {
        const [sizeResult] = await conn.execute(`
          SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMB
          FROM information_schema.tables
          WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys')
        `);
        sizeMB = parseFloat(sizeResult[0]?.sizeMB || 0);
      } catch (sizeErr) {
        console.warn('MySQL size read failed in background:', sizeErr.message);
      }

      let totalTables = 0;
      try {
        const [tables] = await conn.execute(`
          SELECT TABLE_NAME FROM information_schema.tables
          WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys')
        `);
        totalTables = tables.length;
      } catch (tablesErr) {
        console.warn('MySQL tables read failed in background:', tablesErr.message);
      }

      const [slowQ] = await conn.execute("SHOW GLOBAL STATUS LIKE 'Slow_queries'");
      const [questions] = await conn.execute("SHOW GLOBAL STATUS LIKE 'Questions'");
      const [uptime] = await conn.execute("SHOW GLOBAL STATUS LIKE 'Uptime'");

      const uptimeSeconds = parseInt(uptime[0]?.Value || 1);
      const totalQueries = parseInt(questions[0]?.Value || 0);
      const qps = parseFloat((totalQueries / Math.max(uptimeSeconds, 1)).toFixed(2));

      const innodbHits = parseInt(statusMap['Innodb_buffer_pool_read_requests'] || 0);
      const innodbReads = parseInt(statusMap['Innodb_buffer_pool_reads'] || 0);
      const cacheHitRate = innodbHits > 0 ? parseFloat((((innodbHits - innodbReads) / innodbHits) * 100).toFixed(2)) : 0;

      await MonitoringSnapshot.create({
        connection: connDoc._id,
        database: connDoc.database || null,
        type: 'mysql',
        activeConnections: processes.length,
        maxConnections: parseInt(varMap['max_connections'] || 100),
        queriesPerSecond: qps,
        slowQueries: parseInt(slowQ[0]?.Value || 0),
        sizeMB,
        totalTables,
        bytesSent: parseInt(statusMap['Bytes_sent'] || 0),
        bytesReceived: parseInt(statusMap['Bytes_received'] || 0),
        innodbHits,
        innodbReads,
        cacheHitRate,
        uptime: uptimeSeconds
      });
    }

    else if (type === 'postgresql') {
      const dbName = connDoc.database || 'postgres';
      const connCount = await conn.query('SELECT count(*) FROM pg_stat_activity');
      const maxConn = await conn.query('SHOW max_connections');
      const dbSize = await conn.query(`SELECT pg_database_size($1) AS size_bytes`, [dbName]);
      const tables = await conn.query(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`);
      const stats = await conn.query(`SELECT * FROM pg_stat_database WHERE datname = $1`, [dbName]);

      const sizeMB = parseFloat((parseInt(dbSize.rows[0]?.size_bytes || 0) / 1024 / 1024).toFixed(2));

      await MonitoringSnapshot.create({
        connection: connDoc._id,
        database: dbName,
        type: 'postgresql',
        activeConnections: parseInt(connCount.rows[0]?.count || 0),
        maxConnections: parseInt(maxConn.rows[0]?.max_connections || 100),
        sizeMB,
        size: `${sizeMB.toFixed(2)} MB`,
        totalTables: parseInt(tables.rows[0]?.count || 0),
        commits: stats.rows[0]?.xact_commit || 0,
        rollbacks: stats.rows[0]?.xact_rollback || 0,
        blocksRead: stats.rows[0]?.blks_read || 0,
        blocksHit: stats.rows[0]?.blks_hit || 0,
      });
    }

    else if (type === 'mongodb') {
      const dbName = connDoc.database || 'test';
      const db = conn.db(dbName);
      const serverStatus = await db.command({ serverStatus: 1 });
      const dbStats = await db.stats();
      const collections = await db.listCollections().toArray();

      await MonitoringSnapshot.create({
        connection: connDoc._id,
        database: dbName,
        type: 'mongodb',
        activeConnections: serverStatus.connections?.current || 0,
        maxConnections: serverStatus.connections?.available || 0,
        totalCollections: collections.length,
        totalDocuments: dbStats.objects || 0,
        sizeMB: parseFloat(((dbStats.dataSize || 0) / 1024 / 1024).toFixed(2)),
        opCounters: {
          insert: serverStatus.opcounters?.insert || 0,
          query: serverStatus.opcounters?.query || 0,
          update: serverStatus.opcounters?.update || 0,
          delete: serverStatus.opcounters?.delete || 0,
        },
        uptime: serverStatus.uptime || 0,
      });
    }
  } catch (err) {
    console.error(`Snapshot collection failed for connection "${connDoc.name}":`, err.message);
  }
};

exports.startBackgroundHealthMonitor = (io) => {
  console.log('📡 Starting background Health Monitoring Daemon...');
  
  // Run checks every 1 minute
  setInterval(async () => {
    try {
      const connections = await Connection.find({});
      for (const connDoc of connections) {
        if (connDoc.alertsEnabled) {
          try {
            await evaluateConnectionHealth(connDoc, io);
          } catch (err) {
            console.error(`Health evaluation failed for connection "${connDoc.name}":`, err.message);
          }
        }
        try {
          await recordConnectionSnapshot(connDoc);
        } catch (err) {
          console.error(`Failed to record monitoring snapshot for connection "${connDoc.name}":`, err.message);
        }
      }
    } catch (err) {
      console.error('Health monitoring polling loop error:', err.message);
    }
  }, 60000);
};
