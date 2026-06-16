const { mysqlPool } = require('../config/db');
const mongoose = require('mongoose');
const mysql = require('mysql2/promise');
const Connection = require('../models/connectionModel');
const { saveHistory } = require('./queryHistoryController');
const { saveSlowQuery } = require('./slowQueryController');
require('dotenv').config();

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

    const forbidden = ['DROP', 'TRUNCATE', 'ALTER', 'CREATE'];
    const upperQuery = query.toUpperCase();
    const isForbidden = forbidden.some(cmd => upperQuery.includes(cmd));

    if (isForbidden) {
      // Failed history save karo
      await saveHistory(req.user.id, query, 'failed', 0, 0, 'Forbidden query');
      return res.status(403).json({ message: 'Yeh query allowed nahi hai!' });
    }

    // Execution time track karo
    const startTime = Date.now();

    let results;

    if (connectionId) {
      // Run against a specific saved connection
      const connectionDoc = await Connection.findById(connectionId);
      if (!connectionDoc) {
        return res.status(404).json({ message: 'Connection nahi mila!' });
      }
      if (connectionDoc.type !== 'mysql') {
        return res.status(400).json({ message: 'Sirf MySQL connections supported hain.' });
      }

      const useDb = database || connectionDoc.database;
      const conn = await mysql.createConnection({
        host: connectionDoc.host,
        port: connectionDoc.port || 3306,
        user: connectionDoc.username,
        password: connectionDoc.password,
        database: useDb || undefined,
      });
      try {
        // If database provided but not in connection config, ensure USE
        if (useDb) {
          await conn.query(`USE \`${useDb}\``);
        }
        const [resRows] = await conn.query(query);
        results = resRows;
      } finally {
        await conn.end();
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
      null
    );

    // Slow query check karo — 100ms se zyada?
    await saveSlowQuery(req.user.id, query, executionTime, rowsAffected);

    res.status(200).json({ success: true, results });
  } catch (err) {
    // Error history save karo
    try {
      await saveHistory(req.user.id, req.body.query || '', 'failed', 0, 0, err.message);
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