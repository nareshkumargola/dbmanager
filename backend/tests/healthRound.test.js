// Run from backend/: node --test tests/healthRound.test.js
const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');

const { createHealthRunner, isUnreachableError } = require('../services/healthRound');

const OFFLINE = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
const connection = (id) => ({ _id: id, name: `conn-${id}` });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
after(() => mock.restoreAll());

test('connection failures are told apart from other errors', () => {
  for (const err of [
    OFFLINE,
    { code: 'ETIMEDOUT', message: 'connect ETIMEDOUT' },
    { code: 'ENOTFOUND', message: 'getaddrinfo' },
    { name: 'MongoServerSelectionError', message: 'x' },
    { name: 'MongoNetworkError', message: 'x' },
    { message: 'Connection terminated due to connection timeout' },
    { code: 'PROTOCOL_CONNECTION_LOST', message: 'x' },
    { message: 'NJS-503: connection to host could not be established' },
  ]) assert.ok(isUnreachableError(err), JSON.stringify(err));
  for (const err of [
    null,
    undefined,
    { code: 'ER_ACCESS_DENIED_ERROR', message: 'Access denied' },
    { message: 'not authorized on admin to execute command' },
    { message: 'The server certificate could not be verified.' },
  ]) assert.ok(!isUnreachableError(err), JSON.stringify(err));
});

test('every connection is checked, with at most 5 at once', async () => {
  let active = 0;
  let peak = 0;
  const checked = [];
  const runner = createHealthRunner({
    check: async (c) => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(10);
      active -= 1;
      checked.push(c._id);
    },
  });
  await runner.runRound(Array.from({ length: 17 }, (_, i) => connection(i)));
  assert.equal(checked.length, 17);
  assert.equal(new Set(checked).size, 17);
  assert.equal(peak, 5);
});

test('a slow connection does not hold up the others', async () => {
  const finished = [];
  const runner = createHealthRunner({
    concurrency: 2,
    check: async (c) => {
      await sleep(c._id === 'slow' ? 120 : 5);
      finished.push(c._id);
    },
  });
  await runner.runRound(['slow', 'a', 'b', 'c', 'd'].map(connection));
  assert.deepEqual(finished.slice(0, 4), ['a', 'b', 'c', 'd']);
  assert.equal(finished[4], 'slow');
});

test('an error in one check does not stop the others', async () => {
  const checked = [];
  const runner = createHealthRunner({
    check: async (c) => {
      if (c._id === 'bad') throw new Error('boom');
      checked.push(c._id);
    },
  });
  assert.equal(await runner.runRound(['a', 'bad', 'b'].map(connection)), true);
  assert.deepEqual(checked.sort(), ['a', 'b']);
});

test('a new round is skipped while the last one is running', async () => {
  let calls = 0;
  const runner = createHealthRunner({
    check: async () => {
      calls += 1;
      await sleep(40);
    },
  });
  const first = runner.runRound([connection('a')]);
  assert.equal(await runner.runRound([connection('a')]), false);
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.equal(await runner.runRound([connection('a')]), true);
  assert.equal(calls, 2);
});

test('a stuck check cannot stop later rounds or start a second copy', async () => {
  const calls = { stuck: 0, ok: 0 };
  let release;
  const runner = createHealthRunner({
    deadlineMs: 20,
    check: (c) => {
      calls[c._id] += 1;
      if (c._id === 'stuck') return new Promise((resolve) => { release = resolve; });
      return undefined;
    },
  });
  const both = ['stuck', 'ok'].map(connection);
  assert.equal(await runner.runRound(both), true);
  assert.equal(await runner.runRound(both), true);
  assert.deepEqual(calls, { stuck: 1, ok: 2 });
  release();
  await sleep(5);
  await runner.runRound(both);
  assert.deepEqual(calls, { stuck: 2, ok: 3 });
  release();
});

test('an offline connection is tried after 1, 2, then every 3 rounds', async () => {
  const rounds = [];
  let round = 0;
  const runner = createHealthRunner({
    check: async () => {
      rounds.push(round);
      return OFFLINE;
    },
  });
  for (round = 1; round <= 12; round += 1) await runner.runRound([connection('a')]);
  assert.deepEqual(rounds, [1, 2, 4, 7, 10]);
});

test('a connection back online returns to every round at once', async () => {
  const rounds = [];
  let round = 0;
  let online = false;
  const runner = createHealthRunner({
    check: async () => {
      rounds.push(round);
      return online ? undefined : OFFLINE;
    },
  });
  for (round = 1; round <= 3; round += 1) await runner.runRound([connection('a')]);
  online = true;
  for (round = 4; round <= 8; round += 1) await runner.runRound([connection('a')]);
  assert.deepEqual(rounds, [1, 2, 4, 5, 6, 7, 8]);
});

test('other errors keep their normal schedule', async () => {
  let calls = 0;
  const runner = createHealthRunner({
    check: async () => {
      calls += 1;
      return new Error('not authorized on admin to execute command');
    },
  });
  for (let i = 0; i < 6; i += 1) await runner.runRound([connection('a')]);
  assert.equal(calls, 6);
});

test('a deleted connection is forgotten', async () => {
  const calls = [];
  const runner = createHealthRunner({
    check: async (c) => {
      calls.push(c._id);
      return OFFLINE;
    },
  });
  await runner.runRound([connection('a')]);
  await runner.runRound([connection('a')]);
  await runner.runRound([]);
  await runner.runRound([connection('a')]);
  assert.deepEqual(calls, ['a', 'a', 'a']);
});
