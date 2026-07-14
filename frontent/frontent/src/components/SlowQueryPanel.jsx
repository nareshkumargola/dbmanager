import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import API from '../api/axios';

export default function SlowQueryPanel({ connectionId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [queries, setQueries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSlowQueries();
  }, [connectionId]);

  const fetchSlowQueries = async () => {
    try {
      setLoading(true);
      const url = `/slow-queries${connectionId ? `?connectionId=${connectionId}` : ''}`;
      const res = await API.get(url);
      setQueries(res.data.queries);
      setStats(res.data.stats);
    } catch (err) {
      setError('Failed to load slow query data.');
    } finally {
      setLoading(false);
    }
  };

  const deleteOne = async (id) => {
    try {
      await API.delete(`/slow-queries/${id}`);
      setQueries(queries.filter(q => q._id !== id));
    } catch (err) {
      setError('Failed to delete query.');
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all slow query history?')) return;
    try {
      const url = `/slow-queries${connectionId ? `?connectionId=${connectionId}` : ''}`;
      await API.delete(url);
      setQueries([]);
      setStats({ totalSlowQueries: 0, avgExecutionTime: 0, slowestTime: 0 });
    } catch (err) {
      setError('Failed to clear history.');
    }
  };

  const useQuery = (query) => {
    // If inside a connection route, open the parent connection page and request query tab
    if (location.pathname.startsWith('/connections/')) {
      navigate(location.pathname, { state: { openTab: 'query', query } });
    } else {
      navigate('/query', { state: { query } });
    }
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Speed badge color
  const getSpeedBadge = (time) => {
    if (time >= 1000) return { label: 'Very Slow', className: 'bg-red-100 text-red-600' };
    if (time >= 500) return { label: 'Slow', className: 'bg-orange-100 text-orange-600' };
    return { label: 'Moderate', className: 'bg-yellow-100 text-yellow-600' };
  };

  if (loading) return (<div className="text-center py-8"><p className="text-gray-500 text-sm">Loading...</p></div>);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Slow Query Analysis</h2>
          <p className="text-sm text-gray-500 mt-1">100ms se zyada time lene wali queries</p>
        </div>
        {queries.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={clearAll}
              className="px-4 py-2 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 transition"
            >
              Clear All
            </button>
            <button
              onClick={() => {
                if (location.pathname.startsWith('/connections/')) {
                  navigate(location.pathname, { state: { openTab: 'query' } });
                } else {
                  navigate('/query');
                }
              }}
              className="text-sm text-gray-900 underline"
            >
              Query Editor pe jao
            </button>
          </div>
        )}

      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.totalSlowQueries}</p>
            <p className="text-xs text-gray-500 mt-1">Total Slow Queries</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.avgExecutionTime}ms</p>
            <p className="text-xs text-gray-500 mt-1">Average Time</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{stats.slowestTime}ms</p>
            <p className="text-xs text-gray-500 mt-1">Slowest Query</p>
          </div>
        </div>
      )}

      {queries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="text-gray-700 font-medium mb-1">No slow queries detected!</p>
          <p className="text-gray-400 text-sm mb-4">All queries are executing under 100ms.</p>
          <button
            onClick={() => useQuery('')}
            className="text-sm text-gray-900 underline"
          >
            Go to Query Editor
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {queries.map((item) => {
            const badge = getSpeedBadge(item.executionTime);
            return (
              <div key={item._id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${badge.className}`}>{badge.label}</span>
                    <span className="text-xs font-mono font-semibold text-gray-700">{item.executionTime}ms</span>
                    <span className="text-xs text-gray-400">{item.rowsExamined} rows</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatTime(item.createdAt)}</span>
                </div>

                <pre className="text-sm text-gray-700 font-mono bg-gray-50 px-4 py-3 rounded-lg overflow-x-auto mb-3">{item.query}</pre>

                {item.suggestion && (
                  <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 px-4 py-3 rounded-lg mb-3">
                    <span className="text-yellow-500 mt-0.5">💡</span>
                    <p className="text-sm text-yellow-700">{item.suggestion}</p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button onClick={() => useQuery(item.query)} className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition">Query Editor mein kholo</button>
                  <button onClick={() => deleteOne(item._id)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
