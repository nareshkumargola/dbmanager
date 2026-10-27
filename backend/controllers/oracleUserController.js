const Connection = require('../models/connectionModel');
const { getConnection } = require('../connections/connectionManager');

const isSafeUsername = (username) => typeof username === 'string' && /^[A-Z][A-Z0-9_$#]{0,127}$/i.test(username);
const quoteIdentifier = (identifier) => `"${identifier.replace(/"/g, '""').toUpperCase()}"`;
const quotePassword = (password) => `'${password.replace(/'/g, "''")}'`;
const allowedRoles = new Set(['CONNECT', 'RESOURCE', 'SELECT_CATALOG_ROLE']);
const protectedUsers = new Set([
  'SYS', 'SYSTEM', 'OUTLN', 'DBSNMP', 'APPQOSSYS', 'AUDSYS', 'ANONYMOUS',
  'CTXSYS', 'DVSYS', 'DVF', 'GSMADMIN_INTERNAL', 'LBACSYS', 'MDSYS',
  'OJVMSYS', 'ORDDATA', 'ORDPLUGINS', 'ORDSYS', 'WMSYS', 'XDB',
  'XS$NULL', 'SYSBACKUP', 'SYSDG', 'SYSKM', 'SYSRAC', 'ORACLE_OCM'
]);
const isProtectedUser = (username) => {
  const normalized = username.toUpperCase();
  return protectedUsers.has(normalized) || /^(?:APEX_|FLOWS_|ORDS_|XS\$)/.test(normalized);
};

const getAuthorizedOracleConnection = async (req) => {
  const connection = await Connection.findById(req.params.id);
  if (!connection) {
    const error = new Error('Connection not found!');
    error.status = 404;
    throw error;
  }
  if (connection.type !== 'oracle') {
    const error = new Error('This operation requires an Oracle connection.');
    error.status = 400;
    throw error;
  }
  if (
    req.user.role !== 'admin' &&
    connection.user.toString() !== req.user.id &&
    !connection.allowedUsers?.some(user => user.toString() === req.user.id)
  ) {
    const error = new Error('You do not have access to this connection!');
    error.status = 403;
    throw error;
  }

  const { conn } = await getConnection(connection);
  return { connection, conn };
};

const handleError = (res, error, fallback) => {
  res.status(error.status || 400).json({
    message: error.message || fallback,
    error: error.message || fallback
  });
};

const normalizeRoles = (roles) => {
  if (!Array.isArray(roles)) {
    throw new Error('Roles must be provided as an array.');
  }
  return roles.map(role => {
    if (typeof role !== 'string' || !allowedRoles.has(role.toUpperCase())) {
      throw new Error(`Role '${role}' is not allowed.`);
    }
    return role.toUpperCase();
  });
};

const ensureManageableUser = async (conn, username) => {
  const normalized = username.toUpperCase();
  if (isProtectedUser(normalized)) {
    throw new Error('Oracle-maintained system users cannot be modified from this screen.');
  }
  try {
    const result = await conn.execute(
      'SELECT oracle_maintained FROM dba_users WHERE username = :username',
      { username: normalized }
    );
    if (!result.rows.length) throw new Error(`Oracle user ${normalized} was not found.`);
    const maintained = result.rows[0].ORACLE_MAINTAINED || result.rows[0].oracle_maintained;
    if (maintained === 'Y') {
      throw new Error('Oracle-maintained system users cannot be modified from this screen.');
    }
  } catch (error) {
    if (!/ORA-00904/.test(error.message || '')) throw error;
    const result = await conn.execute(
      'SELECT username FROM dba_users WHERE username = :username',
      { username: normalized }
    );
    if (!result.rows.length) throw new Error(`Oracle user ${normalized} was not found.`);
  }
};

exports.listUsers = async (req, res) => {
  try {
    const { conn } = await getAuthorizedOracleConnection(req);
    let users;
    try {
      const result = await conn.execute(
        `SELECT username, account_status, created
         FROM dba_users
         WHERE oracle_maintained = 'N'
         ORDER BY username`
      );
      users = result.rows;
    } catch (error) {
      if (!/ORA-00904/.test(error.message || '')) throw error;
      const result = await conn.execute(
        'SELECT username, account_status, created FROM dba_users ORDER BY username'
      );
      users = result.rows.filter(row => !isProtectedUser(row.USERNAME || row.username));
    }
    res.status(200).json({ success: true, users });
  } catch (error) {
    handleError(res, error, 'Failed to list Oracle users.');
  }
};

exports.getRoles = async (req, res) => {
  try {
    const { username } = req.params;
    if (!isSafeUsername(username)) {
      return res.status(400).json({ message: 'Invalid Oracle username.' });
    }
    const { conn } = await getAuthorizedOracleConnection(req);
    const result = await conn.execute(
      'SELECT granted_role FROM dba_role_privs WHERE grantee = :username',
      { username: username.toUpperCase() }
    );
    const roles = result.rows
      .map(row => row.GRANTED_ROLE || row.granted_role)
      .filter(role => allowedRoles.has(role));
    res.status(200).json({ success: true, roles });
  } catch (error) {
    handleError(res, error, 'Failed to load Oracle user roles.');
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, roles = [] } = req.body;
    if (!isSafeUsername(username)) {
      return res.status(400).json({ message: 'Username must be an unquoted Oracle identifier (letters, numbers, _, $, #).' });
    }
    if (isProtectedUser(username)) {
      return res.status(400).json({ message: 'Oracle-maintained system usernames cannot be created through this screen.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const requestedRoles = normalizeRoles(roles);
    const { conn } = await getAuthorizedOracleConnection(req);
    const safeUsername = quoteIdentifier(username);
    let userCreated = false;
    try {
      await conn.execute(`CREATE USER ${safeUsername} IDENTIFIED BY ${quotePassword(password)}`);
      userCreated = true;
      await conn.execute(`GRANT CREATE SESSION TO ${safeUsername}`);
      for (const role of requestedRoles) {
        await conn.execute(`GRANT ${quoteIdentifier(role)} TO ${safeUsername}`);
      }
    } catch (error) {
      if (userCreated) {
        try {
          await conn.execute(`DROP USER ${safeUsername} CASCADE`);
        } catch (cleanupError) {
          console.error(`Oracle user creation cleanup failed for ${username}:`, cleanupError.message);
        }
      }
      throw error;
    }

    res.status(201).json({ success: true, message: `Oracle user ${username.toUpperCase()} created.` });
  } catch (error) {
    handleError(res, error, 'Failed to create Oracle user.');
  }
};

exports.updateRoles = async (req, res) => {
  try {
    const { username } = req.params;
    if (!isSafeUsername(username)) {
      return res.status(400).json({ message: 'Invalid Oracle username.' });
    }
    const requestedRoles = normalizeRoles(req.body.roles);
    const { conn } = await getAuthorizedOracleConnection(req);
    await ensureManageableUser(conn, username);
    const safeUsername = quoteIdentifier(username);
    const grants = await conn.execute(
      'SELECT granted_role FROM dba_role_privs WHERE grantee = :username',
      { username: username.toUpperCase() }
    );
    const existingRoles = grants.rows.map(row => row.GRANTED_ROLE || row.granted_role)
      .filter(role => allowedRoles.has(role));

    for (const role of existingRoles) {
      if (!requestedRoles.includes(role)) {
        await conn.execute(`REVOKE ${quoteIdentifier(role)} FROM ${safeUsername}`);
      }
    }
    for (const role of requestedRoles) {
      if (!existingRoles.includes(role)) {
        await conn.execute(`GRANT ${quoteIdentifier(role)} TO ${safeUsername}`);
      }
    }

    res.status(200).json({ success: true, message: `Roles updated for ${username.toUpperCase()}.` });
  } catch (error) {
    handleError(res, error, 'Failed to update Oracle user roles.');
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { username } = req.params;
    const { password } = req.body;
    if (!isSafeUsername(username)) {
      return res.status(400).json({ message: 'Invalid Oracle username.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }
    const { conn } = await getAuthorizedOracleConnection(req);
    await ensureManageableUser(conn, username);
    await conn.execute(`ALTER USER ${quoteIdentifier(username)} IDENTIFIED BY ${quotePassword(password)}`);
    res.status(200).json({ success: true, message: `Password updated for ${username.toUpperCase()}.` });
  } catch (error) {
    handleError(res, error, 'Failed to update Oracle user password.');
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { username } = req.params;
    if (!isSafeUsername(username)) {
      return res.status(400).json({ message: 'Invalid Oracle username.' });
    }
    const { connection, conn } = await getAuthorizedOracleConnection(req);
    const normalizedUsername = username.toUpperCase();
    if (['SYS', 'SYSTEM'].includes(normalizedUsername) || normalizedUsername === connection.username.toUpperCase()) {
      return res.status(400).json({ message: 'Cannot drop SYS, SYSTEM, or the user used by this connection.' });
    }
    await ensureManageableUser(conn, normalizedUsername);
    await conn.execute(`DROP USER ${quoteIdentifier(normalizedUsername)} CASCADE`);
    res.status(200).json({ success: true, message: `Oracle user ${normalizedUsername} dropped.` });
  } catch (error) {
    handleError(res, error, 'Failed to drop Oracle user.');
  }
};
