const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
require('dotenv').config();

// Generate token
const generateToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// SIGNUP
exports.signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Does email exist?
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Encrypt password
    const hashed = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
    });

    // Generate token
    const token = generateToken(user._id, user.role);

    res.status(201).json({
      success: true,
      message: 'Account created!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user._id, user.role);

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(null, user._id, 'LOGIN', `User logged in successfully: ${user.email}`);
    } catch (auditErr) {
      console.error('Login audit log failed:', auditErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET PROFILE
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

// LOGOUT
exports.logout = async (req, res) => {
  try {
    const { logAuditTrail } = require('../utils/auditLogger');
    await logAuditTrail(null, req.user.id, 'LOGOUT', `User logged out successfully: ${req.user.email}`);
    res.status(200).json({ success: true, message: 'Logged out successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// FORGOT PASSWORD
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email field is required!' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // For security, don't reveal if user exists or not, but for direct DX feedback, return a friendly msg
      return res.status(404).json({ message: 'No user registered with this email address.' });
    }

    // Generate random reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash token and store in user document with 1 hour expiration
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 3600000; // 1 Hour
    await user.save();

    // Print simulated email link to console logs
    console.log('\n================================================================');
    console.log(`✉️ [EMAIL SIMULATION] Password Reset Request for: ${user.email}`);
    console.log(`Click this link to reset password:`);
    console.log(`👉 http://localhost:5173/reset-password/${resetToken}`);
    console.log('================================================================\n');

    res.status(200).json({
      success: true,
      message: 'Password reset link generated! Check server console logs to click the simulated reset link.'
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// RESET PASSWORD
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'New password is required!' });
    }

    const crypto = require('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
    }

    // Encrypt and update new password
    const hashed = await bcrypt.hash(password, 12);
    user.password = hashed;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    // Log action to system-wide audit trail
    try {
      const { logAuditTrail } = require('../utils/auditLogger');
      await logAuditTrail(null, user._id, 'UPDATE_DB_USER', `User reset password successfully: ${user.email}`);
    } catch (auditErr) {
      console.error('Reset password audit log failed:', auditErr.message);
    }

    res.status(200).json({ success: true, message: 'Password has been reset successfully! You can now log in.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};