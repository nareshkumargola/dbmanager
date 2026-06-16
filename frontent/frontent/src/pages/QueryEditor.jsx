import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import API from '../api/axios';

export default function QueryEditor() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState(
    location.state?.query || 'SELECT * FROM users;'
  );
  const [results, setResults] = useState([]);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const runQuery = async () => {
    setError('');
    setMessage('');
    setResults([]);
    setLoading(true);

    try {
      // If opened with a connection context, forward it
      const params = new URLSearchParams();
      if (location.state?.connectionId) params.append('connectionId', location.state.connectionId);
      if (location.state?.database) params.append('database', location.state.database);
      const path = `/db/mysql/query${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await API.post(path, { query });

      const data = res.data.results;

      // SELECT query — rows aayengi
      if (Array.isArray(data) && data.length > 0) {
        setColumns(Object.keys(data[0]));
        setResults(data);
        setMessage(`${data.length} rows mili`);
      }
      // INSERT/UPDATE/DELETE — affected rows aayenge
      else if (data?.affectedRows !== undefined) {
        setMessage(`Query successful! ${data.affectedRows} rows affected`);
      }
      // Empty result
      else {
        setMessage('Query successful! Koi rows nahi mili');
      }

    } catch (err) {
      setError(err.response?.data?.error || 'Query failed!');
    } finally {
      setLoading(false);
    }
  };

  // Keyboard shortcut — Ctrl+Enter se query run
  const handleKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      runQuery();
    }
  };

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

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">
            SQL Query Editor
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            MySQL queries run karo — Ctrl+Enter se bhi run kar sakte ho
          </p>
        </div>

        {/* Query Box */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">

          {/* Shortcut hints */}
          <div className="flex gap-2 mb-3 flex-wrap">
            {[
              'SELECT * FROM users',
              'SELECT * FROM projects',
              'SHOW TABLES',
              'SHOW DATABASES',
            ].map((hint, i) => (
              <button
                key={i}
                onClick={() => setQuery(hint)}
                className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition"
              >
                {hint}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={6}
            placeholder="SQL query yahan likho..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:border-gray-500 resize-none bg-gray-50"
          />

          {/* Run Button */}
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-400">
              {/* ⚠️ DROP, TRUNCATE, ALTER, CREATE allowed nahi hai */}
              please use quiry and manage 
            </p>
            <button
              onClick={runQuery}
              disabled={loading || !query.trim()}
              className="px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition disabled:opacity-60"
            >
              {loading ? 'Running...' : '▶ Run Query'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">
            ❌ {error}
          </div>
        )}

        {/* Success Message */}
        {message && !error && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-600 text-sm px-4 py-3 rounded-lg">
            ✅ {message}
          </div>
        )}

        {/* Results Table */}
        {results.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">
                Results — {results.length} rows
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">

                {/* Head */}
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {columns.map((col, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Body */}
                <tbody className="divide-y divide-gray-100">
                  {results.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      {columns.map((col, j) => (
                        <td
                          key={j}
                          className="px-4 py-3 text-gray-700 whitespace-nowrap"
                        >
                          {row[col] === null ? (
                            <span className="text-gray-300 italic">null</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}