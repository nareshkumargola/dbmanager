const test = require('node:test');
const assert = require('node:assert/strict');

const { splitOracleStatements } = require('../utils/oracleQueryUtils');

test('splits multiple Oracle statements and omits trailing terminators', () => {
  const statements = splitOracleStatements([
    "INSERT INTO customers VALUES (1, 'Aman')",
    "INSERT INTO customers VALUES (2, 'Rohit')",
    "INSERT INTO customers VALUES (3, 'Sneha')",
    "INSERT INTO customers VALUES (4, 'Karan')",
    "INSERT INTO customers VALUES (5, 'Pooja')"
  ].join(';\n') + ';');

  assert.equal(statements.length, 5);
  assert.equal(statements[0], "INSERT INTO customers VALUES (1, 'Aman')");
  assert.equal(statements[4], "INSERT INTO customers VALUES (5, 'Pooja')");
  assert.ok(statements.every(statement => !statement.endsWith(';')));
});

test('does not split semicolons inside quoted values or comments', () => {
  assert.deepEqual(
    splitOracleStatements("INSERT INTO messages VALUES ('wait; here'); -- ; ignored\nINSERT INTO messages VALUES (q'[a; b]');"),
    [
      "INSERT INTO messages VALUES ('wait; here')",
      "-- ; ignored\nINSERT INTO messages VALUES (q'[a; b]')"
    ]
  );
});

test('keeps PL/SQL blocks intact and removes SQL*Plus slash terminators', () => {
  assert.deepEqual(
    splitOracleStatements('BEGIN\n  INSERT INTO customers VALUES (1, \'Aman\');\nEND;\n/'),
    ['BEGIN\n  INSERT INTO customers VALUES (1, \'Aman\');\nEND;']
  );
});
