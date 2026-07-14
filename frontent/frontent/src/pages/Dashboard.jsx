import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import SystemAuditLogsPanel from '../components/SystemAuditLogsPanel';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);


  const [selectedDevs, setSelectedDevs] = useState({});
  const [todayQueries, setTodayQueries] = useState({});
  const [queriesLoading, setQueriesLoading] = useState({});
  const [viewingQuery, setViewingQuery] = useState(null);
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const [activeTab, setActiveTab] = useState('connections');
  const [allConnections, setAllConnections] = useState([]);
  const [loadingAllConnections, setLoadingAllConnections] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedUserFilter, setSelectedUserFilter] = useState('all');
  const [subTab, setSubTab] = useState('queries');
  const [procedureAudits, setProcedureAudits] = useState([]);
  const [loadingProcedures, setLoadingProcedures] = useState(false);
  const [expandedAuditId, setExpandedAuditId] = useState(null);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharingConn, setSharingConn] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchConnections();
  }, [user]);



  const fetchConnections = async () => {
    try {
      const res = await API.get('/connections');
      setConnections(res.data.connections);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivity = async () => {
    setLoadingActivity(true);
    try {
      const res = await API.get('/history/all');
      setActivityLogs(res.data.history || []);
    } catch (err) {
      console.error('Error fetching activity:', err);
    } finally {
      setLoadingActivity(false);
    }
  };

  const fetchProcedureAudits = async () => {
    setLoadingProcedures(true);
    try {
      const res = await API.get('/history/procedure-audit');
      setProcedureAudits(res.data.audits || []);
    } catch (err) {
      console.error('Error fetching procedure audits:', err);
    } finally {
      setLoadingProcedures(false);
    }
  };

  const fetchAllConnections = async () => {
    setLoadingAllConnections(true);
    try {
      if (user?.role === 'admin') {
        const res = await API.get('/connections/all');
        setAllConnections(res.data.connections || []);
      } else {
        const res = await API.get('/connections');
        setAllConnections(res.data.connections || []);
      }
    } catch (err) {
      console.error('Error fetching all connections:', err);
    } finally {
      setLoadingAllConnections(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'activity') {
      if (subTab === 'queries') {
        fetchActivity();
      } else {
        fetchProcedureAudits();
      }
    } else if (activeTab === 'all-connections') {
      fetchAllConnections();
    }
  }, [activeTab, subTab, user]);

  const isToday = (dateString) => {
    const today = new Date();
    const date = new Date(dateString);
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const formatDateTime = (dateString) => {
    return formatDateDayTime(dateString);
  };

  const exportQueriesToCSV = () => {
    const logsToExport = activityLogs.filter(log => selectedUserFilter === 'all' || log.user?._id === selectedUserFilter);
    if (logsToExport.length === 0) {
      alert('No records available to export!');
      return;
    }
    const headers = ['User Name', 'Email', 'Role', 'Status', 'Execution Time (ms)', 'Query', 'Rows Affected', 'Timestamp'];
    const rows = logsToExport.map(log => [
      log.user?.name || 'Unknown',
      log.user?.email || 'N/A',
      log.user?.role || 'user',
      log.status || 'success',
      log.executionTime || 0,
      `"${(log.query || '').replace(/"/g, '""')}"`,
      log.rowsAffected !== undefined ? log.rowsAffected : 0,
      new Date(log.createdAt).toLocaleString('en-IN')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `activity_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const exportProceduresToCSV = () => {
    if (procedureAudits.length === 0) {
      alert('No records available to export!');
      return;
    }
    const headers = ['User Name', 'Email', 'Role', 'Host/IP', 'Database/Schema', 'Procedure Name', 'Operation', 'SQL Text', 'Timestamp'];
    const rows = procedureAudits.map(audit => [
      audit.user?.name || 'Unknown',
      audit.user?.email || 'N/A',
      audit.user?.role || 'user',
      audit.host || 'N/A',
      audit.databaseName || 'N/A',
      audit.procedureName || 'N/A',
      audit.operation || 'N/A',
      `"${(audit.sqlText || '').replace(/"/g, '""')}"`,
      new Date(audit.createdAt).toLocaleString('en-IN')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `procedure_audits_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDevChange = async (connId, userId) => {
    setSelectedDevs(prev => ({ ...prev, [connId]: userId }));
    if (!userId) {
      setTodayQueries(prev => ({ ...prev, [connId]: [] }));
      return;
    }

    setQueriesLoading(prev => ({ ...prev, [connId]: true }));
    try {
      const res = await API.get(`/history/today?connectionId=${connId}&userId=${userId}`);
      setTodayQueries(prev => ({ ...prev, [connId]: res.data.queries || [] }));
    } catch (err) {
      console.error('Error fetching today queries:', err);
    } finally {
      setQueriesLoading(prev => ({ ...prev, [connId]: false }));
    }
  };

  const handleViewQuery = (q) => {
    setViewingQuery(q);
    setShowQueryModal(true);
  };

  const handleCopyQuery = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDateDayTime = (dateString) => {
    const date = new Date(dateString);
    const dayName = date.toLocaleDateString('en-IN', { weekday: 'short' });
    const dateFormatted = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const timeFormatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dayName}, ${dateFormatted} ${timeFormatted}`;
  };

  const handleOpenShareModal = async (conn) => {
    setSharingConn(conn);
    setShareModalOpen(true);
    setShareError('');
    setShareSuccess('');
    setSelectedUserIds([]);
    try {
      const res = await API.get(`/connections/${conn._id}/share`);
      setUsersList(res.data.users);
      setSelectedUserIds(res.data.allowedUsers);
    } catch (err) {
      setShareError('Failed to load sharing details.');
    }
  };

  const handleToggleUser = (userId) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleSaveShare = async () => {
    setShareLoading(true);
    setShareError('');
    setShareSuccess('');
    try {
      await API.put(`/connections/${sharingConn._id}/share`, {
        developerIds: selectedUserIds
      });
      setShareSuccess('Access updated successfully!');
      fetchConnections();
      setTimeout(() => setShareModalOpen(false), 1000);
    } catch (err) {
      setShareError(err.response?.data?.message || 'Failed to update access.');
    } finally {
      setShareLoading(false);
    }
  };



  const getTypeIcon = (type) => {
    if (type === 'mysql') return '🐬';
    if (type === 'postgresql') return '🐘';
    if (type === 'mongodb') return '🍃';
    return '🗄️';
  };

  const getTypeBadgeColor = (type) => {
    if (type === 'mysql') return 'bg-teal-50 text-teal-700 ring-1 ring-teal-200';
    if (type === 'postgresql') return 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200';
    if (type === 'mongodb') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
    return 'bg-stone-100 text-stone-600 ring-1 ring-stone-200';
  };

  const mysqlCount = connections.filter(c => c.type === 'mysql').length;
  const pgCount = connections.filter(c => c.type === 'postgresql').length;
  const mongoCount = connections.filter(c => c.type === 'mongodb').length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center bg-white/70 backdrop-blur-sm rounded-2xl px-10 py-8">
          <div className="w-10 h-10 border-[3px] border-teal-100 border-t-teal-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-teal-700 text-sm font-medium">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <Navbar variant="teal" />

      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">

        {/* Header */}
        <div className="mb-7">
          <h2 className="text-[26px] font-bold text-teal-900 tracking-tight">Dashboard</h2>
          <p className="text-[13px] text-teal-800/70 mt-1">
            Welcome back, <span className="font-semibold text-teal-900">{user?.name}</span> — here's what's happening across your databases.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="mb-7 bg-gray-50/90 border border-gray-200 rounded-2xl p-5 shadow-md">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-4 rounded-full" style={{ backgroundColor: '#0d9da4' }}></div>
            <h3 className="text-[12px] font-bold text-teal-700 uppercase tracking-wider">Quick Actions</h3>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => setActiveTab('connections')}
              className={`px-4 py-2 text-[13px] rounded-lg transition-all flex items-center gap-2 font-semibold ${
                activeTab === 'connections'
                  ? 'text-white shadow-sm'
                  : 'ring-1 ring-teal-200 text-teal-700 bg-white hover:bg-teal-50'
              }`}
              style={activeTab === 'connections' ? { backgroundColor: '#0d9da4' } : {}}
            >
              <span className="text-base leading-none">🗄️</span> Connections
            </button>

            <button
              onClick={() => setActiveTab('all-connections')}
              className={`px-4 py-2 text-[13px] rounded-lg transition-all flex items-center gap-2 font-semibold ${
                activeTab === 'all-connections'
                  ? 'text-white shadow-sm'
                  : 'ring-1 ring-teal-200 text-teal-700 bg-white hover:bg-teal-50'
              }`}
              style={activeTab === 'all-connections' ? { backgroundColor: '#0d9da4' } : {}}
            >
              <span className="text-base leading-none">🔌</span> App Overview
            </button>

            {user?.role === 'admin' && (
              <button
                onClick={() => setActiveTab('audit-logs')}
                className={`px-4 py-2 text-[13px] rounded-lg transition-all flex items-center gap-2 font-semibold ${
                  activeTab === 'audit-logs'
                    ? 'text-white shadow-sm'
                    : 'ring-1 ring-teal-200 text-teal-700 bg-white hover:bg-teal-50'
                }`}
                style={activeTab === 'audit-logs' ? { backgroundColor: '#0d9da4' } : {}}
              >
                <span className="text-base leading-none">📜</span> System Audit Logs
              </button>
            )}

            <div className="w-px h-6 bg-teal-200 mx-1 self-center hidden sm:block"></div>

            <button
              onClick={() => navigate('/connections')}
              className="px-4 py-2 ring-1 ring-teal-200 text-teal-700 bg-white text-[13px] rounded-lg hover:bg-teal-50 transition-all flex items-center gap-2 font-semibold"
            >
              <span className="text-base leading-none">⚙️</span> Manage Connections
            </button>
            {user?.role === 'admin' && (
              <button
                onClick={() => navigate('/permissions')}
                className="px-4 py-2 ring-1 ring-teal-200 text-teal-700 bg-white text-[13px] rounded-lg hover:bg-teal-50 transition-all flex items-center gap-2 font-semibold"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Permissions
              </button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {activeTab === 'connections' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
            <div className="bg-gray-50/90 border border-gray-200 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg ring-1 ring-teal-100" style={{ backgroundColor: '#e3f6f6' }}>🐬</div>
                <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">MySQL</span>
              </div>
              <p className="text-[28px] font-bold tracking-tight leading-none" style={{ color: '#0d9da4' }}>{mysqlCount}</p>
              <p className="text-[12px] text-teal-700/60 mt-1.5">Active connections</p>
            </div>

            <div className="bg-gray-50/90 border border-gray-200 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg ring-1 ring-cyan-100 bg-cyan-50">🐘</div>
                <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider">Postgres</span>
              </div>
              <p className="text-[28px] font-bold text-cyan-700 tracking-tight leading-none">{pgCount}</p>
              <p className="text-[12px] text-teal-700/60 mt-1.5">Active connections</p>
            </div>

            <div className="bg-gray-50/90 border border-gray-200 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg ring-1 ring-amber-100" style={{ backgroundColor: '#fdf6d8' }}>🍃</div>
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">MongoDB</span>
              </div>
              <p className="text-[28px] font-bold text-amber-700 tracking-tight leading-none">{mongoCount}</p>
              <p className="text-[12px] text-teal-700/60 mt-1.5">Active connections</p>
            </div>
          </div>
        )}

        {/* Main Content Box */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-lg">
          <div className="px-6 border-b border-teal-100 bg-teal-50/40 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-[14px] font-bold text-teal-900 py-4 tracking-tight">
              {activeTab === 'all-connections'
                ? 'App Connections — Admin View'
                : activeTab === 'audit-logs'
                ? 'System Activity Audit Trail — Admin View'
                : 'Your Connections'}
            </h3>

            {activeTab === 'connections' && connections.length > 0 && (
              <span className="text-[11px] font-bold text-teal-700 bg-white ring-1 ring-teal-200 px-2.5 py-1 rounded-full my-3">
                {connections.length} connections
              </span>
            )}

            {activeTab === 'all-connections' && allConnections.length > 0 && (
              <span className="text-[11px] font-bold text-teal-700 bg-white ring-1 ring-teal-200 px-2.5 py-1 rounded-full my-3">
                {allConnections.length} total
              </span>
            )}
          </div>

          {/* Tab Contents */}
          <div className="divide-y divide-teal-50">
            {activeTab === 'connections' && (
              connections.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-4xl mb-4">🗄️</p>
                  <p className="text-teal-900 font-semibold mb-1.5">No connections yet</p>
                  <p className="text-teal-700/60 text-[13px] mb-6">Connect your first database to get started</p>
                  <button
                    onClick={() => navigate('/connections')}
                    className="px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-sm"
                    style={{ backgroundColor: '#0d9da4' }}
                  >
                    + Add Connection
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-6 bg-teal-50/20">
                  {connections.map(conn => (
                    <div
                      key={conn._id}
                      className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4 shadow-md hover:shadow-lg transition-all duration-200"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg ring-1 ring-teal-100 flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: '#f0f9f7' }}>
                            {getTypeIcon(conn.type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap text-left">
                              <p className="text-[14px] font-bold text-teal-900">{conn.name}</p>
                              {conn.user && conn.user._id !== user?.id && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                                  Shared by {conn.user.name}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-teal-700/60 text-left mt-0.5 font-mono">
                              {conn.type === 'mongodb'
                                ? 'MongoDB'
                                : `${conn.host}:${conn.port}${conn.database ? ' / ' + conn.database : ''}`
                              }
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${getTypeBadgeColor(conn.type)}`}>
                            {conn.type}
                          </span>
                          {(user?.role === 'admin' || !conn.user || conn.user._id === user?.id) && (
                            <button
                              onClick={() => handleOpenShareModal(conn)}
                              className="px-2.5 py-1.5 ring-1 ring-teal-200 text-teal-700 text-[12px] rounded-lg hover:bg-teal-50 transition-all flex items-center gap-1 font-semibold"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                              </svg>
                              Share
                            </button>
                          )}
                          <button
                            onClick={() => {
                              navigate(`/connections/${conn._id}`);
                            }}
                            className="px-3.5 py-1.5 text-white text-[12px] rounded-lg hover:opacity-90 transition-opacity font-semibold flex items-center gap-1 shadow-sm"
                            style={{ backgroundColor: '#0d9da4' }}
                          >
                            Open
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {activeTab === 'all-connections' && (
              loadingAllConnections ? (
                <div className="p-16 text-center">
                  <div className="w-8 h-8 border-[3px] border-teal-100 border-t-teal-600 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-teal-700/60 text-[13px]">Fetching app connections…</p>
                </div>
              ) : allConnections.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-4xl mb-4">🔌</p>
                  <p className="text-teal-900 font-semibold mb-1.5">No connections found</p>
                  <p className="text-teal-700/60 text-[13px]">No application connections are linked yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto text-left">
                  <table className="w-full text-sm">
                    <thead className="bg-teal-50/60 border-b border-teal-100 text-left text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Connection</th>
                        <th className="px-6 py-3.5">Type</th>
                        <th className="px-6 py-3.5">Database</th>
                        <th className="px-6 py-3.5">Host / String</th>
                        <th className="px-6 py-3.5">Created By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-teal-50 bg-white">
                      {allConnections.map(conn => (
                        <tr key={conn._id} className="hover:bg-teal-50/40 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-[13px] font-bold text-teal-900">{conn.name}</p>
                            <p className="text-[11px] text-teal-700/50 font-mono">{conn._id}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${getTypeBadgeColor(conn.type)}`}>
                              {getTypeIcon(conn.type)} {conn.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-[13px] text-teal-800 font-semibold">
                            {conn.database || <span className="text-teal-700/40 italic font-normal">None</span>}
                          </td>
                          <td className="px-6 py-4 text-[11px] font-mono text-teal-700/60 max-w-xs truncate">
                            {conn.type === 'mongodb'
                              ? conn.connectionString
                              : `${conn.host}:${conn.port}`
                            }
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm" style={{ backgroundColor: '#0d9da4' }}>
                                {conn.user?.name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div>
                                <p className="text-[12px] font-bold text-teal-900">{conn.user?.name || 'Unknown'}</p>
                                <p className="text-[10px] text-teal-700/50">{conn.user?.email || 'N/A'}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {activeTab === 'audit-logs' && user?.role === 'admin' && (
              <div className="p-6 bg-teal-50/20">
                <SystemAuditLogsPanel />
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Query Detail Modal */}
      {showQueryModal && viewingQuery && (
        <div className="fixed inset-0 bg-teal-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl ring-1 ring-teal-100 shadow-2xl w-full max-w-full h-full max-h-full sm:w-[560px] sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden animate-fadeIn text-left">

            <div className="px-6 py-4 border-b border-teal-100 bg-teal-50/60 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-[15px] font-bold text-teal-900">
                  Full SQL Query
                </h3>
                <p className="text-[12px] text-teal-700/60 mt-0.5">
                  Executed by <span className="font-semibold text-teal-800">{viewingQuery.user?.name}</span> · {formatDateDayTime(viewingQuery.createdAt)}
                </p>
              </div>
              <button
                onClick={() => { setShowQueryModal(false); setViewingQuery(null); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-teal-500 hover:text-teal-800 hover:bg-teal-100 transition-colors text-lg font-medium"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto flex flex-col">
              <div className="relative group flex-1 flex flex-col min-h-[150px]">
                <div className="absolute top-2 right-2 opacity-90 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={() => handleCopyQuery(viewingQuery.query)}
                    className="px-2.5 py-1.5 bg-teal-800 hover:bg-teal-700 text-white rounded-md text-[10px] font-bold flex items-center gap-1 ring-1 ring-teal-700 transition active:scale-95 shadow"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <div className="bg-teal-950 text-teal-50 rounded-lg p-4 pt-10 font-mono text-[12px] overflow-auto whitespace-pre-wrap flex-1 ring-1 ring-teal-800 leading-relaxed">
                  {viewingQuery.query}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[12px] shrink-0">
                <div className="bg-teal-50/60 ring-1 ring-teal-100 rounded-xl p-3.5 flex flex-col justify-between">
                  <span className="text-teal-600 block font-bold uppercase tracking-wider text-[10px]">Status</span>
                  <span className={`font-bold mt-1.5 text-[14px] ${viewingQuery.status === 'success' ? 'text-teal-600' : 'text-rose-500'}`}>
                    {viewingQuery.status === 'success' ? '● Success' : '● Failed'}
                  </span>
                </div>

                <div className="bg-teal-50/60 ring-1 ring-teal-100 rounded-xl p-3.5 flex flex-col justify-between">
                  <span className="text-teal-600 block font-bold uppercase tracking-wider text-[10px]">Execution Speed</span>
                  <span className="text-teal-900 font-bold mt-1.5 text-[14px]">
                    {viewingQuery.executionTime} ms
                  </span>
                </div>

                <div className="bg-teal-50/60 ring-1 ring-teal-100 rounded-xl p-3.5 flex flex-col justify-between">
                  <span className="text-teal-600 block font-bold uppercase tracking-wider text-[10px]">Rows Affected</span>
                  <span className="text-teal-900 font-bold mt-1.5 text-[14px]">
                    {viewingQuery.rowsAffected}
                  </span>
                </div>

                <div className="bg-teal-50/60 ring-1 ring-teal-100 rounded-xl p-3.5 flex flex-col justify-between">
                  <span className="text-teal-600 block font-bold uppercase tracking-wider text-[10px]">Date &amp; Day</span>
                  <span className="text-teal-900 font-bold mt-1.5 text-[12px] truncate">
                    {formatDateDayTime(viewingQuery.createdAt)}
                  </span>
                </div>
              </div>

              {viewingQuery.error && (
                <div className="bg-rose-50 ring-1 ring-rose-200 rounded-xl p-4 text-rose-600 text-[12px] font-mono flex items-start gap-2.5 shrink-0">
                  <span className="text-base leading-none">⚠</span>
                  <div>
                    <strong className="block font-bold mb-0.5">Execution error</strong>
                    <span className="leading-relaxed">{viewingQuery.error}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-teal-50/60 border-t border-teal-100 flex justify-end shrink-0">
              <button
                onClick={() => { setShowQueryModal(false); setViewingQuery(null); }}
                className="px-4 py-2 text-white text-[12px] font-bold rounded-lg transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#0d9da4' }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareModalOpen && sharingConn && (
        <div className="fixed inset-0 bg-teal-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl ring-1 ring-teal-100 shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn text-left">

            <div className="px-6 py-4 border-b border-teal-100 bg-teal-50/60 flex justify-between items-center">
              <div>
                <h3 className="text-[15px] font-bold text-teal-900">
                  Share Access
                </h3>
                <p className="text-[12px] text-teal-700/60 mt-0.5">
                  Connection: <span className="font-semibold text-teal-800">{sharingConn.name}</span>
                </p>
              </div>
              <button
                onClick={() => setShareModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-teal-500 hover:text-teal-800 hover:bg-teal-100 transition-colors text-lg font-medium"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {shareError && (
                <div className="mb-4 bg-rose-50 text-rose-600 text-[12px] px-4 py-2.5 rounded-lg ring-1 ring-rose-200 font-medium">
                  {shareError}
                </div>
              )}
              {shareSuccess && (
                <div className="mb-4 bg-teal-50 text-teal-700 text-[12px] px-4 py-2.5 rounded-lg ring-1 ring-teal-200 font-medium">
                  {shareSuccess}
                </div>
              )}

              <p className="text-[11px] font-bold text-teal-600 mb-3 uppercase tracking-wider">
                Select developers / viewers
              </p>

              {usersList.length === 0 ? (
                <p className="text-[13px] text-teal-700/50 text-center py-6">
                  No developers or viewers found.
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1.5 ring-1 ring-teal-50 rounded-xl p-2.5 bg-teal-50/30">
                  {usersList.map(u => {
                    const isChecked = selectedUserIds.includes(u._id);
                    return (
                      <label
                        key={u._id}
                        className={`flex items-center justify-between p-2.5 rounded-lg ring-1 cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-teal-50/70 ring-teal-200'
                            : 'bg-white ring-teal-50 hover:ring-teal-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleUser(u._id)}
                            className="rounded border-teal-300 text-teal-600 focus:ring-teal-400 w-4 h-4"
                          />
                          <div>
                            <p className="text-[13px] font-semibold text-teal-900">
                              {u.name}
                            </p>
                            <p className="text-[11px] text-teal-700/50">
                              {u.email}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          u.role === 'developer' ? 'bg-amber-100 text-amber-800' : 'bg-cyan-100 text-cyan-800'
                        }`}>
                          {u.role}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-teal-50/60 border-t border-teal-100 flex gap-3">
              <button
                onClick={() => setShareModalOpen(false)}
                className="flex-1 py-2.5 ring-1 ring-teal-200 text-teal-700 text-[13px] font-semibold rounded-lg hover:bg-teal-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveShare}
                disabled={shareLoading || usersList.length === 0}
                className="flex-1 py-2.5 text-white text-[13px] font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: '#0d9da4' }}
              >
                {shareLoading ? 'Saving…' : 'Save Access'}
              </button>
            </div>

          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.18s ease-out;
        }
      `}</style>
    </div>
  );
}