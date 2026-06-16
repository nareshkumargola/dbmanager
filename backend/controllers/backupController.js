const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const mysqldump = require('mysqldump');
const Connection = require('../models/connectionModel');
const { mysqlPool } = require('../config/db');
const { createBackup, backupDir } = require('../utils/backup');

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

// ─── BACKUP KARO ──────────────────────────────────
exports.takeBackup = async (req, res) => {
  try {
    let fileName;
    let filePath;

    if (req.query.connectionId) {
      const connection = await Connection.findById(req.query.connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection nahi mila!' });
      }
      if (connection.type !== 'mysql') {
        return res.status(400).json({ message: 'Backup sirf MySQL connections ke liye available hai.' });
      }

      const database = req.query.database || connection.database;
      if (!database) {
        return res.status(400).json({ message: 'Database select karo pehle!' });
      }

      ({ fileName, filePath } = await createMysqlBackup({
        host: connection.host,
        port: connection.port,
        user: connection.username,
        password: connection.password,
        database,
      }));
    } else {
      ({ fileName, filePath } = await createBackup());
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
      return res.status(400).json({ message: 'SQL file upload karo!' });
    }

    const sqlContent = fs.readFileSync(req.file.path, 'utf8');

    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'));

    let targetConnection;
    let targetDatabase;
    let isPoolConnection = false;

    if (req.query.connectionId) {
      const connectionDoc = await Connection.findById(req.query.connectionId);
      if (!connectionDoc) {
        return res.status(404).json({ message: 'Connection nahi mila!' });
      }
      if (connectionDoc.type !== 'mysql') {
        return res.status(400).json({ message: 'Restore sirf MySQL connections ke liye available hai.' });
      }

      targetDatabase = req.query.database || connectionDoc.database;
      if (!targetDatabase) {
        return res.status(400).json({ message: 'Database select karo pehle!' });
      }

      targetConnection = await mysql.createConnection({
        host: connectionDoc.host,
        port: connectionDoc.port || 3306,
        user: connectionDoc.username,
        password: connectionDoc.password,
      });
      await targetConnection.query(`CREATE DATABASE IF NOT EXISTS \`${targetDatabase}\``);
      await targetConnection.query(`USE \`${targetDatabase}\``);
    } else {
      targetConnection = await mysqlPool.getConnection();
      isPoolConnection = true;
    }

    try {
      await targetConnection.beginTransaction();
      await targetConnection.query('SET FOREIGN_KEY_CHECKS = 0');

      for (const statement of statements) {
        if (statement.trim()) {
          let modifiedStatement = statement;

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
      await targetConnection.commit();
    } catch (err) {
      await targetConnection.rollback();
      throw err;
    } finally {
      if (isPoolConnection) {
        targetConnection.release();
      } else {
        await targetConnection.end();
      }
      fs.unlink(req.file.path, () => {});
    }

    res.status(200).json({
      success: true,
      message: 'Database restore ho gaya!',
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