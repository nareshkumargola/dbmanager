const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000;
const message = { message: 'Too many attempts. Please wait 15 minutes and try again.' };

// Password and code checks: only failures count, so normal use is never blocked
exports.credentialLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  message,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Forgot / reset password: every request counts, since each can send an email
exports.passwordResetLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  message,
  standardHeaders: true,
  legacyHeaders: false,
});
