const Connection = require('../models/connectionModel');
const { getConnection, testConnection, closeConnection } = require('../connections/connectionManager');
const { saveHistory } = require('./queryHistoryController');
const { getBinlogAuditModel, getAuditCheckKey } = require('../models/binlogAuditModel');

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
      connectionString, ssl
    } = req.body;

    // Pehle test karo
    const testResult = await testConnection({
      type, host, port, username,
      password, database, connectionString, ssl
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
      connectionString, ssl
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

// ─── CONNECTION UPDATE KARO ───────────────────────
exports.updateConnection = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, type, host, port,
      username, password, database,
      connectionString, ssl
    } = req.body;

    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (connection.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Permission denied!' });
    }

    const connType = type || connection.type;
    const connHost = host !== undefined ? host : connection.host;
    const connPort = port !== undefined ? port : connection.port;
    const connUsername = username !== undefined ? username : connection.username;
    const connPassword = password ? password : connection.password;
    const connDatabase = database !== undefined ? database : connection.database;
    const connString = connectionString !== undefined ? connectionString : connection.connectionString;
    const connSsl = ssl !== undefined ? ssl : connection.ssl;

    const testResult = await testConnection({
      type: connType,
      host: connHost,
      port: connPort,
      username: connUsername,
      password: connPassword,
      database: connDatabase,
      connectionString: connString,
      ssl: connSsl
    });

    if (!testResult.success) {
      return res.status(400).json({
        message: 'Connection test failed!',
        error: testResult.message
      });
    }

    await closeConnection(id);

    if (name) connection.name = name;
    if (type) connection.type = type;
    if (host !== undefined) connection.host = host;
    if (port !== undefined) connection.port = port;
    if (username !== undefined) connection.username = username;
    if (password) connection.password = password;
    if (database !== undefined) connection.database = database;
    if (connectionString !== undefined) connection.connectionString = connectionString;
    if (ssl !== undefined) connection.ssl = ssl;

    await connection.save();

    res.status(200).json({
      success: true,
      message: 'Connection updated successfully!',
      connection: {
        ...connection.toObject(),
        password: undefined
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating connection', error: err.message });
  }
};

// ─── CONNECTION TEST KARO ─────────────────────────
exports.testConnectionRoute = async (req, res) => {
  try {
    const {
      type, host, port, username,
      password, database, connectionString, ssl
    } = req.body;

    const result = await testConnection({
      type, host, port, username,
      password, database, connectionString, ssl
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
      return res.status(404).json({ message: 'Connection not found!' });
    }

    // Sirf owner ya admin delete kar sakta hai
    if (connection.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Permission denied!' });
    }

    // Active connection close
    await closeConnection(req.params.id);
    await Connection.findByIdAndDelete(req.params.id);

    res.status(200).json({ success: true, message: 'Connection deleted successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// ─── DATABASE TABLES/COLLECTIONS DEKHO ───────────
exports.getDatabaseObjects = async (req, res) => {
  try {
    const connection = await Connection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection, database);
    let result = {};

    if (type === 'mysql') {
      let tables;
      if (database) {
        // Fetch table names along with data size in MB and estimated rows
        const [rows] = await conn.execute(
          `SELECT TABLE_NAME, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS sizeMB, TABLE_ROWS as tableRows 
           FROM information_schema.TABLES 
           WHERE TABLE_SCHEMA = ?`,
          [database]
        );
        tables = rows.map(r => ({
          [`Tables_in_${database}`]: r.TABLE_NAME,
          name: r.TABLE_NAME,
          sizeMB: parseFloat(r.sizeMB || 0.01),
          rows: r.tableRows || 0
        }));
      } else {
        const [rows] = await conn.execute('SHOW TABLES');
        tables = rows;
      }
      result = { tables };
    }

    else if (type === 'postgresql') {
      const tables = await conn.query(`
        SELECT 
          t.table_name,
          t.table_schema,
          ROUND(pg_total_relation_size('"' || t.table_schema || '"."' || t.table_name || '"') / 1024.0 / 1024.0, 2) AS "sizeMB"
        FROM information_schema.tables t
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
          AND t.table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY t.table_name
      `);
      result = { 
        tables: tables.rows.map(r => {
          const displayName = r.table_schema === 'public' ? r.table_name : `${r.table_schema}.${r.table_name}`;
          return { 
            name: displayName, 
            table_name: displayName, 
            schema: r.table_schema,
            sizeMB: parseFloat(r.sizeMB || 0.01) 
          };
        }) 
      };
    }

    else if (type === 'mongodb') {
      const db = conn.db(database || 'test');
      const collections = await db.listCollections().toArray();
      const collectionsWithStats = await Promise.all(
        collections.map(async (col) => {
          try {
            const stats = await db.collection(col.name).stats();
            return {
              name: col.name,
              sizeMB: parseFloat((stats.size / 1024 / 1024).toFixed(2)) || 0.01,
              count: stats.count || 0
            };
          } catch (e) {
            return { name: col.name, sizeMB: 0.01 };
          }
        })
      );
      result = { collections: collectionsWithStats };
    }

    else if (type === 'oracle') {
      const r = await conn.execute(
        `SELECT table_name FROM user_tables ORDER BY table_name`
      );
      const tables = r.rows.map(row => ({ table_name: row.TABLE_NAME || row.table_name || Object.values(row)[0], name: row.TABLE_NAME || row.table_name || Object.values(row)[0], sizeMB: 0.01 }));
      result = { tables };
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
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection, database);
    let rows = [], columns = [];

    if (type === 'mysql') {
      if (!database) {
        return res.status(400).json({ message: 'Please select a database first!' });
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
      const formattedTable = tableName.includes('.') 
        ? tableName.split('.').map(part => `"${part.replace(/"/g, '')}"`).join('.') 
        : `"${tableName.replace(/"/g, '')}"`;

      const result = await conn.query(
        `SELECT * FROM ${formattedTable} LIMIT 100`
      );
      rows = result.rows;
      columns = result.fields.map(f => ({ Field: f.name, Type: f.dataTypeID }));
    }

    else if (type === 'mongodb') {
      const db = conn.db(database || connection.database || 'test');
      rows = await db.collection(tableName).find({}).limit(100).toArray();
    }

    else if (type === 'oracle') {
      const r = await conn.execute(
        `SELECT * FROM "${tableName}" FETCH FIRST 100 ROWS ONLY`
      );
      rows = r.rows;
      columns = r.metaData ? r.metaData.map(col => ({ Field: col.name, Type: 'OracleType' })) : [];
    }

    res.status(200).json({ success: true, type, rows, columns });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Helper to strip client-side DELIMITER commands and clean trailing delimiters
const sanitizeQuery = (sql) => {
  if (!sql) return '';
  const matches = [...sql.matchAll(/^\s*DELIMITER\s+(\S+)/gim)];
  let cleaned = sql.replace(/^\s*DELIMITER\s+\S+/gim, '');
  matches.forEach(m => {
    const delim = m[1];
    if (delim && delim !== ';') {
      const escapedDelim = delim.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const delimRegex = new RegExp(escapedDelim + '\\s*$', 'gm');
      cleaned = cleaned.replace(delimRegex, ';');
    }
  });
  cleaned = cleaned.replace(/;+/g, ';');
  return cleaned.trim();
};

// ─── QUERY RUN KARO ───────────────────────────────
exports.runQuery = async (req, res) => {
  try {
    const { id } = req.params;
    const { query: rawQuery } = req.body;
    const query = sanitizeQuery(rawQuery);
    if (!query) {
      return res.status(400).json({ message: 'Query string cannot be empty after sanitization.' });
    }
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    // Read User role query validation
    const { validateQueryPermissions } = require('../utils/readOnlyQueryValidator');
    const validation = validateQueryPermissions(query, req.user, connection.type);
    if (!validation.isAllowed) {
      return res.status(403).json({ message: validation.error });
    }

    // Engine-level syntax validation
    const cleanQ = query.trim();
    const isMongoCmd = /^db\.[a-zA-Z0-9_-]+|\{.*"find":/i.test(cleanQ);
    const isStrictSQLCmd = /^\s*(SELECT|INSERT\s+INTO|UPDATE\s+[`"']?\w+[`"']?\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i.test(cleanQ);

    if (connection.type === 'mongodb' && isStrictSQLCmd) {
      return res.status(400).json({
        message: "❌ Engine Mismatch Error: MongoDB connection active! Standard SQL queries (SELECT/INSERT INTO/UPDATE/DELETE) cannot be executed on MongoDB. Please write MongoDB MQL syntax (e.g., db.users.find({}))."
      });
    }

    if (connection.type !== 'mongodb' && isMongoCmd) {
      const engineName = connection.type === 'mysql' ? 'MySQL' : connection.type === 'postgresql' ? 'PostgreSQL' : connection.type === 'oracle' ? 'Oracle' : 'SQL';
      return res.status(400).json({
        message: `❌ Engine Mismatch Error: ${engineName} connection active! MongoDB MQL commands (db.collection...) cannot be executed on ${engineName}. Please write valid ${engineName} SQL queries.`
      });
    }

    const database = req.body?.database || req.query?.database || connection.database;
    const { conn, type } = await getConnection(connection, database);
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
      const mongoDb = conn.db(database || connection.database || 'test');
      const clean = query.replace(/;+\s*$/, '').trim();
      const upper = clean.toUpperCase();

      const sanitizeMongoDoc = (doc) => {
        if (!doc || typeof doc !== 'object') return doc;
        const clone = {};
        for (const [key, value] of Object.entries(doc)) {
          if (value && typeof value === 'object') {
            if (value._bsontype === 'ObjectID' || value.constructor?.name === 'ObjectId') {
              clone[key] = value.toString();
            } else if (value instanceof Date) {
              clone[key] = value.toISOString();
            } else {
              clone[key] = JSON.stringify(value);
            }
          } else {
            clone[key] = value;
          }
        }
        return clone;
      };

      if (upper === 'SHOW TABLES' || upper === 'SHOW COLLECTIONS') {
        const collections = await mongoDb.listCollections().toArray();
        results = collections.map(c => ({ collection_name: c.name, type: c.type || 'collection' }));
      } else if (upper.startsWith('SELECT')) {
        const fromMatch = clean.match(/FROM\s+[`"']?([a-zA-Z0-9_-]+)[`"']?/i);
        if (!fromMatch) {
          throw new Error("MongoDB SQL syntax error: Missing 'FROM <collection_name>'. Example: SELECT * FROM users;");
        }
        const collectionName = fromMatch[1];
        let limit = 100;
        const limitMatch = clean.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) limit = parseInt(limitMatch[1], 10);

        let filter = {};
        const whereMatch = clean.match(/WHERE\s+([\s\S]+?)(?:\s+LIMIT|\s*$)/i);
        if (whereMatch) {
          const whereClause = whereMatch[1].trim();
          const eqMatch = whereClause.match(/^([a-zA-Z0-9_.]+)\s*=\s*['"]?([^'"]+)['"]?$/);
          if (eqMatch) {
            let val = eqMatch[2];
            if (!isNaN(val)) val = Number(val);
            else if (val.toLowerCase() === 'true') val = true;
            else if (val.toLowerCase() === 'false') val = false;
            filter = { [eqMatch[1]]: val };
          } else if (whereClause.startsWith('{') && whereClause.endsWith('}')) {
            try { filter = JSON.parse(whereClause); } catch (e) {}
          }
        }

        const docs = await mongoDb.collection(collectionName).find(filter).limit(limit).toArray();
        results = docs.map(doc => sanitizeMongoDoc(doc));
      } else {
        const shellMatch = clean.match(/^db\.(?:getCollection\(['"]([^'"]+)['"]\)|([a-zA-Z0-9_-]+))\.(find|findOne|countDocuments|count|aggregate|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany)\(([\s\S]*)\)$/);
        if (shellMatch) {
          const collectionName = shellMatch[1] || shellMatch[2];
          const method = shellMatch[3];
          const argsStr = shellMatch[4].trim();

          let args = [];
          if (argsStr) {
            try {
              args = JSON.parse(`[${argsStr}]`);
            } catch (e) {
              try {
                const evalFriendly = argsStr.replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":').replace(/'/g, '"');
                args = JSON.parse(`[${evalFriendly}]`);
              } catch (e2) {
                args = [{}];
              }
            }
          }

          if (method === 'find') {
            const docs = await mongoDb.collection(collectionName).find(args[0] || {}).limit(100).toArray();
            results = docs.map(doc => sanitizeMongoDoc(doc));
          } else if (method === 'findOne') {
            const doc = await mongoDb.collection(collectionName).findOne(args[0] || {});
            results = doc ? [sanitizeMongoDoc(doc)] : [];
          } else if (method === 'count' || method === 'countDocuments') {
            const count = await mongoDb.collection(collectionName).countDocuments(args[0] || {});
            results = [{ total_count: count }];
          } else if (method === 'aggregate') {
            const docs = await mongoDb.collection(collectionName).aggregate(args[0] || []).toArray();
            results = docs.map(doc => sanitizeMongoDoc(doc));
          } else {
            const writeResult = await mongoDb.collection(collectionName)[method](...args);
            results = { affectedRows: writeResult.modifiedCount || writeResult.deletedCount || (writeResult.insertedId || writeResult.insertedCount ? 1 : 0), result: writeResult };
          }
        } else if (clean.startsWith('{') && clean.endsWith('}')) {
          const filter = JSON.parse(clean);
          const collections = await mongoDb.listCollections().toArray();
          const targetCollection = collections[0]?.name || 'users';
          const docs = await mongoDb.collection(targetCollection).find(filter).limit(100).toArray();
          results = docs.map(doc => sanitizeMongoDoc(doc));
        } else {
          const docs = await mongoDb.collection(clean).find({}).limit(100).toArray();
          results = docs.map(doc => sanitizeMongoDoc(doc));
        }
      }
    }

    else if (type === 'oracle') {
      const result = await conn.execute(query, [], { autoCommit: true });
      results = result.rows || { success: true, rowsAffected: result.rowsAffected };
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

    // Save to System AuditLog
    try {
      const AuditLog = require('../models/auditLogModel');
      const targetDb = (database || connection.database || 'default').toUpperCase();
      await AuditLog.create({
        connection: id,
        user: req.user.id,
        action: 'RUN_QUERY',
        details: `[${targetDb}] (${executionTime}ms, ${rowsAffected} rows): ${query.substring(0, 400)}`
      });
    } catch (auditErr) {
      console.error('AuditLog creation error for RUN_QUERY:', auditErr.message);
    }

    // Check and save slow query if threshold exceeded
    try {
      const { saveSlowQuery } = require('./slowQueryController');
      await saveSlowQuery(id, req.user.id, query, executionTime, rowsAffected);
    } catch (sqErr) {
      console.error('Slow query check error:', sqErr.message);
    }

    // Save MySQL/Postgres query to BinlogAudit collection as part of unified history logs
    try {
      const clean = query.replace(/\/\*.*?\*\//g, '').trim();
      const upper = clean.toUpperCase();
      let eventType = 'OTHER';
      let shouldLog = false;

      if (upper.startsWith('CALL') || upper.startsWith('EXEC') || upper.includes('PROCEDURE') || upper.includes('FUNCTION')) {
        eventType = 'SP';
        shouldLog = true;
      } else if (upper.startsWith('INSERT')) {
        eventType = 'INSERT';
        shouldLog = true;
      } else if (upper.startsWith('UPDATE')) {
        eventType = 'UPDATE';
        shouldLog = true;
      } else if (upper.startsWith('DELETE')) {
        eventType = 'DELETE';
        shouldLog = true;
      } else if (upper.startsWith('CREATE') || upper.startsWith('ALTER') || upper.startsWith('DROP')) {
        eventType = 'DDL';
        shouldLog = true;
      }

      if (shouldLog) {
        let diff = null;
        try {
          diff = parseSQLDiff(query, eventType);
        } catch (diffErr) {
          console.warn('Failed to parse SQL diff:', diffErr.message);
        }

        const activeDatabaseName = database || connection.database || 'test';
        if (diff) {
          diff.database = activeDatabaseName;
        } else {
          diff = {
            table: 'unknown',
            database: activeDatabaseName,
            newData: null,
            oldData: null
          };
        }

        let dbUser = 'User (App)';
        if (connection && connection.username) {
          dbUser = connection.username;
        }

        const filterSettings = connection.binlogFilterSettings || { INSERT: true, UPDATE: true, DELETE: true, DDL: true, SP: true, OTHER: true };
        const auditCheckKey = getAuditCheckKey(clean, 'Query');

        let auditRecord = null;
        if (filterSettings[auditCheckKey]) {
          const BinlogAuditTable = getBinlogAuditModel(connection, activeDatabaseName, 'INSERT');
          auditRecord = await BinlogAuditTable.create({
            connectionId: id,
            eventType,
            statement: clean,
            originalType: 'Query Editor',
            pos: 0,
            logName: 'Query Editor',
            user: req.user.id || null,
            diff,
            dbUser
          });
        }

        if (eventType === 'SP' && filterSettings['SP']) {
          const BinlogAuditSP = getBinlogAuditModel(connection, activeDatabaseName, 'SP');
          await BinlogAuditSP.create({
            connectionId: id,
            eventType,
            statement: clean,
            originalType: 'Query Editor',
            pos: 0,
            logName: 'Query Editor',
            user: req.user.id || null,
            diff,
            dbUser
          });
        }

        // Broadcast to the connection's room over Socket.io so the frontend updates instantly!
        const io = req.app.get('io');
        if (io && auditRecord) {
          const BinlogAuditTable = getBinlogAuditModel(connection, activeDatabaseName, 'INSERT');
          const populatedRecord = await BinlogAuditTable.findById(auditRecord._id).populate('user', 'name email');
          io.to(`connection_${id}`).emit('binlog_events', {
            events: [{
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
            }]
          });
        }
      }
    } catch (binlogErr) {
      console.error('Failed to log query editor command to binlog audit:', binlogErr.message);
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
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const database = req.query.database || connection.database;
    const { conn, type } = await getConnection(connection, database);
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
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_type IN ('BASE TABLE', 'VIEW')
      `);
      stats = {
        type: 'postgresql',
        database: database,
        size: size.rows[0]?.size || '0 MB',
        totalTables: parseInt(tables.rows[0]?.count || 0),
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

      stats = {
        type: 'oracle',
        database: database,
        sizeMB: sizeResult.rows[0]?.SIZEMB || sizeResult.rows[0]?.sizemb || 0,
        totalTables: tablesResult.rows[0]?.COUNT || tablesResult.rows[0]?.count || 0,
        activeConnections,
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
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
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

    if (req.user.role !== 'admin') {
      const User = require('../models/userModel');
      const currentUser = await User.findById(req.user.id);
      if (currentUser && currentUser.allowedConnections) {
        const allowedConn = currentUser.allowedConnections.find(
          ac => ac.connectionId && ac.connectionId.toString() === req.params.id
        );
        if (allowedConn && Array.isArray(allowedConn.databases) && allowedConn.databases.length > 0 && !allowedConn.databases.includes('*')) {
          databases = databases.filter(db => allowedConn.databases.includes(db));
        }
      }
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
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (connection.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Permission denied!' });
    }

    const User = require('../models/userModel');
    const users = await User.find({ _id: { $ne: req.user.id } })
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
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (connection.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Permission denied!' });
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
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'mysql' && connection.type !== 'postgresql' && connection.type !== 'mongodb') {
      return res.status(400).json({ message: 'Log monitoring is only supported for MySQL, PostgreSQL, and MongoDB connections!' });
    }

    if (connection.type === 'postgresql' || connection.type === 'mongodb') {
      return res.status(200).json({
        success: true,
        logFile: connection.type === 'mongodb' ? 'mock-oplog.000001' : 'mock-wal.000001',
        position: 100,
        logBinEnabled: false,
        mode: 'simulation',
        message: `${connection.type === 'mongodb' ? 'Oplog' : 'WAL'} monitoring started in simulation mode.`
      });
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
    if (upper.startsWith('CALL') || upper.startsWith('EXEC') || upper.includes('PROCEDURE') || upper.includes('FUNCTION')) {
      eventType = 'SP';
    } else if (upper.startsWith('INSERT')) {
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
    } else if (eventType === 'SP') {
      const callMatch = clean.match(/(?:CALL|EXEC)\s+([^\s\`\(]+)/i);
      const procMatch = clean.match(/(?:PROCEDURE|FUNCTION)\s+([^\s\`\(]+)/i);
      const name = callMatch ? callMatch[1] : (procMatch ? procMatch[1] : '');
      if (name) {
        table = name.replace(/[\`\'\"]/g, '');
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
          type: 'SP', 
          statement: `CALL calculate_monthly_revenue(${rand}, '2026-07-01')`,
          diff: {
            table: 'orders',
            newData: { procedure: 'calculate_monthly_revenue', args: [rand, '2026-07-01'] },
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

      if (selected.diff) {
        selected.diff.database = connection.database || 'test';
      }

      const filterSettings = connection.binlogFilterSettings || { INSERT: true, UPDATE: true, DELETE: true, DDL: true, SP: true, OTHER: true };
      const auditCheckKey = getAuditCheckKey(selected.statement, 'Query');

      let auditRecord = null;
      if (filterSettings[auditCheckKey]) {
        const BinlogAuditTable = getBinlogAuditModel(connection, connection.database || 'test', 'INSERT');
        auditRecord = await BinlogAuditTable.create({
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
      }

      if (selected.type === 'SP' && filterSettings['SP']) {
        const BinlogAuditSP = getBinlogAuditModel(connection, connection.database || 'test', 'SP');
        await BinlogAuditSP.create({
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
      }

      if (auditRecord) {
        const BinlogAuditTable = getBinlogAuditModel(connection, connection.database || 'test', 'INSERT');
        const populatedRecord = await BinlogAuditTable.findById(auditRecord._id).populate('user', 'name email');
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

  let rows = [];
  try {
    const [qRows] = await conn.query(`SHOW BINLOG EVENTS IN '${activeFile}' FROM ${startPos} LIMIT 100`);
    rows = qRows;
  } catch (err) {
    const errMsg = err.message || '';
    const isFileNotFound = 
      err.code === 'ER_NO_BINARY_LOG' || 
      err.errno === 1781 || 
      err.errno === 1236 || 
      errMsg.includes('not found') || 
      errMsg.includes('does not exist') ||
      errMsg.includes('could not find');

    if (isFileNotFound) {
      console.warn(`[Self-Healing] Binlog file "${activeFile}" not found on connection ${connectionId}. Attempting recovery...`);
      try {
        const [binlogs] = await conn.query('SHOW BINARY LOGS');
        if (binlogs && binlogs.length > 0) {
          const oldestLog = binlogs[0].Log_name;
          console.log(`[Self-Healing] Resetting connection ${connectionId} state to oldest log "${oldestLog}" at position 4.`);
          
          const BinlogState = require('../models/binlogStateModel');
          await BinlogState.updateOne(
            { connectionId: connection._id },
            { $set: { logFile: oldestLog, position: 4, updatedAt: new Date() } }
          );

          return {
            success: true,
            events: [],
            nextLogFile: oldestLog,
            nextPosition: 4
          };
        }
      } catch (recoveryErr) {
        console.error('[Self-Healing] Recovery failed during SHOW BINARY LOGS:', recoveryErr.message);
      }
    }
    throw err;
  }

  try {
    
    // Map table ID to table name dynamically during the current batch run
    const lastTableMap = {};
    
    for (const row of rows) {
      if (row.Event_type === 'Table_map') {
        const info = row.Info || '';
        const idMatch = info.match(/table_id:\s*(\d+)/i);
        const nameMatch = info.match(/\(([^)]+)\)/);
        if (idMatch && nameMatch) {
          const tableId = idMatch[1];
          let rawName = nameMatch[1];
          let dbName = '';
          let tableName = rawName;
          if (rawName.includes('.')) {
            const parts = rawName.split('.');
            dbName = parts[0].replace(/[\`\'\"]/g, '');
            tableName = parts[1].replace(/[\`\'\"]/g, '');
          }
          lastTableMap[tableId] = { tableName, dbName };
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
          const tableInfo = tableId && lastTableMap[tableId] ? lastTableMap[tableId] : null;
          const tableName = tableInfo ? tableInfo.tableName : 'unknown';

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

        let eventDbName = '';
        if (row.Info) {
          const idMatch = row.Info.match(/table_id:\s*(\d+)/i);
          const tableId = idMatch ? idMatch[1] : null;
          if (tableId && lastTableMap[tableId]) {
            eventDbName = lastTableMap[tableId].dbName || '';
          }
        }
        
        const finalDbName = eventDbName || connection.database || 'test';

        if (diff) {
          diff.database = finalDbName;
        } else {
          diff = {
            table: 'unknown',
            database: finalDbName,
            newData: null,
            oldData: null
          };
        }

        const filterSettings = connection.binlogFilterSettings || { INSERT: true, UPDATE: true, DELETE: true, DDL: true, SP: true, OTHER: true };
        const auditCheckKey = getAuditCheckKey(parsed.statement, parsed.originalType);

        let auditRecord = null;
        if (filterSettings[auditCheckKey]) {
          const BinlogAuditTable = getBinlogAuditModel(connection, finalDbName, 'INSERT');
          auditRecord = await BinlogAuditTable.create({
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
        }

        if (parsed.eventType === 'SP' && filterSettings['SP']) {
          const BinlogAuditSP = getBinlogAuditModel(connection, finalDbName, 'SP');
          await BinlogAuditSP.create({
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
        }

        if (auditRecord) {
          const BinlogAuditTable = getBinlogAuditModel(connection, finalDbName, 'INSERT');
          const populatedRecord = await BinlogAuditTable.findById(auditRecord._id).populate('user', 'name email');
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
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const result = await exports.pollBinlogEventsInternal(id, logFile, position, mode, req.user.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving binlog events', error: err.message });
  }
};

exports.getBinlogHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { timeFilter, startDate, endDate, filterType, searchQuery, database: reqDatabase } = req.query;
    
    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const query = { connectionId: id };

    if (timeFilter && timeFilter !== 'ALL') {
      const now = new Date();
      let timeLimit = null;

      if (timeFilter === '1hour') {
        timeLimit = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      } else if (timeFilter === '3hour') {
        timeLimit = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      } else if (timeFilter === '6hour') {
        timeLimit = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      } else if (timeFilter === '12hour') {
        timeLimit = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      } else if (timeFilter === '24hour') {
        timeLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (timeFilter === '1month') {
        timeLimit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === '3month') {
        timeLimit = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === 'custom') {
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (start || end) {
          query.timestamp = {};
          if (start) query.timestamp.$gte = start;
          if (end) {
            const endOfDay = new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1);
            query.timestamp.$lte = endOfDay;
          }
        }
      }

      if (timeLimit) {
        query.timestamp = { $gte: timeLimit };
      }
    }

    // Database schema filter with loose match fallback
    if (reqDatabase) {
      query.$or = [
        { 'diff.database': reqDatabase },
        { 'diff.database': { $exists: false } },
        { 'diff.database': null }
      ];
    }

    // Event Type Filter
    if (filterType && filterType !== 'ALL') {
      query.eventType = filterType;
    }

    // Text Search Query Filter
    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery.trim(), 'i');
      const searchOr = [
        { statement: searchRegex },
        { dbUser: searchRegex },
        { originalType: searchRegex },
        { 'diff.table': searchRegex }
      ];

      if (query.$or) {
        const dbOr = query.$or;
        delete query.$or;
        query.$and = [
          { $or: dbOr },
          { $or: searchOr }
        ];
      } else {
        query.$or = searchOr;
      }
    }

    const targetDbName = reqDatabase || connection.database || 'test';
    const limitVal = timeFilter && timeFilter !== 'ALL' ? 500 : 150;

    let history = [];
    if (filterType === 'SP') {
      const BinlogAudit = getBinlogAuditModel(connection, targetDbName, 'SP');
      history = await BinlogAudit.find(query)
        .populate('user', 'name email')
        .sort({ timestamp: -1 })
        .limit(limitVal);
    } else {
      const BinlogAudit = getBinlogAuditModel(connection, targetDbName, 'INSERT');
      history = await BinlogAudit.find(query)
        .populate('user', 'name email')
        .sort({ timestamp: -1 })
        .limit(limitVal);
    }

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
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const targetDbName = connection.database || 'test';
    const TableAudit = getBinlogAuditModel(connection, targetDbName, 'INSERT');
    const SPAudit = getBinlogAuditModel(connection, targetDbName, 'SP');

    await Promise.all([
      TableAudit.deleteMany({ connectionId: id }),
      SPAudit.deleteMany({ connectionId: id })
    ]);

    res.status(200).json({ success: true, message: 'Binlog audit log history cleared successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error clearing binlog history', error: err.message });
  }
};

// ─── GET CONNECTION AUDIT LOGS (GET) ──────────────────────
exports.getConnectionAuditLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const AuditLog = require('../models/auditLogModel');
    const Connection = require('../models/connectionModel');

    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const { userId, action, startDate, endDate, queryType } = req.query;
    const filter = { connection: id };

    if (userId) {
      filter.user = userId;
    }
    if (action) {
      filter.action = action;
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    let logs = await AuditLog.find(filter)
      .populate('user', 'name email role')
      .populate('connection', 'name type')
      .sort({ createdAt: -1 })
      .limit(1000);

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
    console.error('Connection audit logs fetch error:', err.message);
    res.status(500).json({ message: 'Error fetching connection audit logs', error: err.message });
  }
};

// ─── GET SINGLE CONNECTION (GET) ──────────────────────
exports.getConnectionById = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    res.status(200).json({ success: true, connection });
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving connection', error: err.message });
  }
};

// ─── UPDATE CONNECTION SETTINGS (PUT) ──────────────────
exports.updateConnectionSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const { slowQueryThreshold, binlogFilterSettings } = req.body;
    
    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (slowQueryThreshold !== undefined) {
      connection.slowQueryThreshold = parseInt(slowQueryThreshold) || 100;
    }

    if (binlogFilterSettings !== undefined) {
      connection.binlogFilterSettings = {
        INSERT: !!binlogFilterSettings.INSERT,
        UPDATE: !!binlogFilterSettings.UPDATE,
        DELETE: !!binlogFilterSettings.DELETE,
        DDL: !!binlogFilterSettings.DDL,
        SP: !!binlogFilterSettings.SP,
        OTHER: !!binlogFilterSettings.OTHER
      };
    }

    await connection.save();

    res.status(200).json({ 
      success: true, 
      message: 'Connection settings updated successfully!', 
      connection 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating settings', error: err.message });
  }
};