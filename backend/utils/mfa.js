const crypto = require('crypto');
const QRCode = require('qrcode');
const { generateSecret, generateURI, verify } = require('otplib');

const ISSUER = 'Allatone DMS';
const BACKUP_CODE_COUNT = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const MFA_TOKEN_AUDIENCE = 'mfa-login';
// Accept the previous and next 30-second code, so a slightly wrong phone clock still works
const CLOCK_TOLERANCE_SECONDS = 30;

// Fields hidden by default on the User model, needed when checking a code
const MFA_PRIVATE_FIELDS = '+mfa.secret +mfa.pendingSecret +mfa.backupCodes +mfa.lastUsedStep +mfa.failedAttempts +mfa.lockedUntil';

const deriveKey = (label) => {
  const base = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!base) throw new Error('MFA_ENCRYPTION_KEY or JWT_SECRET must be set.');
  return Buffer.from(crypto.hkdfSync('sha256', base, '', label, 32));
};

// Signing key for the short-lived "password was correct" token. It differs from JWT_SECRET,
// so the `protect` middleware rejects this token on every other API.
const mfaTokenSecret = () => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set.');
  return Buffer.from(crypto.hkdfSync('sha256', process.env.JWT_SECRET, '', 'mfa-login-token', 32));
};

const encryptSecret = (plainText) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('mfa-secret-encryption'), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
};

const decryptSecret = (stored) => {
  const [version, iv, tag, encrypted] = String(stored).split(':');
  if (version !== 'v1') throw new Error('Unknown MFA secret format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('mfa-secret-encryption'), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
};

const createSetup = async (email) => {
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: ISSUER, label: email, secret });
  // The QR code is drawn here, so the secret never goes to a third-party QR service
  const qrCode = await QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
  return { secret, qrCode };
};

// Returns the code's 30-second time step, which is what blocks reusing the same code
const verifyTotp = async (secret, code) => {
  if (!/^\d{6}$/.test(code)) return { valid: false };
  const result = await verify({ secret, token: code, epochTolerance: CLOCK_TOLERANCE_SECONDS });
  return result.valid ? { valid: true, step: result.timeStep } : { valid: false };
};

const normalizeCode = (code) => String(code ?? '').trim().toUpperCase().replace(/\s/g, '');

const hashBackupCode = (code) => crypto
  .createHmac('sha256', deriveKey('mfa-backup-codes'))
  .update(normalizeCode(code).replace(/-/g, ''))
  .digest('hex');

// Each code has 50 random bits. Base32 leaves out letters that look alike (0/O, 1/I).
const createBackupCodes = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const characters = Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
    return `${characters.slice(0, 5)}-${characters.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashBackupCode) };
};

module.exports = {
  BACKUP_CODE_COUNT,
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
};
