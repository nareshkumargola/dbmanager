import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import API from '../api/axios';

export default function SlowQueryPanel({ connectionId }) {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [activeTab, setActiveTab] = useState(connectionId ? 'live' : 'history');
  const [threshold, setThreshold] = useState(100);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data states
  const [liveProcesses, setLiveProcesses] = useState([]);
  const [queries, setQueries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const refreshTimerRef = useRef(null);

  useEffect(() => {
    if (connectionId) {
      fetchConnectionSettings();
    }
  }, [connectionId]);

  useEffect(() => {
    fetchData();
  }, [connectionId, threshold, activeTab]);

  useEffect(() => {
    if (autoRefresh && activeTab === 'live') {
      refreshTimerRef.current = setInterval(() => {
        fetchLiveProcesses(false);
      }, 3000);
    } else {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [autoRefresh, activeTab, connectionId, threshold]);

  const fetchConnectionSettings = async () => {
    try {
      const res = await API.get(`/connections/${connectionId}`);
      if (res.data.connection && res.data.connection.slowQueryThreshold !== undefined) {
        setThreshold(res.data.connection.slowQueryThreshold);
      }
    } catch (err) {
      console.error('Failed to load connection settings:', err.message);
    }
  };

  const saveThresholdSetting = async () => {
    if (!connectionId) return;
    try {
      setSavingThreshold(true);
      setError('');
      await API.put(`/connections/${connectionId}/settings`, { slowQueryThreshold: parseInt(threshold) || 100 });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update threshold settings.');
    } finally {
      setSavingThreshold(false);
    }
  };

  const fetchData = () => {
    if (activeTab === 'live') {
      fetchLiveProcesses(true);
    } else {
      fetchSlowQueries();
    }
  };

  const fetchLiveProcesses = async (showLoading = true) => {
    if (!connectionId) {
      setLiveProcesses([]);
      setLoading(false);
      return;
    }
    try {
      if (showLoading) setLoading(true);
      setError('');
      const minMs = parseInt(threshold) || 0;
      const res = await API.get(`/slow-queries/live?connectionId=${connectionId}&minMs=${minMs}`);
      setLiveProcesses(res.data.processes || []);
    } catch (err) {
      setError('Failed to fetch live server processes.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchSlowQueries = async () => {
    try {
      setLoading(true);
      setError('');
      const minMs = parseInt(threshold) || 0;
      const url = `/slow-queries?${connectionId ? `connectionId=${connectionId}&` : ''}minMs=${minMs}`;
      const res = await API.get(url);
      setQueries(res.data.queries || []);
      setStats(res.data.stats || null);
    } catch (err) {
      setError('Failed to load slow query history.');
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

  // Export to Excel (CSV)
  const exportHistoryToCSV = () => {
    if (filteredQueries.length === 0) {
      alert('No history records available to export!');
      return;
    }
    const headers = ['Log ID', 'User Name', 'User Email', 'Connection Target', 'Execution Time (ms)', 'Rows Examined', 'Full SQL Query', 'AI Suggestion', 'Timestamp'];
    const rows = filteredQueries.map(item => {
      const cleanQuery = (item.query || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
      const cleanSuggestion = (item.suggestion || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
      const userName = (item.user?.name || 'Unknown').replace(/"/g, '""');
      const userEmail = (item.user?.email || 'N/A').replace(/"/g, '""');
      const connName = (item.connection?.name || 'Target Database').replace(/"/g, '""');
      const timeFormatted = new Date(item.createdAt).toLocaleString('en-IN');

      return [
        item._id,
        `"${userName}"`,
        `"${userEmail}"`,
        `"${connName}"`,
        item.executionTime || 0,
        item.rowsExamined || 0,
        `"${cleanQuery}"`,
        `"${cleanSuggestion}"`,
        `"${timeFormatted}"`
      ];
    });

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `slow_queries_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const useQuery = (queryText) => {
    if (!queryText) return;
    if (location.pathname.startsWith('/connections/')) {
      navigate(location.pathname, { state: { openTab: 'query', query: queryText, openNewTab: true } });
    } else {
      navigate('/query', { state: { query: queryText, openNewTab: true } });
    }
  };

  const copyToClipboard = (text, id) => {
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
          setCopiedId(id);
          setTimeout(() => setCopiedId(null), 2000);
        }).catch(() => fallbackCopy(text, id));
      } else {
        fallbackCopy(text, id);
      }
    } catch (e) {
      fallbackCopy(text, id);
    }
  };

  const fallbackCopy = (text, id) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getTimeBadgeClass = (timeMs) => {
    if (timeMs >= 5000) return 'bg-rose-100 text-rose-800 border-rose-200';
    if (timeMs >= 1000) return 'bg-red-100 text-red-700 border-red-200';
    if (timeMs >= 500) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-teal-100 text-teal-800 border-teal-200';
  };

  // Filter live processes
  const filteredLiveProcesses = liveProcesses.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(p.Id).toLowerCase().includes(q) ||
      String(p.User).toLowerCase().includes(q) ||
      String(p.Host).toLowerCase().includes(q) ||
      String(p.db).toLowerCase().includes(q) ||
      String(p.Command).toLowerCase().includes(q) ||
      String(p.State).toLowerCase().includes(q) ||
      String(p.Info).toLowerCase().includes(q)
    );
  });

  // Filter history queries
  const filteredQueries = queries.filter(qItem => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(qItem.query).toLowerCase().includes(q) ||
      String(qItem.user?.name).toLowerCase().includes(q) ||
      String(qItem.user?.email).toLowerCase().includes(q) ||
      String(qItem.suggestion).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 text-left">
      
      {/* Top Header & Interactive Controls */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>🐢</span> Slow Query &amp; Live Process Analysis
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Queries &amp; active server processes executing above threshold latency.
            </p>
          </div>

          {/* Interactive Threshold & Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Type-able ms Input Box */}
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-250 rounded-xl px-3 py-1.5 shadow-2xs">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Latency Limit:</span>
              <input
                type="number"
                min="0"
                step="10"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-24 px-2 py-1 text-xs font-mono font-bold text-teal-800 bg-white border border-gray-300 rounded-lg outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-400 text-center"
                placeholder="100"
              />
              <span className="text-xs font-bold text-gray-500">ms</span>

              {connectionId && (
                <button
                  onClick={saveThresholdSetting}
                  disabled={savingThreshold}
                  className="ml-1 text-[11px] font-bold text-white px-2.5 py-1 rounded-md transition shadow-2xs hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#0d9da4' }}
                >
                  {savingThreshold ? 'Saving...' : 'Set & Save'}
                </button>
              )}
            </div>

            {/* Refresh */}
            <button
              onClick={fetchData}
              className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition flex items-center gap-1.5"
            >
              <span>🔄</span> Refresh
            </button>
          </div>
        </div>

        {/* Sub-tabs & Search Toolbar */}
        <div className="mt-5 pt-4 border-t border-gray-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Mode Tabs */}
          <div className="flex items-center gap-2">
            {connectionId && (
              <button
                onClick={() => setActiveTab('live')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  activeTab === 'live'
                    ? 'text-white shadow-2xs'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
                style={activeTab === 'live' ? { backgroundColor: '#0d9da4' } : {}}
              >
                <span>⚡</span> Live Processlist (SHOW PROCESSLIST)
              </button>
            )}

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'text-white shadow-2xs'
                  : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={activeTab === 'history' ? { backgroundColor: '#0d9da4' } : {}}
            >
              <span>📜</span> Logged History Logs ({queries.length})
            </button>
          </div>

          {/* Auto Refresh & Search Box */}
          <div className="flex items-center gap-2">
            {activeTab === 'live' && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer mr-2 select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
                />
                Auto-refresh (3s)
              </label>
            )}

            {/* Search Box */}
            <input
              type="text"
              placeholder="🔍 Search user, host, query..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none bg-white focus:border-teal-400 w-48 sm:w-60"
            />
          </div>

        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-xs px-4 py-3 rounded-xl border border-red-200">
          ❌ {error}
        </div>
      )}

      {/* Summary Cards */}
      {activeTab === 'history' && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.totalSlowQueries}</p>
            <p className="text-xs text-gray-500 mt-1">Total Logged Queries</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.avgExecutionTime}ms</p>
            <p className="text-xs text-gray-500 mt-1">Average Execution Latency</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-rose-600">{stats.slowestTime}ms</p>
            <p className="text-xs text-gray-500 mt-1">Slowest Execution</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500">
          <div className="w-8 h-8 border-[3px] border-teal-100 border-t-teal-600 rounded-full animate-spin mx-auto mb-3"></div>
          Fetching queries taking &gt;= {threshold}ms...
        </div>
      ) : activeTab === 'live' ? (
        /* LIVE SERVER PROCESSLIST TABLE VIEW */
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-gray-50/80 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-xs font-bold text-teal-800 uppercase tracking-wider">
              ⚡ Running Server Processlist (Time &gt;= {threshold}ms)
            </h3>
            <span className="text-xs font-bold text-gray-500">
              Showing {filteredLiveProcesses.length} active threads
            </span>
          </div>

          {filteredLiveProcesses.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-3xl">🎉</span>
              <p className="text-sm font-semibold text-gray-700 mt-2">No active server processes running &gt;= {threshold}ms!</p>
              <p className="text-xs text-gray-400 mt-1">All database server threads are currently executing under threshold.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-gray-100/70 border-b border-gray-200 font-bold text-gray-700 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Id</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Host</th>
                    <th className="px-4 py-3">db</th>
                    <th className="px-4 py-3">Command</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">Info (SQL Query)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150 font-mono">
                  {filteredLiveProcesses.map(p => (
                    <tr key={p.Id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-800">{p.Id}</td>
                      <td className="px-4 py-3 text-gray-700">{p.User}</td>
                      <td className="px-4 py-3 text-gray-500 text-[11px] truncate max-w-[150px]" title={p.Host}>{p.Host}</td>
                      <td className="px-4 py-3 font-semibold text-teal-700">{p.db || <span className="text-gray-400 italic">null</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          p.Command === 'Query' ? 'bg-blue-100 text-blue-800' : 'bg-gray-150 text-gray-700'
                        }`}>
                          {p.Command}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full font-bold border ${getTimeBadgeClass(p.Time)}`}>
                          {p.Time} ms ({p.TimeSec}s)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={p.State}>{p.State || 'null'}</td>
                      <td className="px-4 py-3 max-w-[320px]">
                        {p.Info ? (
                          <div className="bg-gray-50 p-2 rounded border border-gray-200 text-[11px] relative group">
                            <div className="truncate font-sans font-mono" title={p.Info}>
                              {p.Info}
                            </div>
                            <div className="mt-1 flex items-center gap-2 font-sans">
                              <button
                                onClick={() => copyToClipboard(p.Info, p.Id)}
                                className="text-[10px] text-teal-700 hover:underline font-bold"
                              >
                                {copiedId === p.Id ? '✓ Copied' : '📋 Copy'}
                              </button>
                              <button
                                onClick={() => useQuery(p.Info)}
                                className="text-[10px] text-blue-600 hover:underline font-bold"
                              >
                                ⚡ Open in Editor
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic font-sans text-[11px]">null</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* LOGGED SLOW QUERIES HISTORY TABLE VIEW */
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 bg-gray-50/80 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-xs font-bold text-teal-800 uppercase tracking-wider">
              📜 Logged Slow Query History (Execution &gt;= {threshold}ms)
            </h3>
            <div className="flex items-center gap-3">
              {filteredQueries.length > 0 && (
                <button
                  onClick={exportHistoryToCSV}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  <span>📊</span> Export Excel (CSV)
                </button>
              )}
              {filteredQueries.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-rose-600 hover:underline font-bold"
                >
                  🗑️ Clear History
                </button>
              )}
            </div>
          </div>

          {filteredQueries.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-3xl">🎉</span>
              <p className="text-sm font-semibold text-gray-700 mt-2">No logged slow queries &gt;= {threshold}ms!</p>
              <p className="text-xs text-gray-400 mt-1">Try lowering the latency threshold or run queries from the Query Editor.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-gray-100/70 border-b border-gray-200 font-bold text-gray-700 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Log Id</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Connection Target</th>
                    <th className="px-4 py-3">Latency</th>
                    <th className="px-4 py-3">Rows Examined</th>
                    <th className="px-4 py-3">SQL Query &amp; AI Suggestion</th>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150">
                  {filteredQueries.map((item) => (
                    <tr key={item._id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono text-gray-500 text-[10px]">{item._id.substring(item._id.length - 6)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">{item.user?.name || 'Unknown'}</p>
                        <p className="text-[10px] text-gray-400">{item.user?.email || 'N/A'}</p>
                      </td>
                      <td className="px-4 py-3 font-bold text-teal-700">
                        {item.connection?.name || 'Target Database'}
                      </td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full font-bold border ${getTimeBadgeClass(item.executionTime)}`}>
                          {item.executionTime} ms
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">{item.rowsExamined || 0}</td>
                      <td className="px-4 py-3 max-w-[350px]">
                        <pre className="bg-gray-50 p-2 rounded border border-gray-200 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-24">
                          {item.query}
                        </pre>
                        {item.suggestion && (
                          <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-800 flex items-start gap-1.5">
                            <span>💡</span>
                            <span>{item.suggestion}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-[11px] whitespace-nowrap">{formatTime(item.createdAt)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => useQuery(item.query)}
                            className="px-2.5 py-1 bg-gray-900 text-white rounded text-[10px] font-bold hover:bg-gray-800 transition"
                          >
                            Open in Editor
                          </button>
                          <button
                            onClick={() => deleteOne(item._id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition"
                            title="Delete log"
                          >
                            ❌
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
