const Connection = require('../models/connectionModel');
const { getConnection } = require('../connections/connectionManager');

const checkAccess = (connection, user) => {
  if (user.role === 'admin') return true;
  if (connection.user.toString() === user.id) return true;
  if (connection.allowedUsers && connection.allowedUsers.some(u => u.toString() === user.id)) return true;
  return false;
};

// ─── LIST MONGODB USERS ────────────────────────────────
exports.listMongoUsers = async (req, res) => {
  try {
    const { id } = req.params;
    const dbName = req.query.database || 'admin';
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'mongodb') {
      return res.status(400).json({ message: 'Users listing is only supported for MongoDB connections!' });
    }

    const { conn } = await getConnection(connection);
    const db = conn.db(dbName);

    // Call usersInfo command on MongoDB
    const result = await db.command({ usersInfo: 1 });
    const users = result.users || [];

    const mappedUsers = users.map(u => ({
      user: u.user,
      db: u.db,
      roles: u.roles || []
    }));

    res.status(200).json({ success: true, users: mappedUsers });
  } catch (err) {
    res.status(500).json({ message: 'Error listing MongoDB users', error: err.message });
  }
};

// ─── CREATE MONGODB USER ──────────────────────────────
exports.createMongoUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, roles, database } = req.body; // database where the user is created
    const targetDb = database || 'admin';

    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'mongodb') {
      return res.status(400).json({ message: 'User management is only supported for MongoDB!' });
    }

    const { conn } = await getConnection(connection);
    const db = conn.db(targetDb);

    // Parse roles. Expecting array of objects: [{ role: 'readWrite', db: 'mydb' }]
    const parsedRoles = Array.isArray(roles) ? roles : [{ role: 'read', db: targetDb }];

    await db.command({
      createUser: username,
      pwd: password,
      roles: parsedRoles
    });

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(id, req.user.id, 'CREATE_DB_USER', `Created MongoDB user: ${username} in database: ${targetDb}`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(200).json({ success: true, message: `User ${username} created successfully!` });
  } catch (err) {
    res.status(500).json({ message: 'Error creating MongoDB user', error: err.message });
  }
};

// ─── DELETE MONGODB USER ──────────────────────────────
exports.deleteMongoUser = async (req, res) => {
  try {
    const { id, username, dbName } = req.params;

    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'mongodb') {
      return res.status(400).json({ message: 'User management is only supported for MongoDB!' });
    }

    const { conn } = await getConnection(connection);
    const db = conn.db(dbName || 'admin');

    await db.command({
      dropUser: username
    });

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(id, req.user.id, 'DELETE_DB_USER', `Deleted MongoDB user: ${username} from database: ${dbName || 'admin'}`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(200).json({ success: true, message: `User ${username} dropped successfully!` });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting MongoDB user', error: err.message });
  }
};

// ─── UPDATE MONGODB USER PASSWORD ─────────────────────
exports.updateMongoUserPassword = async (req, res) => {
  try {
    const { id, username, dbName } = req.params;
    const { password } = req.body;

    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const { conn } = await getConnection(connection);
    const db = conn.db(dbName || 'admin');

    await db.command({
      updateUser: username,
      pwd: password
    });

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(id, req.user.id, 'UPDATE_DB_USER', `Updated password for MongoDB user: ${username} in database: ${dbName || 'admin'}`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(200).json({ success: true, message: `Password for ${username} updated successfully!` });
  } catch (err) {
    res.status(500).json({ message: 'Error updating user password', error: err.message });
  }
};

// ─── UPDATE MONGODB USER ROLES ────────────────────────
exports.updateMongoUserRoles = async (req, res) => {
  try {
    const { id, username, dbName } = req.params;
    const { roles } = req.body; // Array of objects: [{ role: 'read', db: 'mydb' }]

    const connection = await Connection.findById(id);
    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const { conn } = await getConnection(connection);
    const db = conn.db(dbName || 'admin');

    const parsedRoles = Array.isArray(roles) ? roles : [];

    await db.command({
      updateUser: username,
      roles: parsedRoles
    });

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(id, req.user.id, 'UPDATE_DB_USER', `Updated roles for MongoDB user: ${username} in database: ${dbName || 'admin'}`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(200).json({ success: true, message: `Roles for ${username} updated successfully!` });
  } catch (err) {
    res.status(500).json({ message: 'Error updating user roles', error: err.message });
  }
};
