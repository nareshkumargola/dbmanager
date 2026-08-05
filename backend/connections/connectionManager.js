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
    port: config.port || 5432,
    user: config.username,
    password: config.password,
    database: config.database,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
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
const getConnection = async (connectionDoc) => {
  const key = connectionDoc._id.toString();

  // Pehle se connected hai?
  if (activeConnections.has(key)) {
    return activeConnections.get(key);
  }

  // Naya connection banao
  let conn;
  switch (connectionDoc.type) {
    case 'mysql':
      conn = await connectMySQL(connectionDoc);
      break;
    case 'postgresql':
      conn = await connectPostgreSQL(connectionDoc);
      break;
    case 'mongodb':
      conn = await connectMongoDB(connectionDoc);
      break;
    case 'oracle':
      conn = await connectOracle(connectionDoc);
      break;
    default:
      throw new Error('Unsupported database type!');
  }

  // Save karo memory mein
  activeConnections.set(key, { conn, type: connectionDoc.type });
  return { conn, type: connectionDoc.type };
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
        const client = await connectPostgreSQL(config);
        await client.end();
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
  const key = connectionId.toString();
  if (activeConnections.has(key)) {
    const { conn, type } = activeConnections.get(key);
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
};

module.exports = { getConnection, testConnection, closeConnection };