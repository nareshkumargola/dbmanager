// Checks alerts and snapshots against a throwaway database. Notifications are replaced, so nothing is sent.
// Run from backend/: node --test tests/healthCheck.test.js
process.env.CONNECTION_ENCRYPTION_KEY = 'test-only-connection-key';

const { after, before, beforeEach, test, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const notifications = require('../services/notificationService');

const sent = [];
const record = (channel) => async (target, alert) => { sent.push({ channel, resolved: alert.resolved, type: alert.type }); };
notifications.sendSlackNotification = record('slack');
notifications.sendDiscordNotification = record('discord');
notifications.sendEmailNotification = record('email');

const { checkConnection } = require('../services/healthMonitoringService');
const { isUnreachableError } = require('../services/healthRound');
const { closeConnection } = require('../connections/connectionManager');
const User = require('../models/userModel');
const Connection = require('../models/connectionModel');
const Alert = require('../models/alertModel');
const MonitoringSnapshot = require('../models/monitoringSnapshotModel');

const DB_NAME = 'dbmanager_health_test';
const LIVE_URI = `mongodb://127.0.0.1:27017/${DB_NAME}`;
const DEAD_URI = 'mongodb://127.0.0.1:1/nothing';
const io = { emit: () => {} };
let owner;
const opened = new Set();

const makeConnection = async (connectionString, alertsEnabled) => {
  const doc = await Connection.create({ user: owner._id, name: `Health ${opened.size}`, type: 'mongodb', database: DB_NAME, connectionString, alertsEnabled, alertEmail: 'nobody@test.local' });
  opened.add(String(doc._id));
  return doc;
};

before(async () => {
  await mongoose.connect(LIVE_URI, { serverSelectionTimeoutMS: 3000 });
  assert.equal(mongoose.connection.name, DB_NAME);
  await mongoose.connection.db.dropDatabase();
  owner = await User.create({ name: 'Owner', email: 'owner@test.local', role: 'developer', isFirstLogin: false, password: 'x'.repeat(60) });
  mock.method(console, 'error', () => {});
});

beforeEach(() => { sent.length = 0; });

after(async () => {
  mock.restoreAll();
  await Promise.all([...opened].map((id) => closeConnection(id).catch(() => {})));
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test('a healthy connection saves a snapshot and reports no problem', async () => {
  const doc = await makeConnection(LIVE_URI, true);
  assert.equal(await checkConnection(doc, io), undefined);
  assert.equal(await MonitoringSnapshot.countDocuments({ connection: doc._id }), 1);
  assert.equal(await Alert.countDocuments({ connection: doc._id }), 0);
});

test('with alerts off, a healthy connection still saves a snapshot', async () => {
  const doc = await makeConnection(LIVE_URI, false);
  assert.equal(await checkConnection(doc, io), undefined);
  assert.equal(await MonitoringSnapshot.countDocuments({ connection: doc._id }), 1);
});

test('the first failure raises one down alert at once, and it stays one alert', async () => {
  const doc = await makeConnection(DEAD_URI, true);
  const problem = await checkConnection(doc, io);
  assert.ok(isUnreachableError(problem), String(problem));
  assert.equal(await Alert.countDocuments({ connection: doc._id, type: 'down', resolved: false }), 1);
  assert.deepEqual(sent.map((s) => s.channel).sort(), ['discord', 'email', 'slack']);
  assert.equal(await MonitoringSnapshot.countDocuments({ connection: doc._id }), 0);

  sent.length = 0;
  assert.ok(isUnreachableError(await checkConnection(doc, io)));
  assert.equal(await Alert.countDocuments({ connection: doc._id, type: 'down', resolved: false }), 1);
  assert.equal(sent.length, 0);
});

test('with alerts off, an offline connection is still reported, without an alert', async () => {
  const doc = await makeConnection(DEAD_URI, false);
  assert.ok(isUnreachableError(await checkConnection(doc, io)));
  assert.equal(await Alert.countDocuments({ connection: doc._id }), 0);
  assert.equal(sent.length, 0);
});

test('when the database comes back, the alert is resolved and snapshots resume', async () => {
  const doc = await makeConnection(DEAD_URI, true);
  await checkConnection(doc, io);
  sent.length = 0;

  doc.connectionString = LIVE_URI;
  await doc.save();
  await closeConnection(String(doc._id));
  assert.equal(await checkConnection(await Connection.findById(doc._id), io), undefined);
  assert.equal(await Alert.countDocuments({ connection: doc._id, type: 'down', resolved: false }), 0);
  assert.equal(await Alert.countDocuments({ connection: doc._id, type: 'down', resolved: true }), 1);
  assert.ok(sent.every((s) => s.resolved === true) && sent.length === 3);
  assert.equal(await MonitoringSnapshot.countDocuments({ connection: doc._id }), 1);
});
