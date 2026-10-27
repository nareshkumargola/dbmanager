const isPLSQLBlock = (sql) => {
  const firstStatement = sql.replace(
    /^(?:\s|\/\*[\s\S]*?\*\/|--[^\r\n]*(?:\r?\n|$))*/,
    ''
  );
  return /^\s*(?:BEGIN|DECLARE)\b|^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:PROCEDURE|FUNCTION|TRIGGER|PACKAGE|TYPE)\b/i.test(firstStatement);
};

const splitOracleStatements = (sql) => {
  if (isPLSQLBlock(sql)) {
    return [sql.replace(/^\s*\/\s*$/gm, '').trim()].filter(Boolean);
  }

  const statements = [];
  let current = '';
  let state = 'normal';
  let qQuoteEnd = '';

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (state === 'singleQuote') {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        i += 1;
      } else if (char === "'") {
        state = 'normal';
      }
      continue;
    }

    if (state === 'doubleQuote') {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        i += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'qQuote') {
      current += char;
      if (char === qQuoteEnd && next === "'") {
        current += next;
        i += 1;
        state = 'normal';
      }
      continue;
    }

    if (state === 'lineComment') {
      current += char;
      if (char === '\n') state = 'normal';
      continue;
    }

    if (state === 'blockComment') {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        i += 1;
        state = 'normal';
      }
      continue;
    }

    if ((char === 'q' || char === 'Q') && next === "'") {
      const delimiter = sql[i + 2];
      if (delimiter !== undefined) {
        const closingDelimiters = { '[': ']', '{': '}', '(': ')', '<': '>' };
        qQuoteEnd = closingDelimiters[delimiter] || delimiter;
        current += char + next + delimiter;
        i += 2;
        state = 'qQuote';
        continue;
      }
    }

    if (char === "'") {
      current += char;
      state = 'singleQuote';
    } else if (char === '"') {
      current += char;
      state = 'doubleQuote';
    } else if (char === '-' && next === '-') {
      current += char + next;
      i += 1;
      state = 'lineComment';
    } else if (char === '/' && next === '*') {
      current += char + next;
      i += 1;
      state = 'blockComment';
    } else if (char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
};

module.exports = { splitOracleStatements };
