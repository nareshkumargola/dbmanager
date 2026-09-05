const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
require("dotenv").config();
const { sendGenericEmail } = require("../services/notificationService");

// Generate token
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

exports.signup = async (req, res) => {
  try {
    console.log("Request Body:", req.body);

    const { name, email, password, role } = req.body;

    console.log("Password:", password);
    console.log("Password type:", typeof password);

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 12);

    console.log("Hash generated:", hashed);

    const user = await User.create({
      name,
      email,
      password: hashed,
      role: "developer",
      accessMode: "read",
    });

    const token = generateToken(user._id, user.role);

    try {
      const { logAuditTrail } = require("../utils/auditLogger");
      await logAuditTrail(
        null,
        user._id,
        "SIGNUP",
        `User signed up successfully: ${user.email}`,
      );
    } catch (auditErr) {
      console.error("Signup audit log failed:", auditErr.message);
    }

    res.status(201).json({
      success: true,
      message: "User registered successfully!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accessMode: user.accessMode || "read",
        permissions: user.permissions,
      },
    });
  } catch (err) {
    console.error(err);
    console.error(err.stack);

    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};
// LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if user is logging in for the FIRST TIME
    if (user.isFirstLogin === true) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.loginOtp = otp;
      user.loginOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes valid
      await user.save();

      console.log("\n====================================================");
      console.log(`🔑 [FIRST-TIME LOGIN OTP SIMULATION] User: ${user.name} (${user.email})`);
      console.log(`👉 OTP CODE: ${otp}`);
      console.log("====================================================\n");

      const subject = "🔒 First-Time Login OTP Verification - Allatone DMS";
      const htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eee; border-radius: 12px;">
          <h2 style="color: #0d9da4; margin-top: 0;">First-Time Login Verification</h2>
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>Your account was created by the System Administrator. Please enter the OTP code below to verify your first-time login:</p>
          <div style="text-align: center; margin: 25px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0d9da4; background: #f0fdfa; padding: 12px 24px; border-radius: 8px; border: 1px solid #ccfbf1; font-family: monospace;">${otp}</span>
          </div>
          <p style="font-size: 12px; color: #777;">This OTP is valid for 10 minutes. Subsequent logins will not require OTP verification.</p>
        </div>
      `;

      try {
        await sendGenericEmail(user.email, subject, htmlContent);
      } catch (mailErr) {
        console.error("Failed to send OTP email:", mailErr.message);
      }

      return res.status(200).json({
        success: true,
        requiresOtp: true,
        email: user.email,
        message: "First-time login detected. OTP has been sent to your registered email address!",
        debugOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
      });
    }

    // Subsequent logins: Direct Login
    const token = generateToken(user._id, user.role);

    // Log to shared connection audit trail
    try {
      const { logAuditTrail } = require("../utils/auditLogger");
      await logAuditTrail(
        null,
        user._id,
        "LOGIN",
        `User logged in successfully: ${user.email}`,
      );
    } catch (auditErr) {
      console.error("Login audit log failed:", auditErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accessMode: user.accessMode || "read",
        permissions: user.permissions,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// VERIFY FIRST-TIME LOGIN OTP
exports.verifyLoginOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required!" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    if (!user.loginOtp || user.loginOtp !== otp.trim()) {
      return res.status(400).json({ message: "Invalid OTP code. Please check and try again." });
    }

    if (user.loginOtpExpires && user.loginOtpExpires < Date.now()) {
      return res.status(400).json({ message: "OTP code has expired. Please request a new OTP." });
    }

    // OTP Verification Success -> Disable OTP for future logins
    user.isFirstLogin = false;
    user.loginOtp = null;
    user.loginOtpExpires = null;
    await user.save();

    const token = generateToken(user._id, user.role);

    try {
      const { logAuditTrail } = require("../utils/auditLogger");
      await logAuditTrail(
        null,
        user._id,
        "LOGIN",
        `First-time login OTP verified successfully: ${user.email}`,
      );
    } catch (auditErr) {
      console.error("Login OTP audit log failed:", auditErr.message);
    }

    res.status(200).json({
      success: true,
      message: "First-time login verified successfully!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accessMode: user.accessMode || "read",
        permissions: user.permissions,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// RESEND LOGIN OTP
exports.resendLoginOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required!" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.loginOtp = otp;
    user.loginOtpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    console.log(`🔑 [RESEND LOGIN OTP SIMULATION] Email: ${user.email} | OTP: ${otp}`);

    const subject = "🔒 Resent First-Time Login OTP - Allatone DMS";
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eee; border-radius: 12px;">
        <h2 style="color: #0d9da4; margin-top: 0;">New First-Time Login OTP</h2>
        <p>Hello <strong>${user.name}</strong>,</p>
        <p>Your new OTP code for first-time login verification is:</p>
        <div style="text-align: center; margin: 25px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #0d9da4; background: #f0fdfa; padding: 12px 24px; border-radius: 8px; border: 1px solid #ccfbf1; font-family: monospace;">${otp}</span>
        </div>
        <p style="font-size: 12px; color: #777;">This OTP will expire in 10 minutes.</p>
      </div>
    `;

    try {
      await sendGenericEmail(user.email, subject, htmlContent);
    } catch (mailErr) {
      console.error("Failed to send OTP email:", mailErr.message);
    }

    res.status(200).json({
      success: true,
      message: "New OTP has been sent to your email address!",
      debugOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET PROFILE
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// LOGOUT
exports.logout = async (req, res) => {
  try {
    const { logAuditTrail } = require("../utils/auditLogger");
    await logAuditTrail(
      null,
      req.user.id,
      "LOGOUT",
      `User logged out successfully: ${req.user.email}`,
    );
    res
      .status(200)
      .json({ success: true, message: "Logged out successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// FORGOT PASSWORD
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email field is required!" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // For security, don't reveal if user exists or not, but for direct DX feedback, return a friendly msg
      return res
        .status(404)
        .json({ message: "No user registered with this email address." });
    }

    // Generate random reset token
    const crypto = require("crypto");
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash token and store in user document with 1 hour expiration
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 3600000; // 1 Hour
    await user.save();

    // Generate reset HTML layout
    const resetUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password/${resetToken}`;
    const subject = "🔒 Reset Your Allatone DMS Password";
    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 650px; border: 1px solid #eee; border-radius: 12px; text-align: left;">
        <h2 style="color: #0d9da4; margin-top: 0; font-size: 20px;">
          Password Reset Request
        </h2>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          Hello,
        </p>
        <p style="font-size: 14px; color: #555; line-height: 1.6;">
          You are receiving this email because you (or someone else) requested a password reset for your Allatone Database Management account.
        </p>
        <div style="margin: 25px 0; text-align: center;">
          <a href="${resetUrl}" style="background-color: #0d9da4; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 14px;">
            Reset Password Link
          </a>
        </div>
        <p style="font-size: 12px; color: #888; line-height: 1.6;">
          If the button above does not work, copy and paste this URL into your web browser:
        </p>
        <p style="font-size: 12px; font-family: monospace; color: #0d9da4; word-break: break-all;">
          ${resetUrl}
        </p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;" />
        <p style="font-size: 12px; color: #a0aec0; text-align: center;">
          This link will expire in 1 hour. If you did not request this, please ignore this email and your password will remain unchanged.
        </p>
      </div>
    `;

    // Print simulated email link to console logs
    console.log(
      "\n================================================================",
    );
    console.log(
      `✉️ [EMAIL SIMULATION] Password Reset Request for: ${user.email}`,
    );
    console.log(`Click this link to reset password:`);
    console.log(`👉 ${resetUrl}`);
    console.log(
      "================================================================\n",
    );

    try {
      await sendGenericEmail(user.email, subject, htmlContent);
      res.status(200).json({
        success: true,
        message: "Password reset link sent to your registered email address!",
      });
    } catch (mailErr) {
      console.error("Failed to send reset email:", mailErr.message);
      res.status(200).json({
        success: true,
        message:
          "Password reset link generated on console logs (email delivery failed).",
      });
    }
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// RESET PASSWORD
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "New password is required!" });
    }

    const crypto = require("crypto");
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Password reset token is invalid or has expired." });
    }

    // Encrypt and update new password
    const hashed = await bcrypt.hash(password, 12);
    user.password = hashed;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    // Log action to system-wide audit trail
    try {
      const { logAuditTrail } = require("../utils/auditLogger");
      await logAuditTrail(
        null,
        user._id,
        "UPDATE_DB_USER",
        `User reset password successfully: ${user.email}`,
      );
    } catch (auditErr) {
      console.error("Reset password audit log failed:", auditErr.message);
    }

    res.status(200).json({
      success: true,
      message: "Password has been reset successfully! You can now log in.",
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
