// Creates an admin account from the server. Public signup is off, so a new install starts here:
//   node scripts/create-admin.js admin@example.com "Admin Name"
// A random password is printed once. Change it from Profile > Security after signing in.
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectAppDb = require('./connectAppDb');
const User = require('../models/userModel');
const { logAuditTrail } = require('../utils/auditLogger');

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const name = String(process.argv[3] || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2) {
    console.error('Usage: node scripts/create-admin.js admin@example.com "Admin Name"');
    process.exitCode = 1;
    return;
  }

  await connectAppDb();
  try {
    if (await User.exists({ email })) {
      console.error(`A user with email ${email} already exists. Nothing was changed.`);
      process.exitCode = 1;
      return;
    }

    const password = crypto.randomBytes(18).toString('base64url');
    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role: 'admin',
      accessMode: 'readwrite',
      isFirstLogin: false,
    });
    await logAuditTrail(null, user._id, 'CREATE_USER', `Admin account created from the server command line: ${user.email}`);

    console.log(`Admin created: ${user.email}`);
    console.log(`Password (shown only once): ${password}`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((err) => {
  console.error('Could not create the admin:', err.message);
  process.exitCode = 1;
});
