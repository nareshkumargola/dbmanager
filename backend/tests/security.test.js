// Runs the real routes against a throwaway database, with a throwaway MongoDB login inside it.
// Run from backend/: node --test tests/security.test.js
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.MFA_ENCRYPTION_KEY = 'test-only-mfa-key';
process.env.CONNECTION_ENCRYPTION_KEY = 'test-only-connection-key';
process.env.NODE_ENV = 'test';

const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const bcrypt = require('bcryptjs');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { generate } = require('otplib');

const DB_NAME = 'dbmanager_security_test';
const TEST_DB = `mongodb://127.0.0.1:27017/${DB_NAME}`;
const PASSWORD = 'Correct-Horse-1';
const MONGO_SECRET = 'S3cret-Mongo-Pass';
const MONGO_URI = `mongodb://sec_tester:${MONGO_SECRET}@127.0.0.1:27017/${DB_NAME}`;
const MASKED_URI = `mongodb://sec_tester:****@127.0.0.1:27017/${DB_NAME}`;

const User = require('../models/userModel');
const Connection = require('../models/connectionModel');
const { getConnection, closeConnection } = require('../connections/connectionManager');
const { maskConnectionString, restoreMaskedPassword } = require('../utils/connectionString');
const { decryptSecret, isEncrypted } = require('../utils/connectionSecrets');

let server;
let base;
let clientNumber = 0;
const openConnectionIds = new Set();

const call = async (method, url, body, token) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.1.0.${clientNumber}`, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, text };
};

const makeUser = (email, role = 'developer', extra = {}) => User.create({
  name: email.split('@')[0],
  email,
  role,
  isFirstLogin: false,
  password: bcrypt.hashSync(PASSWORD, 4),
  mfa: { optedOut: true },
  ...extra,
});
const tokenFor = async (email, password = PASSWORD) => (await call('POST', '/api/auth/login', { email, password })).data.token;
const profileStatus = async (token) => (await call('GET', '/api/auth/profile', null, token)).status;
const storedConnection = (id) => Connection.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
const rawConnection = async (id) => {
  const stored = await storedConnection(id);
  return { ...stored, password: decryptSecret(stored.password), connectionString: decryptSecret(stored.connectionString) };
};

const makeMongoConnection = async (owner, extra = {}) => {
  const connection = await Connection.create({ user: owner._id, name: 'Mongo Test', type: 'mongodb', connectionString: MONGO_URI, ...extra });
  openConnectionIds.add(String(connection._id));
  return connection;
};

before(async () => {
  await mongoose.connect(TEST_DB, { serverSelectionTimeoutMS: 3000 });
  assert.equal(mongoose.connection.name, DB_NAME);
  const db = mongoose.connection.db;
  await db.dropDatabase();
  await db.command({ dropAllUsersFromDatabase: 1 });
  await db.command({ createUser: 'sec_tester', pwd: MONGO_SECRET, roles: [{ role: 'readWrite', db: DB_NAME }] });

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/users', require('../routes/userRoutes'));
  app.use('/api/connections', require('../routes/connectionRoutes'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  clientNumber += 1;
});

after(async () => {
  await Promise.all([...openConnectionIds].map((id) => closeConnection(id).catch(() => {})));
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const db = mongoose.connection.db;
  await db.command({ dropAllUsersFromDatabase: 1 });
  await db.dropDatabase();
  await mongoose.disconnect();
});

/* ---------- Connection string helpers ---------- */

test('masking hides only the password', () => {
  assert.equal(maskConnectionString('mongodb://u:p%40ss@h1:27017,h2:27017/db?x=1'), 'mongodb://u:****@h1:27017,h2:27017/db?x=1');
  assert.equal(maskConnectionString('mongodb+srv://u:p@cluster.example.net/db'), 'mongodb+srv://u:****@cluster.example.net/db');
  assert.equal(maskConnectionString('mongodb://u:p@ss@h/db'), 'mongodb://u:****@h/db');
  assert.equal(maskConnectionString('mongodb://h:27017/db'), 'mongodb://h:27017/db');
  assert.equal(maskConnectionString('mongodb://user-only@h/db'), 'mongodb://user-only@h/db');
  assert.equal(maskConnectionString('not a url u:p@h'), '****');
  assert.equal(maskConnectionString(null), null);
});

test('restoring keeps the saved password, and refuses a changed host', () => {
  const stored = 'mongodb://u:secret@h1:27017/db';
  assert.equal(restoreMaskedPassword('mongodb://u:****@h1:27017/other', stored).value, 'mongodb://u:secret@h1:27017/other');
  assert.equal(restoreMaskedPassword('mongodb://u:new@evil:27017/db', stored).value, 'mongodb://u:new@evil:27017/db');
  assert.equal(restoreMaskedPassword('****', stored).value, stored);
  const moved = restoreMaskedPassword('mongodb://u:****@evil.example.com:27017/db', stored);
  assert.equal(moved.value, undefined);
  assert.ok(moved.error);
  assert.ok(restoreMaskedPassword('mongodb://u:****@h1/db', null).error);
});

/* ---------- Connection API ---------- */

test('no API response contains the Mongo or SQL password', async () => {
  const admin = await makeUser('leak-admin@test.local', 'admin');
  const dev = await makeUser('leak-dev@test.local');
  const token = await tokenFor(admin.email);
  const devToken = await tokenFor(dev.email);

  const created = await call('POST', '/api/connections', { name: 'Created', type: 'mongodb', connectionString: MONGO_URI }, token);
  assert.equal(created.status, 201);
  assert.equal(created.data.connection.connectionString, MASKED_URI);
  const id = created.data.connection._id;
  openConnectionIds.add(id);
  assert.equal((await rawConnection(id)).connectionString, MONGO_URI);

  await Connection.updateOne({ _id: id }, { $addToSet: { allowedUsers: dev._id } });
  const sql = await Connection.create({ user: admin._id, name: 'Sql', type: 'mysql', host: 'h', username: 'u', password: 'Sql-Secret-Value', allowedUsers: [dev._id] });

  const responses = [
    await call('GET', '/api/connections', null, token),
    await call('GET', '/api/connections', null, devToken),
    await call('GET', `/api/connections/${id}`, null, token),
    await call('GET', `/api/connections/${id}`, null, devToken),
    await call('GET', `/api/connections/${sql._id}`, null, token),
    await call('PUT', `/api/connections/${id}`, { name: 'Renamed', connectionString: MASKED_URI }, token),
  ];
  for (const res of responses) {
    assert.ok(!res.text.includes(MONGO_SECRET), `Mongo password leaked: ${res.text.slice(0, 120)}`);
    assert.ok(!res.text.includes('Sql-Secret-Value'), 'SQL password leaked');
  }
  const listed = responses[1].data.connections.find((c) => c._id === id);
  assert.equal(listed.connectionString, MASKED_URI);
  assert.equal(listed.password, undefined);
});

test('the server still connects with the real password', async () => {
  const owner = await makeUser('real@test.local', 'admin');
  const doc = await makeMongoConnection(owner);
  const { conn } = await getConnection(doc);
  const ping = await conn.db(DB_NAME).command({ ping: 1 });
  assert.equal(ping.ok, 1);
});

test('saving the masked string keeps the password, and a new password replaces it', async () => {
  const owner = await makeUser('save@test.local', 'admin');
  const token = await tokenFor(owner.email);
  const doc = await makeMongoConnection(owner);

  const unchanged = await call('PUT', `/api/connections/${doc._id}`, { name: 'Same', connectionString: MASKED_URI }, token);
  assert.equal(unchanged.status, 200, unchanged.text);
  assert.equal((await rawConnection(doc._id)).connectionString, MONGO_URI);

  const wrong = `mongodb://sec_tester:Wrong-Pass@127.0.0.1:27017/${DB_NAME}`;
  assert.equal((await call('PUT', `/api/connections/${doc._id}`, { connectionString: wrong }, token)).status, 400);
  assert.equal((await rawConnection(doc._id)).connectionString, MONGO_URI);

  const withOption = `mongodb://sec_tester:****@127.0.0.1:27017/${DB_NAME}?appName=dms`;
  assert.equal((await call('PUT', `/api/connections/${doc._id}`, { connectionString: withOption }, token)).status, 200);
  assert.equal((await rawConnection(doc._id)).connectionString, `${MONGO_URI}?appName=dms`);
});

test('a masked string cannot send the saved password to another host', async () => {
  const owner = await makeUser('exfil@test.local', 'admin');
  const token = await tokenFor(owner.email);
  const doc = await makeMongoConnection(owner);
  const moved = `mongodb://sec_tester:****@127.0.0.2:27017/${DB_NAME}`;

  const update = await call('PUT', `/api/connections/${doc._id}`, { connectionString: moved }, token);
  assert.equal(update.status, 400);
  assert.ok(update.data.message.includes('password again'));
  const testRoute = await call('POST', '/api/connections/test', { type: 'mongodb', connectionId: doc._id, connectionString: moved }, token);
  assert.equal(testRoute.status, 400);
  assert.equal((await rawConnection(doc._id)).connectionString, MONGO_URI);
});

test('Test Connection works with the masked string, only for the owner or an admin', async () => {
  const owner = await makeUser('tester-owner@test.local', 'developer', { permissions: { connections: true } });
  const other = await makeUser('tester-other@test.local', 'developer', { permissions: { connections: true } });
  const ownerToken = await tokenFor(owner.email);
  const otherToken = await tokenFor(other.email);
  const doc = await makeMongoConnection(owner, { allowedUsers: [other._id] });
  const body = { type: 'mongodb', connectionId: doc._id, connectionString: MASKED_URI };

  assert.equal((await call('POST', '/api/connections/test', body, ownerToken)).status, 200);
  const denied = await call('POST', '/api/connections/test', body, otherToken);
  assert.equal(denied.status, 403);
  assert.equal((await call('POST', '/api/connections/test', { ...body, connectionId: 'not-an-id' }, ownerToken)).status, 400);
  assert.equal((await call('POST', '/api/connections/test', { ...body, connectionId: undefined }, ownerToken)).status, 400);
});

/* ---------- Database names when sharing a connection ---------- */

test('an Oracle service name is listed without logging in to the server', async () => {
  const admin = await makeUser('oracle-admin@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const oracle = await Connection.create({ user: admin._id, name: 'Oracle', type: 'oracle', host: '127.0.0.1', port: 1, username: 'u', password: 'p', database: 'FREEPDB1' });
  const started = Date.now();
  const res = await call('GET', `/api/connections/${oracle._id}/databases`, null, token);
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.data.databases, ['FREEPDB1']);
  assert.ok(Date.now() - started < 1500, 'it should not wait on a connection');
});

test('a developer only sees the Oracle service they were given', async () => {
  const admin = await makeUser('oracle-owner@test.local', 'admin');
  const oracle = await Connection.create({ user: admin._id, name: 'Oracle', type: 'oracle', host: '127.0.0.1', port: 1, username: 'u', password: 'p', database: 'FREEPDB1' });
  const allowed = await makeUser('oracle-allowed@test.local', 'developer', { allowedConnections: [{ connectionId: oracle._id, databases: ['FREEPDB1'] }] });
  const blocked = await makeUser('oracle-blocked@test.local', 'developer', { allowedConnections: [{ connectionId: oracle._id, databases: ['OTHER'] }] });
  const stranger = await makeUser('oracle-stranger@test.local');
  await Connection.updateOne({ _id: oracle._id }, { $set: { allowedUsers: [allowed._id, blocked._id] } });
  const url = `/api/connections/${oracle._id}/databases`;
  assert.deepEqual((await call('GET', url, null, await tokenFor(allowed.email))).data.databases, ['FREEPDB1']);
  assert.deepEqual((await call('GET', url, null, await tokenFor(blocked.email))).data.databases, []);
  assert.equal((await call('GET', url, null, await tokenFor(stranger.email))).status, 403);
});

test('a database error shows its real reason, without the password', async () => {
  const admin = await makeUser('reason@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const bad = await makeMongoConnection(admin, { connectionString: `mongodb://sec_tester:Wrong-Secret-Value@127.0.0.1:27017/${DB_NAME}` });
  const res = await call('GET', `/api/connections/${bad._id}/databases`, null, token);
  assert.equal(res.status, 500);
  assert.match(res.data.message, /^Database error: .+/);
  assert.ok(!res.text.includes('Wrong-Secret-Value'));
});

test('the share list includes connections without an owner, and is not open to everyone', async () => {
  const admin = await makeUser('list-admin@test.local', 'admin');
  const manager = await makeUser('list-manager@test.local', 'developer', { permissions: { userManagement: true } });
  const developer = await makeUser('list-dev@test.local');
  const orphan = await Connection.create({ user: new mongoose.Types.ObjectId(), name: 'Owner Deleted', type: 'mysql', host: 'h', username: 'u', password: 'Orphan-Secret' });

  for (const email of [admin.email, manager.email]) {
    const res = await call('GET', '/api/connections/all', null, await tokenFor(email));
    assert.equal(res.status, 200);
    assert.ok(res.data.connections.some((c) => c._id === String(orphan._id)), email);
    assert.ok(!res.text.includes('Orphan-Secret'));
  }
  assert.equal((await call('GET', '/api/connections/all', null, await tokenFor(developer.email))).status, 403);
});

/* ---------- Cloud connections ---------- */

test('a cloud connection saves its provider and service, and shows them in the list', async () => {
  const admin = await makeUser('cloud-admin@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const res = await call('POST', '/api/connections', { name: 'Atlas One', type: 'mongodb', connectionString: MONGO_URI, cloudProvider: 'atlas', cloudService: 'MongoDB Atlas' }, token);
  assert.equal(res.status, 201, res.text);
  openConnectionIds.add(res.data.connection._id);
  assert.equal(res.data.connection.cloudProvider, 'atlas');
  assert.equal(res.data.connection.cloudService, 'MongoDB Atlas');
  assert.equal(res.data.connection.ssl, true);
  const list = await call('GET', '/api/connections', null, token);
  const listed = list.data.connections.find((c) => c.name === 'Atlas One');
  assert.equal(listed.cloudProvider, 'atlas');
  assert.ok(!list.text.includes(MONGO_SECRET));
});

test('a connection from the Database tab has no cloud provider', async () => {
  const admin = await makeUser('plain-conn@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const res = await call('POST', '/api/connections', { name: 'Plain One', type: 'mongodb', connectionString: MONGO_URI }, token);
  assert.equal(res.status, 201, res.text);
  openConnectionIds.add(res.data.connection._id);
  assert.equal(res.data.connection.cloudProvider, null);
  assert.equal(res.data.connection.cloudService, null);
});

test('an unknown cloud provider is refused before anything is saved', async () => {
  const admin = await makeUser('bad-cloud@test.local', 'admin');
  const token = await tokenFor(admin.email);
  for (const cloudProvider of ['not-a-cloud', { $ne: null }]) {
    const res = await call('POST', '/api/connections', { name: 'Bad Cloud', type: 'mongodb', connectionString: MONGO_URI, cloudProvider }, token);
    assert.equal(res.status, 400);
  }
  assert.equal(await Connection.countDocuments({ name: 'Bad Cloud' }), 0);
});

test('a cloud connection with no endpoint is refused instead of reaching a local database', async () => {
  const admin = await makeUser('no-endpoint@test.local', 'admin');
  const token = await tokenFor(admin.email);
  for (const host of ['', '   ', undefined]) {
    const body = { name: 'No Endpoint', type: 'mysql', host, port: 3306, username: 'root', password: 'x', cloudProvider: 'aws', cloudService: 'Aurora MySQL' };
    const tested = await call('POST', '/api/connections/test', body, token);
    assert.equal(tested.status, 400);
    assert.match(tested.text, /cloud endpoint/);
    const saved = await call('POST', '/api/connections', body, token);
    assert.equal(saved.status, 400);
    assert.match(saved.text, /cloud endpoint/);
  }
  assert.equal(await Connection.countDocuments({ name: 'No Endpoint' }), 0);
});

test('Test Connection and editing still work on a cloud connection', async () => {
  const admin = await makeUser('edit-cloud@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const doc = await makeMongoConnection(admin, { cloudProvider: 'atlas', cloudService: 'MongoDB Atlas' });
  const body = { type: 'mongodb', connectionId: doc._id, connectionString: MASKED_URI };
  assert.equal((await call('POST', '/api/connections/test', body, token)).status, 200);
  const updated = await call('PUT', `/api/connections/${doc._id}`, { name: 'Renamed Cloud', connectionString: MASKED_URI }, token);
  assert.equal(updated.status, 200, updated.text);
  assert.equal(updated.data.connection.cloudProvider, 'atlas');
  assert.equal((await rawConnection(doc._id)).connectionString, MONGO_URI);
});

/* ---------- Saved passwords ---------- */

test('passwords and connection strings are encrypted in the database and work as before', async () => {
  const admin = await makeUser('encrypted@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const created = await call('POST', '/api/connections', { name: 'Encrypted', type: 'mongodb', connectionString: MONGO_URI }, token);
  assert.equal(created.status, 201, created.text);
  const id = created.data.connection._id;
  openConnectionIds.add(id);

  const stored = await storedConnection(id);
  assert.ok(isEncrypted(stored.connectionString));
  assert.ok(!JSON.stringify(stored).includes(MONGO_SECRET));
  assert.equal(created.data.connection.connectionString, MASKED_URI);

  const doc = await Connection.findById(id);
  assert.equal(doc.connectionString, MONGO_URI);
  assert.equal(doc.toObject().connectionString, MONGO_URI);
  assert.equal(doc.toJSON().connectionString, MASKED_URI);
  const { conn } = await getConnection(doc);
  assert.ok((await conn.db(DB_NAME).command({ ping: 1 })).ok);
});

test('saving again does not encrypt a password twice', async () => {
  const owner = await makeUser('twice@test.local', 'admin');
  const doc = await Connection.create({ user: owner._id, name: 'Twice', type: 'mysql', host: 'db.example.com', username: 'u', password: 'plain-pass' });
  const stored = await storedConnection(doc._id);
  assert.ok(isEncrypted(stored.password));
  assert.equal(doc.password, 'plain-pass');
  assert.equal(doc.toJSON().password, undefined);

  const loaded = await Connection.findById(doc._id);
  loaded.name = 'Twice Renamed';
  await loaded.save();
  const after = await Connection.findById(doc._id);
  assert.equal(after.password, 'plain-pass');
  assert.equal((await storedConnection(doc._id)).password, stored.password);

  after.password = 'new-pass';
  await after.save();
  assert.ok(isEncrypted((await storedConnection(doc._id)).password));
  assert.equal((await Connection.findById(doc._id)).password, 'new-pass');
});

test('a connection saved before encryption still works and stays hidden', async () => {
  const admin = await makeUser('before-encryption@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const { insertedId } = await Connection.collection.insertOne({ user: admin._id, name: 'Legacy', type: 'mongodb', connectionString: MONGO_URI, password: 'old-plain', createdAt: new Date() });
  openConnectionIds.add(String(insertedId));
  const doc = await Connection.findById(insertedId);
  assert.equal(doc.password, 'old-plain');
  const { conn } = await getConnection(doc);
  assert.ok((await conn.db(DB_NAME).command({ ping: 1 })).ok);
  const list = await call('GET', '/api/connections', null, token);
  assert.ok(!list.text.includes(MONGO_SECRET) && !list.text.includes('old-plain'));
  assert.equal(list.data.connections.find((c) => c.name === 'Legacy').connectionString, MASKED_URI);
});

test('with the wrong key the list still opens, hides the value, and connecting fails clearly', async (t) => {
  const admin = await makeUser('wrong-key@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const doc = await makeMongoConnection(admin, { name: 'Wrong Key' });
  const key = process.env.CONNECTION_ENCRYPTION_KEY;
  t.after(() => { process.env.CONNECTION_ENCRYPTION_KEY = key; });
  process.env.CONNECTION_ENCRYPTION_KEY = 'a-different-key';
  const list = await call('GET', '/api/connections', null, token);
  assert.equal(list.status, 200, list.text);
  assert.equal(list.data.connections.find((c) => c.name === 'Wrong Key').connectionString, '****');
  await closeConnection(String(doc._id));
  await assert.rejects(getConnection(await Connection.findById(doc._id)), /CONNECTION_ENCRYPTION_KEY/);
});

test('a saved password is not sent to a host typed into the form', async () => {
  const admin = await makeUser('host-swap@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const doc = await Connection.create({ user: admin._id, name: 'Host Swap', type: 'mysql', host: 'db.example.com', port: 3306, username: 'u', password: 'keep-me' });
  const body = { type: 'mysql', host: 'attacker.example.net', port: 3306, username: 'u', password: '' };
  const tested = await call('POST', '/api/connections/test', { ...body, connectionId: doc._id }, token);
  assert.equal(tested.status, 400);
  assert.match(tested.text, /password again/);
  const updated = await call('PUT', `/api/connections/${doc._id}`, body, token);
  assert.equal(updated.status, 400);
  assert.match(updated.text, /password again/);
  assert.equal((await Connection.findById(doc._id)).host, 'db.example.com');
});

/* ---------- Cloud TLS rules on the routes ---------- */

test('a cloud connection string that turns off TLS is refused', async () => {
  const admin = await makeUser('no-tls@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const body = { name: 'No TLS', type: 'mongodb', connectionString: 'mongodb://u:p@cluster.example.net/db?tls=false', cloudProvider: 'atlas' };
  for (const url of ['/api/connections/test', '/api/connections']) {
    const res = await call('POST', url, body, token);
    assert.equal(res.status, 400);
    assert.match(res.text, /turns off TLS/);
  }
  assert.equal(await Connection.countDocuments({ name: 'No TLS' }), 0);
});

test('a bad CA certificate is refused before any network call', async () => {
  const admin = await makeUser('bad-ca@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const body = { name: 'Bad CA', type: 'mysql', host: 'db.example.com', port: 3306, username: 'u', password: 'x', cloudProvider: 'ibm', caCertificate: 'not a certificate' };
  for (const url of ['/api/connections/test', '/api/connections']) {
    const res = await call('POST', url, body, token);
    assert.equal(res.status, 400);
    assert.match(res.text, /valid CA certificate/);
  }
  const doc = await Connection.create({ user: admin._id, name: 'Edit CA', type: 'mysql', host: 'db.example.com', username: 'u', password: 'x', cloudProvider: 'ibm' });
  const edited = await call('PUT', `/api/connections/${doc._id}`, { caCertificate: 'still not one' }, token);
  assert.equal(edited.status, 400);
  assert.match(edited.text, /valid CA certificate/);
  assert.equal((await Connection.findById(doc._id)).caCertificate, null);
});

test('the Database tab ignores a CA certificate', async () => {
  const admin = await makeUser('plain-ca@test.local', 'admin');
  const token = await tokenFor(admin.email);
  const res = await call('POST', '/api/connections', { name: 'Plain CA', type: 'mongodb', connectionString: MONGO_URI, caCertificate: 'anything', ssl: false }, token);
  assert.equal(res.status, 201, res.text);
  openConnectionIds.add(res.data.connection._id);
  assert.equal(res.data.connection.caCertificate, null);
  assert.equal(res.data.connection.ssl, false);
});

/* ---------- Session tokens ---------- */

test('changing a password ends other sessions and keeps this one', async () => {
  const user = await makeUser('change@test.local');
  const thisDevice = await tokenFor(user.email);
  const otherDevice = await tokenFor(user.email);
  assert.equal(await profileStatus(otherDevice), 200);

  const res = await call('PUT', '/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'New-Password-2' }, thisDevice);
  assert.equal(res.status, 200);
  assert.ok(res.data.token);

  assert.equal(await profileStatus(otherDevice), 401);
  assert.equal(await profileStatus(thisDevice), 401);
  assert.equal(await profileStatus(res.data.token), 200);
  assert.ok(await tokenFor(user.email, 'New-Password-2'));
});

test('a rejected password change ends nothing', async () => {
  const user = await makeUser('keep@test.local');
  const token = await tokenFor(user.email);
  const res = await call('PUT', '/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'New-Password-2' }, token);
  assert.equal(res.status, 400);
  assert.equal(await profileStatus(token), 200);
});

test('a password reset by email ends all sessions', async () => {
  const user = await makeUser('reset@test.local');
  const token = await tokenFor(user.email);
  const resetToken = 'a'.repeat(64);
  await User.updateOne({ _id: user._id }, {
    passwordResetToken: crypto.createHash('sha256').update(resetToken).digest('hex'),
    passwordResetExpires: new Date(Date.now() + 60000),
  });
  assert.equal((await call('POST', `/api/auth/reset-password/${resetToken}`, { password: 'New-Password-2' })).status, 200);
  assert.equal(await profileStatus(token), 401);
});

test('an admin setting a password ends that user\'s sessions; other edits do not', async () => {
  const admin = await makeUser('setter@test.local', 'admin');
  const user = await makeUser('target@test.local');
  const adminToken = await tokenFor(admin.email);
  const token = await tokenFor(user.email);

  assert.equal((await call('PUT', `/api/users/${user._id}`, { name: 'Renamed Person' }, adminToken)).status, 200);
  assert.equal(await profileStatus(token), 200);
  assert.equal((await call('PUT', '/api/auth/profile', { bio: 'hello' }, token)).status, 200);
  assert.equal(await profileStatus(token), 200);

  assert.equal((await call('PUT', `/api/users/${user._id}`, { password: 'Admin-Set-Pass-3' }, adminToken)).status, 200);
  assert.equal(await profileStatus(token), 401);
  assert.equal(await profileStatus(adminToken), 200);
});

test('tokens from before this change keep working until the first password change', async () => {
  const user = await makeUser('legacy@test.local');
  const legacy = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  assert.equal(await profileStatus(legacy), 200);
  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  assert.equal(await profileStatus(legacy), 401);
});

test('a deleted user is rejected, and a role change applies at once', async () => {
  const admin = await makeUser('boss@test.local', 'admin');
  const demoted = await makeUser('demoted@test.local', 'admin');
  const removed = await makeUser('removed@test.local');
  const adminToken = await tokenFor(admin.email);
  const demotedToken = await tokenFor(demoted.email);
  const removedToken = await tokenFor(removed.email);

  assert.equal((await call('GET', '/api/users', null, demotedToken)).status, 200);
  assert.equal((await call('PUT', `/api/users/${demoted._id}/role`, { role: 'developer' }, adminToken)).status, 200);
  assert.equal((await call('POST', '/api/users', { name: 'X Y', email: 'x@test.local', password: PASSWORD }, demotedToken)).status, 403);

  assert.equal((await call('DELETE', `/api/users/${removed._id}`, null, adminToken)).status, 200);
  assert.equal(await profileStatus(removedToken), 401);
});

test('a password change also cancels a half-finished MFA sign-in', async () => {
  const user = await makeUser('mfa-pending@test.local');
  const token = await tokenFor(user.email);
  const setup = await call('POST', '/api/auth/mfa/setup', { password: PASSWORD }, token);
  await call('POST', '/api/auth/mfa/enable', { code: await generate({ secret: setup.data.secret }) }, token);
  await User.updateOne({ _id: user._id }, { $set: { 'mfa.lastUsedStep': null } });

  const { data: { mfaToken } } = await call('POST', '/api/auth/login', { email: user.email, password: PASSWORD });
  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  const res = await call('POST', '/api/auth/mfa/verify', { mfaToken, code: await generate({ secret: setup.data.secret }) });
  assert.equal(res.status, 401);
  assert.equal(res.data.sessionExpired, true);
});

test('a database outage answers 503, so nobody gets signed out by it', async (t) => {
  const user = await makeUser('outage@test.local');
  const token = await tokenFor(user.email);
  t.mock.method(User, 'findById', () => ({ select: () => Promise.reject(new Error('database down')) }));
  assert.equal(await profileStatus(token), 503);
});

test('the token version never reaches the browser', async () => {
  const admin = await makeUser('hidden@test.local', 'admin');
  const token = await tokenFor(admin.email);
  for (const url of ['/api/auth/profile', '/api/users', `/api/users/${admin._id}`]) {
    assert.ok(!(await call('GET', url, null, token)).text.includes('tokenVersion'), url);
  }
});
