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
      message: 'User aur uske saare database connections delete ho gaye!' 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Naya user banao — sirf admin
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered!' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed, role });

    // Log to system audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(null, req.user.id, 'CREATE_USER', `Created new user account: ${user.name} (${user.email}) with role ${role}`);
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
    const { permissions } = req.body;
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

    // Admins implicitly have all permissions
    if (targetUser.role === 'admin') {
      return res.status(400).json({ 
        message: 'Admin users always have all permissions enabled!' 
      });
    }

    targetUser.permissions = {
      backup: !!permissions?.backup,
      binlog: !!permissions?.binlog,
      monitor: !!permissions?.monitor,
      query: !!permissions?.query,
      history: !!permissions?.history,
      slowQuery: !!permissions?.slowQuery,
      auditLogs: !!permissions?.auditLogs,
      connections: !!permissions?.connections
    };

    await targetUser.save();

    // Log to system audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      const grants = Object.keys(targetUser.permissions.toObject())
        .filter(k => targetUser.permissions[k] === true)
        .join(', ');
      const revokes = Object.keys(targetUser.permissions.toObject())
        .filter(k => targetUser.permissions[k] === false)
        .join(', ');

      const detailMsg = `Updated permissions for ${targetUser.name} (${targetUser.email}). ` +
        `Granted: [${grants || 'None'}], Revoked: [${revokes || 'None'}]`;

      await logAuditTrail(null, req.user.id, 'UPDATE_USER_PERMISSIONS', detailMsg);
    } catch (auditErr) {
      console.error('Audit trail logging failed:', auditErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Permissions updated successfully!',
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        permissions: targetUser.permissions
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};