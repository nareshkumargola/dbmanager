// Encrypts saved database passwords and connection strings. Values saved before encryption
// have no prefix and are read as they are, until scripts/encrypt-connection-secrets.js runs.
const crypto = require('crypto');

const PREFIX = 'enc:v1:';

const encryptionKey = () => {
  const base = process.env.CONNECTION_ENCRYPTION_KEY;
  if (!base) throw new Error('CONNECTION_ENCRYPTION_KEY must be set to save or read connection passwords.');
  return Buffer.from(crypto.hkdfSync('sha256', base, '', 'connection-credentials', 32));
};

const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

const encryptSecret = (value) => {
  if (typeof value !== 'string' || value === '') return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${PREFIX}${[iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join(':')}`;
};

const decryptSecret = (value) => {
  if (!isEncrypted(value)) return value;
  try {
    const [iv, tag, encrypted] = value.slice(PREFIX.length).split(':').map((part) => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('A saved connection password could not be read. Check CONNECTION_ENCRYPTION_KEY.');
  }
};

module.exports = { encryptSecret, decryptSecret, isEncrypted };
