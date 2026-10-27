const readOptionalMetric = async (conn, query, unavailableMetrics, label) => {
  try {
    const result = await conn.execute(query);
    return result.rows || [];
  } catch (error) {
    if (error.errorNum === 942 || error.errorNum === 1031 || /ORA-00942|ORA-01031/.test(error.message)) {
      unavailableMetrics.push(label);
      return null;
    }
    throw error;
  }
};

const getOracleMonitoringMetrics = async (conn) => {
  const unavailableMetrics = [];
  const [sizeResult, tablesResult] = await Promise.all([
    conn.execute('SELECT NVL(SUM(bytes), 0) AS SIZE_BYTES FROM user_segments'),
    conn.execute('SELECT COUNT(*) AS TOTAL_TABLES FROM user_tables'),
  ]);
  const sessionRows = await readOptionalMetric(
    conn,
    `SELECT
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS ACTIVE_SESSIONS,
      COUNT(*) AS TOTAL_SESSIONS,
      SUM(CASE WHEN status = 'ACTIVE' AND last_call_et > 1 THEN 1 ELSE 0 END) AS SLOW_SESSIONS
    FROM v$session
    WHERE type = 'USER'`,
    unavailableMetrics,
    'session counts and slow sessions'
  );
  const parameterRows = await readOptionalMetric(
    conn,
    `SELECT value FROM v$parameter WHERE name = 'sessions'`,
    unavailableMetrics,
    'maximum sessions'
  );
  const instanceRows = await readOptionalMetric(
    conn,
    'SELECT (SYSDATE - startup_time) * 86400 AS UPTIME_SECONDS FROM v$instance',
    unavailableMetrics,
    'instance uptime'
  );
  const metricRows = await readOptionalMetric(
    conn,
    `SELECT metric_name, value
    FROM v$sysmetric
    WHERE group_id = 2 AND metric_name = 'User Transaction Per Sec'`,
    unavailableMetrics,
    'transactions per second'
  );
  const statsRows = await readOptionalMetric(
    conn,
    `SELECT name, value
    FROM v$sysstat
    WHERE name IN (
      'bytes sent via SQL*Net to client',
      'bytes received via SQL*Net from client',
      'session logical reads',
      'physical reads'
    )`,
    unavailableMetrics,
    'network and cache statistics'
  );

  const session = sessionRows?.[0];
  const parameter = parameterRows?.[0];
  const instance = instanceRows?.[0];
  const stats = statsRows
    ? Object.fromEntries(statsRows.map(row => [row.NAME || row.name, Number(row.VALUE ?? row.value ?? 0)]))
    : null;
  const logicalReads = stats?.['session logical reads'];
  const physicalReads = stats?.['physical reads'];
  const sizeBytes = Number(sizeResult.rows[0]?.SIZE_BYTES ?? sizeResult.rows[0]?.size_bytes ?? 0);

  return {
    type: 'oracle',
    activeConnections: session
      ? Number(session.ACTIVE_SESSIONS ?? session.active_sessions ?? 0)
      : null,
    totalConnections: session
      ? Number(session.TOTAL_SESSIONS ?? session.total_sessions ?? 0)
      : null,
    maxConnections: parameter
      ? Number(parameter.VALUE ?? parameter.value ?? 0)
      : null,
    totalTables: Number(tablesResult.rows[0]?.TOTAL_TABLES ?? tablesResult.rows[0]?.total_tables ?? 0),
    sizeMB: Number((sizeBytes / 1024 / 1024).toFixed(2)),
    slowQueries: session
      ? Number(session.SLOW_SESSIONS ?? session.slow_sessions ?? 0)
      : null,
    queriesPerSecond: metricRows
      ? Number(metricRows[0]?.VALUE ?? metricRows[0]?.value ?? 0)
      : null,
    uptime: instance
      ? Math.floor(Number(instance.UPTIME_SECONDS ?? instance.uptime_seconds ?? 0))
      : null,
    bytesSent: stats ? stats['bytes sent via SQL*Net to client'] : null,
    bytesReceived: stats ? stats['bytes received via SQL*Net from client'] : null,
    cacheHitRate: logicalReads > 0
      ? Number((Math.max(0, ((logicalReads - physicalReads) / logicalReads) * 100)).toFixed(2))
      : stats ? 0 : null,
    unavailableMetrics,
  };
};

module.exports = { getOracleMonitoringMetrics };
