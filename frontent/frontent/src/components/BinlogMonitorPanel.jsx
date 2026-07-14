import { useState, useEffect, Fragment } from 'react';
import API from '../api/axios';
import { socket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';

export default function BinlogMonitorPanel({ connectionId, database, connectionType }) {
  const { user: authUser } = useAuth();
  
  // State Variables
  const [auditHistory, setAuditHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  
  // Coordinates & Mode (from backend poller)
  const [mode, setMode] = useState(''); // 'real' or 'simulation'
  const [logFile, setLogFile] = useState('');
  const [position, setPosition] = useState(null);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('ALL'); // 'ALL', '1hour', '3hour', '6hour', '12hour', '24hour', '1month', '3month', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Interactive UI States
  const [selectedEvent, setSelectedEvent] = useState(null); // Details Inspector Modal
  const [expandedDiffs, setExpandedDiffs] = useState({});

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, timeFilter]);

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
      const params = {};
      if (timeFilter !== 'ALL') {
        params.timeFilter = timeFilter;
        if (timeFilter === 'custom') {
          if (customStartDate) params.startDate = customStartDate;
          if (customEndDate) params.endDate = customEndDate;
        }
      }
      const res = await API.get(`/connections/${connectionId}/binlog/history`, { params });
      setAuditHistory(res.data.history || []);
    } catch (err) {
      console.error('History fetch failed:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditHistory();
  }, [timeFilter, customStartDate, customEndDate, connectionId]);

  const deleteMongoAuditLogs = async () => {
    if (!window.confirm('Are you sure you want to clear the database query history?')) return;
    try {
      setError('');
      await API.delete(`/connections/${connectionId}/binlog/history`);
      setAuditHistory([]);
    } catch (err) {
      setError('Failed to clear database query history.');
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

  const getGraphData = () => {
    const groups = {};
    const sortedEvents = [...filteredAuditHistory].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    sortedEvents.forEach(event => {
      const date = new Date(event.timestamp);
      let key = '';
      
      if (timeFilter === '1month' || timeFilter === '3month') {
        key = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      } else if (timeFilter === 'custom') {
        const diffMs = customEndDate && customStartDate 
          ? new Date(customEndDate) - new Date(customStartDate) 
          : 0;
        if (diffMs > 3 * 24 * 60 * 60 * 1000) {
          key = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        } else {
          key = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } else {
        key = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      
      if (!groups[key]) {
        groups[key] = { name: key, INSERT: 0, UPDATE: 0, DELETE: 0, DDL: 0, OTHER: 0 };
      }
      
      const type = event.eventType;
      if (groups[key][type] !== undefined) {
        groups[key][type] += 1;
      } else {
        groups[key]['OTHER'] += 1;
      }
    });
    
    return Object.values(groups);
  };

  // Client-Side Filtering logic
  const matchFilter = (item) => {
    // 0. Database filter
    if (database) {
      const itemDb = item.diff && item.diff.database;
      if (itemDb && itemDb.toLowerCase() !== database.toLowerCase()) {
        return false;
      }
    }

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

  // Paginate items
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredAuditHistory.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredAuditHistory.length / itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Top Banner and Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">📡 {connectionType === 'mongodb' ? 'Oplog' : (connectionType === 'postgresql' ? 'WAL' : 'Binlog')} Query History & Logs</h2>
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
            View the live record and audit history of queries executed on this database here.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition flex items-center gap-1.5"
          >
            <span>❓</span> {showHelp ? 'Hide Info' : `What is ${connectionType === 'mongodb' ? 'Oplog?' : (connectionType === 'postgresql' ? 'WAL?' : 'Binlog?')}`}
          </button>
          <button
            onClick={deleteMongoAuditLogs}
            className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition"
          >
            Clear Query History
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm animate-fadeIn">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">💡</span>
              <h3 className="text-md font-bold text-gray-900">
                What is {connectionType === 'mongodb' ? 'MongoDB Operations Log (oplog)' : (connectionType === 'postgresql' ? 'PostgreSQL Write-Ahead Log (WAL)' : 'MySQL Binary Log (binlog)')}?
              </h3>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="text-gray-400 hover:text-gray-600 text-sm font-semibold"
            >
              Close
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mt-2">
            <div className="bg-white p-4 rounded-lg border border-gray-150 shadow-xs flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔄</span>
                <h4 className="font-semibold text-gray-800">1. Replication (Server Sync)</h4>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {connectionType === 'mongodb'
                  ? 'The primary replica database node writes changes to oplogs, which are read by secondary nodes to keep all cluster nodes in sync.'
                  : (connectionType === 'postgresql'
                    ? 'PostgreSQL WAL files are streamed to replicas to update rows and schemas asynchronously, maintaining secondary nodes in sync.'
                    : 'The source database server (Master) sends its changes to copy servers (Slaves) via binlogs, keeping all servers synced.')}
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg border border-gray-150 shadow-xs flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <h4 className="font-semibold text-gray-800">2. Disaster Recovery</h4>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {connectionType === 'mongodb'
                  ? 'Oplogs act as a rolling buffer. In case of node failures, replication resume, or recovery, MongoDB replays the oplog to recover state.'
                  : (connectionType === 'postgresql'
                    ? 'WAL files record all transactions prior to committing, enabling crash recovery and rollbacks to avoid data corruption.'
                    : 'If a table is accidentally deleted, you can restore a backup and replay binlog events to recover the database state.')}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-150 shadow-xs flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <h4 className="font-semibold text-gray-800">3. Audit & Change Tracking</h4>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {connectionType === 'mongodb'
                  ? 'The oplog captures all database mutations in a capped collection, providing a live stream of every insert, update, and delete.'
                  : (connectionType === 'postgresql'
                    ? 'The WAL logs logical page and row changes, allowing logical replication streams to capture data changes in real-time.'
                    : 'The binlog records which query ran, when it ran, and which connection user ran it, allowing detailed change auditing.')}
              </p>
            </div>
          </div>
          
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs text-gray-600 flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <span>
              <strong>Is App Mein Use:</strong> {connectionType === 'mongodb'
                ? 'We stream the MongoDB oplog/change history live so you can track mutations, updates, and collection audits in real-time.'
                : (connectionType === 'postgresql'
                  ? 'We monitor the PostgreSQL WAL modifications in real-time to show you dynamic updates and transaction audit logs.'
                  : 'We listen to the MySQL binlog live so you can dynamically monitor data changes and audit trails in real-time.')}
            </span>
          </div>
        </div>
      )}

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

      {/* Date/Time Filter Panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Time Filter:</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'All Time', value: 'ALL' },
                { label: '1 Hour', value: '1hour' },
                { label: '3 Hours', value: '3hour' },
                { label: '6 Hours', value: '6hour' },
                { label: '12 Hours', value: '12hour' },
                { label: '24 Hours', value: '24hour' },
                { label: '1 Month', value: '1month' },
                { label: '3 Months', value: '3month' },
                { label: 'Custom Range', value: 'custom' }
              ].map((rangeOpt) => (
                <button
                  key={rangeOpt.value}
                  onClick={() => setTimeFilter(rangeOpt.value)}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition ${
                    timeFilter === rangeOpt.value
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {rangeOpt.label}
                </button>
              ))}
            </div>
          </div>

          {timeFilter === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200/50">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Start:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase">End:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Activity Graph */}
      {filteredAuditHistory && filteredAuditHistory.length > 0 && (() => {
        const graphData = getGraphData();
        if (graphData.length === 0) return null;
        return (
          <div className="bg-white rounded-2xl border border-gray-250 p-5 shadow-xs">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              📊 Query Activity Distribution ({timeFilter === 'ALL' ? 'All Time' : (timeFilter === 'custom' ? 'Custom Range' : timeFilter)})
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={graphData}>
                <defs>
                  <linearGradient id="colorInsert" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorUpdate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDelete" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', fontSize: '10px', color: '#111827' }}
                  itemStyle={{ fontSize: '11px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
                <Area
                  type="monotone"
                  dataKey="INSERT"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorInsert)"
                  name="Inserts"
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="UPDATE"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorUpdate)"
                  name="Updates"
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="DELETE"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorDelete)"
                  name="Deletes"
                  stackId="1"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

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
              <span className="inline-block animate-spin mr-2">⚙️</span> Logs are loading...
            </div>
          ) : filteredAuditHistory.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
              <div className="text-3xl mb-3">📁</div>
              <p className="font-semibold text-gray-700 mb-1">Audit log list is empty</p>
              <p className="text-sm text-gray-400">
                {searchQuery.trim()
                  ? 'No queries found matching this filter.'
                  : 'Awaiting database query executions...'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="max-h-[700px] overflow-y-auto">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50 z-10">
                        <th className="px-6 py-3.5">Event Type</th>
                        <th className="px-6 py-3.5">DB User</th>
                        <th className="px-6 py-3.5">{connectionType === 'mongodb' ? 'Mongo Statement' : 'SQL Query'}</th>
                        <th className="px-6 py-3.5">Position / Source</th>
                        <th className="px-6 py-3.5">Timestamp</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                      {currentItems.map((item) => {
                        const hasDiff = item.diff && (item.diff.newData || item.diff.oldData);
                        const isExpanded = expandedDiffs[item._id];

                        return (
                          <Fragment key={item._id}>
                            <tr className="hover:bg-gray-50/50 transition align-middle">
                              <td className="px-6 py-4">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getEventBadge(item.eventType)}`}>
                                  {item.eventType}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {item.dbUser ? (
                                  <span className="text-[11px] bg-gray-100 text-gray-600 font-mono px-1.5 py-0.5 rounded">
                                    👤 {item.dbUser}
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-mono text-gray-400">unknown</span>
                                )}
                              </td>
                              <td className="px-6 py-4 max-w-xl">
                                <div
                                  onClick={() => setSelectedEvent(item)}
                                  title="Click to view details"
                                  className="font-mono text-xs text-gray-700 bg-gray-50 p-2 rounded border border-gray-100 cursor-pointer hover:bg-gray-100 hover:border-gray-200 transition break-all line-clamp-2"
                                >
                                  {item.statement}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1 text-[10px] font-mono text-gray-500">
                                  <span className="text-gray-700 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-150 w-fit whitespace-nowrap">
                                    {item.originalType === 'Query Editor' ? 'Query Editor' : `Pos: ${item.pos}`}
                                  </span>
                                  <span className="text-gray-400 truncate max-w-[150px]" title={item.logName || 'Query Editor'}>
                                    {item.logName || 'Query Editor'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-xs text-gray-500 font-mono flex flex-col">
                                  <span className="font-semibold text-gray-700">{formatTime(item.timestamp)}</span>
                                  <span className="text-[10px] text-gray-400">{formatDate(item.timestamp)}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-2">
                                  {hasDiff && (
                                    <button
                                      onClick={() => toggleDiffPanel(item._id)}
                                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded border border-gray-200 transition flex items-center gap-1"
                                    >
                                      <span>{isExpanded ? '🔼 Hide' : '🔽 Diff'}</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setSelectedEvent(item)}
                                    className="px-2 py-1 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded transition"
                                  >
                                    Details
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {hasDiff && isExpanded && (
                              <tr className="bg-gray-50/30">
                                <td colSpan={6} className="px-6 py-4 border-t border-gray-100 bg-gray-50/20">
                                  <div className="p-3 bg-white border border-gray-150 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-3 text-xs shadow-sm">
                                    {/* Before Data */}
                                    <div className="space-y-1">
                                      <span className="font-semibold text-red-600 block text-[10px] uppercase tracking-wider">🛑 Before (Old State) - Table: {item.diff.table}</span>
                                      <pre className="p-2.5 bg-red-50/50 text-red-800 rounded border border-red-100 overflow-x-auto max-h-40 font-mono text-[11px]">
                                        {item.diff.oldData ? JSON.stringify(item.diff.oldData, null, 2) : 'NULL'}
                                      </pre>
                                    </div>

                                    {/* After Data */}
                                    <div className="space-y-1">
                                      <span className="font-semibold text-green-600 block text-[10px] uppercase tracking-wider">🟢 After (New State) - Table: {item.diff.table}</span>
                                      <pre className="p-2.5 bg-green-50/50 text-green-800 rounded border border-green-100 overflow-x-auto max-h-40 font-mono text-[11px]">
                                        {item.diff.newData ? JSON.stringify(item.diff.newData, null, 2) : 'NULL'}
                                      </pre>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-gray-200 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-xs font-bold disabled:opacity-50 transition"
                  >
                    ← Previous
                  </button>
                  <span className="text-xs text-gray-500 font-bold">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 border border-gray-200 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-xs font-bold disabled:opacity-50 transition"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
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
                <h3 className="text-lg font-bold text-gray-900">
                  {connectionType === 'mongodb' ? 'Oplog Document Inspector' : 'Query Details Inspector'}
                </h3>
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
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {connectionType === 'mongodb' ? 'Mongo Statement' : 'SQL Statement'}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedEvent.statement);
                      alert(connectionType === 'mongodb' ? 'Mongo statement copied to clipboard!' : 'SQL statement copied to clipboard!');
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
                    JSON Diff Snapshot ({connectionType === 'mongodb' ? 'Collection' : 'Table'}: {selectedEvent.diff.table})
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
