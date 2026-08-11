/**
 * Validates query execution permissions based on user role & dbType.
 * Read Users ('read') are strictly limited to Read-Only operations across MySQL, PostgreSQL, Oracle, and MongoDB.
 */
function validateQueryPermissions(rawQuery, user, dbType) {
  // Admins and ReadWrite users have full query execution rights
  if (!user || user.role === 'admin' || user.role === 'readwrite') {
    return { isAllowed: true };
  }

  // If user role is 'read' (Read User), enforce strict read-only rules
  if (user.role === 'read') {
    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return { isAllowed: false, error: 'Query string cannot be empty.' };
    }

    const query = rawQuery.trim();
    const type = (dbType || 'mysql').toLowerCase();

    // ─── MONGODB READ-ONLY VALIDATION ───────────────────
    if (type === 'mongodb') {
      const clean = query.replace(/;+\s*$/, '').trim();
      const upper = clean.toUpperCase();

      // Allowed MongoDB read patterns
      if (
        upper === 'SHOW TABLES' ||
        upper === 'SHOW COLLECTIONS' ||
        upper.startsWith('SELECT') ||
        clean.startsWith('{')
      ) {
        return { isAllowed: true };
      }

      // Check MongoDB shell method calls db.collection.method(...)
      const mongoReadMatch = clean.match(/^db\.(?:getCollection\(['"]([^'"]+)['"]\)|([a-zA-Z0-9_-]+))\.(find|findOne|countDocuments|count|aggregate|distinct|estimatedDocumentCount)\(/i);
      if (mongoReadMatch) {
        return { isAllowed: true };
      }

      // Write/Mutation methods
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

    // ─── SQL (MYSQL, POSTGRESQL, ORACLE) READ-ONLY VALIDATION ───
    // Remove comments
    const cleanSql = query
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--.*$/gm, '')
      .trim();

    // Check statements separated by semicolon
    const statements = cleanSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const allowedVerbs = ['SELECT', 'SHOW', 'EXPLAIN', 'DESC', 'DESCRIBE', 'WITH', 'VALUES'];
    const forbiddenKeywords = [
      'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'RENAME',
      'GRANT', 'REVOKE', 'REPLACE', 'CALL', 'EXEC', 'EXECUTE', 'LOCK', 'FLASHBACK', 'PURGE'
    ];

    for (const stmt of statements) {
      const firstWord = stmt.split(/\s+/)[0].toUpperCase();
      if (!allowedVerbs.includes(firstWord)) {
        return {
          isAllowed: false,
          error: `Access Denied: Read User accounts are restricted to read-only queries (SELECT, SHOW, EXPLAIN, DESCRIBE). Operation '${firstWord}' is not permitted.`
        };
      }

      // Secondary check for embedded mutation statements
      const upperStmt = stmt.toUpperCase();
      for (const kw of forbiddenKeywords) {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        if (regex.test(upperStmt) && !upperStmt.startsWith('SELECT') && !upperStmt.startsWith('WITH')) {
          return {
            isAllowed: false,
            error: `Access Denied: Read User accounts are restricted to read-only queries. Keyword '${kw}' is prohibited for Read Users.`
          };
        }
      }
    }

    return { isAllowed: true };
  }

  return { isAllowed: true };
}

module.exports = { validateQueryPermissions };
