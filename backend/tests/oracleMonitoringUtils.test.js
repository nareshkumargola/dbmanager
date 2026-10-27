const test = require('node:test');
const assert = require('node:assert/strict');

const { getOracleMonitoringMetrics } = require('../utils/oracleMonitoringUtils');

test('returns available schema metrics when Oracle performance views are not granted', async () => {
  const conn = {
    execute: async (query) => {
      if (query.includes('user_segments')) return { rows: [{ SIZE_BYTES: 1048576 }] };
      if (query.includes('user_tables')) return { rows: [{ TOTAL_TABLES: 4 }] };
      const error = new Error('ORA-00942: table or view does not exist');
      error.errorNum = 942;
      throw error;
    },
  };

  const metrics = await getOracleMonitoringMetrics(conn);

  assert.equal(metrics.sizeMB, 1);
  assert.equal(metrics.totalTables, 4);
  assert.equal(metrics.activeConnections, null);
  assert.equal(metrics.queriesPerSecond, null);
  assert.equal(metrics.unavailableMetrics.length, 5);
});

test('propagates Oracle errors unrelated to missing view privileges', async () => {
  const conn = {
    execute: async (query) => {
      if (query.includes('user_segments')) return { rows: [{ SIZE_BYTES: 0 }] };
      if (query.includes('user_tables')) return { rows: [{ TOTAL_TABLES: 0 }] };
      throw new Error('ORA-03113: end-of-file on communication channel');
    },
  };

  await assert.rejects(getOracleMonitoringMetrics(conn), /ORA-03113/);
});
