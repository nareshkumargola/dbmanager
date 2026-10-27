const { splitOracleStatements } = require('./oracleQueryUtils');

const isSafeOracleIdentifier = (identifier) => /^[A-Z][A-Z0-9_$#]{0,127}$/i.test(identifier);
const quoteOracleIdentifier = (identifier) => `"${identifier.replace(/"/g, '""').toUpperCase()}"`;

const readLob = (lob) => new Promise((resolve, reject) => {
  let value = '';
  lob.setEncoding('utf8');
  lob.on('data', chunk => { value += chunk; });
  lob.on('end', () => resolve(value));
  lob.on('error', reject);
});

const readOracleValue = async (value) => {
  if (value && typeof value === 'object' && typeof value.setEncoding === 'function') {
    return readLob(value);
  }
  return value;
};

const quoteString = (value) => `'${value.replace(/'/g, "''")}'`;
const clobLiteral = (value, functionName) => {
  const chunks = value.match(/[\s\S]{1,3000}/g) || [''];
  return chunks.map(chunk => `${functionName}(${quoteString(chunk)})`).join(' || ');
};

const isSupportedDataType = (dataType) =>
  /^(?:CHAR|VARCHAR2|NCHAR|NVARCHAR2|NUMBER|FLOAT|BINARY_FLOAT|BINARY_DOUBLE|DATE|TIMESTAMP|RAW|CLOB|NCLOB|ROWID|UROWID|INTERVAL)\b/i.test(dataType);

const isOracleMetadataCompatibilityError = (error) =>
  error?.errorNum === 904 ||
  error?.errorNum === 942 ||
  /ORA-00904|ORA-00942/.test(error?.message || '');

const oracleLiteral = (value, dataType) => {
  if (value === null || value === undefined) return 'NULL';
  const type = dataType.toUpperCase();
  if (Buffer.isBuffer(value)) {
    if (value.length > 2000) throw new Error('RAW/BLOB values larger than 2000 bytes are not supported in SQL backup files.');
    return `HEXTORAW('${value.toString('hex')}')`;
  }
  if (type === 'BLOB' || type === 'BFILE') {
    throw new Error(`Oracle ${type} columns are not supported by SQL export. Use Data Pump for this schema.`);
  }
  if (type === 'CLOB' || type === 'NCLOB') {
    return clobLiteral(String(value), type === 'NCLOB' ? 'TO_NCLOB' : 'TO_CLOB');
  }
  if (value instanceof Date) {
    const iso = value.toISOString();
    if (type.startsWith('TIMESTAMP') && type.includes('TIME ZONE')) {
      return `TO_TIMESTAMP_TZ('${iso.replace('Z', '+00:00')}', 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM')`;
    }
    if (type.startsWith('TIMESTAMP')) {
      return `TO_TIMESTAMP('${iso.slice(0, -1)}', 'YYYY-MM-DD"T"HH24:MI:SS.FF3')`;
    }
    return `TO_DATE('${iso.slice(0, 19).replace('T', ' ')}', 'YYYY-MM-DD HH24:MI:SS')`;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (/^(?:NUMBER|FLOAT|BINARY_FLOAT|BINARY_DOUBLE)/.test(type) && /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(String(value))) {
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  return quoteString(String(value));
};

const createOracleSqlBackup = async (conn, owner, requestedTables = []) => {
  const userTables = await conn.execute(
    'SELECT table_name FROM user_tables ORDER BY table_name'
  );
  const availableTables = userTables.rows.map(row => row.TABLE_NAME || row.table_name);
  const tables = requestedTables.length
    ? requestedTables.map(table => table.toUpperCase())
    : availableTables;

  if (!tables.length) {
    throw new Error('No Oracle tables are available to export from this schema.');
  }

  if (tables.some(table => !isSafeOracleIdentifier(table) || !availableTables.includes(table))) {
    throw new Error('Backup selection contains an invalid or inaccessible Oracle table.');
  }

  await conn.execute(`
    BEGIN
      DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR', TRUE);
      DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'EMIT_SCHEMA', FALSE);
    END;`);

  const sections = [
    `-- DBMANAGER_ORACLE_SCHEMA_BACKUP v1 ${JSON.stringify({ owner: owner.toUpperCase(), tables })}`,
    `-- Generated: ${new Date().toISOString()}`,
    ''
  ];

  for (const table of tables) {
    const ddlResult = await conn.execute(
      `SELECT DBMS_METADATA.GET_DDL('TABLE', :tableName, USER) AS DDL FROM DUAL`,
      { tableName: table }
    );
    const ddl = await readOracleValue(ddlResult.rows[0]?.DDL || ddlResult.rows[0]?.ddl);
    if (!ddl) throw new Error(`Could not export DDL for Oracle table ${table}.`);
    sections.push(`-- Table: ${table}`, ddl.trim(), '');

    let columnRows;
    try {
      const columnResult = await conn.execute(
        `SELECT c.column_name, c.data_type
         FROM user_tab_columns c
         WHERE c.table_name = :tableName
           AND c.virtual_column = 'NO'
           AND NOT EXISTS (
             SELECT 1 FROM user_tab_identity_cols i
             WHERE i.table_name = c.table_name
               AND i.column_name = c.column_name
               AND i.generation_type = 'ALWAYS'
           )
         ORDER BY c.column_id`,
        { tableName: table }
      );
      columnRows = columnResult.rows;
    } catch (error) {
      if (!isOracleMetadataCompatibilityError(error)) throw error;
      const columnResult = await conn.execute(
         `SELECT column_name, data_type
          FROM user_tab_columns
         WHERE table_name = :tableName
         ORDER BY column_id`,
        { tableName: table }
      );
      const excludedColumns = new Set();
      const optionalMetadataQueries = [
         `SELECT column_name FROM user_tab_identity_cols
          WHERE table_name = :tableName AND generation_type = 'ALWAYS'`,
         `SELECT column_name FROM user_tab_cols
          WHERE table_name = :tableName AND virtual_column = 'YES'`
      ];
      for (const query of optionalMetadataQueries) {
         try {
           const metadataResult = await conn.execute(query, { tableName: table });
           metadataResult.rows.forEach(row => {
             excludedColumns.add(row.COLUMN_NAME || row.column_name);
           });
         } catch (metadataError) {
           if (!isOracleMetadataCompatibilityError(metadataError)) throw metadataError;
         }
      }
      columnRows = columnResult.rows.filter(row =>
         !excludedColumns.has(row.COLUMN_NAME || row.column_name)
      );
    }
    const columns = columnRows.map(row => ({
      name: row.COLUMN_NAME || row.column_name,
      type: row.DATA_TYPE || row.data_type
    }));
    if (columns.some(column => !isSupportedDataType(column.type))) {
      const unsupported = columns.find(column => !isSupportedDataType(column.type));
      throw new Error(`Oracle column ${table}.${unsupported.name} has unsupported type ${unsupported.type}. Use Data Pump for this schema.`);
    }
    if (!columns.length) {
      throw new Error(`Oracle table ${table} has no exportable columns.`);
    }
    const dataResult = await conn.execute(
      `SELECT ${columns.map(column => quoteOracleIdentifier(column.name)).join(', ')} FROM ${quoteOracleIdentifier(table)}`,
      [],
      { resultSet: true, fetchArraySize: 100 }
    );
    try {
      let rows = await dataResult.resultSet.getRows(100);
      while (rows.length) {
        for (const row of rows) {
          const values = [];
          for (const column of columns) {
            if (['BLOB', 'BFILE'].includes(column.type.toUpperCase())) {
              throw new Error(`Oracle ${column.type.toUpperCase()} column ${table}.${column.name} is not supported by SQL export. Use Data Pump for this schema.`);
            }
            const value = await readOracleValue(row[column.name]);
            values.push(oracleLiteral(value, column.type));
          }
          sections.push(
            `INSERT INTO ${quoteOracleIdentifier(table)} (${columns.map(column => quoteOracleIdentifier(column.name)).join(', ')}) VALUES (${values.join(', ')});`
          );
        }
        rows = await dataResult.resultSet.getRows(100);
      }
    } finally {
      await dataResult.resultSet.close();
    }
    sections.push('');
  }

  return { sql: sections.join('\n'), tables };
};

const parseOracleSqlBackup = (content) => {
  const match = content.match(/^\s*-- DBMANAGER_ORACLE_SCHEMA_BACKUP v1 (\{[^\r\n]+\})/);
  if (!match) {
    throw new Error('This is not a supported DB Manager Oracle schema backup.');
  }

  let manifest;
  try {
    manifest = JSON.parse(match[1]);
  } catch {
    throw new Error('Oracle backup manifest is invalid.');
  }
  if (
    !manifest ||
    typeof manifest.owner !== 'string' ||
    !isSafeOracleIdentifier(manifest.owner) ||
    !Array.isArray(manifest.tables) ||
    manifest.tables.length === 0 ||
    manifest.tables.some(table => !isSafeOracleIdentifier(table))
  ) {
    throw new Error('Oracle backup manifest contains invalid schema or table names.');
  }

  const sql = content
    .replace(/^\s*-- DBMANAGER_ORACLE_SCHEMA_BACKUP v1 [^\r\n]+\r?\n/, '')
    .replace(/^\s*--.*(?:\r?\n|$)/gm, '');
  const statements = splitOracleStatements(sql);
  const allowedTables = new Set(manifest.tables.map(table => table.toUpperCase()));
  const createdTables = new Set();
  const validStatement = (statement) => {
    const tableStatement = statement.match(/^(?:CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO)\s+"?([A-Z][A-Z0-9_$#]*)"?\b/i);
    if (tableStatement) {
      const table = tableStatement[1].toUpperCase();
      if (/^CREATE\s+TABLE/i.test(statement)) createdTables.add(table);
      return allowedTables.has(table);
    }
    const indexStatement = statement.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+"?[A-Z][A-Z0-9_$#]*"?\s+ON\s+"?([A-Z][A-Z0-9_$#]*)"?\b/i);
    return !!indexStatement && allowedTables.has(indexStatement[1].toUpperCase());
  };
  if (!statements.length || statements.some(statement => !validStatement(statement))) {
    throw new Error('Oracle backup contains unsupported SQL or references tables outside its manifest.');
  }
  if (manifest.tables.some(table => !createdTables.has(table.toUpperCase()))) {
    throw new Error('Oracle backup is incomplete: every manifest table must include its CREATE TABLE statement.');
  }
  return { manifest, statements };
};

module.exports = {
  createOracleSqlBackup,
  parseOracleSqlBackup,
  isSafeOracleIdentifier,
  quoteOracleIdentifier
};
