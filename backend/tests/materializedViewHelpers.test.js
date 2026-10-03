const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeViews } = require('../utils/viewUtils');

test('mergeViews keeps standard views and marks materialized views', () => {
  const merged = mergeViews(
    [{ name: 'active_customers', definition: 'SELECT * FROM customers' }],
    [{ name: 'customer_summary', definition: 'SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id', isMaterialized: true }]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].type, 'VIEW');
  assert.equal(merged[1].type, 'MATERIALIZED VIEW');
  assert.equal(merged[1].isMaterialized, true);
});
