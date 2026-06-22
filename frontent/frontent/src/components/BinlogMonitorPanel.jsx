import { useState, useEffect, useRef } from 'react';
import API from '../api/axios';
import { socket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

export default function BinlogMonitorPanel({ connectionId }) {
  const { user: authUser } = useAuth();
  
  // Monitoring States
  const [monitoring, setMonitoring] = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);
  const [auditHistory, setAuditHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Coordinates & Mode
  const [mode, setMode] = useState(''); // 'real' or 'simulation'
  const [logFile, setLogFile] = useState('');
  const [position, setPosition] = useState(null);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  // Stream Control States
  const [isPaused, setIsPaused] = useState(false);
  const [bufferedEvents, setBufferedEvents] = useState([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedDiffs, setExpandedDiffs] = useState({});

  // Refs to avoid stale closures in Socket callbacks
  const isPausedRef = useRef(isPaused);
  const streamContainerRef = useRef(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Connect socket and register listeners
  useEffect(() => {
    socket.connect();
    
    // Join connection room
    socket.emit('join_connection', connectionId);

    const handleBinlogEvents = (data) => {
      const newEvents = data.events || [];
      if (newEvents.length > 0) {
        // Tag events with a local key for rendering
        const formattedEvents = newEvents.map(e => ({
          ...e,
          id: e._id || Math.random().toString(),
          localTimestamp: Date.now() // Track precisely when it arrived on client for visual highlights
        }));

        if (isPausedRef.current) {
          setBufferedEvents(prev => [...formattedEvents, ...prev]);
        } else {
          setLiveEvents(prev => [...formattedEvents, ...prev]);
        }
        
        // Refresh MongoDB history
        fetchAuditHistory();
      }
      
      setLogFile(data.logFile);
      setPosition(data.position);
    };

    const handleBinlogLocation = (data) => {
      setLogFile(data.logFile);
      setPosition(data.position);
    };

    socket.on('binlog_events', handleBinlogEvents);
    socket.on('binlog_location', handleBinlogLocation);

    // Initial audit log fetch
    fetchAuditHistory();

    return () => {
      // Disconnect cleanly and stop monitoring
      socket.emit('stop_binlog_monitoring', { connectionId });
      socket.off('binlog_events', handleBinlogEvents);
      socket.off('binlog_location', handleBinlogLocation);
      socket.disconnect();
      setMonitoring(false);
    };
  }, [connectionId]);

  // Auto-scroll handler
  useEffect(() => {
    if (autoScroll && !isPaused && streamContainerRef.current) {
      streamContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [liveEvents, autoScroll, isPaused]);

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

  const startMonitoring = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await API.post(`/connections/${connectionId}/binlog/start`);
      if (res.data.success) {
        setLogFile(res.data.logFile);
        setPosition(res.data.position);
        setMode(res.data.mode);
        setMonitoring(true);

        // Tell Socket server to spin up the interval loop
        socket.emit('start_binlog_monitoring', {
          connectionId,
          logFile: res.data.logFile,
          position: res.data.position,
          mode: res.data.mode,
          userId: authUser?.id || authUser?._id
        });
      } else {
        setError(res.data.message || 'Failed to start monitoring.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error starting monitoring.');
    } finally {
      setLoading(false);
    }
  };

  const stopMonitoring = () => {
    socket.emit('stop_binlog_monitoring', { connectionId });
    setMonitoring(false);
    setIsPaused(false);
    setBufferedEvents([]);
  };

  const togglePauseStream = () => {
    if (isPaused) {
      // Resume: append buffered events to liveEvents
      setLiveEvents(prev => [...bufferedEvents, ...prev]);
      setBufferedEvents([]);
      setIsPaused(false);
    } else {
      setIsPaused(true);
    }
  };

  const clearCapturedView = () => {
    setLiveEvents([]);
    setBufferedEvents([]);
  };

  const deleteMongoAuditLogs = async () => {
    if (!window.confirm('Kya aap sach mein MongoDB audit trails clear karna chahte hain?')) return;
    try {
      setError('');
      await API.delete(`/connections/${connectionId}/binlog/history`);
      setAuditHistory([]);
    } catch (err) {
      setError('MongoDB audit trail delete nahi hua.');
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
        return 'bg-gray-50 text-gray-700 border-gray-200';
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

  const filteredLiveEvents = liveEvents.filter(matchFilter);
  const filteredAuditHistory = auditHistory.filter(matchFilter);

  return (
    <div className="space-y-6">
      {/* Styles for Visual Highlight Animation */}
      <style>{`
        @keyframes highlightPulse {
          0% { background-color: #fef08a; border-color: #eab308; }
          100% { background-color: #ffffff; border-color: #e5e7eb; }
        }
        .event-card-new {
          animation: highlightPulse 2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
      `}</style>

      {/* Top Banner and Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">📡 Binlog Monitor</h2>
            {monitoring ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse"></span>
                Monitoring Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-full text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                Stopped
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            WebSockets ke jariye MySQL binary logs stream karein aur aur JSON diffs check karein.
          </p>

          {/* Coordinates metadata */}
          {monitoring && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 w-fit">
              <div><span className="text-gray-400">File:</span> {logFile}</div>
              <div><span className="text-gray-400">Position:</span> {position}</div>
              <div>
                <span className="text-gray-400">Mode:</span>{' '}
                <span className={mode === 'real' ? 'text-blue-600 font-bold' : 'text-orange-600 font-bold'}>
                  {mode === 'real' ? 'Real Binlog' : 'Simulation'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {monitoring ? (
            <>
              {/* Play/Pause controls */}
              <button
                onClick={togglePauseStream}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition border ${
                  isPaused 
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {isPaused ? `▶ Resume Stream (${bufferedEvents.length})` : '⏸ Pause Stream'}
              </button>

              <button
                onClick={stopMonitoring}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition"
              >
                Stop Monitoring
              </button>
            </>
          ) : (
            <button
              onClick={startMonitoring}
              disabled={loading}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition"
            >
              {loading ? 'Starting...' : 'Start Monitoring'}
            </button>
          )}

          <button
            onClick={clearCapturedView}
            className="px-4 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg transition"
          >
            Clear Screen
          </button>
          
          <button
            onClick={deleteMongoAuditLogs}
            className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition"
          >
            Clear Audit History
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
            placeholder="Search query, table name, or DB user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:bg-white focus:border-gray-400 transition"
          />
        </div>

        {/* Operation Type Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'INSERT', 'UPDATE', 'DELETE', 'DDL'].map((type) => (
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

        {/* Auto-scroll Toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="autoscroll-toggle"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="w-4 h-4 text-gray-900 bg-gray-100 border-gray-300 rounded focus:ring-gray-900 cursor-pointer"
          />
          <label htmlFor="autoscroll-toggle" className="text-xs font-semibold text-gray-600 select-none cursor-pointer">
            Auto-scroll newest to top
          </label>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column: Live Captured events stream (60% width) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-md font-bold text-gray-900 flex items-center gap-2">
              Live Captured Stream
              {isPaused && (
                <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded font-normal animate-pulse">
                  Paused ({bufferedEvents.length} updates buffered)
                </span>
              )}
            </h3>
            <span className="text-xs text-gray-500 font-medium">
              Showing {filteredLiveEvents.length} of {liveEvents.length} events
            </span>
          </div>

          <div
            ref={streamContainerRef}
            className="space-y-4 max-h-[600px] overflow-y-auto pr-2"
          >
            {filteredLiveEvents.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
                <div className="text-3xl mb-3">📡</div>
                <p className="font-semibold text-gray-700 mb-1">Live updates stream is empty</p>
                <p className="text-sm text-gray-400">
                  {monitoring 
                    ? 'Active state matching search filter nahi mila. DB write check karein...'
                    : '"Start Monitoring" select karein live logs verify karne ke liye.'}
                </p>
              </div>
            ) : (
              filteredLiveEvents.map((item) => {
                const isNew = Date.now() - item.localTimestamp < 3000;
                const hasDiff = item.diff && (item.diff.newData || item.diff.oldData);
                const isExpanded = expandedDiffs[item.id];
                
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition ${
                      isNew ? 'event-card-new' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${getEventBadge(item.eventType)}`}>
                          {item.eventType}
                        </span>
                        <span className="text-xs font-mono font-semibold text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                          Pos: {item.pos}
                        </span>
                        {item.dbUser && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-mono">
                            👤 {item.dbUser}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 font-medium">
                        {formatTime(item.timestamp)}
                      </div>
                    </div>

                    <pre className="text-sm text-gray-700 font-mono bg-gray-50 px-4 py-3 rounded-lg overflow-x-auto mb-3 border border-gray-100 whitespace-pre-wrap break-all">
                      {item.statement}
                    </pre>

                    {/* Expandable JSON Diff section */}
                    {hasDiff && (
                      <div className="mb-3 border border-gray-150 rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleDiffPanel(item.id)}
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
                        Log File: <span className="font-mono text-gray-600">{item.logName}</span>
                      </div>
                      {item.user && (
                        <div>
                          Auditor: <span className="font-medium text-gray-600">{item.user.name || item.user.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: MongoDB Audit Logs (40% width) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-md font-bold text-gray-900">MongoDB Audit Trail</h3>
            <span className="text-xs text-gray-500 font-medium">Saved Database History</span>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="max-h-[600px] overflow-y-auto">
              {historyLoading && auditHistory.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  Audit logs load ho rahe hain...
                </div>
              ) : filteredAuditHistory.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="text-2xl mb-2">📁</div>
                  <p className="font-medium text-gray-700">Audit trail khali hai</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {searchQuery.trim()
                      ? 'No history matches selected filter.'
                      : 'MongoDB database mein koi history saved nahi hai.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredAuditHistory.map((item) => (
                    <div key={item._id} className="p-4 hover:bg-gray-50 transition">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getEventBadge(item.eventType)}`}>
                            {item.eventType}
                          </span>
                          {item.dbUser && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 font-mono px-1 rounded">
                              {item.dbUser}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono">
                          {formatDate(item.timestamp)} {formatTime(item.timestamp)}
                        </div>
                      </div>

                      <p className="text-xs font-mono text-gray-700 line-clamp-2 bg-gray-50 p-2 rounded mb-2 border border-gray-50 break-all">
                        {item.statement}
                      </p>

                      {/* Display table name in Diffs for history */}
                      {item.diff && item.diff.table && (
                        <div className="mb-2 text-[10px] text-gray-500">
                          🎯 Table: <span className="font-mono font-semibold">{item.diff.table}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <div>
                          Pos: <span className="font-mono">{item.pos}</span>
                        </div>
                        {item.user && (
                          <div className="truncate max-w-[120px]">
                            👤 {item.user.name || item.user.email}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
