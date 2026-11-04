const test = require('node:test');
const assert = require('node:assert/strict');

const { validateQueryPermissions } = require('../utils/readOnlyQueryValidator');

const readUser = { id: 'user-1', role: 'user' };

test('allows read-only CTE queries', () => {
  const result = validateQueryPermissions(
    'WITH recent AS (SELECT * FROM orders WHERE id > 10) SELECT * FROM recent',
    readUser,
    'mysql',
    'app',
    null,
    'read'
  );

  assert.equal(result.isAllowed, true);
});

test('rejects DML hidden inside a WITH clause', () => {
  const result = validateQueryPermissions(
    'WITH recent AS (DELETE FROM orders WHERE id = 1) SELECT * FROM recent',
    readUser,
    'mysql',
    'app',
    null,
    'read'
  );

  assert.equal(result.isAllowed, false);
  assert.match(result.error, /Read User/);
});

test('ignores semicolons wrapped inside quoted strings', () => {
  const result = validateQueryPermissions(
    "SELECT 'drop; table' AS label FROM orders WHERE id = 1",
    readUser,
    'mysql',
    'app',
    null,
    'read'
  );

  assert.equal(result.isAllowed, true);
});

test('blocks multi-statement SQL with a trailing write query', () => {
  const result = validateQueryPermissions(
    "SELECT 1; DELETE FROM orders WHERE id = 1",
    readUser,
    'mysql',
    'app',
    null,
    'read'
  );

  assert.equal(result.isAllowed, false);
});
