import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';

export default function QueryHistory() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await API.get('/history');
      setHistory(res.data.history);
    } catch (err) {
      setError('History load nahi hui');
    } finally {
      setLoading(false);
    }
  };

  const deleteOne = async (id) => {
    try {
      await API.delete(`/history/${id}`);
      setHistory(history.filter(h => h._id !== id));
    } catch (err) {
      setError('Delete nahi hua');
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Poori history delete karni hai?')) return;
    try {
      await API.delete('/history');
      setHistory([]);
    } catch (err) {
      setError('Clear nahi hua');
    }
  };

  // Query Editor mein bhejo
  const useQuery = (query) => {
    navigate('/query', { state: { query } });
  };

  // Time format karo
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading history...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-semibold text-gray-900">DB Manager</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Dashboard
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              Query History
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {history.length} queries — Last 50 shown
            </p>
          </div>
          {history.length > 0 && (
            <button
              onClick={clearAll}
              className="px-4 py-2 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 transition"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Empty */}
        {history.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm mb-2">
              Abhi koi query history nahi hai
            </p>
            <button
              onClick={() => navigate('/query')}
              className="text-sm text-gray-900 underline"
            >
              Query Editor pe jao
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item, i) => (
              <div
                key={item._id}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                {/* Top Row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      item.status === 'success'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-red-100 text-red-500'
                    }`}>
                      {item.status === 'success' ? '✓ Success' : '✗ Failed'}
                    </span>

                    {/* Execution Time */}
                    <span className="text-xs text-gray-400">
                      {item.executionTime}ms
                    </span>

                    {/* Rows */}
                    {item.rowsAffected > 0 && (
                      <span className="text-xs text-gray-400">
                        {item.rowsAffected} rows
                      </span>
                    )}
                  </div>

                  {/* Time */}
                  <span className="text-xs text-gray-400">
                    {formatTime(item.createdAt)}
                  </span>
                </div>

                {/* Query */}
                <pre className="text-sm text-gray-700 font-mono bg-gray-50 px-4 py-3 rounded-lg overflow-x-auto mb-3">
                  {item.query}
                </pre>

                {/* Error message */}
                {item.error && (
                  <p className="text-xs text-red-500 mb-3">
                    ❌ {item.error}
                  </p>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => useQuery(item.query)}
                    className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition"
                  >
                    Use this query
                  </button>
                  <button
                    onClick={() => deleteOne(item._id)}
                    className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition"
                  >
                    Delete
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}