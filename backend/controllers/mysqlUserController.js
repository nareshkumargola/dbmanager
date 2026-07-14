const Connection = require('../models/connectionModel');
const { getConnection } = require('../connections/connectionManager');

const checkAccess = (connection, user) => {
  if (user.role === 'admin') return true;
  if (connection.user.toString() === user.id) return true;
  if (connection.allowedUsers && connection.allowedUsers.some(u => u.toString() === user.id)) return true;
  return false;
};

const PRIVILEGE_MAP = {
  Select_priv: 'SELECT',
  Insert_priv: 'INSERT',
  Update_priv: 'UPDATE',
  Delete_priv: 'DELETE',
  Create_priv: 'CREATE',
  Drop_priv: 'DROP',
  Reload_priv: 'RELOAD',
  Shutdown_priv: 'SHUTDOWN',
  Process_priv: 'PROCESS',
  File_priv: 'FILE',
  Grant_priv: 'GRANT OPTION',
  References_priv: 'REFERENCES',
  Index_priv: 'INDEX',
  Alter_priv: 'ALTER',
  Show_db_priv: 'SHOW DATABASES',
  Super_priv: 'SUPER',
  Create_tmp_table_priv: 'CREATE TEMPORARY TABLES',
  Lock_tables_priv: 'LOCK TABLES',
  Execute_priv: 'EXECUTE',
  Repl_slave_priv: 'REPLICATION SLAVE',
  Repl_client_priv: 'REPLICATION CLIENT',
  Create_view_priv: 'CREATE VIEW',
  Show_view_priv: 'SHOW VIEW',
  Create_routine_priv: 'CREATE ROUTINE',
  Alter_routine_priv: 'ALTER ROUTINE',
  Create_user_priv: 'CREATE USER',
  Event_priv: 'EVENT',
  Trigger_priv: 'TRIGGER',
  Create_tablespace_priv: 'CREATE TABLESPACE'
};

// ─── LIST MYSQL USERS ────────────────────────────────
exports.listMySQLUsers = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (connection.type !== 'mysql') {
      return res.status(400).json({ message: 'Users listing is only supported for MySQL databases!' });
    }

    const { conn } = await getConnection(connection);

    // Get privilege columns from table schema dynamically (handles different MySQL/MariaDB versions)
    const [cols] = await conn.query('SHOW COLUMNS FROM mysql.user');
    const privCols = cols.map(c => c.Field).filter(name => name.endsWith('_priv'));

    // Construct select fields
    const queryFields = ['user', 'host', ...privCols].map(f => `\`${f}\``).join(', ');
    const [users] = await conn.query(`SELECT ${queryFields} FROM mysql.user ORDER BY user, host`);

    const result = users.map(u => {
      let grantedCount = 0;
      privCols.forEach(col => {
        if (u[col] === 'Y') grantedCount++;
      });

      return {
        user: u.user || u.User,
        host: u.host || u.Host,
        grantedCount,
        totalCount: privCols.length
      };
    });

    res.status(200).json({ success: true, users: result });
  } catch (err) {
    res.status(500).json({ message: 'Error listing MySQL users', error: err.message });
  }
};

// ─── GET DETAILED PRIVILEGES FOR A USER ───────────────
exports.getMySQLUserPrivileges = async (req, res) => {
  try {
    const { id, username, host } = req.params;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const { conn } = await getConnection(connection);

    // Query privilege fields dynamically
    const [cols] = await conn.query('SHOW COLUMNS FROM mysql.user');
    const privCols = cols.map(c => c.Field).filter(name => name.endsWith('_priv'));

    const queryFields = ['user', 'host', ...privCols].map(f => `\`${f}\``).join(', ');
    const [users] = await conn.query(
      `SELECT ${queryFields} FROM mysql.user WHERE user = ? AND host = ?`,
      [username, host]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'MySQL User not found!' });
    }

    const u = users[0];
    const privileges = {};
    privCols.forEach(col => {
      privileges[col] = u[col] === 'Y';
    });

    res.status(200).json({
      success: true,
      user: username,
      host,
      privileges,
      privilegeNames: PRIVILEGE_MAP
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching privileges', error: err.message });
  }
};

// ─── CREATE MYSQL USER ────────────────────────────────
exports.createMySQLUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, host, password } = req.body;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (!username || !host) {
      return res.status(400).json({ message: 'Username aur Host fields required hain!' });
    }

    const { conn } = await getConnection(connection);

    const escapedUser = conn.escape(username);
    const escapedHost = conn.escape(host);
    const escapedPass = conn.escape(password || '');

    await conn.query(`CREATE USER ${escapedUser}@${escapedHost} IDENTIFIED BY ${escapedPass}`);
    await conn.query('FLUSH PRIVILEGES');

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(id, req.user.id, 'CREATE_DB_USER', `Created MySQL user: ${username}@${host}`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(201).json({ success: true, message: 'MySQL User successfully created!' });
  } catch (err) {
    res.status(500).json({ message: 'Error creating MySQL user', error: err.message });
  }
};

// ─── DELETE MYSQL USER ────────────────────────────────
exports.deleteMySQLUser = async (req, res) => {
  try {
    const { id, username, host } = req.params;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const { conn } = await getConnection(connection);

    const escapedUser = conn.escape(username);
    const escapedHost = conn.escape(host);

    await conn.query(`DROP USER ${escapedUser}@${escapedHost}`);
    await conn.query('FLUSH PRIVILEGES');

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(id, req.user.id, 'DELETE_DB_USER', `Deleted MySQL user: ${username}@${host}`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(200).json({ success: true, message: 'MySQL User successfully deleted!' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting MySQL user', error: err.message });
  }
};

// ─── UPDATE PASSWORD ──────────────────────────────────
exports.updateMySQLUserPassword = async (req, res) => {
  try {
    const { id, username, host } = req.params;
    const { password } = req.body;
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    if (password === undefined || password === '') {
      return res.status(400).json({ message: 'Password is required!' });
    }

    const { conn } = await getConnection(connection);

    const escapedUser = conn.escape(username);
    const escapedHost = conn.escape(host);
    const escapedPass = conn.escape(password);

    await conn.query(`ALTER USER ${escapedUser}@${escapedHost} IDENTIFIED BY ${escapedPass}`);
    await conn.query('FLUSH PRIVILEGES');

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(id, req.user.id, 'UPDATE_DB_USER', `Updated password for MySQL user: ${username}@${host}`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(200).json({ success: true, message: 'Password successfully changed!' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating MySQL user password', error: err.message });
  }
};

// ─── UPDATE PRIVILEGES (GRANT/REVOKE) ──────────────────
exports.updateMySQLUserPrivileges = async (req, res) => {
  try {
    const { id, username, host } = req.params;
    const { privileges } = req.body; // Object mapping: { Select_priv: true, ... }
    const connection = await Connection.findById(id);

    if (!connection) {
      return res.status(404).json({ message: 'Connection not found!' });
    }

    if (!checkAccess(connection, req.user)) {
      return res.status(403).json({ message: 'You do not have access to this connection!' });
    }

    const { conn } = await getConnection(connection);

    // Get database state
    const [cols] = await conn.query('SHOW COLUMNS FROM mysql.user');
    const privCols = cols.map(c => c.Field).filter(name => name.endsWith('_priv'));

    const queryFields = ['user', 'host', ...privCols].map(f => `\`${f}\``).join(', ');
    const [users] = await conn.query(
      `SELECT ${queryFields} FROM mysql.user WHERE user = ? AND host = ?`,
      [username, host]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: 'MySQL User not found!' });
    }

    const current = users[0];
    const escapedUser = conn.escape(username);
    const escapedHost = conn.escape(host);

    // Compare privileges and run GRANT or REVOKE queries
    for (const col of privCols) {
      const oldVal = current[col] === 'Y';
      const newVal = privileges[col];

      if (oldVal !== newVal && newVal !== undefined) {
        const sqlPriv = PRIVILEGE_MAP[col];
        if (!sqlPriv) continue;

        try {
          if (newVal) {
            // Grant privilege
            if (sqlPriv === 'GRANT OPTION') {
              await conn.query(`GRANT USAGE ON *.* TO ${escapedUser}@${escapedHost} WITH GRANT OPTION`);
            } else {
              await conn.query(`GRANT ${sqlPriv} ON *.* TO ${escapedUser}@${escapedHost}`);
            }
          } else {
            // Revoke privilege
            if (sqlPriv === 'GRANT OPTION') {
              await conn.query(`REVOKE GRANT OPTION ON *.* FROM ${escapedUser}@${escapedHost}`);
            } else {
              await conn.query(`REVOKE ${sqlPriv} ON *.* FROM ${escapedUser}@${escapedHost}`);
            }
          }
        } catch (grantErr) {
          console.error(`Failed to change privilege ${sqlPriv}:`, grantErr.message);
          // Return error if critical, or proceed
        }
      }
    }

    await conn.query('FLUSH PRIVILEGES');

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(id, req.user.id, 'UPDATE_DB_USER', `Updated privileges for MySQL user: ${username}@${host}`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(200).json({ success: true, message: 'Permissions successfully update ho gayi hain!' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating privileges', error: err.message });
  }
};
