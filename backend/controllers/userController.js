const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const Connection = require('../models/connectionModel');
const { closeConnection } = require('../connections/connectionManager');

// Saare users dekho — sirf admin
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')  // Password mat bhejo
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, users });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Single user dekho
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found!' });
    }
    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// User ka role update karo
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const { id } = req.params;

    // Apna role khud mat badlo
    if (id === req.user.id) {
      return res.status(400).json({ 
        message: 'You cannot change your own role!' 
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found!' });
    }

    res.status(200).json({ 
      success: true, 
      message: 'User role updated successfully!',
      user 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// User delete karo
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Khud ko delete mat karo
    if (id === req.user.id) {
      return res.status(400).json({ 
        message: 'You cannot delete yourself!' 
      });
    }

    // Pehle user ke connections find karo taaki unhe close kar sakein
    const connectionsToClose = await Connection.find({ user: id });
    for (const conn of connectionsToClose) {
      await closeConnection(conn._id);
    }

    // Ab connections delete karo
    await Connection.deleteMany({ user: id });

    // Ab user delete karo
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found!' });
    }

    // Log to system audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(null, req.user.id, 'DELETE_USER', `Deleted user account: ${user.name} (${user.email})`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(200).json({ 
      success: true, 
      message: 'User account and all associated database profiles deleted successfully!' 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Naya user banao — sirf admin
const syncConnectionAllowedUsers = async (userId, allowedConnections) => {
  if (!allowedConnections || !Array.isArray(allowedConnections)) return;
  try {
    const Connection = require('../models/connectionModel');
    const allowedConnIds = allowedConnections.map(ac => ac.connectionId).filter(Boolean);
    
    // Add user to allowed connections
    if (allowedConnIds.length > 0) {
      await Connection.updateMany(
        { _id: { $in: allowedConnIds } },
        { $addToSet: { allowedUsers: userId } }
      );
    }
    
    // Remove user from non-allowed connections
    await Connection.updateMany(
      { _id: { $nin: allowedConnIds } },
      { $pull: { allowedUsers: userId } }
    );
  } catch (err) {
    console.error('Error syncing connection allowedUsers:', err.message);
  }
};

// Naya user banao — sirf admin
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, accessMode, allowedConnections } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered!' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const userRole = role || 'developer';
    const userAccessMode = accessMode || 'read';
    const userPermissions = (req.body.permissions && userRole !== 'admin') ? {
      userManagement: !!req.body.permissions.userManagement,
      backup: req.body.permissions.backup !== undefined ? !!req.body.permissions.backup : true,
      binlog: req.body.permissions.binlog !== undefined ? !!req.body.permissions.binlog : true,
      monitor: req.body.permissions.monitor !== undefined ? !!req.body.permissions.monitor : true,
      query: req.body.permissions.query !== undefined ? !!req.body.permissions.query : true,
      history: req.body.permissions.history !== undefined ? !!req.body.permissions.history : true,
      slowQuery: req.body.permissions.slowQuery !== undefined ? !!req.body.permissions.slowQuery : true,
      auditLogs: req.body.permissions.auditLogs !== undefined ? !!req.body.permissions.auditLogs : true,
      connections: req.body.permissions.connections !== undefined ? !!req.body.permissions.connections : true
    } : {
      userManagement: false,
      backup: true, binlog: true, monitor: true, query: true, history: true, slowQuery: true, auditLogs: true, connections: true
    };

    const user = await User.create({
      name,
      email,
      password: hashed,
      role: userRole,
      accessMode: userAccessMode,
      permissions: userPermissions,
      allowedConnections: Array.isArray(allowedConnections) ? allowedConnections : []
    });

    if (Array.isArray(allowedConnections)) {
      await syncConnectionAllowedUsers(user._id, allowedConnections);
    }

    // Log to system audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(null, req.user.id, 'CREATE_USER', `Created new user account: ${user.name} (${user.email}) with role ${userRole} (${userAccessMode})`);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accessMode: user.accessMode,
        permissions: user.permissions,
        allowedConnections: user.allowedConnections
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// User permissions update karo — sirf admin
exports.updateUserPermissions = async (req, res) => {
  try {
    const { permissions, accessMode, allowedConnections } = req.body;
    const { id } = req.params;

    // Apna permission khud mat badlo
    if (id === req.user.id) {
      return res.status(400).json({ 
        message: 'You cannot change your own permissions!' 
      });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found!' });
    }

    if (accessMode && ['read', 'readwrite'].includes(accessMode)) {
      targetUser.accessMode = accessMode;
    }

    if (Array.isArray(allowedConnections)) {
      targetUser.allowedConnections = allowedConnections;
      targetUser.markModified('allowedConnections');
      await syncConnectionAllowedUsers(targetUser._id, allowedConnections);
    }

    // Admins implicitly have all permissions
    if (targetUser.role !== 'admin' && permissions) {
      targetUser.permissions = {
        userManagement: !!permissions?.userManagement,
        backup: !!permissions?.backup,
        binlog: !!permissions?.binlog,
        monitor: !!permissions?.monitor,
        query: !!permissions?.query,
        history: !!permissions?.history,
        slowQuery: !!permissions?.slowQuery,
        auditLogs: !!permissions?.auditLogs,
        connections: !!permissions?.connections
      };
      targetUser.markModified('permissions');
    }

    await targetUser.save();

    res.status(200).json({
      success: true,
      message: 'Permissions updated successfully!',
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        accessMode: targetUser.accessMode,
        permissions: targetUser.permissions,
        allowedConnections: targetUser.allowedConnections
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Full user details update (Name, Email, Password, Role, AccessMode, Permissions)
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, accessMode, permissions, allowedConnections } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found!' });
    }

    if (email && email !== user.email) {
      const existing = await User.findOne({ email, _id: { $ne: id } });
      if (existing) {
        return res.status(400).json({ message: 'Email address is already in use by another account!' });
      }
      user.email = email;
    }

    if (name) user.name = name;

    if (password && password.trim() !== '') {
      const hashed = await bcrypt.hash(password, 12);
      user.password = hashed;
    }

    if (role && id !== req.user.id) {
      user.role = role;
    }

    if (accessMode && ['read', 'readwrite'].includes(accessMode)) {
      user.accessMode = accessMode;
    }

    if (Array.isArray(allowedConnections)) {
      user.allowedConnections = allowedConnections;
      user.markModified('allowedConnections');
      await syncConnectionAllowedUsers(user._id, allowedConnections);
    }

    if (permissions && user.role !== 'admin') {
      user.permissions = {
        userManagement: !!permissions.userManagement,
        backup: !!permissions.backup,
        binlog: !!permissions.binlog,
        monitor: !!permissions.monitor,
        query: !!permissions.query,
        history: !!permissions.history,
        slowQuery: !!permissions.slowQuery,
        auditLogs: !!permissions.auditLogs,
        connections: !!permissions.connections
      };
      user.markModified('permissions');
    }

    await user.save();

    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(null, req.user.id, 'UPDATE_USER', `Updated user account details: ${user.name} (${user.email}) - Role: ${user.role}, Mode: ${user.accessMode}`);
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'User details updated successfully!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accessMode: user.accessMode,
        permissions: user.permissions
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating user', error: err.message });
  }
};