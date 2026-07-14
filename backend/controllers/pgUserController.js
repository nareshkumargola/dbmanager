const Connection = require('../models/connectionModel');
const { getConnection } = require('../connections/connectionManager');
const { logAuditTrail } = require('../utils/auditLogger');

const checkAccess = (connection, user) => {
  if (user.role === 'admin') return true;
  if (connection.user.toString() === user.id) return true;
  if (connection.allowedUsers && connection.allowedUsers.some(u => u.toString() === user.id)) return true;
  return false;
};

// ─── LIST POSTGRESQL USERS ───────────────────────────
exports.listPGUsers = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'postgresql') {
      return res.status(400).json({ message: 'Users listing is only supported for PostgreSQL databases!' });
    }

    const { conn } = await getConnection(connection);

    // Query active roles that can login
    const query = `
      SELECT rolname AS username, 
             rolsuper AS is_superuser, 
             rolcreatedb AS can_create_db, 
             rolcreaterole AS can_create_role,
             rolreplication AS is_replication
      FROM pg_roles
      WHERE rolcanlogin = true
      ORDER BY rolname;
    `;

    const { rows } = await conn.query(query);

    res.status(200).json({
      success: true,
      users: rows.map(r => ({
        username: r.username,
        isSuperuser: r.is_superuser,
        canCreateDb: r.can_create_db,
        canCreateRole: r.can_create_role,
        isReplication: r.is_replication
      }))
    });
  } catch (err) {
    console.error('List PG Users error:', err.message);
    res.status(500).json({ message: 'Error retrieving PostgreSQL users', error: err.message });
  }
};

// ─── CREATE POSTGRESQL USER ──────────────────────────
exports.createPGUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, isSuperuser, canCreateDb, canCreateRole } = req.body;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'postgresql') {
      return res.status(400).json({ message: 'Database type must be PostgreSQL!' });
    }

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required!' });
    }

    // Sanitize identifier to prevent SQL injection in DDL queries
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ message: 'Invalid username format!' });
    }

    const { conn } = await getConnection(connection);

    // Compile options
    const options = [];
    options.push(isSuperuser ? 'SUPERUSER' : 'NOSUPERUSER');
    options.push(canCreateDb ? 'CREATEDB' : 'NOCREATEDB');
    options.push(canCreateRole ? 'CREATEROLE' : 'NOCREATEROLE');

    // DDL query creation using pg client
    const createQuery = `CREATE ROLE "${username}" WITH LOGIN PASSWORD $1 ${options.join(' ')};`;
    await conn.query(createQuery, [password]);

    // Log to audit log
    await logAuditTrail(
      connection._id,
      req.user.id,
      'CREATE_DB_USER',
      `Created PostgreSQL user: ${username} with options: ${options.join(', ')}`
    );

    res.status(201).json({ success: true, message: `PostgreSQL user ${username} created successfully!` });
  } catch (err) {
    console.error('Create PG User error:', err.message);
    res.status(500).json({ message: 'Error creating PostgreSQL user', error: err.message });
  }
};

// ─── DELETE POSTGRESQL USER ──────────────────────────
exports.deletePGUser = async (req, res) => {
  try {
    const { id, username } = req.params;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'postgresql') {
      return res.status(400).json({ message: 'Database type must be PostgreSQL!' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ message: 'Invalid username format!' });
    }

    const { conn } = await getConnection(connection);

    const dropQuery = `DROP ROLE "${username}";`;
    await conn.query(dropQuery);

    // Log to audit log
    await logAuditTrail(
      connection._id,
      req.user.id,
      'DELETE_DB_USER',
      `Deleted PostgreSQL user: ${username}`
    );

    res.status(200).json({ success: true, message: `PostgreSQL user ${username} deleted successfully!` });
  } catch (err) {
    console.error('Delete PG User error:', err.message);
    res.status(500).json({ message: 'Error deleting PostgreSQL user', error: err.message });
  }
};

// ─── UPDATE PASSWORD ─────────────────────────────────
exports.updatePGUserPassword = async (req, res) => {
  try {
    const { id, username } = req.params;
    const { password } = req.body;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'postgresql') {
      return res.status(400).json({ message: 'Database type must be PostgreSQL!' });
    }

    if (!password) {
      return res.status(400).json({ message: 'Password is required!' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ message: 'Invalid username format!' });
    }

    const { conn } = await getConnection(connection);

    const alterQuery = `ALTER ROLE "${username}" WITH PASSWORD $1;`;
    await conn.query(alterQuery, [password]);

    // Log to audit log
    await logAuditTrail(
      connection._id,
      req.user.id,
      'UPDATE_DB_USER',
      `Updated password for PostgreSQL user: ${username}`
    );

    res.status(200).json({ success: true, message: `Password updated for PostgreSQL user ${username}!` });
  } catch (err) {
    console.error('Update PG User Password error:', err.message);
    res.status(500).json({ message: 'Error updating PostgreSQL user password', error: err.message });
  }
};

// ─── UPDATE PRIVILEGES (ROLES) ──────────────────────
exports.updatePGUserRoles = async (req, res) => {
  try {
    const { id, username } = req.params;
    const { isSuperuser, canCreateDb, canCreateRole } = req.body;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'postgresql') {
      return res.status(400).json({ message: 'Database type must be PostgreSQL!' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ message: 'Invalid username format!' });
    }

    const { conn } = await getConnection(connection);

    // Compile options
    const options = [];
    options.push(isSuperuser ? 'SUPERUSER' : 'NOSUPERUSER');
    options.push(canCreateDb ? 'CREATEDB' : 'NOCREATEDB');
    options.push(canCreateRole ? 'CREATEROLE' : 'NOCREATEROLE');

    const alterQuery = `ALTER ROLE "${username}" WITH ${options.join(' ')};`;
    await conn.query(alterQuery);

    // Log to audit log
    await logAuditTrail(
      connection._id,
      req.user.id,
      'UPDATE_DB_USER',
      `Updated privileges for PostgreSQL user: ${username} to: ${options.join(', ')}`
    );

    res.status(200).json({ success: true, message: `Privileges updated for PostgreSQL user ${username}!` });
  } catch (err) {
    console.error('Update PG User Privileges error:', err.message);
    res.status(500).json({ message: 'Error updating PostgreSQL user privileges', error: err.message });
  }
};
