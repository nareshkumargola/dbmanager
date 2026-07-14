const query = `DELIMITER //

CREATE PROCEDURE AddTest(
    IN p_name VARCHAR(100),
    IN p_address VARCHAR(200)
)
BEGIN
    INSERT INTO test(name, address)
    VALUES(p_name, p_address);
END //

DELIMITER ;`;

const sanitizeQuery = (sql) => {
  if (!sql) return '';
  
  // Find all custom delimiters first using multiline regex
  const matches = [...sql.matchAll(/^\s*DELIMITER\s+(\S+)/gim)];
  console.log('Matches:', matches.map(m => m[0]));
  
  // Remove DELIMITER declarations that start on their own line
  let cleaned = sql.replace(/^\s*DELIMITER\s+\S+/gim, '');
  
  // Replace custom delimiters with semicolon
  matches.forEach(m => {
    const delim = m[1];
    if (delim && delim !== ';') {
      const escapedDelim = delim.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      // Replace custom delimiter only when it appears at the end of a line or statement
      const delimRegex = new RegExp(escapedDelim + '\\s*$', 'gm');
      cleaned = cleaned.replace(delimRegex, ';');
    }
  });
  
  cleaned = cleaned.replace(/;+/g, ';');
  return cleaned.trim();
};

console.log('Original:');
console.log(JSON.stringify(query));
console.log('\nSanitized:');
console.log(sanitizeQuery(query));
