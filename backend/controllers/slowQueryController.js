const SlowQuery = require('../models/slowQueryModel');

// Slow query threshold — 100ms se zyada = slow
const SLOW_THRESHOLD = 100;

// Suggestion generate karo
const generateSuggestion = (query, executionTime) => {
  const upperQuery = query.toUpperCase();

  if (upperQuery.includes('SELECT *')) {
    return 'SELECT * ki jagah specific columns use karo — e.g. SELECT id, name';
  }
  if (!upperQuery.includes('WHERE') && upperQuery.includes('SELECT')) {
    return 'WHERE clause add karo — full table scan ho raha hai!';
  }
  if (upperQuery.includes('LIKE') && upperQuery.includes('%')) {
    return 'LIKE "%value%" slow hota hai — Full text search use karo';
  }
  if (upperQuery.includes('JOIN') && executionTime > 500) {
    return 'JOIN pe index check karo — foreign key columns pe index hona chahiye';
  }
  if (upperQuery.includes('ORDER BY') && !upperQuery.includes('LIMIT')) {
    return 'ORDER BY ke saath LIMIT use karo — unnecessary rows mat lao';
  }
  return 'Query optimize karo — EXPLAIN keyword se analysis karo';
};

// Slow query save karo — dbController se call hoga
exports.saveSlowQuery = async (connectionId, userId, query, executionTime, rowsExamined) => {
  try {
    if (!connectionId) return;
    if (executionTime >= SLOW_THRESHOLD) {
      const suggestion = generateSuggestion(query, executionTime);
      await SlowQuery.create({
        connection: connectionId,
        user: userId,
        query,
        executionTime,
        rowsExamined,
        suggestion,
      });
    }
  } catch (err) {
    console.error('Slow query not saved:', err.message);
  }
};

// Slow queries dekho
exports.getSlowQueries = async (req, res) => {
  try {
    const { connectionId } = req.query;
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId parameter required!' });
    }
    const queries = await SlowQuery.find({ user: req.user.id, connection: connectionId })
      .sort({ executionTime: -1 }) // Sabse slow pehle
      .limit(50);

    // Stats calculate karo
    const totalQueries = queries.length;
    const avgTime = totalQueries > 0
      ? Math.round(queries.reduce((sum, q) => sum + q.executionTime, 0) / totalQueries)
      : 0;
    const slowestQuery = queries[0] || null;

    res.status(200).json({
      success: true,
      queries,
      stats: {
        totalSlowQueries: totalQueries,
        avgExecutionTime: avgTime,
        slowestTime: slowestQuery?.executionTime || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Single slow query delete karo
exports.deleteSlowQuery = async (req, res) => {
  try {
    await SlowQuery.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Deleted!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Poori history clear karo
exports.clearSlowQueries = async (req, res) => {
  try {
    const { connectionId } = req.query;
    if (!connectionId) {
      return res.status(400).json({ message: 'connectionId parameter required!' });
    }
    await SlowQuery.deleteMany({ user: req.user.id, connection: connectionId });
    res.status(200).json({ success: true, message: 'Query history cleared successfully!' });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};