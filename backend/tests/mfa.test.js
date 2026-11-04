// Runs the real auth routes against a throwaway database, never the app's own.
// Run from backend/: node --test tests/mfa.test.js
process.env.JWT_SECRET = process.env.JWT_SECRET_TEST || 'test-only-jwt-secret';
process.env.MFA_ENCRYPTION_KEY = 'test-only-mfa-key';
process.env.NODE_ENV = 'test';

const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const express = require('express');
const mongoose = require('mongoose');
const { generate } = require('otplib');

const TEST_DB = 'mongodb://127.0.0.1:27017/dbmanager_mfa_test';
const PASSWORD = 'Correct-Horse-1';
const User = require('../models/userModel');
const AuditLog = require('../models/auditLogModel');
const { decryptSecret } = require('../utils/mfa');

let server;
let base;
// Each test acts as its own client, so one test's failures don't use up the next test's rate limit
let clientNumber = 0;

const call = async (method, url, body, token) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.' + clientNumber, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

// Most tests start from someone who already turned MFA off, so the password alone signs in
const makeUser = (email, role = 'developer', optedOut = true) => User.create({
  name: email.split('@')[0],
  email,
  role,
  isFirstLogin: false,
  password: bcrypt.hashSync(PASSWORD, 4),
  mfa: { optedOut },
});

const login = (email, password = PASSWORD) => call('POST', '/api/auth/login', { email, password });

const allowCodesAgain = (email) => User.updateOne({ email }, { $set: { 'mfa.lastUsedStep': null } });

// Signs in and turns MFA on; returns the session token, secret and backup codes
const enableMfa = async (email) => {
  await makeUser(email);
  const { data: { token } } = await login(email);
  const setup = await call('POST', '/api/auth/mfa/setup', { password: PASSWORD }, token);
  assert.equal(setup.status, 200);
  const confirm = await call('POST', '/api/auth/mfa/enable', { code: await generate({ secret: setup.data.secret }) }, token);
  assert.equal(confirm.status, 200);
  await allowCodesAgain(email);
  return { token, secret: setup.data.secret, backupCodes: confirm.data.backupCodes };
};

before(async () => {
  await mongoose.connect(TEST_DB, { serverSelectionTimeoutMS: 3000 });
  assert.match(mongoose.connection.name, /_test$/);
  await mongoose.connection.dropDatabase();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/users', require('../routes/userRoutes'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});

beforeEach(() => {
  clientNumber += 1;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('public signup is gone', async () => {
  const res = await call('POST', '/api/auth/signup', { name: 'Intruder', email: 'intruder@test.local', password: PASSWORD });
  assert.equal(res.status, 404);
  assert.equal(await User.countDocuments({ email: 'intruder@test.local' }), 0);
});

test('an admin can still create a user, who can then sign in', async () => {
  const admin = await makeUser('creator@test.local', 'admin');
  const adminToken = (await login(admin.email)).data.token;
  const body = { name: 'New Person', email: 'newperson@test.local', password: PASSWORD };
  assert.equal((await call('POST', '/api/users', body)).status, 401);
  assert.equal((await call('POST', '/api/users', body, adminToken)).status, 201);
  assert.equal((await login('newperson@test.local')).data.requiresMfaSetup, true);
});

test('a developer cannot create users', async () => {
  await makeUser('nocreate@test.local');
  const { data: { token } } = await login('nocreate@test.local');
  const res = await call('POST', '/api/users', { name: 'X Y', email: 'blocked@test.local', password: PASSWORD }, token);
  assert.equal(res.status, 403);
  assert.equal(await User.countDocuments({ email: 'blocked@test.local' }), 0);
});

test('the server script creates a working admin and refuses a duplicate', async () => {
  const script = path.join(__dirname, '../scripts/create-admin.js');
  const env = { ...process.env, MONGODB_URI: TEST_DB };
  const output = execFileSync(process.execPath, [script, 'FirstAdmin@test.local', 'First Admin'], { env, encoding: 'utf8' });
  const password = output.match(/shown only once\): (\S+)/)[1];
  const res = await login('firstadmin@test.local', password);
  assert.equal(res.data.requiresMfaSetup, true);
  assert.throws(() => execFileSync(process.execPath, [script, 'firstadmin@test.local', 'Other Name'], { env, stdio: 'pipe' }));
  const stored = await User.findOne({ email: 'firstadmin@test.local' });
  assert.equal(stored.name, 'First Admin');
  assert.ok(await bcrypt.compare(password, stored.password));
});

test('MFA is on by default: a new person sets it up before getting a session', async () => {
  await makeUser('first@test.local', 'developer', false);
  const res = await login('first@test.local');
  assert.equal(res.status, 200);
  assert.equal(res.data.requiresMfaSetup, true);
  assert.equal(res.data.token, undefined);
  assert.equal(res.data.user, undefined);
  assert.equal((await call('GET', '/api/auth/profile', null, res.data.mfaToken)).status, 401);
  assert.equal((await call('POST', '/api/auth/mfa/login-setup', { mfaToken: 'garbage' })).status, 401);

  const setup = await call('POST', '/api/auth/mfa/login-setup', { mfaToken: res.data.mfaToken });
  assert.equal(setup.status, 200);
  assert.ok(setup.data.qrCode.startsWith('data:image/png'));

  const wrong = await call('POST', '/api/auth/mfa/login-enable', { mfaToken: res.data.mfaToken, code: '000000' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.data.token, undefined);
  assert.equal((await User.findOne({ email: 'first@test.local' })).mfa.enabled, false);

  const done = await call('POST', '/api/auth/mfa/login-enable', { mfaToken: res.data.mfaToken, code: await generate({ secret: setup.data.secret }) });
  assert.equal(done.status, 200);
  assert.ok(done.data.token);
  assert.equal(done.data.backupCodes.length, 10);
  assert.equal((await call('GET', '/api/auth/profile', null, done.data.token)).status, 200);

  const again = await call('POST', '/api/auth/mfa/login-enable', { mfaToken: res.data.mfaToken, code: await generate({ secret: setup.data.secret }) });
  assert.equal(again.status, 401);
  const next = await login('first@test.local');
  assert.equal(next.data.requiresMfa, true);
  assert.equal(next.data.requiresMfaSetup, undefined);
});

test('users from before this change and users made by an admin also set it up', async () => {
  await User.collection.insertOne({ name: 'Old Account', email: 'old@test.local', role: 'developer', password: bcrypt.hashSync(PASSWORD, 4), isFirstLogin: false });
  assert.equal((await login('old@test.local')).data.requiresMfaSetup, true);

  const admin = await makeUser('maker@test.local', 'admin');
  const adminToken = (await login(admin.email)).data.token;
  await call('POST', '/api/users', { name: 'Made Person', email: 'made@test.local', password: PASSWORD }, adminToken);
  assert.equal((await login('made@test.local')).data.requiresMfaSetup, true);
});

test('someone who turned MFA off is not asked again, and setup cannot be forced on them', async () => {
  const { token, secret } = await enableMfa('optout@test.local');
  await call('POST', '/api/auth/mfa/disable', { password: PASSWORD, code: await generate({ secret }) }, token);
  const res = await login('optout@test.local');
  assert.ok(res.data.token);
  assert.equal(res.data.requiresMfaSetup, undefined);
  assert.equal((await User.findOne({ email: 'optout@test.local' })).mfa.optedOut, true);
});

test('a setup token cannot change an account that already has MFA', async () => {
  await makeUser('swap@test.local', 'developer', false);
  const { data: { mfaToken } } = await login('swap@test.local');
  const first = await call('POST', '/api/auth/mfa/login-setup', { mfaToken });
  await call('POST', '/api/auth/mfa/login-enable', { mfaToken, code: await generate({ secret: first.data.secret }) });
  assert.equal((await call('POST', '/api/auth/mfa/login-setup', { mfaToken })).status, 401);
});

test('the old passwordless OTP routes are gone', async () => {
  await makeUser('victim@test.local', 'admin');
  const resend = await call('POST', '/api/auth/resend-otp', { email: 'victim@test.local' });
  const verifyOtp = await call('POST', '/api/auth/verify-otp', { email: 'victim@test.local', otp: '123456' });
  assert.equal(resend.status, 404);
  assert.equal(verifyOtp.status, 404);
});

test('after turning MFA off, the password alone signs in', async () => {
  await makeUser('plain@test.local');
  const res = await login('plain@test.local');
  assert.equal(res.status, 200);
  assert.ok(res.data.token);
  assert.equal(res.data.requiresMfa, undefined);
});

test('a wrong code does not turn MFA on, so nobody locks themselves out', async () => {
  await makeUser('wrongsetup@test.local');
  const { data: { token } } = await login('wrongsetup@test.local');
  const denied = await call('POST', '/api/auth/mfa/setup', { password: 'wrong' }, token);
  assert.equal(denied.status, 400);
  await call('POST', '/api/auth/mfa/setup', { password: PASSWORD }, token);
  const confirm = await call('POST', '/api/auth/mfa/enable', { code: '000000' }, token);
  assert.equal(confirm.status, 400);
  const status = await call('GET', '/api/auth/mfa', null, token);
  assert.equal(status.data.enabled, false);
  const again = await login('wrongsetup@test.local');
  assert.ok(again.data.token);
});

test('with MFA, the password gives no session and the temporary token opens no API', async () => {
  const { secret } = await enableMfa('step@test.local');
  const res = await login('step@test.local');
  assert.equal(res.data.requiresMfa, true);
  assert.equal(res.data.token, undefined);
  assert.equal(res.data.user, undefined);
  assert.equal((await call('GET', '/api/auth/profile', null, res.data.mfaToken)).status, 401);
  assert.equal((await call('GET', '/api/users', null, res.data.mfaToken)).status, 401);

  const verified = await call('POST', '/api/auth/mfa/verify', { mfaToken: res.data.mfaToken, code: await generate({ secret }) });
  assert.equal(verified.status, 200);
  assert.ok(verified.data.token);
  assert.equal((await call('GET', '/api/auth/profile', null, verified.data.token)).status, 200);
});

test('the same code cannot be used twice', async () => {
  const { secret } = await enableMfa('replay@test.local');
  const code = await generate({ secret });
  const first = await login('replay@test.local');
  assert.equal((await call('POST', '/api/auth/mfa/verify', { mfaToken: first.data.mfaToken, code })).status, 200);
  const second = await login('replay@test.local');
  assert.equal((await call('POST', '/api/auth/mfa/verify', { mfaToken: second.data.mfaToken, code })).status, 400);
});

test('the same code sent twice at once is accepted only once', async () => {
  const { secret } = await enableMfa('race@test.local');
  const code = await generate({ secret });
  const { data: { mfaToken } } = await login('race@test.local');
  const results = await Promise.all([1, 2, 3].map(() => call('POST', '/api/auth/mfa/verify', { mfaToken, code })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
});

test('a backup code works once and is then used up', async () => {
  const { backupCodes } = await enableMfa('backup@test.local');
  assert.equal(backupCodes.length, 10);
  const first = await login('backup@test.local');
  const used = await call('POST', '/api/auth/mfa/verify', { mfaToken: first.data.mfaToken, code: backupCodes[0].toLowerCase() });
  assert.equal(used.status, 200);
  const status = await call('GET', '/api/auth/mfa', null, used.data.token);
  assert.equal(status.data.backupCodesRemaining, 9);
  const second = await login('backup@test.local');
  assert.equal((await call('POST', '/api/auth/mfa/verify', { mfaToken: second.data.mfaToken, code: backupCodes[0] })).status, 400);
  assert.equal(await AuditLog.countDocuments({ action: 'MFA_BACKUP_USED', details: /backup@test/ }), 1);
});

test('five wrong codes lock the account, even for the right code', async () => {
  const { secret } = await enableMfa('lock@test.local');
  const { data: { mfaToken } } = await login('lock@test.local');
  const statuses = [];
  for (let i = 0; i < 5; i += 1) {
    statuses.push((await call('POST', '/api/auth/mfa/verify', { mfaToken, code: '000000' })).status);
  }
  assert.deepEqual(statuses, [400, 400, 400, 400, 429]);
  const right = await call('POST', '/api/auth/mfa/verify', { mfaToken, code: await generate({ secret }) });
  assert.equal(right.status, 429);
  assert.ok(right.data.message.includes('15 minutes'));
});

test('an expired or forged temporary token is rejected', async () => {
  const jwt = require('jsonwebtoken');
  const user = await makeUser('forged@test.local');
  const session = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { audience: 'mfa-login' });
  assert.equal((await call('POST', '/api/auth/mfa/verify', { mfaToken: session, code: '000000' })).status, 401);
  assert.equal((await call('POST', '/api/auth/mfa/verify', { mfaToken: 'garbage', code: '000000' })).status, 401);
});

test('turning MFA off needs both the password and a code', async () => {
  const { token, secret } = await enableMfa('off@test.local');
  const url = '/api/auth/mfa/disable';
  assert.equal((await call('POST', url, { password: 'wrong', code: await generate({ secret }) }, token)).status, 400);
  assert.equal((await call('POST', url, { password: PASSWORD, code: '000000' }, token)).status, 400);
  assert.equal((await call('POST', url, { password: PASSWORD, code: await generate({ secret }) }, token)).status, 200);
  const res = await login('off@test.local');
  assert.ok(res.data.token);
  assert.equal(await AuditLog.countDocuments({ action: 'MFA_DISABLE', details: /off@test/ }), 1);
});

test('new backup codes need the password and a code, and replace the old ones', async () => {
  const { token, secret, backupCodes } = await enableMfa('regen@test.local');
  const url = '/api/auth/mfa/backup-codes';
  assert.equal((await call('POST', url, { password: 'wrong', code: await generate({ secret }) }, token)).status, 400);
  assert.equal((await call('POST', url, { password: PASSWORD, code: '000000' }, token)).status, 400);
  const res = await call('POST', url, { password: PASSWORD, code: await generate({ secret }) }, token);
  assert.equal(res.status, 200);
  assert.equal(res.data.backupCodes.length, 10);

  const old = await login('regen@test.local');
  assert.equal((await call('POST', '/api/auth/mfa/verify', { mfaToken: old.data.mfaToken, code: backupCodes[0] })).status, 400);
  const fresh = await login('regen@test.local');
  assert.equal((await call('POST', '/api/auth/mfa/verify', { mfaToken: fresh.data.mfaToken, code: res.data.backupCodes[0] })).status, 200);
  assert.equal(await AuditLog.countDocuments({ action: 'MFA_BACKUP_CODES', details: /regen@test/ }), 1);
});

test('secrets and backup codes never reach the browser and are not stored readable', async () => {
  const { token, secret, backupCodes } = await enableMfa('leak@test.local');
  const admin = await makeUser('leakadmin@test.local', 'admin');
  const adminToken = (await login(admin.email)).data.token;
  const responses = JSON.stringify([
    (await call('GET', '/api/auth/profile', null, token)).data,
    (await call('GET', '/api/users', null, adminToken)).data,
  ]);
  assert.ok(responses.includes('"enabled":true'));
  for (const field of ['backupCodes', 'lastUsedStep', 'lockedUntil', 'failedAttempts', 'pendingSecret']) {
    assert.ok(!responses.includes(field), field + ' leaked');
  }
  assert.ok(!responses.includes('"secret"'));

  const stored = await User.findOne({ email: 'leak@test.local' }).select('+mfa.secret +mfa.backupCodes').lean();
  assert.notEqual(stored.mfa.secret, secret);
  assert.equal(decryptSecret(stored.mfa.secret), secret);
  assert.ok(!stored.mfa.backupCodes.includes(backupCodes[0]));
});

test('an admin can reset another user, not themselves, and a developer cannot', async () => {
  const { token } = await enableMfa('resetme@test.local');
  const target = await User.findOne({ email: 'resetme@test.local' });
  const admin = await makeUser('resetadmin@test.local', 'admin');
  const adminToken = (await login(admin.email)).data.token;
  assert.equal((await call('DELETE', '/api/users/' + target._id + '/mfa', null, token)).status, 403);
  assert.equal((await call('DELETE', '/api/users/' + admin._id + '/mfa', null, adminToken)).status, 400);
  assert.equal((await call('DELETE', '/api/users/' + target._id + '/mfa', null, adminToken)).status, 200);
  const afterReset = await login('resetme@test.local');
  assert.equal(afterReset.data.token, undefined);
  assert.equal(afterReset.data.requiresMfaSetup, true);
  assert.equal(await AuditLog.countDocuments({ action: 'MFA_RESET', details: /resetme@test/ }), 1);
});

test('the server recovery script turns MFA off', async () => {
  await enableMfa('script@test.local');
  execFileSync(process.execPath, [path.join(__dirname, '../scripts/reset-mfa.js'), 'script@test.local'], {
    env: { ...process.env, MONGODB_URI: TEST_DB },
    stdio: 'pipe',
  });
  assert.equal((await User.findOne({ email: 'script@test.local' })).mfa.enabled, false);
  assert.ok((await login('script@test.local')).data.token);
});

test('repeated wrong passwords are blocked', async () => {
  const statuses = [];
  for (let i = 0; i < 12; i += 1) statuses.push((await login('plain@test.local', 'wrong')).status);
  assert.equal(statuses.at(-1), 429);
  assert.ok(statuses.includes(401));
});
