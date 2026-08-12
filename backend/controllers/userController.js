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
// Naya user banao — sirf admin
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, accessMode } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered!' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const userRole = role || 'developer';
    const userAccessMode = accessMode || 'read';
    const user = await User.create({
      name,
      email,
      password: hashed,
      role: userRole,
      accessMode: userAccessMode
    });

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
        permissions: user.permissions
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// User permissions update karo — sirf admin
exports.updateUserPermissions = async (req, res) => {
  try {
    const { permissions, accessMode } = req.body;
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
        permissions: targetUser.permissions
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
    const { name, email, password, role, accessMode, permissions } = req.body;

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