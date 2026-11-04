// Last-resort recovery when no admin can sign in, run on the server: node scripts/reset-mfa.js user@example.com
require('dotenv').config();
const mongoose = require('mongoose');
const connectAppDb = require('./connectAppDb');
const User = require('../models/userModel');
const { logAuditTrail } = require('../utils/auditLogger');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node scripts/reset-mfa.js user@example.com');
    process.exitCode = 1;
    return;
  }

  await connectAppDb();
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`No user found with email ${email}.`);
      process.exitCode = 1;
      return;
    }
    await User.updateOne({ _id: user._id }, { $set: { mfa: { enabled: false, optedOut: true } } });
    await logAuditTrail(null, user._id, 'MFA_RESET', `MFA reset from the server command line for: ${user.email}`);
    console.log(`MFA turned off for ${user.email}. They can now sign in with their password.`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((err) => {
  console.error('Could not reset MFA:', err.message);
  process.exitCode = 1;
});
