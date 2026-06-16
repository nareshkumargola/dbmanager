const Connection = require('../models/connectionModel');
const { getConnection, testConnection, closeConnection } = require('../connections/connectionManager');
const { saveHistory } = require('./queryHistoryController');

// ─── SAARE CONNECTIONS DEKHO ──────────────────────
exports.getConnections = async (req, res) => {
  try {
    const connections = await Connection.find({ user: req.user.id })
      .select('-password') // Password hide karo
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, connections });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── NAYA CONNECTION BANAO ────────────────────────
exports.createConnection = async (req, res) => {
  try {
    const {
      name, type, host, port,
      username, password, database,
      connectionString
    } = req.body;

    // Pehle test karo
    const testResult = await testConnection({
      type, host, port, username,
      password, database, connectionString
    });

    if (!testResult.success) {
      return res.status(400).json({
        message: 'Connection failed!',
        error: testResult.message
      });
    }

    // Save karo
    const connection = await Connection.create({
      user: req.user.id,
      name, type, host,
      port: port || (type === 'mysql' ? 3306 : type === 'postgresql' ? 5432 : null),
      username, password, database,
      connectionString,
    });

    res.status(201).json({
      success: true,
      message: 'Connection save ho gaya!',
      connection: {
        ...connection.toObject(),
        password: undefined, // Password hide karo
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── CONNECTION TEST KARO ─────────────────────────
exports.testConnectionRoute = async (req, res) => {
  try {
    const {
      type, host, port, username,
      password, database, connectionString
    } = req.body;

    const result = await testConnection({
      type, host, port, username,
      password, database, connectionString
    });

    if (result.success) {
      res.status(200).json({ success: true, message: result.message });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── CONNECTION DELETE KARO ───────────────────────
exports.deleteConnection = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    // Sirf apna connection delete karo
    if (connection.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Permission nahi hai!' });
    }

    // Active connection close karo
    await closeConnection(req.params.id);
    await Connection.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'Connection delete ho gaya!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── DATABASE TABLES/COLLECTIONS DEKHO ───────────
exports.getDatabaseObjects = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection);
    let result = {};

    if (type === 'mysql') {
      let tables;
      if (database) {
        // Pool se alag connection lo aur USE karo
        const [rows] = await conn.execute(
          `SELECT TABLE_NAME FROM information_schema.TABLES 
           WHERE TABLE_SCHEMA = ?`,
          [database]
        );
        tables = rows.map(r => ({ [`Tables_in_${database}`]: r.TABLE_NAME }));
      } else {
        const [rows] = await conn.execute('SHOW TABLES');
        tables = rows;
      }
      result = { tables };
    }

    else if (type === 'postgresql') {
      const tables = await conn.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      result = { tables: tables.rows };
    }

    else if (type === 'mongodb') {
      const db = conn.db(database || 'test');
      const collections = await db.listCollections().toArray();
      result = { collections };
    }

    res.status(200).json({ success: true, type, result, database });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── TABLE/COLLECTION DATA DEKHO ─────────────────
exports.getTableData = async (req, res) => {
  try {
    const { id, tableName } = req.params;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection);
    let rows = [], columns = [];

    if (type === 'mysql') {
      if (!database) {
        return res.status(400).json({ message: 'Database select karo pehle!' });
      }

      const [tableRows] = await conn.execute(
        `SELECT * FROM \`${database}\`.\`${tableName}\` LIMIT 100`
      );
      const [cols] = await conn.execute(
        `SHOW COLUMNS FROM \`${database}\`.\`${tableName}\``
      );
      rows = tableRows;
      columns = cols;
    }

    else if (type === 'postgresql') {
      const result = await conn.query(
        `SELECT * FROM "${tableName}" LIMIT 100`
      );
      rows = result.rows;
      columns = result.fields.map(f => ({ Field: f.name, Type: f.dataTypeID }));
    }

    else if (type === 'mongodb') {
      const db = conn.db(database || connection.database || 'test');
      rows = await db.collection(tableName).find({}).limit(100).toArray();
    }

    res.status(200).json({ success: true, type, rows, columns });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── QUERY RUN KARO ───────────────────────────────
exports.runQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const { query } = req.body;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    // Dangerous queries block karo
    const forbidden = ['DROP', 'TRUNCATE'];
    const upperQuery = query.toUpperCase();
    const isForbidden = forbidden.some(cmd => upperQuery.startsWith(cmd));

    if (isForbidden) {
      return res.status(403).json({ message: 'Yeh query allowed nahi hai!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection);
    const startTime = Date.now();
    let results = [];

    if (type === 'mysql') {
      if (database) {
        const mysqlConn = await conn.getConnection();
        try {
          await mysqlConn.query(`USE \`${database}\``);
          const [rows] = await mysqlConn.query(query);
          results = rows;
        } finally {
          mysqlConn.release();
        }
      } else {
        const [rows] = await conn.execute(query);
        results = rows;
      }
    }

    else if (type === 'postgresql') {
      const result = await conn.query(query);
      results = result.rows;
    }

    else if (type === 'mongodb') {
      results = { message: 'MongoDB queries use collection methods' };
    }

    const executionTime = Date.now() - startTime;

    // Save history (rowsAffected calculation)
    let rowsAffected = 0;
    if (Array.isArray(results)) rowsAffected = results.length;
    else if (results && typeof results.affectedRows === 'number') rowsAffected = results.affectedRows;
    try {
      await saveHistory(req.user.id, query, 'success', rowsAffected, executionTime, null);
    } catch (e) {
      console.error('History save error:', e.message);
    }

    res.status(200).json({ success: true, results, executionTime });
  } catch (err) {
    // Save failed history
    try {
      await saveHistory(req.user.id, req.body.query || '', 'failed', 0, 0, err.message);
    } catch (e) {
      console.error('History save error:', e.message);
    }
    res.status(500).json({ message: 'Query Error', error: err.message });
  }
};

// ─── DATABASE STATS ───────────────────────────────
exports.getDatabaseStats = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection);
    let stats = {};

    if (type === 'mysql') {
      const [size] = await conn.execute(`
        SELECT 
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMB
        FROM information_schema.tables
        WHERE table_schema = ?
      `, [database]);

      const [tables] = await conn.execute(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = ?
      `, [database]);

      const [processes] = await conn.execute('SHOW PROCESSLIST');

      stats = {
        type: 'mysql',
        database: database,
        sizeMB: size[0]?.sizeMB || 0,
        totalTables: tables[0]?.count || 0,
        activeConnections: processes.length,
      };
    }

    else if (type === 'postgresql') {
      const size = await conn.query(
        `SELECT pg_size_pretty(pg_database_size($1)) AS size`,
        [database]
      );
      const tables = await conn.query(`
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public'
      `);
      stats = {
        type: 'postgresql',
        database: database,
        size: size.rows[0]?.size,
        totalTables: tables.rows[0]?.count,
      };
    }

    else if (type === 'mongodb') {
      const db = conn.db(database || 'test');
      const dbStats = await db.stats();
      const collections = await db.listCollections().toArray();
      stats = {
        type: 'mongodb',
        database: database,
        collections: collections.length,
        documents: dbStats.objects,
        sizeMB: (dbStats.dataSize / 1024 / 1024).toFixed(2),
      };
    }

    res.status(200).json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── SAARE DATABASES LIST KARO ───────────────────
exports.getDatabases = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    const { conn, type } = await getConnection(connection);
    let databases = [];

    if (type === 'mysql') {
      const [rows] = await conn.execute('SHOW DATABASES');
      databases = rows.map(r => Object.values(r)[0]).filter(db =>
        !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(db)
      );
    }

    else if (type === 'postgresql') {
      const result = await conn.query(
        `SELECT datname FROM pg_database
         WHERE datistemplate = false
         ORDER BY datname`
      );
      databases = result.rows.map(r => r.datname);
    }

    else if (type === 'mongodb') {
      const adminDb = conn.db('admin');
      const result = await adminDb.admin().listDatabases();
      databases = result.databases
        .map(d => d.name)
        .filter(d => !['admin', 'local', 'config'].includes(d));
    }

    res.status(200).json({ success: true, databases });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};