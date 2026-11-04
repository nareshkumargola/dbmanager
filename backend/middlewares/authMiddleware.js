const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
require('dotenv').config();

// Login check
exports.protect = async (req, res, next) => {
  let token;

  // Header se token lo
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Authentication required. Please login first.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Token is invalid or has expired.' });
  }

  let user;
  try {
    user = await User.findById(decoded.id).select('role email tokenVersion');
  } catch (err) {
    // Not 401: the frontend signs people out on 401, and an outage should not do that
    console.error('Could not check the session:', err.message);
    return res.status(503).json({ message: 'Could not verify your session. Please try again.' });
  }

  // Tokens made before tokenVersion existed have no "tv" and count as version 0
  if (!user || (decoded.tv || 0) !== (user.tokenVersion || 0)) {
    return res.status(401).json({ message: 'Your session has ended. Please sign in again.' });
  }

  // Role and email come from the database, so a role change applies immediately
  req.user = { ...decoded, id: String(user._id), role: user.role, email: user.email };
  return next();
};

// Role check
exports.adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      message: 'Admin privileges required for this action.' 
    });
  }
  next();
};

// Custom Feature Permission check
exports.checkPermission = (permissionKey) => {
  return async (req, res, next) => {
    try {
      const User = require('../models/userModel');
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found!' });
      }

      // Admins bypass all permission checks
      if (user.role === 'admin') {
        return next();
      }

      // Check if permission key is true
      if (user.permissions && user.permissions[permissionKey] === true) {
        return next();
      }

      return res.status(403).json({
        message: `Access denied! You do not have permission to access '${permissionKey}' features.`
      });
    } catch (err) {
      return res.status(500).json({ message: 'Server authorization error', error: err.message });
    }
  };
};