const jwt = require('jsonwebtoken');

const generateToken = (user) => jwt.sign({ id: user._id, role: user.role, tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRE || '1h',
});

// Final step of every sign-in: records it and sends the session token to the browser
const completeLogin = async (user, res, { auditDetails, message = 'Login successful!', extra = {} } = {}) => {
  user.lastLoginAt = new Date();
  await user.save();

  const { logAuditTrail } = require('./auditLogger');
  await logAuditTrail(null, user._id, 'LOGIN', auditDetails || `User logged in successfully: ${user.email}`);

  return res.status(200).json({
    success: true,
    message,
    ...extra,
    token: generateToken(user),
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      accessMode: user.accessMode || 'read',
      permissions: user.permissions,
      preferences: user.preferences,
    },
  });
};

module.exports = { completeLogin, generateToken };
