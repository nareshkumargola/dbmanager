const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const mysqldump = require('mysqldump');
const { ObjectId } = require('mongodb');
const Connection = require('../models/connectionModel');
const { mysqlPool } = require('../config/db');
const { createBackup, backupDir } = require('../utils/backup');

const parseMongoTypes = (doc) => {
  if (!doc) return doc;
  const newDoc = { ...doc };
  
  if (newDoc._id && typeof newDoc._id === 'string' && newDoc._id.length === 24 && /^[0-9a-fA-F]{24}$/.test(newDoc._id)) {
    newDoc._id = new ObjectId(newDoc._id);
  }

  const idFields = ['user', 'connectionId'];
  for (const field of idFields) {
    if (newDoc[field] && typeof newDoc[field] === 'string' && newDoc[field].length === 24 && /^[0-9a-fA-F]{24}$/.test(newDoc[field])) {
      newDoc[field] = new ObjectId(newDoc[field]);
    }
  }

  if (newDoc.allowedUsers && Array.isArray(newDoc.allowedUsers)) {
    newDoc.allowedUsers = newDoc.allowedUsers.map(item => {
      if (typeof item === 'string' && item.length === 24 && /^[0-9a-fA-F]{24}$/.test(item)) {
        return new ObjectId(item);
      }
      return item;
    });
  }

  const dateFields = ['createdAt', 'updatedAt', 'timestamp'];
  for (const field of dateFields) {
    if (newDoc[field] && typeof newDoc[field] === 'string') {
      const d = new Date(newDoc[field]);
      if (!isNaN(d.getTime())) {
        newDoc[field] = d;
      }
    }
  }

  return newDoc;
};

const createMysqlBackup = async ({ host, port, user, password, database }) => {
  const fileName = `backup_${database || 'database'}_${Date.now()}.sql`;
  const filePath = path.join(backupDir, fileName);

  await mysqldump({
    connection: {
      host,
      port: port || 3306,
      user,
      password,
      database,
    },
    dumpToFile: filePath,
  });

  return { fileName, filePath };
};

const createPgBackup = async ({ host, port, username, password, database, selections }) => {
  const { Pool } = require('pg');
  const pool = new Pool({
    host,
    port: port || 5432,
    user: username,
    password,
    database,
  });

  const client = await pool.connect();
  let sqlDump = `-- PostgreSQL database dump
-- Generated at: ${new Date().toISOString()}
`;

  try {
    let tables = [];
    if (selections && selections[database] && selections[database].length > 0) {
      tables = selections[database];
    } else {
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `);
      tables = tablesRes.rows.map(r => r.table_name);
    }

    for (const table of tables) {
      sqlDump += `\n-- Table: public."${table}"\n`;
      sqlDump += `DROP TABLE IF EXISTS public."${table}" CASCADE;\n`;
      
      const columnsRes = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      
      const colDefs = columnsRes.rows.map(c => {
        let def = `"${c.column_name}" ${c.data_type.toUpperCase()}`;
        if (c.is_nullable === 'NO') {
          def += ' NOT NULL';
        }
        if (c.column_default) {
          def += ` DEFAULT ${c.column_default}`;
        }
        return def;
      });

      sqlDump += `CREATE TABLE public."${table}" (\n  ${colDefs.join(',\n  ')}\n);\n\n`;

      const rowsRes = await client.query(`SELECT * FROM public."${table}"`);
      const columns = columnsRes.rows.map(c => c.column_name);

      if (rowsRes.rows.length > 0) {
        sqlDump += `INSERT INTO public."${table}" ("${columns.join('", "')}") VALUES\n`;
        const valuesList = rowsRes.rows.map(row => {
          const vals = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            return val;
          });
          return `(${vals.join(', ')})`;
        });
        sqlDump += `${valuesList.join(',\n')};\n`;
      }
    }

    const fileName = `backup_postgres_${database || 'database'}_${Date.now()}.sql`;
    const filePath = path.join(backupDir, fileName);
    fs.writeFileSync(filePath, sqlDump, 'utf8');

    return { fileName, filePath };
  } finally {
    client.release();
    await pool.end();
  }
};

const generateSinglePgDump = async ({ host, port, username, password, database, selectedTables }) => {
  const { Pool } = require('pg');
  const pool = new Pool({
    host,
    port: port || 5432,
    user: username,
    password,
    database,
  });

  const client = await pool.connect();
  let sqlDump = `-- PostgreSQL Database Dump for: ${database}\n`;

  try {
    let tables = [];
    if (selectedTables && Array.isArray(selectedTables) && selectedTables.length > 0) {
      tables = selectedTables;
    } else {
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `);
      tables = tablesRes.rows.map(r => r.table_name);
    }

    for (const table of tables) {
      sqlDump += `\n-- Table: public."${table}"\n`;
      sqlDump += `DROP TABLE IF EXISTS public."${table}" CASCADE;\n`;
      
      const columnsRes = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      
      const colDefs = columnsRes.rows.map(c => {
        let def = `"${c.column_name}" ${c.data_type.toUpperCase()}`;
        if (c.is_nullable === 'NO') {
          def += ' NOT NULL';
        }
        if (c.column_default) {
          def += ` DEFAULT ${c.column_default}`;
        }
        return def;
      });

      sqlDump += `CREATE TABLE public."${table}" (\n  ${colDefs.join(',\n  ')}\n);\n\n`;

      const rowsRes = await client.query(`SELECT * FROM public."${table}"`);
      const columns = columnsRes.rows.map(c => c.column_name);

      if (rowsRes.rows.length > 0) {
        sqlDump += `INSERT INTO public."${table}" ("${columns.join('", "')}") VALUES\n`;
        const valuesList = rowsRes.rows.map(row => {
          const vals = columns.map(col => {
            const val = row[col];
            if (val === null) return 'NULL';
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            return val;
          });
          return `(${vals.join(', ')})`;
        });
        sqlDump += `${valuesList.join(',\n')};\n`;
      }
    }

    return sqlDump;
  } finally {
    client.release();
    await pool.end();
  }
};

// ─── BACKUP KARO ──────────────────────────────────
exports.takeBackup = async (req, res) => {
  try {
    let fileName;
    let filePath;

    const connectionId = req.body.connectionId || req.query.connectionId;

    if (connectionId) {
      const connection = await Connection.findById(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found!' });
      }
      if (connection.type !== 'mysql' && connection.type !== 'mongodb' && connection.type !== 'postgresql') {
        return res.status(400).json({ message: 'Backup is only available for MySQL, MongoDB and PostgreSQL connections.' });
      }

      const database = req.body.database || req.query.database;
      let selections = req.body.selections;
      if (!selections && req.query.selections) {
        try {
          selections = typeof req.query.selections === 'string' 
            ? JSON.parse(req.query.selections) 
            : req.query.selections;
        } catch (e) {
          console.error('Error parsing selections query parameter:', e.message);
        }
      }

      if (connection.type === 'mongodb') {
        const { getConnection } = require('../connections/connectionManager');
        const { conn } = await getConnection(connection);

        if (selections && typeof selections === 'object' && Object.keys(selections).length > 0) {
          // Backup selected databases and collections
          const databasesData = {};
          for (const dbName of Object.keys(selections)) {
            const db = conn.db(dbName);
            let colsToBackup = [];
            
            const selectedCols = selections[dbName];
            if (selectedCols && Array.isArray(selectedCols) && selectedCols.length > 0) {
              colsToBackup = selectedCols;
            } else {
              const cols = await db.listCollections().toArray();
              colsToBackup = cols
                .map(c => c.name)
                .filter(colName => !colName.startsWith('system.'));
            }

            const collectionsData = {};
            for (const colName of colsToBackup) {
              try {
                const docs = await db.collection(colName).find({}).toArray();
                collectionsData[colName] = docs;
              } catch (colErr) {
                console.error(`Skipping collection ${colName} backup:`, colErr.message);
              }
            }
            databasesData[dbName] = collectionsData;
          }

          const backupPayload = {
            dbType: 'mongodb',
            backupType: 'selection',
            backupTime: new Date().toISOString(),
            databases: databasesData
          };

          fileName = `backup_mongodb_selection_${Date.now()}.json`;
          filePath = path.join(backupDir, fileName);
          fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2), 'utf8');
        } else if (database) {
          // Backup specific MongoDB database
          const db = conn.db(database);
          const cols = await db.listCollections().toArray();
          const collectionsData = {};
          
          for (const col of cols) {
            const colName = col.name;
            if (colName.startsWith('system.')) continue;
            const docs = await db.collection(colName).find({}).toArray();
            collectionsData[colName] = docs;
          }

          const backupPayload = {
            dbType: 'mongodb',
            backupType: 'single',
            backupTime: new Date().toISOString(),
            database,
            collections: collectionsData
          };

          fileName = `backup_mongodb_${database}_${Date.now()}.json`;
          filePath = path.join(backupDir, fileName);
          fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2), 'utf8');
        } else {
          // Backup entire MongoDB server (all user databases)
          const adminDb = conn.db('admin');
          const dbsRes = await adminDb.admin().listDatabases();
          const systemDbs = ['admin', 'local', 'config'];
          const dbsToBackup = dbsRes.databases
            .map(d => d.name)
            .filter(dbName => !systemDbs.includes(dbName.toLowerCase()));

          const databasesData = {};
          for (const dbName of dbsToBackup) {
            const db = conn.db(dbName);
            const cols = await db.listCollections().toArray();
            const collectionsData = {};
            for (const col of cols) {
              const colName = col.name;
              if (colName.startsWith('system.')) continue;
              const docs = await db.collection(colName).find({}).toArray();
              collectionsData[colName] = docs;
            }
            databasesData[dbName] = collectionsData;
          }

          const backupPayload = {
            dbType: 'mongodb',
            backupType: 'server',
            backupTime: new Date().toISOString(),
            databases: databasesData
          };

          fileName = `backup_mongodb_server_${Date.now()}.json`;
          filePath = path.join(backupDir, fileName);
          fs.writeFileSync(filePath, JSON.stringify(backupPayload, null, 2), 'utf8');
        }
      } else if (connection.type === 'postgresql') {
        if (selections && typeof selections === 'object' && Object.keys(selections).length > 0) {
          const dbsToBackup = Object.keys(selections);
          fileName = `backup_postgres_selection_${Date.now()}.sql`;
          filePath = path.join(backupDir, fileName);

          fs.writeFileSync(filePath, `-- PostgreSQL Selection Backup\n-- Generated: ${new Date().toISOString()}\n\n`, 'utf8');

          for (const db of dbsToBackup) {
            try {
              const dumpContent = await generateSinglePgDump({
                host: connection.host,
                port: connection.port,
                username: connection.username,
                password: connection.password,
                database: db,
                selectedTables: selections[db]
              });

              fs.appendFileSync(
                filePath,
                `\n\n-- -----------------------------------------------------\n` +
                `-- Database: ${db}\n` +
                `-- -----------------------------------------------------\n` +
                `${dumpContent}\n`,
                'utf8'
              );
            } catch (dumpErr) {
              console.error(`Skipping PostgreSQL backup for database ${db}:`, dumpErr.message);
            }
          }
        } else {
          const targetDb = database || connection.database;
          if (targetDb) {
            const pgBackupResult = await createPgBackup({
              host: connection.host,
              port: connection.port,
              username: connection.username,
              password: connection.password,
              database: targetDb,
            });
            fileName = pgBackupResult.fileName;
            filePath = pgBackupResult.filePath;
          } else {
            const { Pool } = require('pg');
            const adminPool = new Pool({
              host: connection.host,
              port: connection.port || 5432,
              user: connection.username,
              password: connection.password,
              database: 'postgres'
            });

            let dbs = [];
            try {
              const resDbs = await adminPool.query(
                "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres', 'template1', 'template2')"
              );
              dbs = resDbs.rows.map(r => r.datname);
            } catch (dbErr) {
              console.error('Error fetching pg databases:', dbErr.message);
            } finally {
              await adminPool.end();
            }

            if (dbs.length === 0) {
              return res.status(400).json({ message: 'No PostgreSQL user databases found.' });
            }

            fileName = `backup_postgres_server_${Date.now()}.sql`;
            filePath = path.join(backupDir, fileName);
            fs.writeFileSync(filePath, `-- PostgreSQL Server Backup\n-- Generated: ${new Date().toISOString()}\n\n`, 'utf8');

            for (const db of dbs) {
              try {
                const dumpContent = await generateSinglePgDump({
                  host: connection.host,
                  port: connection.port,
                  username: connection.username,
                  password: connection.password,
                  database: db
                });
                fs.appendFileSync(
                  filePath,
                  `\n\n-- -----------------------------------------------------\n` +
                  `-- Database: ${db}\n` +
                  `-- -----------------------------------------------------\n` +
                  `${dumpContent}\n`,
                  'utf8'
                );
              } catch (dumpErr) {
                console.error(`Skipping backup for database ${db}:`, dumpErr.message);
              }
            }
          }
        }
      } else {
        // MySQL backup logic
        if (selections && typeof selections === 'object' && Object.keys(selections).length > 0) {
          const dbsToBackup = Object.keys(selections);
          fileName = `backup_selection_${Date.now()}.sql`;
          filePath = path.join(backupDir, fileName);

          // Initialize empty consolidated SQL file
          fs.writeFileSync(filePath, `-- MySQL Selection Backup\n-- Generated: ${new Date().toISOString()}\n\n`, 'utf8');

          for (const db of dbsToBackup) {
            const tempFileName = `temp_${db}_${Date.now()}.sql`;
            const tempFilePath = path.join(backupDir, tempFileName);

            const selectedTables = selections[db];
            const dumpConfig = {
              connection: {
                host: connection.host,
                port: connection.port || 3306,
                user: connection.username,
                password: connection.password,
                database: db,
              },
              dumpToFile: tempFilePath,
            };

            if (selectedTables && Array.isArray(selectedTables) && selectedTables.length > 0) {
              dumpConfig.dump = {
                tables: selectedTables
              };
            }

            try {
              await mysqldump(dumpConfig);

              if (fs.existsSync(tempFilePath)) {
                const dumpContent = fs.readFileSync(tempFilePath, 'utf8');
                fs.appendFileSync(
                  filePath,
                  `\n\n-- -----------------------------------------------------\n` +
                  `-- Database: ${db}\n` +
                  `-- -----------------------------------------------------\n` +
                  `CREATE DATABASE IF NOT EXISTS \`${db}\`;\n` +
                  `USE \`${db}\`;\n\n` +
                  `${dumpContent}\n`,
                  'utf8'
                );
                fs.unlinkSync(tempFilePath);
              }
            } catch (dumpErr) {
              console.error(`Skipping backup for database ${db}:`, dumpErr.message);
            }
          }
        } else if (database) {
          // Backup specific database
          ({ fileName, filePath } = await createMysqlBackup({
            host: connection.host,
            port: connection.port,
            user: connection.username,
            password: connection.password,
            database,
          }));
        } else {
          // Backup entire database server (all user schemas)
          const conn = await mysql.createConnection({
            host: connection.host,
            port: connection.port || 3306,
            user: connection.username,
            password: connection.password,
          });
          conn.on('error', (err) => {
            console.error('Temporary backup MySQL connection error:', err.message);
          });

          const [rows] = await conn.query('SHOW DATABASES');
          const systemDbs = ['information_schema', 'performance_schema', 'mysql', 'sys'];
          const dbsToBackup = rows
            .map(r => Object.values(r)[0])
            .filter(db => !systemDbs.includes(db.toLowerCase()));

          await conn.end();

          if (dbsToBackup.length === 0) {
            return res.status(400).json({ message: 'No user databases found to backup.' });
          }

          fileName = `backup_server_${Date.now()}.sql`;
          filePath = path.join(backupDir, fileName);

          // Initialize empty consolidated SQL file
          fs.writeFileSync(filePath, `-- MySQL Server Backup\n-- Generated: ${new Date().toISOString()}\n\n`, 'utf8');

          for (const db of dbsToBackup) {
            const tempFileName = `temp_${db}_${Date.now()}.sql`;
            const tempFilePath = path.join(backupDir, tempFileName);

            try {
              await mysqldump({
                connection: {
                  host: connection.host,
                  port: connection.port || 3306,
                  user: connection.username,
                  password: connection.password,
                  database: db,
                },
                dumpToFile: tempFilePath,
              });

              if (fs.existsSync(tempFilePath)) {
                const dumpContent = fs.readFileSync(tempFilePath, 'utf8');
                fs.appendFileSync(
                  filePath,
                  `\n\n-- -----------------------------------------------------\n` +
                  `-- Database: ${db}\n` +
                  `-- -----------------------------------------------------\n` +
                  `CREATE DATABASE IF NOT EXISTS \`${db}\`;\n` +
                  `USE \`${db}\`;\n\n` +
                  `${dumpContent}\n`,
                  'utf8'
                );
                fs.unlinkSync(tempFilePath);
              }
            } catch (dumpErr) {
              console.error(`Skipping backup for database ${db}:`, dumpErr.message);
            }
          }
        }
      }
    } else {
      ({ fileName, filePath } = await createBackup());
    }

    if (connectionId) {
      try {
        const { logAuditTrail } = require('../utils/auditLogger');
        const dbName = req.body.database || req.query.database || 'All Databases';
        await logAuditTrail(connectionId, req.user.id, 'EXPORT_BACKUP', `Exported backup for database: ${dbName}. Filename: ${fileName}`);
      } catch (auditErr) {
        console.error('Audit trail logging failed:', auditErr.message);
      }
    }

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      fs.unlink(filePath, () => {});
    });

  } catch (err) {
    res.status(500).json({ message: 'Backup failed!', error: err.message });
  }
};

// ─── RESTORE KARO ─────────────────────────────────
exports.restoreBackup = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a backup file!' });
    }

    const fileContent = fs.readFileSync(req.file.path, 'utf8');

    // Check if the uploaded file is a MongoDB backup file (JSON)
    let isMongoDBBackup = false;
    let backupPayload = null;
    try {
      backupPayload = JSON.parse(fileContent);
      if (backupPayload && backupPayload.dbType === 'mongodb') {
        isMongoDBBackup = true;
      }
    } catch (e) {
      // Not JSON, continue as SQL
    }

    if (isMongoDBBackup) {
      if (!req.query.connectionId) {
        return res.status(400).json({ message: 'Restore requires a connectionId!' });
      }

      const connectionDoc = await Connection.findById(req.query.connectionId);
      if (!connectionDoc) {
        return res.status(404).json({ message: 'Connection not found!' });
      }
      if (connectionDoc.type !== 'mongodb') {
        return res.status(400).json({ message: 'Target connection is not a MongoDB connection!' });
      }

      const { getConnection } = require('../connections/connectionManager');
      const { conn } = await getConnection(connectionDoc);
      const targetDatabase = req.query.database;

      let restoredCollectionsCount = 0;
      let restoredDocsCount = 0;

      if (backupPayload.backupType === 'single') {
        const dbName = targetDatabase || backupPayload.database || 'restored_db';
        const db = conn.db(dbName);
        
        for (const [colName, docs] of Object.entries(backupPayload.collections || {})) {
          const collection = db.collection(colName);
          await collection.deleteMany({});
          if (docs.length > 0) {
            const parsedDocs = docs.map(parseMongoTypes);
            await collection.insertMany(parsedDocs, { ordered: false });
            restoredDocsCount += docs.length;
          }
          restoredCollectionsCount++;
        }
      } else if (backupPayload.backupType === 'server' || backupPayload.backupType === 'selection') {
        for (const [dbName, collections] of Object.entries(backupPayload.databases || {})) {
          const db = conn.db(dbName);
          for (const [colName, docs] of Object.entries(collections || {})) {
            const collection = db.collection(colName);
            await collection.deleteMany({});
            if (docs.length > 0) {
              const parsedDocs = docs.map(parseMongoTypes);
              await collection.insertMany(parsedDocs, { ordered: false });
              restoredDocsCount += docs.length;
            }
            restoredCollectionsCount++;
          }
        }
      }

      fs.unlink(req.file.path, () => {});

      // Log to audit log
      try {
        const { logAuditTrail } = require('../utils/auditLogger');
        const dbName = targetDatabase || 'All Databases';
        await logAuditTrail(req.query.connectionId, req.user.id, 'RESTORE_BACKUP', `Restored MongoDB backup filename: ${req.file.originalname} into database: ${dbName}`);
      } catch (auditErr) {
        console.error('Audit trail logging failed:', auditErr.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Restore completed successfully!',
        statements: restoredCollectionsCount,
        collections: restoredCollectionsCount,
        documents: restoredDocsCount
      });
    }

    const statements = fileContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    let targetConnection;
    let targetDatabase;
    let isPoolConnection = false;

    if (req.query.connectionId) {
      const connectionDoc = await Connection.findById(req.query.connectionId);
      if (!connectionDoc) {
        return res.status(404).json({ message: 'Connection not found!' });
      }
      if (connectionDoc.type !== 'mysql' && connectionDoc.type !== 'postgresql') {
        return res.status(400).json({ message: 'Restore is only available for MySQL and PostgreSQL connections.' });
      }

      if (connectionDoc.type === 'postgresql') {
        targetDatabase = req.query.database;
        const { Pool } = require('pg');

        // Create target database if it doesn't exist
        if (targetDatabase) {
          const adminPool = new Pool({
            host: connectionDoc.host,
            port: connectionDoc.port || 5432,
            user: connectionDoc.username,
            password: connectionDoc.password,
            database: 'postgres',
          });
          const adminClient = await adminPool.connect();
          try {
            const dbCheck = await adminClient.query(
              "SELECT 1 FROM pg_database WHERE datname = $1",
              [targetDatabase]
            );
            if (dbCheck.rows.length === 0) {
              await adminClient.query(`CREATE DATABASE "${targetDatabase}"`);
            }
          } catch (dbErr) {
            console.error('Error creating PostgreSQL database:', dbErr.message);
          } finally {
            adminClient.release();
            await adminPool.end();
          }
        }

        // Connect to target database and execute statements
        const pool = new Pool({
          host: connectionDoc.host,
          port: connectionDoc.port || 5432,
          user: connectionDoc.username,
          password: connectionDoc.password,
          database: targetDatabase || 'postgres',
        });
        const pgClient = await pool.connect();

        try {
          await pgClient.query('BEGIN');
          // Execute the entire content directly to support multi-line statements, triggers, functions and string literals with semicolons
          await pgClient.query(fileContent);
          await pgClient.query('COMMIT');
        } catch (pgErr) {
          await pgClient.query('ROLLBACK');
          throw pgErr;
        } finally {
          pgClient.release();
          await pool.end();
          fs.unlink(req.file.path, () => {});
        }

        // Log to audit log
        try {
          const { logAuditTrail } = require('../utils/auditLogger');
          const dbName = targetDatabase || 'postgres';
          await logAuditTrail(req.query.connectionId, req.user.id, 'RESTORE_BACKUP', `Restored PostgreSQL SQL backup filename: ${req.file.originalname} into database: ${dbName}`);
        } catch (auditErr) {
          console.error('Audit trail logging failed:', auditErr.message);
        }

        return res.status(200).json({
          success: true,
          message: 'Restore completed successfully!',
          statements: statements.length,
        });
      }

      targetDatabase = req.query.database;

      targetConnection = await mysql.createConnection({
        host: connectionDoc.host,
        port: connectionDoc.port || 3306,
        user: connectionDoc.username,
        password: connectionDoc.password,
      });
      targetConnection.on('error', (err) => {
        console.error('Restore MySQL connection error:', err.message);
      });

      if (targetDatabase) {
        await targetConnection.query(`CREATE DATABASE IF NOT EXISTS \`${targetDatabase}\``);
        await targetConnection.query(`USE \`${targetDatabase}\``);
      }
    } else {
      targetConnection = await mysqlPool.getConnection();
      isPoolConnection = true;
    }

    const useTransaction = !!targetDatabase;
    try {
      if (useTransaction) {
        await targetConnection.beginTransaction();
      }
      await targetConnection.query('SET FOREIGN_KEY_CHECKS = 0');

      for (const statement of statements) {
        if (statement.trim()) {
          let modifiedStatement = statement;

          if (targetDatabase) {
            const cleanStmt = modifiedStatement.trim();
            if (/^CREATE\s+DATABASE/i.test(cleanStmt) || /^USE\s+/i.test(cleanStmt)) {
              continue;
            }
          }

          if (/^INSERT\s+INTO/i.test(modifiedStatement)) {
            modifiedStatement = modifiedStatement.replace(
              /^INSERT\s+INTO/i, 'INSERT IGNORE INTO'
            );
          }

          if (/^CREATE\s+TABLE/i.test(modifiedStatement)) {
            modifiedStatement = modifiedStatement.replace(
              /^CREATE\s+TABLE/i, 'CREATE TABLE IF NOT EXISTS'
            );
          }

          try {
            await targetConnection.query(modifiedStatement);
          } catch (stmtErr) {
            console.log('Statement skip:', stmtErr.message);
          }
        }
      }

      await targetConnection.query('SET FOREIGN_KEY_CHECKS = 1');
      if (useTransaction) {
        await targetConnection.commit();
      }
    } catch (err) {
      if (useTransaction) {
        await targetConnection.rollback();
      }
      throw err;
    } finally {
      if (isPoolConnection) {
        targetConnection.release();
      } else {
        await targetConnection.end();
      }
      fs.unlink(req.file.path, () => {});
    }

    // Log to audit log
    if (req.query.connectionId) {
      try {
        const { logAuditTrail } = require('../utils/auditLogger');
        const dbName = targetDatabase || 'All Databases';
        await logAuditTrail(req.query.connectionId, req.user.id, 'RESTORE_BACKUP', `Restored MySQL SQL backup filename: ${req.file.originalname} into database: ${dbName}`);
      } catch (auditErr) {
        console.error('Audit trail logging failed:', auditErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Restore completed successfully!',
      statements: statements.length,
    });

  } catch (err) {
    res.status(500).json({ message: 'Restore failed!', error: err.message });
  }
};

// ─── BACKUP LIST DEKHO ────────────────────────────
exports.getBackupInfo = async (req, res) => {
  try {
    const [tables] = await mysqlPool.execute('SHOW TABLES');
    const [size] = await mysqlPool.execute(`
      SELECT 
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS sizeMB
      FROM information_schema.tables
      WHERE table_schema = ?
    `, [process.env.MYSQL_DATABASE]);

    res.status(200).json({
      success: true,
      info: {
        database: process.env.MYSQL_DATABASE,
        totalTables: tables.length,
        sizeInMB: size[0]?.sizeMB || 0,
        backupTime: new Date().toISOString(),
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};