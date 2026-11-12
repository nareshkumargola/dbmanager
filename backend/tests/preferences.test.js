// Settings saved with PUT /api/auth/preferences, run against a throwaway database.
// Run from backend/: node --test tests/preferences.test.js
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

const DB_NAME = 'dbmanager_preferences_test';
const PASSWORD = 'Correct-Horse-1';
const User = require('../models/userModel');

let server;
let base;
let token;
let userId;

const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

before(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/${DB_NAME}`, { serverSelectionTimeoutMS: 3000 });
  assert.equal(mongoose.connection.name, DB_NAME);
  await mongoose.connection.db.dropDatabase();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const user = await User.create({ name: 'Prefs', email: 'prefs@test.local', role: 'developer', isFirstLogin: false, password: bcrypt.hashSync(PASSWORD, 4), mfa: { optedOut: true } });
  userId = user._id;
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: PASSWORD }) });
  ({ token } = await res.json());
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('font size starts at default', async () => {
  const { status, data } = await call('GET', '/api/auth/profile');
  assert.equal(status, 200);
  assert.equal(data.user.preferences.fontSize, 'default');
});

test('each font size can be saved and is returned on the profile', async () => {
  for (const size of ['small', 'large', 'xlarge', 'default']) {
    const saved = await call('PUT', '/api/auth/preferences', { fontSize: size });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.user.preferences.fontSize, size);
    assert.equal((await call('GET', '/api/auth/profile')).data.user.preferences.fontSize, size);
  }
});

test('an unknown font size is refused and nothing changes', async () => {
  await call('PUT', '/api/auth/preferences', { fontSize: 'large' });
  for (const bad of ['huge', '', 20, { $gt: '' }]) {
    const res = await call('PUT', '/api/auth/preferences', { fontSize: bad });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
    assert.equal(res.data.message, 'Invalid font size.');
  }
  assert.equal((await User.findById(userId).lean()).preferences.fontSize, 'large');
});

test('saving font size leaves the other settings alone', async () => {
  await call('PUT', '/api/auth/preferences', { reduceMotion: true, defaultLanding: '/connections' });
  const { data } = await call('PUT', '/api/auth/preferences', { fontSize: 'small' });
  assert.equal(data.user.preferences.fontSize, 'small');
  assert.equal(data.user.preferences.reduceMotion, true);
  assert.equal(data.user.preferences.defaultLanding, '/connections');
});
