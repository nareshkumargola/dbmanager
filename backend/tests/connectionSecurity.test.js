// Run from backend/: node --test tests/connectionSecurity.test.js
process.env.CONNECTION_ENCRYPTION_KEY = 'test-only-connection-key';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { encryptSecret, decryptSecret, isEncrypted } = require('../utils/connectionSecrets');
const {
  cloudConfigError, isCertificateError, mongoTlsOptions, oracleConnectOptions, tlsOptions,
} = require('../connections/connectionTls');

const CA_FILE = path.join(__dirname, '../certs/aws-rds-global-bundle.pem');
const ONE_CA = fs.readFileSync(CA_FILE, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0];
// Built in pieces so secret scanners don't mistake this placeholder for a real key
const FAKE_KEY = ['-----BEGIN', 'PRIVATE KEY-----\nAAAA\n-----END', 'PRIVATE KEY-----'].join(' ');

test('secrets are encrypted with a fresh IV and read back', () => {
  const first = encryptSecret('p@ss:word');
  const second = encryptSecret('p@ss:word');
  assert.ok(isEncrypted(first));
  assert.ok(!first.includes('p@ss'));
  assert.notEqual(first, second);
  assert.equal(decryptSecret(first), 'p@ss:word');
});

test('empty values and values saved before encryption pass through', () => {
  for (const value of [null, undefined, '']) assert.equal(encryptSecret(value), value);
  assert.equal(decryptSecret('old-plain-password'), 'old-plain-password');
  assert.equal(decryptSecret(null), null);
});

test('a changed value or a different key is refused', (t) => {
  const secret = encryptSecret('secret');
  const parts = secret.split(':');
  parts[parts.length - 1] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptSecret(parts.join(':')), /could not be read/);

  const key = process.env.CONNECTION_ENCRYPTION_KEY;
  t.after(() => { process.env.CONNECTION_ENCRYPTION_KEY = key; });
  process.env.CONNECTION_ENCRYPTION_KEY = 'a-different-key';
  assert.throws(() => decryptSecret(secret), /could not be read/);
  delete process.env.CONNECTION_ENCRYPTION_KEY;
  assert.throws(() => encryptSecret('x'), /CONNECTION_ENCRYPTION_KEY must be set/);
});

test('the Database tab keeps its SSL setting', () => {
  assert.equal(tlsOptions({ ssl: false }), false);
  assert.deepEqual(tlsOptions({ ssl: true }), { rejectUnauthorized: false });
});

test('a cloud connection always verifies, even with SSL off', () => {
  for (const cloudProvider of ['azure', 'ibm', 'alibaba', 'gcp']) {
    const options = tlsOptions({ cloudProvider, ssl: false, host: 'db.example.com' });
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.verifyIdentity, true);
    assert.equal(options.checkServerIdentity, undefined);
  }
});

test('AWS uses the built-in CA bundle unless another one is pasted', () => {
  const builtIn = tlsOptions({ cloudProvider: 'aws', host: 'db.rds.amazonaws.com' });
  assert.ok(builtIn.ca.match(/BEGIN CERTIFICATE/g).length > 10);
  assert.equal(tlsOptions({ cloudProvider: 'aws', host: 'x', caCertificate: ONE_CA }).ca, ONE_CA);
  assert.equal(tlsOptions({ cloudProvider: 'azure', host: 'x' }).ca, undefined);
});

test('only Google Cloud by IP with its own CA skips the host name check', () => {
  const skipped = tlsOptions({ cloudProvider: 'gcp', host: '10.0.0.5', caCertificate: ONE_CA });
  assert.equal(skipped.verifyIdentity, false);
  assert.equal(skipped.checkServerIdentity(), undefined);
  assert.equal(skipped.rejectUnauthorized, true);
  // Without its own CA, any public certificate would otherwise pass
  assert.equal(tlsOptions({ cloudProvider: 'gcp', host: '10.0.0.5' }).verifyIdentity, true);
  assert.equal(tlsOptions({ cloudProvider: 'gcp', host: 'db.example.com', caCertificate: ONE_CA }).verifyIdentity, true);
  assert.equal(tlsOptions({ cloudProvider: 'ibm', host: '10.0.0.5', caCertificate: ONE_CA }).verifyIdentity, true);
});

test('a cloud connection string cannot turn off TLS', () => {
  const secure = (connectionString) => mongoTlsOptions({ cloudProvider: 'atlas', connectionString });
  assert.deepEqual(secure('mongodb+srv://u:p@cluster.example.net/db'), { tls: true });
  assert.deepEqual(secure('mongodb://u:p@a.example.net:27017,b.example.net:27017/db'), { tls: true });
  for (const option of ['tls=false', 'ssl=false', 'tlsInsecure=true', 'tlsAllowInvalidCertificates=true', 'tlsAllowInvalidHostnames=true', 'TLS=FALSE']) {
    assert.throws(() => secure(`mongodb://u:p@a.example.net/db?appName=x&${option}`), /turns off TLS/, option);
  }
  assert.deepEqual(secure('mongodb://u:p@127.0.0.1:27017/db'), {});
  assert.deepEqual(secure('mongodb://u:p@localhost:27017,127.0.0.1:27018/db'), {});
  // A local address inside the password must not count
  assert.deepEqual(secure('mongodb://u:localhost@a.example.net/db'), { tls: true });
  assert.deepEqual(mongoTlsOptions({ connectionString: 'mongodb://u:p@a.example.net/db?tls=false' }), {});
});

test('Oracle Cloud uses TCPS, and the Database tab stays as it was', () => {
  const config = { username: 'u', password: 'p', host: 'db.example.com', database: 'svc' };
  assert.deepEqual(oracleConnectOptions({ ...config, port: 1521, ssl: true }), { user: 'u', password: 'p', connectString: 'db.example.com:1521/svc' });
  assert.deepEqual(oracleConnectOptions({ ...config, cloudProvider: 'oci' }), { user: 'u', password: 'p', connectString: 'tcps://db.example.com:2484/svc', sslServerDNMatch: true });
});

test('the CA field accepts only certificates', () => {
  const check = (caCertificate) => cloudConfigError({ type: 'mysql', host: 'db.example.com', caCertificate });
  assert.equal(check(undefined), null);
  assert.equal(check(''), null);
  assert.equal(check(ONE_CA), null);
  assert.match(check('not a certificate'), /valid CA certificate/);
  assert.match(check('-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----'), /valid CA certificate/);
  assert.match(check(`${ONE_CA}\n${FAKE_KEY}`), /not a private key/);
  assert.match(check({ $ne: null }), /valid CA certificate/);
  assert.match(check('x'.repeat(70000)), /valid CA certificate/);
});

test('certificate failures are recognised, and other failures are not', () => {
  for (const code of ['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    assert.ok(isCertificateError({ code }), code);
  }
  assert.ok(!isCertificateError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }));
  assert.ok(!isCertificateError({ code: 'ER_ACCESS_DENIED_ERROR', message: 'Access denied' }));
});
