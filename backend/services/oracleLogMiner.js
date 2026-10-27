const oracledb = require('oracledb');
const { getBinlogAuditModel, getAuditCheckKey } = require('../models/binlogAuditModel');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

const readLob = (lob) => new Promise((resolve, reject) => {
  let value = '';
  lob.setEncoding('utf8');
  lob.on('data', chunk => { value += chunk; });
  lob.on('end', () => resolve(value));
  lob.on('error', reject);
});

const readValue = async (value) => {
  if (value && typeof value === 'object' && typeof value.setEncoding === 'function') {
    return readLob(value);
  }
  return value;
};

const openOracleConnection = async (config) => oracledb.getConnection({
  user: config.username,
  password: config.password,
  connectString: `${config.host}:${config.port || 1521}/${config.database}`
});

const startSession = async (connection, startScn) => {
  const conn = await openOracleConnection(connection);
  try {
    const databaseResult = await conn.execute(`
      SELECT log_mode, supplemental_log_data_min, current_scn
      FROM v$database
    `);
    const databaseInfo = databaseResult.rows[0];
    if (!databaseInfo) throw new Error('Oracle did not return database LogMiner status.');

    const supplementalLogging = String(
      databaseInfo.SUPPLEMENTAL_LOG_DATA_MIN || databaseInfo.supplemental_log_data_min || ''
    ).toUpperCase();
    if (!['YES', 'IMPLICIT'].includes(supplementalLogging)) {
      throw new Error(
        'Oracle LogMiner requires minimal supplemental logging. Ask a DBA to run: ALTER DATABASE ADD SUPPLEMENTAL LOG DATA;'
      );
    }

    const logRows = await conn.execute(`
      SELECT member FROM (
        SELECT MIN(member) AS member FROM v$logfile GROUP BY group#
        UNION
        SELECT name AS member
        FROM (
          SELECT name, ROW_NUMBER() OVER (ORDER BY first_change# DESC) AS log_rank
          FROM v$archived_log
          WHERE name IS NOT NULL AND archived = 'YES' AND deleted = 'NO'
        )
        WHERE log_rank <= 100
      )
      WHERE member IS NOT NULL
    `);
    const logFiles = [...new Set(logRows.rows.map(row => row.MEMBER || row.member).filter(Boolean))];
    if (logFiles.length === 0) {
      throw new Error('Oracle returned no online or archived redo log files for LogMiner.');
    }

    for (let index = 0; index < logFiles.length; index += 1) {
      await conn.execute(
        `BEGIN
           DBMS_LOGMNR.ADD_LOGFILE(
             LOGFILENAME => :fileName,
             OPTIONS => DBMS_LOGMNR.${index === 0 ? 'NEW' : 'ADDFILE'}
           );
         END;`,
        { fileName: logFiles[index] }
      );
    }

    const beginScn = Math.max(0, Number(startScn) || Number(databaseInfo.CURRENT_SCN || databaseInfo.current_scn) || 0);
    await conn.execute(
      `BEGIN
         DBMS_LOGMNR.START_LOGMNR(
           STARTSCN => :startScn,
           OPTIONS => DBMS_LOGMNR.DICT_FROM_ONLINE_CATALOG
         );
       END;`,
      { startScn: beginScn }
    );

    return {
      conn,
      currentScn: Number(databaseInfo.CURRENT_SCN || databaseInfo.current_scn),
      logMode: databaseInfo.LOG_MODE || databaseInfo.log_mode,
      logFileCount: logFiles.length
    };
  } catch (error) {
    try { await conn.close(); } catch (closeError) {
      console.error('Failed to close Oracle LogMiner setup connection:', closeError.message);
    }
    if (/ORA-(?:00942|01031|06550)/.test(error.message || '')) {
      error.message += ' Oracle LogMiner requires DBA-granted access to V$DATABASE, V$LOGFILE, V$ARCHIVED_LOG, V$LOGMNR_CONTENTS, and EXECUTE on DBMS_LOGMNR.';
    }
    throw error;
  }
};

const closeLogMiner = async (conn) => {
  if (!conn) return;
  try {
    await conn.execute('BEGIN DBMS_LOGMNR.END_LOGMNR; END;');
  } catch (error) {
    if (!String(error.message).includes('ORA-01307')) throw error;
  } finally {
    await conn.close();
  }
};

const startOracleLogMiner = async (connection) => {
  const session = await startSession(connection, undefined);
  const startScn = session.currentScn;
  await closeLogMiner(session.conn);
  return {
    startScn,
    logMode: session.logMode,
    logFileCount: session.logFileCount
  };
};

const pollOracleLogMiner = async (connection, startScn, cursor, userId) => {
  const session = await startSession(connection, startScn);
  const events = [];
  let nextScn = Number(startScn) || session.currentScn;
  let nextCursor = cursor || { rsId: '', ssn: 0 };
  try {
    const queryResult = await session.conn.execute(
      `SELECT * FROM (
         SELECT scn, timestamp, username, operation, seg_owner, table_name,
                sql_redo, sql_undo, rs_id, ssn
         FROM v$logmnr_contents
         WHERE (scn > :lastScn
           OR (scn = :lastScn AND
             (rs_id > :lastRsId OR (rs_id = :lastRsId AND ssn > :lastSsn))))
           AND operation IN ('INSERT', 'UPDATE', 'DELETE', 'DDL')
         ORDER BY scn, rs_id, ssn
       )
       WHERE ROWNUM <= 100`,
      {
        lastScn: Number(startScn) || 0,
        lastRsId: cursor?.rsId || '',
        lastSsn: Number(cursor?.ssn) || 0
      },
      { resultSet: true, fetchArraySize: 100 }
    );

    try {
      let rows = await queryResult.resultSet.getRows(100);
      while (rows.length) {
        for (const row of rows) {
          const scn = Number(row.SCN || row.scn);
          const rsId = String(row.RS_ID || row.rs_id || '');
          const ssn = Number(row.SSN || row.ssn || 0);
          const eventType = String(row.OPERATION || row.operation || 'OTHER').toUpperCase();
          const statement = await readValue(row.SQL_REDO || row.sql_redo) || `${eventType} (SQL_REDO unavailable)`;
          const undo = await readValue(row.SQL_UNDO || row.sql_undo);
          const table = row.TABLE_NAME || row.table_name || 'unknown';
          const owner = row.SEG_OWNER || row.seg_owner || connection.username;
          const timestamp = row.TIMESTAMP || row.timestamp;
          const filterSettings = connection.binlogFilterSettings || { INSERT: true, UPDATE: true, DELETE: true, DDL: true, SP: true, OTHER: true };
          const auditCheckKey = getAuditCheckKey(statement);

          if (filterSettings[auditCheckKey]) {
            const auditModel = getBinlogAuditModel(connection, owner, 'INSERT');
            const auditRecord = await auditModel.create({
              connectionId: connection._id,
              eventType: ['INSERT', 'UPDATE', 'DELETE', 'DDL'].includes(eventType) ? eventType : 'OTHER',
              statement,
              originalType: 'Oracle LogMiner',
              pos: scn,
              logName: `SCN ${scn}`,
              user: userId || null,
              dbUser: row.USERNAME || row.username || 'Oracle user',
              timestamp: timestamp instanceof Date ? timestamp : new Date(timestamp || Date.now()),
              diff: {
                database: owner,
                table,
                scn,
                newData: eventType === 'INSERT' || eventType === 'UPDATE' ? { sqlRedo: statement } : null,
                oldData: eventType === 'DELETE' || eventType === 'UPDATE' ? { sqlUndo: undo } : null
              }
            });
            const populatedRecord = await auditModel.findById(auditRecord._id).populate('user', 'name email');
            events.push({
              _id: populatedRecord._id,
              eventType: populatedRecord.eventType,
              statement: populatedRecord.statement,
              originalType: populatedRecord.originalType,
              pos: populatedRecord.pos,
              logName: populatedRecord.logName,
              timestamp: populatedRecord.timestamp,
              user: populatedRecord.user,
              dbUser: populatedRecord.dbUser,
              diff: populatedRecord.diff
            });
          }
          nextScn = scn;
          nextCursor = { rsId, ssn };
        }
        rows = await queryResult.resultSet.getRows(100);
      }
    } finally {
      await queryResult.resultSet.close();
    }

    if (events.length === 0) {
      nextScn = Math.max(nextScn, session.currentScn);
      nextCursor = { rsId: '', ssn: 0 };
    }
    return {
      success: true,
      events,
      nextLogFile: 'oracle-logminer',
      nextPosition: nextScn,
      nextCursor
    };
  } finally {
    await closeLogMiner(session.conn);
  }
};

module.exports = { startOracleLogMiner, pollOracleLogMiner };
