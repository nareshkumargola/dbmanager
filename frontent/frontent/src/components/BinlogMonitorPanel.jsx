import { useState, useEffect } from 'react';
import API from '../api/axios';
import { socket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

export default function BinlogMonitorPanel({ connectionId }) {
  const { user: authUser } = useAuth();
  
  // State Variables
  const [auditHistory, setAuditHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [error, setError] = useState('');
  
  // Coordinates & Mode (from backend poller)
  const [mode, setMode] = useState(''); // 'real' or 'simulation'
  const [logFile, setLogFile] = useState('');
  const [position, setPosition] = useState(null);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Interactive UI States
  const [selectedEvent, setSelectedEvent] = useState(null); // Details Inspector Modal
  const [expandedDiffs, setExpandedDiffs] = useState({});

  // Connect socket, fetch audit history and start monitoring automatically
  useEffect(() => {
    socket.connect();
    
    // Join connection room
    socket.emit('join_connection', connectionId);

    const handleBinlogEvents = (data) => {
      // Refresh history when new query events occur
      fetchAuditHistory();
      if (data.logFile) setLogFile(data.logFile);
      if (data.position) setPosition(data.position);
    };

    const handleBinlogLocation = (data) => {
      if (data.logFile) setLogFile(data.logFile);
      if (data.position) setPosition(data.position);
    };

    socket.on('binlog_events', handleBinlogEvents);
    socket.on('binlog_location', handleBinlogLocation);

    // Initial audit log fetch
    fetchAuditHistory();

    // Auto-start monitoring on backend and trigger socket monitoring
    let isMounted = true;
    const autoStart = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await API.post(`/connections/${connectionId}/binlog/start`);
        if (!isMounted) return;
        if (res.data.success) {
          setLogFile(res.data.logFile);
          setPosition(res.data.position);
          setMode(res.data.mode);
          setMonitoring(true);

          socket.emit('start_binlog_monitoring', {
            connectionId,
            logFile: res.data.logFile,
            position: res.data.position,
            mode: res.data.mode,
            userId: authUser?.id || authUser?._id
          });
        } else {
          setError(res.data.message || 'Failed to start log monitoring.');
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err.response?.data?.message || 'Error starting log monitoring.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    autoStart();

    return () => {
      isMounted = false;
      // Disconnect cleanly and stop monitoring
      socket.emit('stop_binlog_monitoring', { connectionId });
      socket.off('binlog_events', handleBinlogEvents);
      socket.off('binlog_location', handleBinlogLocation);
      socket.disconnect();
      setMonitoring(false);
    };
  }, [connectionId, authUser]);

  const fetchAuditHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await API.get(`/connections/${connectionId}/binlog/history`);
      setAuditHistory(res.data.history || []);
    } catch (err) {
      console.error('History fetch failed:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteMongoAuditLogs = async () => {
    if (!window.confirm('Kya aap sach mein database history clear karna chahte hain?')) return;
    try {
      setError('');
      await API.delete(`/connections/${connectionId}/binlog/history`);
      setAuditHistory([]);
    } catch (err) {
      setError('Database query history clear nahi ho saki.');
    }
  };

  const toggleDiffPanel = (id) => {
    setExpandedDiffs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short'
    });
  };

  const getEventBadge = (type) => {
    switch (type) {
      case 'INSERT':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'UPDATE':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'DELETE':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'DDL':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-300';
    }
  };

  // Client-Side Filtering logic
  const matchFilter = (item) => {
    // 1. Type Filter
    if (filterType !== 'ALL' && item.eventType !== filterType) return false;
    
    // 2. Text Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const statementMatch = item.statement && item.statement.toLowerCase().includes(q);
      const tableMatch = item.diff && item.diff.table && item.diff.table.toLowerCase().includes(q);
      const dbUserMatch = item.dbUser && item.dbUser.toLowerCase().includes(q);
      const originalTypeMatch = item.originalType && item.originalType.toLowerCase().includes(q);
      
      return statementMatch || tableMatch || dbUserMatch || originalTypeMatch;
    }
    return true;
  };

  const filteredAuditHistory = auditHistory.filter(matchFilter);

  return (
    <div className="space-y-6">
      {/* Top Banner and Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">📡 Query History & Logs</h2>
            {monitoring ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse"></span>
                Live
              </span>
            ) : loading ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full text-xs font-semibold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-yellow-550"></span>
                Connecting...
              </span>
            ) : null}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Database par chalne wali queries ka live record aur audit history yahan dekhein.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={deleteMongoAuditLogs}
            className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition"
          >
            Clear Query History
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <span>❌</span> {error}
        </div>
      )}

      {/* Advanced Filters & Search Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="Search query, table, or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:bg-white focus:border-gray-400 transition"
          />
        </div>

        {/* Operation Type Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'INSERT', 'UPDATE', 'DELETE', 'DDL', 'OTHER'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                filterType === type
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Unified Query History Stream (Full Width) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-bold text-gray-900">Query History Logs</h3>
          <span className="text-xs text-gray-500 font-medium">
            Showing {filteredAuditHistory.length} of {auditHistory.length} events
          </span>
        </div>

        <div className="space-y-4">
          {historyLoading && auditHistory.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
              <span className="inline-block animate-spin mr-2">⚙️</span> Logs loading ho rahe hain...
            </div>
          ) : filteredAuditHistory.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
              <div className="text-3xl mb-3">📁</div>
              <p className="font-semibold text-gray-700 mb-1">Audit log list khali hai</p>
              <p className="text-sm text-gray-400">
                {searchQuery.trim()
                  ? 'Is filter ke matching koi queries nahi mili.'
                  : 'Awaiting database query executions...'}
              </p>
            </div>
          ) : (
            filteredAuditHistory.map((item) => {
              const hasDiff = item.diff && (item.diff.newData || item.diff.oldData);
              const isExpanded = expandedDiffs[item._id];

              return (
                <div
                  key={item._id}
                  className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${getEventBadge(item.eventType)}`}>
                        {item.eventType}
                      </span>
                      {item.dbUser && (
                        <span className="text-xs text-gray-500 bg-gray-150 px-2 py-0.5 rounded font-mono">
                          👤 {item.dbUser}
                        </span>
                      )}
                      <span className="text-xs font-mono text-gray-400 bg-gray-55 px-2 py-0.5 rounded border border-gray-100">
                        {item.originalType === 'Query Editor' ? 'Query Editor' : `Pos: ${item.pos}`}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 font-medium font-mono">
                      {formatDate(item.timestamp)} {formatTime(item.timestamp)}
                    </div>
                  </div>

                  <pre className="text-sm text-gray-700 font-mono bg-gray-50 px-4 py-3 rounded-lg overflow-x-auto mb-3 border border-gray-100 whitespace-pre-wrap break-all line-clamp-3">
                    {item.statement}
                  </pre>

                  {/* Expandable JSON Diff section */}
                  {hasDiff && (
                    <div className="mb-3 border border-gray-150 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleDiffPanel(item._id)}
                        className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 text-xs font-semibold text-gray-700 flex justify-between items-center transition border-b border-gray-100"
                      >
                        <span>⚙️ JSON Diff Viewer (Table: {item.diff.table})</span>
                        <span>{isExpanded ? '🔼 Hide Diff' : '🔽 Expand Diff'}</span>
                      </button>
                      
                      {isExpanded && (
                        <div className="p-3 bg-white grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          {/* Before Data */}
                          <div className="space-y-1">
                            <span className="font-semibold text-red-600 block">🛑 Before (Old State)</span>
                            <pre className="p-2 bg-red-50 text-red-800 rounded border border-red-100 overflow-x-auto max-h-40 font-mono">
                              {item.diff.oldData ? JSON.stringify(item.diff.oldData, null, 2) : 'NULL'}
                            </pre>
                          </div>

                          {/* After Data */}
                          <div className="space-y-1">
                            <span className="font-semibold text-green-600 block">🟢 After (New State)</span>
                            <pre className="p-2 bg-green-50 text-green-800 rounded border border-green-100 overflow-x-auto max-h-40 font-mono">
                              {item.diff.newData ? JSON.stringify(item.diff.newData, null, 2) : 'NULL'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[11px] text-gray-400">
                    <div>
                      Source: <span className="font-mono text-gray-600">{item.logName || 'Query Editor'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedEvent(item)}
                        className="text-[10px] font-bold text-gray-900 underline hover:text-gray-600"
                      >
                        🔍 View Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal: Event/Query Details Inspector */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Query Details Inspector</h3>
                <span className={`text-[10px] mt-1 px-2.5 py-0.5 rounded-full font-bold border inline-block ${getEventBadge(selectedEvent.eventType)}`}>
                  {selectedEvent.eventType}
                </span>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Code block */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">SQL Statement</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedEvent.statement);
                      alert('SQL statement copied to clipboard!');
                    }}
                    className="text-xs text-gray-900 font-bold underline hover:text-gray-600"
                  >
                    📋 Copy Statement
                  </button>
                </div>
                <pre className="text-sm font-mono text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200 overflow-x-auto whitespace-pre-wrap break-all max-h-60">
                  {selectedEvent.statement}
                </pre>
              </div>

              {/* Metadata parameters */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-gray-400 block font-semibold">SOURCE FILE / TYPE</span>
                  <span className="font-mono text-gray-800 font-semibold">{selectedEvent.logName || 'Query Editor'}</span>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-gray-400 block font-semibold">LOG POSITION</span>
                  <span className="font-mono text-gray-800 font-semibold">{selectedEvent.pos === 0 ? 'N/A' : selectedEvent.pos}</span>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-gray-400 block font-semibold">DATABASE USER</span>
                  <span className="font-mono text-gray-800 font-semibold">{selectedEvent.dbUser || 'unknown'}</span>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-gray-400 block font-semibold">AUDIT TIMESTAMP</span>
                  <span className="text-gray-800 font-semibold">
                    {formatDate(selectedEvent.timestamp)} {formatTime(selectedEvent.timestamp)}
                  </span>
                </div>
              </div>

              {/* JSON Diff if exists */}
              {selectedEvent.diff && (selectedEvent.diff.newData || selectedEvent.diff.oldData) && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    JSON Diff Snapshot (Table: {selectedEvent.diff.table})
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="space-y-1">
                      <span className="font-semibold text-red-600 block">🛑 Before (Old State)</span>
                      <pre className="p-2 bg-red-50 text-red-800 rounded border border-red-150 overflow-x-auto max-h-40 font-mono">
                        {selectedEvent.diff.oldData ? JSON.stringify(selectedEvent.diff.oldData, null, 2) : 'NULL'}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <span className="font-semibold text-green-600 block">🟢 After (New State)</span>
                      <pre className="p-2 bg-green-50 text-green-800 rounded border border-green-150 overflow-x-auto max-h-40 font-mono">
                        {selectedEvent.diff.newData ? JSON.stringify(selectedEvent.diff.newData, null, 2) : 'NULL'}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-lg transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
