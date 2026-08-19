const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const { MongoClient } = require('mongodb');

// Active connections store karo — memory mein
const activeConnections = new Map();

// ─── MYSQL CONNECT ────────────────────────────────
const connectMySQL = async (config) => {
  const poolConfig = {
    host: config.host,
    port: parseInt(config.port) || 3306,
    user: config.username,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 5,
    authPlugins: undefined,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    multipleStatements: true,
    connectTimeout: 2000, // Fail fast on offline hosts
  };

  // Database optional hai — sirf tab add karo jab ho
  if (config.database) {
    poolConfig.database = config.database;
  }

  const pool = mysql.createPool(poolConfig);
  const conn = await pool.getConnection();
  conn.release();
  return pool;
};

// ─── POSTGRESQL CONNECT ───────────────────────────
const connectPostgreSQL = async (config) => {
  const poolConfig = {
    host: config.host,
    port: parseInt(config.port) || 5432,
    user: config.username,
    password: config.password,
    database: config.database || 'postgres',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
  };

  if (config.ssl) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(poolConfig);

  // Verify connection by connecting a client and releasing it immediately
  const client = await pool.connect();
  client.release();
  return pool;
};

// ─── MONGODB CONNECT ──────────────────────────────
const connectMongoDB = async (config) => {
  const client = new MongoClient(config.connectionString, {
    serverSelectionTimeoutMS: 2000, // Fail fast on offline hosts
  });
  await client.connect();
  return client;
};

// ─── ORACLE CONNECT ───────────────────────────────
const connectOracle = async (config) => {
  const oracledb = require('oracledb');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  
  // Thin mode has connectString = host:port/serviceName
  const conn = await oracledb.getConnection({
    user: config.username,
    password: config.password,
    connectString: `${config.host}:${config.port || 1521}/${config.database}`
  });
  return conn;
};

// ─── CONNECTION GET OR CREATE ─────────────────────
const getConnection = async (connectionDoc, targetDatabase = null) => {
  const targetDb = targetDatabase || connectionDoc.database;
  const key = `${connectionDoc._id.toString()}${targetDb ? `_${targetDb}` : ''}`;

  // Pehle se connected hai?
  if (activeConnections.has(key)) {
    return activeConnections.get(key);
  }

  // Connection config prepare karo
  const configToUse = connectionDoc.toObject ? connectionDoc.toObject() : { ...connectionDoc };
  if (targetDb) {
    configToUse.database = targetDb;
  }

  // Naya connection banao
  let conn;
  switch (configToUse.type) {
    case 'mysql':
      conn = await connectMySQL(configToUse);
      break;
    case 'postgresql':
      conn = await connectPostgreSQL(configToUse);
      break;
    case 'mongodb':
      conn = await connectMongoDB(configToUse);
      break;
    case 'oracle':
      conn = await connectOracle(configToUse);
      break;
    default:
      throw new Error('Unsupported database type!');
  }

  // Save karo memory mein
  activeConnections.set(key, { conn, type: configToUse.type });
  return { conn, type: configToUse.type };
};

// ─── CONNECTION TEST ──────────────────────────────
const testConnection = async (config) => {
  try {
    switch (config.type) {
      case 'mysql': {
        const pool = await connectMySQL(config);
        await pool.end();
        break;
      }
      case 'postgresql': {
        const pool = await connectPostgreSQL(config);
        await pool.end();
        break;
      }
      case 'mongodb': {
        const client = await connectMongoDB(config);
        await client.close();
        break;
      }
      case 'oracle': {
        const conn = await connectOracle(config);
        await conn.close();
        break;
      }
      default:
        throw new Error('Unsupported database type!');
    }
    return { success: true, message: 'Connection successful!' };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

// ─── CONNECTION CLOSE ─────────────────────────────
const closeConnection = async (connectionId) => {
  const prefix = connectionId.toString();
  for (const [key, item] of activeConnections.entries()) {
    if (key === prefix || key.startsWith(`${prefix}_`)) {
      const { conn, type } = item;
      try {
        if (type === 'mysql') await conn.end();
        if (type === 'postgresql') await conn.end();
        if (type === 'mongodb') await conn.close();
        if (type === 'oracle') await conn.close();
      } catch (err) {
        console.error('Close error:', err.message);
      }
      activeConnections.delete(key);
    }
  }
};

module.exports = { getConnection, testConnection, closeConnection };