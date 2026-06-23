const Connection = require('../models/connectionModel');
const { getConnection, testConnection, closeConnection } = require('../connections/connectionManager');
const { saveHistory } = require('./queryHistoryController');
const BinlogAudit = require('../models/binlogAuditModel');

const checkAccess = (connection, user) => {
  if (user.role === 'admin') return true;
  if (connection.user.toString() === user.id) return true;
  if (connection.allowedUsers && connection.allowedUsers.some(u => u.toString() === user.id)) return true;
  return false;
};

// ─── SAARE CONNECTIONS DEKHO ──────────────────────
exports.getConnections = async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? {}
      : {
          $or: [
            { user: req.user.id },
            { allowedUsers: req.user.id }
          ]
        };

    const connections = await Connection.find(query)
      .populate('user', 'name email role')
      .populate('allowedUsers', 'name email role')
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

    // Sirf owner ya admin delete kar sakta hai
    if (connection.user.toString() !== req.user.id && req.user.role !== 'admin') {
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

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
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

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
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

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection);
    const startTime = Date.now();
    let results = [];

    const upperQuery = query ? query.toUpperCase() : '';
    const isStoredProcedureDDL =
      (upperQuery.includes('CREATE') && upperQuery.includes('PROCEDURE')) ||
      (upperQuery.includes('ALTER') && upperQuery.includes('PROCEDURE')) ||
      (upperQuery.includes('DROP') && upperQuery.includes('PROCEDURE'));

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
      await saveHistory(req.user.id, query, 'success', rowsAffected, executionTime, null, id, database);
    } catch (e) {
      console.error('History save error:', e.message);
    }

    // Stored procedure audit check and log
    if (isStoredProcedureDDL) {
      try {
        const { logProcedureAudit } = require('./queryHistoryController');
        await logProcedureAudit(
          req.user.id,
          query,
          id,
          req.ip || req.socket.remoteAddress,
          database
        );
      } catch (logErr) {
        console.error('Procedure audit logging failed:', logErr.message);
      }
    }
    
    // Slow query check karo — 100ms se zyada?
    try {
      const { saveSlowQuery } = require('./slowQueryController');
      await saveSlowQuery(req.user.id, query, executionTime, rowsAffected);
    } catch (slowQueryErr) {
      console.error('Failed to log slow query:', slowQueryErr.message);
    }

    res.status(200).json({ success: true, results, executionTime });
  } catch (err) {
    // Save failed history
    try {
      await saveHistory(req.user.id, req.body.query || '', 'failed', 0, 0, err.message, req.params.id, req.query.database || null);
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

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
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

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
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

// ─── ADMIN ONLY: GET ALL CONNECTIONS IN SYSTEM ─────
exports.getAllConnectionsAdmin = async (req, res) => {
  try {
    const connections = await Connection.find()
      .populate('user', 'name email role')
      .select('-password')
      .sort({ createdAt: -1 });

    const activeUserConnections = connections.filter(c => c.user !== null);

    res.status(200).json({ success: true, connections: activeUserConnections });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── CONNECTION SHARING INFO (GET) ───────────────────
exports.getShareInfo = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    if (connection.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Permission nahi hai!' });
    }

    const User = require('../models/userModel');
    const users = await User.find({ role: { $in: ['developer', 'viewer'] } })
      .select('name email role');

    res.status(200).json({
      success: true,
      allowedUsers: connection.allowedUsers || [],
      users
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── CONNECTION SHARING UPDATE (PUT) ───────────────────
exports.updateShareInfo = async (req, res) => {
  try {
    const { developerIds } = req.body;
    const connection = await Connection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    if (connection.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Permission nahi hai!' });
    }

    connection.allowedUsers = developerIds || [];
    await connection.save();
 
    res.status(200).json({ success: true, message: 'Access updated successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── BINLOG START MONITORING (POST) ───────────────────
exports.startBinlogMonitoring = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
    }

    if (connection.type !== 'mysql') {
      return res.status(400).json({ message: 'Binlog monitor sirf MySQL connections ke liye support hota hai!' });
    }

    const { conn } = await getConnection(connection);
    
    // Check if binary logging is enabled
    let logBinEnabled = false;
    try {
      const [logBinVars] = await conn.query("SHOW VARIABLES LIKE 'log_bin'");
      if (logBinVars && logBinVars.length > 0 && logBinVars[0].Value === 'ON') {
        logBinEnabled = true;
      }
    } catch (err) {
      console.warn('Failed to query log_bin variable:', err.message);
    }

    if (logBinEnabled) {
      try {
        let logFile = '';
        let position = 4;
        
        // Try SHOW BINARY LOG STATUS (MySQL 8.4+) first, then SHOW MASTER STATUS
        try {
          const [binlogStatus] = await conn.query("SHOW BINARY LOG STATUS");
          if (binlogStatus && binlogStatus.length > 0) {
            logFile = binlogStatus[0].File;
            position = binlogStatus[0].Position;
          }
        } catch (e1) {
          const [masterStatus] = await conn.query("SHOW MASTER STATUS");
          if (masterStatus && masterStatus.length > 0) {
            logFile = masterStatus[0].File;
            position = masterStatus[0].Position;
          }
        }

        if (logFile) {
          return res.status(200).json({
            success: true,
            logFile,
            position,
            logBinEnabled: true,
            mode: 'real',
            message: 'Real-time binlog monitoring started.'
          });
        }
      } catch (err) {
        console.warn('Failed to query binlog status, switching to simulation:', err.message);
      }
    }

    // Fallback/Simulation mode if binlog is off or permission is missing
    return res.status(200).json({
      success: true,
      logFile: 'mock-binlog.000001',
      position: 100,
      logBinEnabled: false,
      mode: 'simulation',
      message: 'Binlog is disabled or access is denied. Started in simulation mode.'
    });

  } catch (err) {
    res.status(500).json({ message: 'Error starting binlog monitor', error: err.message });
  }
};

// Helper to parse query info in binlog
const parseBinlogEvent = (event) => {
  const type = event.Event_type || '';
  const info = event.Info || '';
  const pos = event.Pos;
  const endPos = event.End_log_pos;
  const logName = event.Log_name;

  let eventType = 'OTHER';
  let statement = info;

  if (type === 'Query') {
    const cleanInfo = info.replace(/\/\*.*?\*\//g, '').trim(); // Clean comments
    const upper = cleanInfo.toUpperCase();
    if (upper.startsWith('INSERT')) {
      eventType = 'INSERT';
    } else if (upper.startsWith('UPDATE')) {
      eventType = 'UPDATE';
    } else if (upper.startsWith('DELETE')) {
      eventType = 'DELETE';
    } else if (upper.startsWith('CREATE') || upper.startsWith('ALTER') || upper.startsWith('DROP')) {
      eventType = 'DDL';
    }
    statement = cleanInfo;
  } else if (type.includes('Write_rows') || type.includes('Write') || type.includes('Insert')) {
    eventType = 'INSERT';
    statement = `INSERT in table mapping (Pos: ${pos})`;
  } else if (type.includes('Update_rows') || type.includes('Update')) {
    eventType = 'UPDATE';
    statement = `UPDATE in table mapping (Pos: ${pos})`;
  } else if (type.includes('Delete_rows') || type.includes('Delete')) {
    eventType = 'DELETE';
    statement = `DELETE in table mapping (Pos: ${pos})`;
  }

  return {
    eventType,
    statement,
    originalType: type,
    originalInfo: info,
    pos,
    endPos,
    logName
  };
};

// SQL query to structured JSON diff parser
const parseSQLDiff = (statement, eventType) => {
  if (!statement) return null;
  const clean = statement.replace(/\/\*.*?\*\//g, '').trim();

  let table = '';
  let newData = null;
  let oldData = null;

  try {
    if (eventType === 'INSERT') {
      const intoMatch = clean.match(/INSERT\s+INTO\s+([^\s\(\`]+)/i);
      if (intoMatch) {
        table = intoMatch[1].replace(/[\`\'\"]/g, '');
      }

      const colsMatch = clean.match(/\(([^)]+)\)\s*VALUES/i);
      const valsMatch = clean.match(/VALUES\s*\((.+)\)/is);

      if (colsMatch && valsMatch) {
        const cols = colsMatch[1].split(',').map(s => s.trim().replace(/[\`\'\"]/g, ''));
        const vals = valsMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
        
        newData = {};
        cols.forEach((col, idx) => {
          if (vals[idx] !== undefined) {
            newData[col] = vals[idx];
          }
        });
      }
    } else if (eventType === 'UPDATE') {
      const updateMatch = clean.match(/UPDATE\s+([^\s\`]+)/i);
      if (updateMatch) {
        table = updateMatch[1].replace(/[\`\'\"]/g, '');
      }

      const setMatch = clean.match(/SET\s+(.+?)(?:WHERE|$)/is);
      const whereMatch = clean.match(/WHERE\s+(.+)/is);

      if (setMatch) {
        const assignments = setMatch[1].split(',');
        newData = {};
        assignments.forEach(assign => {
          const parts = assign.split('=');
          if (parts.length === 2) {
            const key = parts[0].trim().replace(/[\`\'\"]/g, '');
            const val = parts[1].trim().replace(/^['"]|['"]$/g, '');
            newData[key] = val;
          }
        });
      }

      if (whereMatch) {
        const conds = whereMatch[1].split(/\s+AND\s+/i);
        oldData = {};
        conds.forEach(cond => {
          const parts = cond.split('=');
          if (parts.length === 2) {
            const key = parts[0].trim().replace(/[\`\'\"]/g, '');
            const val = parts[1].trim().replace(/^['"]|['"]$/g, '');
            oldData[key] = val;
          }
        });
      }
    } else if (eventType === 'DELETE') {
      const fromMatch = clean.match(/DELETE\s+FROM\s+([^\s\`\(]+)/i);
      if (fromMatch) {
        table = fromMatch[1].replace(/[\`\'\"]/g, '');
      }

      const whereMatch = clean.match(/WHERE\s+(.+)/is);
      if (whereMatch) {
        const conds = whereMatch[1].split(/\s+AND\s+/i);
        oldData = {};
        conds.forEach(cond => {
          const parts = cond.split('=');
          if (parts.length === 2) {
            const key = parts[0].trim().replace(/[\`\'\"]/g, '');
            const val = parts[1].trim().replace(/^['"]|['"]$/g, '');
            oldData[key] = val;
          }
        });
      }
    } else if (eventType === 'DDL') {
      const createMatch = clean.match(/(?:CREATE|DROP|ALTER)\s+TABLE\s+([^\s\`\(]+)/i);
      if (createMatch) {
        table = createMatch[1].replace(/[\`\'\"]/g, '');
      }
    }
  } catch (e) {
    console.error('SQL parser error:', e.message);
  }

  if (table && table.includes('.')) {
    table = table.split('.').pop();
  }

  return {
    table: table || 'unknown',
    newData,
    oldData
  };
};

// Internal poller accessible by HTTP controller and Socket.io setup
exports.pollBinlogEventsInternal = async (connectionId, logFile, position, mode, userId) => {
  const Connection = require('../models/connectionModel');
  const BinlogAudit = require('../models/binlogAuditModel');
  const { getConnection } = require('../connections/connectionManager');

  const connection = await Connection.findById(connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  const startPos = parseInt(position) || 4;
  const activeFile = logFile || '';

  if (mode === 'simulation' || activeFile.startsWith('mock-')) {
    const events = [];
    let nextPos = startPos;
    
    // 20% probability of generating simulated writes
    if (Math.random() < 0.20) {
      const rand = Math.floor(Math.random() * 1000) + 1;
      const mockTemplates = [
        { 
          type: 'INSERT', 
          statement: `INSERT INTO users (name, email, role) VALUES ('Developer_${rand}', 'dev_${rand}@coinfinity.io', 'developer')`,
          diff: {
            table: 'users',
            newData: { id: rand, name: `Developer_${rand}`, email: `dev_${rand}@coinfinity.io`, role: 'developer' },
            oldData: null
          }
        },
        { 
          type: 'UPDATE', 
          statement: `UPDATE orders SET status = 'completed', amount = 1250, updated_at = NOW() WHERE id = ${rand}`,
          diff: {
            table: 'orders',
            newData: { id: rand, status: 'completed', amount: 1250 },
            oldData: { id: rand, status: 'pending', amount: 1250 }
          }
        },
        { 
          type: 'DELETE', 
          statement: `DELETE FROM sessions WHERE expired = 1 AND user_id = ${rand}`,
          diff: {
            table: 'sessions',
            oldData: { expired: 1, user_id: rand },
            newData: null
          }
        },
        { 
          type: 'DDL', 
          statement: `CREATE TABLE IF NOT EXISTS audit_logs_${rand} (id INT AUTO_INCREMENT PRIMARY KEY, event VARCHAR(255))`,
          diff: {
            table: `audit_logs_${rand}`,
            newData: null,
            oldData: null
          }
        },
        { 
          type: 'OTHER', 
          statement: `SELECT * FROM users WHERE role = 'developer' AND status = 'active' LIMIT 10`,
          diff: {
            table: 'users',
            newData: null,
            oldData: null
          }
        },
      ];
      const selected = mockTemplates[Math.floor(Math.random() * mockTemplates.length)];
      nextPos = startPos + 150;

      const mockUsers = [
        'root@localhost',
        'webapp_backend@192.168.1.15',
        'repl_client@10.0.0.4',
        'developer_worker@127.0.0.1'
      ];
      const dbUser = mockUsers[Math.floor(Math.random() * mockUsers.length)];

      const auditRecord = await BinlogAudit.create({
        connectionId,
        eventType: selected.type,
        statement: selected.statement,
        originalType: 'Query (Simulated)',
        pos: startPos,
        logName: activeFile,
        user: userId || null,
        diff: selected.diff,
        dbUser
      });

      const populatedRecord = await BinlogAudit.findById(auditRecord._id).populate('user', 'name email');
      events.push({
        _id: populatedRecord._id,
        eventType: populatedRecord.eventType,
        statement: populatedRecord.statement,
        originalType: populatedRecord.originalType,
        pos: populatedRecord.pos,
        logName: populatedRecord.logName,
        timestamp: populatedRecord.timestamp,
        user: populatedRecord.user,
        diff: populatedRecord.diff,
        dbUser: populatedRecord.dbUser
      });
    }

    return {
      success: true,
      events,
      nextLogFile: activeFile,
      nextPosition: nextPos
    };
  }

  // Real Mode
  const { conn } = await getConnection(connection);
  const events = [];
  let nextLogFile = activeFile;
  let nextPosition = startPos;

  // Retrieve active MySQL user and thread host info
  let dbUser = 'root@localhost';
  try {
    const [userRows] = await conn.query('SELECT USER() as db_user');
    if (userRows && userRows.length > 0) {
      dbUser = userRows[0].db_user;
    }
  } catch (err) {
    console.warn('Failed to query MySQL user:', err.message);
  }

  try {
    const [rows] = await conn.query(`SHOW BINLOG EVENTS IN '${activeFile}' FROM ${startPos} LIMIT 100`);
    
    // Map table ID to table name dynamically during the current batch run
    const lastTableMap = {};
    
    for (const row of rows) {
      if (row.Event_type === 'Table_map') {
        const info = row.Info || '';
        const idMatch = info.match(/table_id:\s*(\d+)/i);
        const nameMatch = info.match(/\(([^)]+)\)/);
        if (idMatch && nameMatch) {
          const tableId = idMatch[1];
          let tableName = nameMatch[1];
          if (tableName.includes('.')) {
            tableName = tableName.split('.').pop().replace(/[\`\'\"]/g, '');
          }
          lastTableMap[tableId] = tableName;
        }
      }

      if (row.Event_type === 'Rotate') {
        const rotateInfo = row.Info || '';
        const parts = rotateInfo.split(';');
        nextLogFile = parts[0].trim();
        nextPosition = 4;
        if (parts[1] && parts[1].includes('pos=')) {
          nextPosition = parseInt(parts[1].split('=')[1]) || 4;
        }
        break;
      }

      const parsed = parseBinlogEvent(row);
      
      if (['INSERT', 'UPDATE', 'DELETE', 'DDL', 'OTHER'].includes(parsed.eventType)) {
        let diff = parseSQLDiff(parsed.statement, parsed.eventType);

        // Fallback for Row-based binary logging format where statement parsing doesn't apply
        if ((!diff || (!diff.newData && !diff.oldData)) && row.Info) {
          const idMatch = row.Info.match(/table_id:\s*(\d+)/i);
          const tableId = idMatch ? idMatch[1] : null;
          const tableName = tableId && lastTableMap[tableId] ? lastTableMap[tableId] : 'unknown';

          diff = {
            table: tableName,
            newData: parsed.eventType === 'INSERT' || parsed.eventType === 'UPDATE' ? {
              table_name: tableName,
              operation: parsed.eventType,
              binlog_position: row.Pos,
              event_type: row.Event_type,
              raw_details: row.Info
            } : null,
            oldData: parsed.eventType === 'DELETE' || parsed.eventType === 'UPDATE' ? {
              table_name: tableName,
              operation: parsed.eventType,
              binlog_position: row.Pos,
              event_type: row.Event_type,
              raw_details: row.Info
            } : null
          };
        }

        const auditRecord = await BinlogAudit.create({
          connectionId,
          eventType: parsed.eventType,
          statement: parsed.statement,
          originalType: parsed.originalType,
          pos: parsed.pos,
          logName: parsed.logName,
          user: userId || null,
          diff,
          dbUser
        });

        const populatedRecord = await BinlogAudit.findById(auditRecord._id).populate('user', 'name email');
        events.push({
          _id: populatedRecord._id,
          eventType: populatedRecord.eventType,
          statement: populatedRecord.statement,
          originalType: populatedRecord.originalType,
          pos: populatedRecord.pos,
          logName: populatedRecord.logName,
          timestamp: populatedRecord.timestamp,
          user: populatedRecord.user,
          diff: populatedRecord.diff,
          dbUser: populatedRecord.dbUser
        });
      }
      
      nextPosition = row.End_log_pos;
    }
  } catch (err) {
    console.error('Error fetching SHOW BINLOG EVENTS:', err.message);
    if (err.message.includes('find log file') || err.message.includes('does not exist')) {
      try {
        const [binlogStatus] = await conn.query("SHOW BINARY LOG STATUS");
        if (binlogStatus && binlogStatus.length > 0) {
          nextLogFile = binlogStatus[0].File;
          nextPosition = binlogStatus[0].Position;
        }
      } catch (e2) {
        try {
          const [masterStatus] = await conn.query("SHOW MASTER STATUS");
          if (masterStatus && masterStatus.length > 0) {
            nextLogFile = masterStatus[0].File;
            nextPosition = masterStatus[0].Position;
          }
        } catch (e3) {
          nextLogFile = 'mock-binlog.000001';
          nextPosition = 100;
        }
      }
    }
  }

  return {
    success: true,
    events,
    nextLogFile,
    nextPosition
  };
};

// ─── GET BINLOG EVENTS (GET HTTP ROUTE) ──────────────────────────
exports.getBinlogEvents = async (req, res) => {
  try {
    const { id } = req.params;
    const { logFile, position, mode } = req.query;
    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
    }

    const result = await exports.pollBinlogEventsInternal(id, logFile, position, mode, req.user.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving binlog events', error: err.message });
  }
};

// ─── GET BINLOG HISTORY (GET) ──────────────────────────
exports.getBinlogHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
    }

    const history = await BinlogAudit.find({ connectionId: id })
      .populate('user', 'name email')
      .sort({ timestamp: -1 })
      .limit(100);

    res.status(200).json({ success: true, history });
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving binlog history', error: err.message });
  }
};

// ─── CLEAR BINLOG HISTORY (DELETE) ──────────────────────
exports.clearBinlogHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection nahi mila!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'Aapko is connection ka access nahi hai!' });
    }

    await BinlogAudit.deleteMany({ connectionId: id });

    res.status(200).json({ success: true, message: 'Binlog audit log history cleared successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error clearing binlog history', error: err.message });
  }
};