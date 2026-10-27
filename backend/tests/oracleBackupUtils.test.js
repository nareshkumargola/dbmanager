const test = require('node:test');
const assert = require('node:assert/strict');

const { createOracleSqlBackup, parseOracleSqlBackup } = require('../utils/oracleBackupUtils');

test('exports Oracle tables when VIRTUAL_COLUMN metadata is unavailable', async () => {
  const conn = {
    execute: async (query) => {
      if (query.includes('FROM user_tables')) {
        return { rows: [{ TABLE_NAME: 'CUSTOMERS' }] };
      }
      if (query.includes('DBMS_METADATA.SET_TRANSFORM_PARAM')) {
        return { rows: [] };
      }
      if (query.includes('DBMS_METADATA.GET_DDL')) {
        return { rows: [{ DDL: 'CREATE TABLE CUSTOMERS (ID NUMBER, NAME VARCHAR2(30))' }] };
      }
      if (query.includes('c.virtual_column')) {
        const error = new Error('ORA-00904: "C"."VIRTUAL_COLUMN": invalid identifier');
        error.errorNum = 904;
        throw error;
      }
      if (query.includes('FROM user_tab_columns')) {
        return {
          rows: [
            { COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER' },
            { COLUMN_NAME: 'NAME', DATA_TYPE: 'VARCHAR2' },
            { COLUMN_NAME: 'GENERATED_NAME', DATA_TYPE: 'VARCHAR2' },
          ],
        };
      }
      if (query.includes('FROM user_tab_identity_cols')) {
        return { rows: [{ COLUMN_NAME: 'ID' }] };
      }
      if (query.includes('FROM user_tab_cols')) {
        return { rows: [{ COLUMN_NAME: 'GENERATED_NAME' }] };
      }
      if (query.includes('FROM "CUSTOMERS"')) {
        let fetched = false;
        return {
          resultSet: {
            getRows: async () => {
              if (fetched) return [];
              fetched = true;
              return [{ NAME: 'Aman' }];
            },
            close: async () => {},
          },
        };
      }
      throw new Error(`Unexpected Oracle query: ${query}`);
    },
  };

  const backup = await createOracleSqlBackup(conn, 'DBMANAGER', ['CUSTOMERS']);

  assert.match(backup.sql, /INSERT INTO "CUSTOMERS" \("NAME"\) VALUES \('Aman'\);/);
  assert.doesNotMatch(backup.sql, /"GENERATED_NAME"/);
  assert.deepEqual(backup.tables, ['CUSTOMERS']);
});

test('parses an Oracle schema backup manifest and preserves semicolons in strings', () => {
  const backup = [
    '-- DBMANAGER_ORACLE_SCHEMA_BACKUP v1 {"owner":"APP","tables":["CUSTOMERS"]}',
    '-- Generated: 2026-10-27T00:00:00.000Z',
    'CREATE TABLE "CUSTOMERS" ("ID" NUMBER);',
    `INSERT INTO "CUSTOMERS" ("ID") VALUES (1);`,
    `INSERT INTO "CUSTOMERS" ("ID") VALUES ('value; kept');`
  ].join('\n');

  const parsed = parseOracleSqlBackup(backup);
  assert.equal(parsed.manifest.owner, 'APP');
  assert.deepEqual(parsed.manifest.tables, ['CUSTOMERS']);
  assert.equal(parsed.statements.length, 3);
  assert.match(parsed.statements[2], /'value; kept'/);
});

test('rejects unsupported statements in an Oracle restore file', () => {
  const backup = [
    '-- DBMANAGER_ORACLE_SCHEMA_BACKUP v1 {"owner":"APP","tables":["CUSTOMERS"]}',
    'CREATE TABLE "CUSTOMERS" ("ID" NUMBER);',
    'DROP USER "SYSTEM" CASCADE;'
  ].join('\n');

  assert.throws(() => parseOracleSqlBackup(backup), /unsupported SQL/);
});

test('rejects backup statements that target tables outside the manifest', () => {
  const backup = [
    '-- DBMANAGER_ORACLE_SCHEMA_BACKUP v1 {"owner":"APP","tables":["CUSTOMERS"]}',
    'CREATE TABLE "CUSTOMERS" ("ID" NUMBER);',
    'INSERT INTO "ORDERS" ("ID") VALUES (1);'
  ].join('\n');

  assert.throws(() => parseOracleSqlBackup(backup), /outside its manifest/);
});
