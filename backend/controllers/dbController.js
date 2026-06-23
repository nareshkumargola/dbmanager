const { mysqlPool } = require('../config/db');
const mongoose = require('mongoose');
const mysql = require('mysql2/promise');
const Connection = require('../models/connectionModel');
const { saveHistory } = require('./queryHistoryController');
const { saveSlowQuery } = require('./slowQueryController');
const { getConnection } = require('../connections/connectionManager');
require('dotenv').config();

const checkAccess = (connection, user) => {
  if (user.role === 'admin') return true;
  if (connection.user.toString() === user.id) return true;
  if (connection.allowedUsers && connection.allowedUsers.some(u => u.toString() === user.id)) return true;
  return false;
};

exports.getMysqlTables = async (req, res) => {
  try {
    const [tables] = await mysqlPool.execute('SHOW TABLES');
    res.status(200).json({ success: true, tables });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

exports.getMysqlTableData = async (req, res) => {
  try {
    const { tableName } = req.params;
    const [tables] = await mysqlPool.execute('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    if (!tableNames.includes(tableName)) {
      return res.status(400).json({ message: 'Table nahi mili!' });
    }
    const [rows] = await mysqlPool.execute(
      `SELECT * FROM \`${tableName}\` LIMIT 100`
    );
    const [columns] = await mysqlPool.execute(
      `SHOW COLUMNS FROM \`${tableName}\``
    );
    res.status(200).json({ success: true, rows, columns });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── QUERY RUN + HISTORY SAVE ─────────────────────
exports.runMysqlQuery = async (req, res) => {
  try {
    const { query } = req.body;
    const connectionId = req.query.connectionId;
    const database = req.query.database;

    const upperQuery = query.toUpperCase();

    // Check if it is a stored procedure DDL command for auditing
    const isStoredProcedureDDL =
      (upperQuery.includes('CREATE') && upperQuery.includes('PROCEDURE')) ||
      (upperQuery.includes('ALTER') && upperQuery.includes('PROCEDURE')) ||
      (upperQuery.includes('DROP') && upperQuery.includes('PROCEDURE'));

    // Execution time track karo
    const startTime = Date.now();

    let results;
    let connectionDoc = null;

    if (connectionId) {
      // Run against a specific saved connection
      connectionDoc = await Connection.findById(connectionId);
      if (!connectionDoc) {
        return res.status(404).json({ message: 'Connection nahi mila!' });
      }
      if (connectionDoc.type !== 'mysql') {
        return res.status(400).json({ message: 'Sirf MySQL connections supported hain.' });
      }
      if (!checkAccess(connectionDoc, req.user)) {
        return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
      }

      const useDb = database || connectionDoc.database;
      const { conn } = await getConnection(connectionDoc);
      
      if (useDb) {
        const mysqlConn = await conn.getConnection();
        try {
          await mysqlConn.query(`USE \`${useDb}\``);
          const [resRows] = await mysqlConn.query(query);
          results = resRows;
        } finally {
          mysqlConn.release();
        }
      } else {
        const [resRows] = await conn.execute(query);
        results = resRows;
      }
    } else {
      const [resRows] = await mysqlPool.execute(query);
      results = resRows;
    }

    const executionTime = Date.now() - startTime;

    // Rows count karo
    const rowsAffected = Array.isArray(results)
      ? results.length
      : results.affectedRows || 0;

    // Success history save karo
    await saveHistory(
      req.user.id,
      query,
      'success',
      rowsAffected,
      executionTime,
      null,
      connectionId || null,
      database || (connectionDoc ? connectionDoc.database : null)
    );

    // Save MySQL query to BinlogAudit collection as part of unified history logs
    if (connectionId) {
      try {
        const clean = query.replace(/\/\*.*?\*\//g, '').trim();
        const upper = clean.toUpperCase();
        let eventType = 'OTHER';

        if (upper.startsWith('INSERT')) {
          eventType = 'INSERT';
        } else if (upper.startsWith('UPDATE')) {
          eventType = 'UPDATE';
        } else if (upper.startsWith('DELETE')) {
          eventType = 'DELETE';
        } else if (upper.startsWith('CREATE') || upper.startsWith('ALTER') || upper.startsWith('DROP')) {
          eventType = 'DDL';
        }

        let diff = null;
        try {
          const { parseSQLDiff } = require('./connectionController');
          diff = parseSQLDiff(query, eventType);
        } catch (diffErr) {
          console.warn('Failed to parse SQL diff:', diffErr.message);
        }

        let dbUser = 'User (App)';
        if (connectionDoc && connectionDoc.username) {
          dbUser = connectionDoc.username;
        }

        const BinlogAudit = require('../models/binlogAuditModel');
        await BinlogAudit.create({
          connectionId,
          eventType,
          statement: clean,
          originalType: 'Query Editor',
          pos: 0,
          logName: 'Query Editor',
          user: req.user.id || null,
          diff,
          dbUser
        });
      } catch (binlogErr) {
        console.error('Failed to log query editor command to binlog audit:', binlogErr.message);
      }
    }

    // Stored procedure audit check and log
    if (isStoredProcedureDDL) {
      try {
        let dbName = database;
        if (!dbName && connectionId) {
          const connectionDoc = await Connection.findById(connectionId);
          if (connectionDoc) {
            dbName = connectionDoc.database;
          }
        }
        if (!dbName && !connectionId) {
          dbName = process.env.MYSQL_DATABASE;
        }

        const { logProcedureAudit } = require('./queryHistoryController');
        await logProcedureAudit(
          req.user.id,
          query,
          connectionId,
          req.ip || req.socket.remoteAddress,
          dbName
        );
      } catch (logErr) {
        console.error('Procedure audit logging failed:', logErr.message);
      }
    }

    // Slow query check karo — 100ms se zyada?
    await saveSlowQuery(req.user.id, query, executionTime, rowsAffected);

    res.status(200).json({ success: true, results });
  } catch (err) {
    // Error history save karo
    try {
      await saveHistory(
        req.user.id,
        req.body.query || '',
        'failed',
        0,
        0,
        err.message,
        req.query.connectionId || null,
        req.query.database || null
      );
    } catch (e) {
      console.error('History save error:', e.message);
    }
    res.status(500).json({ message: 'Query Error', error: err.message });
  }
};

exports.getMysqlStats = async (req, res) => {
  try {
    const [size] = await mysqlPool.execute(`
      SELECT 
        table_schema AS 'Database',
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
      FROM information_schema.tables
      WHERE table_schema = ?
      GROUP BY table_schema
    `, [process.env.MYSQL_DATABASE]);
    const [tables] = await mysqlPool.execute('SHOW TABLES');
    const [processes] = await mysqlPool.execute('SHOW PROCESSLIST');
    res.status(200).json({
      success: true,
      stats: {
        size: size[0],
        totalTables: tables.length,
        activeConnections: processes.length,
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

exports.getMongoCollections = async (req, res) => {
  try {
    const collections = await mongoose.connection.db
      .listCollections().toArray();
    res.status(200).json({ success: true, collections });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

exports.getMongoCollectionData = async (req, res) => {
  try {
    const { collectionName } = req.params;
    const data = await mongoose.connection.db
      .collection(collectionName)
      .find({}).limit(100).toArray();
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

exports.getMongoStats = async (req, res) => {
  try {
    const stats = await mongoose.connection.db.stats();
    const collections = await mongoose.connection.db
      .listCollections().toArray();
    res.status(200).json({
      success: true,
      stats: {
        totalCollections: collections.length,
        dataSize: (stats.dataSize / 1024 / 1024).toFixed(2) + ' MB',
        storageSize: (stats.storageSize / 1024 / 1024).toFixed(2) + ' MB',
        totalDocuments: stats.objects,
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── POSTGRESQL ENDPOINTS ─────────────────────────
exports.getPostgresTables = async (req, res) => {
  try {
    const connectionId = req.query.connectionId;
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId specify karo!' });
    }
    const connectionDoc = await Connection.findById(connectionId);
    if (!connectionDoc) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }
    if (connectionDoc.type !== 'postgresql') {
      return res.status(400).json({ message: 'PostgreSQL connection nahi mila!' });
    }
    if (!checkAccess(connectionDoc, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
    }
    const { conn } = await getConnection(connectionDoc);
    const result = await conn.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    res.status(200).json({ success: true, tables: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

exports.getPostgresTableData = async (req, res) => {
  try {
    const { tableName } = req.params;
    const connectionId = req.query.connectionId;
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId specify karo!' });
    }
    const connectionDoc = await Connection.findById(connectionId);
    if (!connectionDoc) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }
    if (connectionDoc.type !== 'postgresql') {
      return res.status(400).json({ message: 'Valid PostgreSQL connection nahi mila!' });
    }
    if (!checkAccess(connectionDoc, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
    }
    const { conn } = await getConnection(connectionDoc);
    
    // Fetch columns
    const columnsResult = await conn.query(`
      SELECT column_name AS "Field", data_type AS "Type"
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
    `, [tableName]);
    
    // Fetch data
    const rowsResult = await conn.query(`SELECT * FROM "${tableName}" LIMIT 100`);
    
    res.status(200).json({
      success: true,
      rows: rowsResult.rows,
      columns: columnsResult.rows
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

exports.getPostgresStats = async (req, res) => {
  try {
    const connectionId = req.query.connectionId;
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId specify karo!' });
    }
    const connectionDoc = await Connection.findById(connectionId);
    if (!connectionDoc) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }
    if (connectionDoc.type !== 'postgresql') {
      return res.status(400).json({ message: 'Valid PostgreSQL connection nahi mila!' });
    }
    if (!checkAccess(connectionDoc, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
    }
    const { conn } = await getConnection(connectionDoc);
    const database = req.query.database || connectionDoc.database;
    
    const size = await conn.query(
      `SELECT pg_size_pretty(pg_database_size($1)) AS size`,
      [database]
    );
    const tables = await conn.query(`
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    
    res.status(200).json({
      success: true,
      stats: {
        size: size.rows[0]?.size || '0 bytes',
        totalTables: parseInt(tables.rows[0]?.count) || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

exports.runPostgresQuery = async (req, res) => {
  try {
    const { query } = req.body;
    const connectionId = req.query.connectionId;
    
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId specify karo!' });
    }
    
    const connectionDoc = await Connection.findById(connectionId);
    if (!connectionDoc) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }
    if (connectionDoc.type !== 'postgresql') {
      return res.status(400).json({ message: 'Sirf PostgreSQL connections supported hain.' });
    }
    if (!checkAccess(connectionDoc, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
    }
    
    const { conn } = await getConnection(connectionDoc);
    
    const upperQuery = query.toUpperCase();
    
    // Check if it is a stored procedure DDL command for auditing
    const isStoredProcedureDDL =
      (upperQuery.includes('CREATE') && upperQuery.includes('PROCEDURE')) ||
      (upperQuery.includes('ALTER') && upperQuery.includes('PROCEDURE')) ||
      (upperQuery.includes('DROP') && upperQuery.includes('PROCEDURE'));
      
    // Execution time track karo
    const startTime = Date.now();
    
    const result = await conn.query(query);
    const executionTime = Date.now() - startTime;
    
    // Rows count karo
    let results;
    let rowsAffected = 0;
    
    if (Array.isArray(result)) {
      results = result.map(r => r.rows);
      rowsAffected = result.reduce((acc, r) => acc + (r.rowCount || 0), 0);
    } else if (result.command === 'SELECT') {
      results = result.rows;
      rowsAffected = result.rows.length;
    } else {
      results = {
        affectedRows: result.rowCount !== null ? result.rowCount : 0,
        command: result.command
      };
      rowsAffected = result.rowCount || 0;
    }
    
    // Success history save karo
    await saveHistory(
      req.user.id,
      query,
      'success',
      rowsAffected,
      executionTime,
      null,
      connectionId,
      req.query.database || connectionDoc.database || null
    );
    
    // Stored procedure audit check and log
    if (isStoredProcedureDDL) {
      try {
        const dbName = connectionDoc.database;
        const { logProcedureAudit } = require('./queryHistoryController');
        await logProcedureAudit(
          req.user.id,
          query,
          connectionId,
          req.ip || req.socket.remoteAddress,
          dbName
        );
      } catch (logErr) {
        console.error('Procedure audit logging failed:', logErr.message);
      }
    }
    
    // Slow query check karo — 100ms se zyada?
    await saveSlowQuery(req.user.id, query, executionTime, rowsAffected);
    
    res.status(200).json({ success: true, results });
  } catch (err) {
    // Error history save karo
    try {
      await saveHistory(
        req.user.id,
        req.body.query || '',
        'failed',
        0,
        0,
        err.message,
        req.query.connectionId || null,
        req.query.database || null
      );
    } catch (e) {
      console.error('History save error:', e.message);
    }
    res.status(500).json({ message: 'Query Error', error: err.message });
  }
};