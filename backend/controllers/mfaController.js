const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const { completeLogin } = require('../utils/authSession');
const { logAuditTrail } = require('../utils/auditLogger');
const {
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  MFA_PRIVATE_FIELDS,
  MFA_TOKEN_AUDIENCE,
  createBackupCodes,
  createSetup,
  decryptSecret,
  encryptSecret,
  hashBackupCode,
  mfaTokenSecret,
  normalizeCode,
  verifyTotp,
} = require('../utils/mfa');

const serverError = (res, err) => {
  console.error('MFA error:', err.message);
  return res.status(500).json({ message: 'Could not complete the MFA request. Please try again.' });
};

// Wrong passwords and codes answer 400, not 401: the frontend treats any 401 as a dead session
// and signs the person out, which must not happen for a typo on the profile page.
const failedCodeResponse = (res, check) => {
  if (check.locked) {
    return res.status(429).json({ message: `Too many wrong codes. Please try again in ${LOCK_MINUTES} minutes.` });
  }
  return res.status(400).json({ message: 'That code is not valid. Please check it and try again.' });
};

// Checks an authenticator or backup code. The database updates are conditional, so one code
// cannot be accepted twice, even by two requests arriving at the same time.
const checkCode = async (user, rawCode) => {
  if (user.mfa?.lockedUntil && user.mfa.lockedUntil > new Date()) return { ok: false, locked: true };

  const code = normalizeCode(rawCode);
  const clearFailures = { 'mfa.failedAttempts': 0, 'mfa.lockedUntil': null };

  if (/^\d{6}$/.test(code)) {
    const { valid, step } = await verifyTotp(decryptSecret(user.mfa.secret), code);
    if (valid) {
      const update = await User.updateOne(
        { _id: user._id, $or: [{ 'mfa.lastUsedStep': null }, { 'mfa.lastUsedStep': { $lt: step } }] },
        { $set: { 'mfa.lastUsedStep': step, ...clearFailures } }
      );
      if (update.modifiedCount === 1) return { ok: true, usedBackupCode: false };
    }
  } else if (code) {
    const hash = hashBackupCode(code);
    const update = await User.updateOne(
      { _id: user._id, 'mfa.backupCodes': hash },
      { $pull: { 'mfa.backupCodes': hash }, $set: clearFailures }
    );
    if (update.modifiedCount === 1) return { ok: true, usedBackupCode: true };
  }

  const updated = await User.findByIdAndUpdate(
    user._id,
    { $inc: { 'mfa.failedAttempts': 1 } },
    { returnDocument: 'after' }
  ).select('+mfa.failedAttempts');

  await logAuditTrail(null, user._id, 'MFA_FAILED', `Wrong MFA code entered for: ${user.email}`);

  if (updated.mfa.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    await User.updateOne(
      { _id: user._id },
      { $set: { 'mfa.failedAttempts': 0, 'mfa.lockedUntil': new Date(Date.now() + LOCK_MINUTES * 60 * 1000) } }
    );
    return { ok: false, locked: true };
  }
  return { ok: false, locked: false };
};

const loadUserForMfa = (id) => User.findById(id).select(MFA_PRIVATE_FIELDS);

const auditBackupCodeUse = async (user) => {
  await logAuditTrail(null, user._id, 'MFA_BACKUP_USED', `Backup code used by: ${user.email}`);
};

const SESSION_EXPIRED = { message: 'Your sign-in has expired. Please sign in again.', sessionExpired: true };

// The temporary token proves the password was already correct
const userFromMfaToken = async (mfaToken) => {
  let payload;
  try {
    payload = jwt.verify(String(mfaToken), mfaTokenSecret(), { audience: MFA_TOKEN_AUDIENCE });
  } catch {
    return null;
  }
  const user = await loadUserForMfa(payload.id);
  return user && (payload.tv || 0) === (user.tokenVersion || 0) ? user : null;
};

// Second sign-in step
exports.verifyLogin = async (req, res) => {
  try {
    const { mfaToken, code } = req.body;
    const user = await userFromMfaToken(mfaToken);
    if (!user || !user.mfa?.enabled) return res.status(401).json(SESSION_EXPIRED);

    const check = await checkCode(user, code);
    if (!check.ok) return failedCodeResponse(res, check);
    if (check.usedBackupCode) await auditBackupCodeUse(user);

    return completeLogin(user, res, { auditDetails: `User logged in with MFA: ${user.email}` });
  } catch (err) {
    return serverError(res, err);
  }
};

const createPendingSetup = async (user) => {
  const { secret, qrCode } = await createSetup(user.email);
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.pendingSecret': encryptSecret(secret) } });
  return { qrCode, secret };
};

// A working code proves the app was set up correctly, so nobody locks themselves out
const activateMfa = async (user, rawCode) => {
  const { valid, step } = await verifyTotp(decryptSecret(user.mfa.pendingSecret), normalizeCode(rawCode));
  if (!valid) return null;

  const { codes, hashes } = createBackupCodes();
  const enabledAt = new Date();
  await User.updateOne({ _id: user._id }, {
    $set: {
      'mfa.enabled': true,
      'mfa.optedOut': false,
      'mfa.enabledAt': enabledAt,
      'mfa.secret': user.mfa.pendingSecret,
      'mfa.pendingSecret': null,
      'mfa.backupCodes': hashes,
      'mfa.lastUsedStep': step,
      'mfa.failedAttempts': 0,
      'mfa.lockedUntil': null,
    },
  });
  await logAuditTrail(null, user._id, 'MFA_ENABLE', `User turned on MFA: ${user.email}`);
  return { enabledAt, backupCodes: codes };
};

const INVALID_CODE = { message: 'That code is not valid. Please check it and try again.' };

// First sign-in, step 1: MFA is on by default, so the QR code comes before any session
exports.startLoginSetup = async (req, res) => {
  try {
    const user = await userFromMfaToken(req.body.mfaToken);
    if (!user || user.mfa?.enabled || user.mfa?.optedOut) return res.status(401).json(SESSION_EXPIRED);
    const setup = await createPendingSetup(user);
    return res.status(200).json({ success: true, ...setup });
  } catch (err) {
    return serverError(res, err);
  }
};

// First sign-in, step 2: the session starts only after a working code
exports.finishLoginSetup = async (req, res) => {
  try {
    const user = await userFromMfaToken(req.body.mfaToken);
    if (!user || user.mfa?.enabled || user.mfa?.optedOut || !user.mfa?.pendingSecret) {
      return res.status(401).json(SESSION_EXPIRED);
    }
    const activated = await activateMfa(user, req.body.code);
    if (!activated) return res.status(400).json(INVALID_CODE);

    return completeLogin(user, res, {
      auditDetails: `User logged in after setting up MFA: ${user.email}`,
      extra: { backupCodes: activated.backupCodes },
    });
  } catch (err) {
    return serverError(res, err);
  }
};

exports.getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+mfa.backupCodes');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.status(200).json({
      success: true,
      enabled: Boolean(user.mfa?.enabled),
      enabledAt: user.mfa?.enabledAt || null,
      backupCodesRemaining: user.mfa?.backupCodes?.length || 0,
    });
  } catch (err) {
    return serverError(res, err);
  }
};

// Step 1 of turning MFA on: needs the password, and stays inactive until a code is confirmed
exports.startSetup = async (req, res) => {
  try {
    const user = await loadUserForMfa(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.mfa?.enabled) return res.status(400).json({ message: 'MFA is already turned on.' });

    if (!(await bcrypt.compare(String(req.body.password ?? ''), user.password))) {
      return res.status(400).json({ message: 'Your password is incorrect.' });
    }

    return res.status(200).json({ success: true, ...(await createPendingSetup(user)) });
  } catch (err) {
    return serverError(res, err);
  }
};

// Step 2
exports.confirmSetup = async (req, res) => {
  try {
    const user = await loadUserForMfa(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.mfa?.enabled) return res.status(400).json({ message: 'MFA is already turned on.' });
    if (!user.mfa?.pendingSecret) return res.status(400).json({ message: 'Please start the MFA setup again.' });

    const activated = await activateMfa(user, req.body.code);
    if (!activated) return res.status(400).json(INVALID_CODE);
    return res.status(200).json({ success: true, enabled: true, ...activated });
  } catch (err) {
    return serverError(res, err);
  }
};

const verifyPasswordAndCode = async (req, res) => {
  const user = await loadUserForMfa(req.user.id);
  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return null;
  }
  if (!user.mfa?.enabled) {
    res.status(400).json({ message: 'MFA is not turned on.' });
    return null;
  }
  if (!(await bcrypt.compare(String(req.body.password ?? ''), user.password))) {
    res.status(400).json({ message: 'Your password is incorrect.' });
    return null;
  }
  const check = await checkCode(user, req.body.code);
  if (!check.ok) {
    failedCodeResponse(res, check);
    return null;
  }
  if (check.usedBackupCode) await auditBackupCodeUse(user);
  return user;
};

exports.disable = async (req, res) => {
  try {
    const user = await verifyPasswordAndCode(req, res);
    if (!user) return undefined;

    await User.updateOne({ _id: user._id }, { $set: { mfa: { enabled: false, optedOut: true } } });
    await logAuditTrail(null, user._id, 'MFA_DISABLE', `User turned off MFA: ${user.email}`);
    return res.status(200).json({ success: true, enabled: false });
  } catch (err) {
    return serverError(res, err);
  }
};

exports.regenerateBackupCodes = async (req, res) => {
  try {
    const user = await verifyPasswordAndCode(req, res);
    if (!user) return undefined;

    const { codes, hashes } = createBackupCodes();
    await User.updateOne({ _id: user._id }, { $set: { 'mfa.backupCodes': hashes } });
    await logAuditTrail(null, user._id, 'MFA_BACKUP_CODES', `User created new MFA backup codes: ${user.email}`);
    return res.status(200).json({ success: true, backupCodes: codes });
  } catch (err) {
    return serverError(res, err);
  }
};

// Admin recovery for someone who lost both their phone and backup codes
exports.adminReset = async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot reset your own MFA here. Use your profile page.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found!' });
    if (!user.mfa?.enabled) return res.status(400).json({ message: 'MFA is not turned on for this user.' });

    await User.updateOne({ _id: user._id }, { $set: { mfa: { enabled: false, optedOut: false } } });
    await logAuditTrail(null, req.user.id, 'MFA_RESET', `Reset MFA for user: ${user.name} (${user.email})`);
    return res.status(200).json({ success: true, message: `MFA was reset for ${user.name}.` });
  } catch (err) {
    return serverError(res, err);
  }
};
