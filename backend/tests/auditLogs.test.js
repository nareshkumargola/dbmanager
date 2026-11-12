// Audit log filters used by the Download box, run against a throwaway database.
// Run from backend/: node --test tests/auditLogs.test.js
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.MFA_ENCRYPTION_KEY = 'test-only-mfa-key';
process.env.CONNECTION_ENCRYPTION_KEY = 'test-only-connection-key';
process.env.NODE_ENV = 'test';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcryptjs');
const express = require('express');
const mongoose = require('mongoose');

const DB_NAME = 'dbmanager_audit_test';
const PASSWORD = 'Correct-Horse-1';

const User = require('../models/userModel');
const Connection = require('../models/connectionModel');
const AuditLog = require('../models/auditLogModel');

let server;
let base;
let adminToken;
let developerToken;
let admin;
let developer;
let reports;
let billing;

const get = async (query, token = adminToken) => {
  const res = await fetch(`${base}/api/audit-logs?${new URLSearchParams(query)}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, data: await res.json() };
};
const at = (hhmm) => new Date(`2026-11-10T${hhmm}:00.000Z`);

before(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/${DB_NAME}`, { serverSelectionTimeoutMS: 3000 });
  assert.equal(mongoose.connection.name, DB_NAME);
  await mongoose.connection.db.dropDatabase();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/audit-logs', require('../routes/auditLogRoutes'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const makeUser = (email, role) => User.create({ name: email.split('@')[0], email, role, isFirstLogin: false, password: bcrypt.hashSync(PASSWORD, 4), mfa: { optedOut: true } });
  admin = await makeUser('audit-admin@test.local', 'admin');
  developer = await makeUser('audit-dev@test.local', 'developer');
  const login = async (email) => (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })).json()).token;
  adminToken = await login(admin.email);
  developerToken = await login(developer.email);

  reports = await Connection.create({ user: admin._id, name: 'Reports', type: 'mysql', host: '127.0.0.1', port: 1, username: 'u', password: 'p', database: 'x' });
  billing = await Connection.create({ user: admin._id, name: 'Billing', type: 'postgresql', host: '127.0.0.1', port: 2, username: 'u', password: 'p', database: 'x' });

  // Signing in above wrote LOGIN records at the real time. Remove them so the counts below are exact.
  await AuditLog.deleteMany({});
  await AuditLog.collection.insertMany([
    { user: developer._id, connection: reports._id, action: 'RUN_QUERY', details: 'SELECT 1', createdAt: at('08:00') },
    { user: developer._id, connection: reports._id, action: 'RUN_QUERY', details: 'SELECT 2', createdAt: at('09:30') },
    { user: developer._id, connection: reports._id, action: 'DELETE_DATA', details: 'DELETE FROM t', createdAt: at('10:15') },
    { user: developer._id, connection: billing._id, action: 'SLOW_QUERY', details: 'SELECT slow', createdAt: at('11:00') },
    { user: admin._id, connection: billing._id, action: 'RUN_QUERY', details: 'UPDATE t SET a=1', createdAt: at('12:00') },
    { user: admin._id, connection: null, action: 'LOGIN', details: 'Signed in', createdAt: at('07:00') },
    { user: admin._id, connection: null, action: 'CREATE_USER', details: 'Added someone', createdAt: at('18:00') },
  ]);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('only admins can read or count the audit logs', async () => {
  assert.equal((await get({}, developerToken)).status, 403);
  assert.equal((await get({ countOnly: '1' }, developerToken)).status, 403);
});

test('an exact time window keeps only records inside it, ends included', async () => {
  const { status, data } = await get({ from: at('09:30').toISOString(), to: at('11:00').toISOString() });
  assert.equal(status, 200);
  assert.deepEqual(data.logs.map((log) => log.details), ['SELECT slow', 'DELETE FROM t', 'SELECT 2']);
});

test('the window can be open on one side', async () => {
  assert.equal((await get({ from: at('12:00').toISOString() })).data.logs.length, 2);
  assert.equal((await get({ to: at('07:59').toISOString() })).data.logs.length, 1);
});

test('user, connection and time combine', async () => {
  const { data } = await get({ userId: String(developer._id), connectionId: String(reports._id), from: at('09:00').toISOString(), to: at('23:00').toISOString() });
  assert.deepEqual(data.logs.map((log) => log.details), ['DELETE FROM t', 'SELECT 2']);
  assert.equal(data.logs[0].user.email, developer.email);
  assert.equal(data.logs[0].connection.name, 'Reports');
});

test('global system logs are the ones with no connection', async () => {
  const { data } = await get({ connectionId: 'global' });
  assert.deepEqual(data.logs.map((log) => log.action).sort(), ['CREATE_USER', 'LOGIN']);
});

test('a group of actions filters like one category', async () => {
  const { data } = await get({ actions: 'RUN_QUERY,SLOW_QUERY' });
  assert.equal(data.logs.length, 4);
  assert.ok(data.logs.every((log) => ['RUN_QUERY', 'SLOW_QUERY'].includes(log.action)));
});

test('one exact action wins over a group', async () => {
  const { data } = await get({ action: 'SLOW_QUERY', actions: 'RUN_QUERY,LOGIN' });
  assert.deepEqual(data.logs.map((log) => log.action), ['SLOW_QUERY']);
});

test('count only gives the same number as the full list, without the rows', async () => {
  const query = { userId: String(developer._id), actions: 'RUN_QUERY,SLOW_QUERY,DELETE_DATA' };
  const counted = await get({ ...query, countOnly: '1' });
  assert.equal(counted.status, 200);
  assert.equal(counted.data.count, 4);
  assert.equal(counted.data.logs, undefined);
  assert.equal((await get(query)).data.logs.length, 4);
});

test('count only still applies the role and query type checks', async () => {
  assert.equal((await get({ role: 'admin', countOnly: '1' })).data.count, 3);
  assert.equal((await get({ queryType: 'update', countOnly: '1' })).data.count, 1);
});

test('the row limit can be raised for a download, but not past 10000', async () => {
  const small = await get({ limit: '2' });
  assert.equal(small.data.logs.length, 2);
  assert.equal(small.data.limit, 2);
  assert.equal((await get({ limit: '999999' })).data.limit, 10000);
  assert.equal((await get({ limit: 'lots' })).data.limit, 2000);
  assert.equal((await get({})).data.limit, 2000);
});

test('bad or backwards times are refused', async () => {
  const bad = await get({ from: 'yesterday-ish' });
  assert.equal(bad.status, 400);
  assert.match(bad.data.message, /valid dates and times/);
  const backwards = await get({ from: at('12:00').toISOString(), to: at('08:00').toISOString() });
  assert.equal(backwards.status, 400);
  assert.match(backwards.data.message, /earlier than To/);
});

test('the old day range still works', async () => {
  const { status, data } = await get({ startDate: '2026-11-10', endDate: '2026-11-10' });
  assert.equal(status, 200);
  assert.ok(data.logs.length >= 1);
});
