function stripCommentsAndQuotedLiterals(sql) {
  let stripped = '';
  let quote = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        stripped += ' ';
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (char === quote && next === quote) {
        stripped += '  ';
        i += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      stripped += ' ';
      continue;
    }

    if (char === '-' && next === '-') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      stripped += ' ';
      continue;
    }

    stripped += char;
  }

  return stripped;
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote && next === quote) {
        current += next;
        i += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '-' && next === '-') {
      current += char + next;
      i += 1;
      inLineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      current += char + next;
      i += 1;
      inBlockComment = true;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ';') {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const finalStatement = current.trim();
  if (finalStatement) {
    statements.push(finalStatement);
  }

  return statements;
}

/**
 * Validates query execution permissions based on user role & dbType.
 * Read Users ('read') are strictly limited to Read-Only operations across MySQL, PostgreSQL, Oracle, and MongoDB.
 */
function validateQueryPermissions(rawQuery, user, dbType, targetDatabase, connectionId, connectionMode) {
  if (!user) {
    return { isAllowed: true };
  }

  let effectiveMode = ['read', 'readwrite'].includes(connectionMode)
    ? connectionMode
    : (user.accessMode || (user.role === 'readwrite' ? 'readwrite' : 'read'));

  // Check per-database mode if defined for this connection & database
  if (connectionId && targetDatabase && Array.isArray(user.allowedConnections)) {
    const connIdStr = connectionId.toString();
    const connEntry = user.allowedConnections.find(ac => (ac.connectionId?._id || ac.connectionId)?.toString() === connIdStr);
    if (connEntry && connEntry.databaseModes) {
      const modes = connEntry.databaseModes;
      let dbMode = null;
      if (modes instanceof Map) {
        dbMode = modes.get(targetDatabase);
      } else if (typeof modes === 'object') {
        dbMode = modes[targetDatabase];
      }
      if (dbMode && ['read', 'readwrite'].includes(dbMode)) {
        effectiveMode = dbMode;
      }
    }
  }

  if (effectiveMode === 'readwrite') {
    return { isAllowed: true };
  }

  if (effectiveMode === 'read') {
    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return { isAllowed: false, error: 'Query string cannot be empty.' };
    }

    const query = rawQuery.trim();
    const type = (dbType || 'mysql').toLowerCase();

    if (type === 'mongodb') {
      const clean = query.replace(/;+\s*$/, '').trim();
      const upper = clean.toUpperCase();

      if (
        upper === 'SHOW TABLES' ||
        upper === 'SHOW COLLECTIONS' ||
        upper.startsWith('SELECT') ||
        clean.startsWith('{')
      ) {
        return { isAllowed: true };
      }

      const mongoReadMatch = clean.match(/^db\.(?:getCollection\(['"]([^'"]+)['"]\)|([a-zA-Z0-9_-]+))\.(find|findOne|countDocuments|count|aggregate|distinct|estimatedDocumentCount)\(/i);
      if (mongoReadMatch) {
        return { isAllowed: true };
      }

      const writeMethods = [
        'insertOne', 'insertMany', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
        'replaceOne', 'drop', 'dropDatabase', 'createCollection', 'bulkWrite', 'remove', 'save', 'renameCollection'
      ];
      const hasWriteMethod = writeMethods.some(m => new RegExp(`\\.${m}\\b`, 'i').test(clean));
      if (hasWriteMethod) {
        return {
          isAllowed: false,
          error: 'Access Denied: Read User accounts are restricted to read-only queries (find, aggregate, count, show collections). Data modification and drop operations (insert, update, delete, drop) are prohibited.'
        };
      }

      return {
        isAllowed: false,
        error: 'Access Denied: Read User accounts are restricted to read-only queries. This query contains non-allowed modification operations.'
      };
    }

    const statements = splitSqlStatements(query);
    const allowedVerbs = ['SELECT', 'SHOW', 'EXPLAIN', 'DESC', 'DESCRIBE', 'WITH', 'VALUES'];
    const forbiddenKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'RENAME', 'GRANT', 'REVOKE', 'REPLACE', 'CALL', 'EXEC', 'EXECUTE', 'LOCK', 'FLASHBACK', 'PURGE'];

    for (const stmt of statements) {
      const normalized = stripCommentsAndQuotedLiterals(stmt).trim();
      if (!normalized) {
        continue;
      }

      const tokens = normalized
        .replace(/[^A-Za-z0-9_$#]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map(token => token.toUpperCase());

      if (!tokens.length) {
        continue;
      }

      let firstWord = tokens[0];
      if (firstWord === 'EXPLAIN') {
        const nextWord = tokens[1] || '';
        if (!allowedVerbs.includes(nextWord) && nextWord !== 'ANALYZE') {
          return {
            isAllowed: false,
            error: `Access Denied: Read User accounts are restricted to read-only queries (SELECT, SHOW, EXPLAIN, DESCRIBE). Operation '${nextWord || 'UNKNOWN'}' is not permitted.`
          };
        }
        if (nextWord === 'ANALYZE') {
          const followUp = tokens[2] || '';
          if (!allowedVerbs.includes(followUp)) {
            return {
              isAllowed: false,
              error: `Access Denied: Read User accounts are restricted to read-only queries (SELECT, SHOW, EXPLAIN, DESCRIBE). Operation '${followUp || 'UNKNOWN'}' is not permitted.`
            };
          }
        }
        continue;
      }

      if (!allowedVerbs.includes(firstWord)) {
        return {
          isAllowed: false,
          error: `Access Denied: Read User accounts are restricted to read-only queries (SELECT, SHOW, EXPLAIN, DESCRIBE). Operation '${firstWord}' is not permitted.`
        };
      }

      if (firstWord === 'WITH' && tokens.some(token => forbiddenKeywords.includes(token))) {
        return {
          isAllowed: false,
          error: `Access Denied: Read User accounts are restricted to read-only queries. Keyword '${tokens.find(token => forbiddenKeywords.includes(token))}' is prohibited for Read Users.`
        };
      }
    }

    return { isAllowed: true };
  }

  return { isAllowed: true };
}

module.exports = { validateQueryPermissions };
