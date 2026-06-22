import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Developer Query Tracking States
  const [selectedDevs, setSelectedDevs] = useState({});
  const [todayQueries, setTodayQueries] = useState({});
  const [queriesLoading, setQueriesLoading] = useState({});
  const [viewingQuery, setViewingQuery] = useState(null);
  const [showQueryModal, setShowQueryModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Admin Tabs & Activity Logging States
  const [activeTab, setActiveTab] = useState('connections');
  const [allConnections, setAllConnections] = useState([]);
  const [loadingAllConnections, setLoadingAllConnections] = useState(false);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedUserFilter, setSelectedUserFilter] = useState('all');
  const [subTab, setSubTab] = useState('queries'); // 'queries' or 'procedures'
  const [procedureAudits, setProcedureAudits] = useState([]);
  const [loadingProcedures, setLoadingProcedures] = useState(false);
  const [expandedAuditId, setExpandedAuditId] = useState(null);

  // Connection Sharing States
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      const res = await API.get('/connections/all');
      setAllConnections(res.data.connections || []);
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
      alert('Export karne ke liye koi records nahi hain!');
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
      alert('Export karne ke liye koi records nahi hain!');
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

  // Connection sharing handlers
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getTypeIcon = (type) => {
    if (type === 'mysql') return '🐬';
    if (type === 'postgresql') return '🐘';
    if (type === 'mongodb') return '🍃';
    return '🗄️';
  };

  const getTypeBadgeColor = (type) => {
    if (type === 'mysql') return 'bg-blue-100 text-blue-700';
    if (type === 'postgresql') return 'bg-indigo-100 text-indigo-700';
    if (type === 'mongodb') return 'bg-emerald-100 text-emerald-700';
    return 'bg-gray-100 text-gray-600';
  };

  const mysqlCount = connections.filter(c => c.type === 'mysql').length;
  const pgCount = connections.filter(c => c.type === 'postgresql').length;
  const mongoCount = connections.filter(c => c.type === 'mongodb').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">

      {/* Navbar */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-10 px-6 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">DB</span>
          </div>
          <h1 className="text-lg font-semibold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
            DB Management
          </h1>
        </div>

        {/* Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-all duration-200"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-sm font-medium">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-gray-700">{user?.name}</p>
              <p className="text-xs text-gray-400">{user?.role}</p>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-20 animate-fadeIn">
              <button
                onClick={() => { setDropdownOpen(false); navigate('/profile'); }}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                My Profile
              </button>
              <hr className="my-1 border-gray-100" />
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">
            Welcome back, {user?.name}! Manage your database connections.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="mb-8 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-6 bg-gray-800 rounded-full"></div>
            <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setActiveTab('connections')}
              className={`px-4 py-2 text-sm rounded-lg transition flex items-center gap-2 font-medium ${
                activeTab === 'connections'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              🗄️ Connections List
            </button>

            <button
              onClick={() => setActiveTab('activity')}
              className={`px-4 py-2 text-sm rounded-lg transition flex items-center gap-2 font-medium ${
                activeTab === 'activity'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              👥 Developer Activity Logs
            </button>

            <button
              onClick={() => setActiveTab('all-connections')}
              className={`px-4 py-2 text-sm rounded-lg transition flex items-center gap-2 font-medium ${
                activeTab === 'all-connections'
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              🔌 App Connections Overview
            </button>


            <button
              onClick={() => navigate('/connections')}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition flex items-center gap-2 font-medium"
            >
              ⚙️ Manage Connections
            </button>
            <button
              onClick={() => navigate('/history')}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition flex items-center gap-2 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Query History
            </button>
            
            <button
              onClick={() => navigate('/users')}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition flex items-center gap-2 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              User Management
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {activeTab === 'connections' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-xl">🐬</div>
                <span className="text-xs text-gray-400">MySQL</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{mysqlCount}</p>
              <p className="text-xs text-gray-500 mt-1">MySQL Connections</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-xl">🐘</div>
                <span className="text-xs text-gray-400">PostgreSQL</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{pgCount}</p>
              <p className="text-xs text-gray-500 mt-1">PostgreSQL Connections</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-xl">🍃</div>
                <span className="text-xs text-gray-400">MongoDB</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{mongoCount}</p>
              <p className="text-xs text-gray-500 mt-1">MongoDB Connections</p>
            </div>
          </div>
        )}

        {/* Main Content Box (Tab container) */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {/* Tab headers */}
          <div className="px-6 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2">
              <h3 className="text-sm font-semibold text-gray-900 py-4">
                {activeTab === 'connections' 
                  ? 'Your Connections' 
                  : activeTab === 'all-connections' 
                  ? 'App Connections (Admin View)' 
                  : 'Developer Activity Logs'}
              </h3>
            </div>

            {activeTab === 'connections' && connections.length > 0 && (
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full my-3">
                {connections.length} Connections
              </span>
            )}

            {activeTab === 'all-connections' && allConnections.length > 0 && (
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full my-3">
                {allConnections.length} Total Connections
              </span>
            )}

            {activeTab === 'activity' && (
              <div className="flex items-center gap-3 my-2 flex-wrap">
                {subTab === 'queries' && activityLogs.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">Filter by Developer:</span>
                    <select
                      value={selectedUserFilter}
                      onChange={(e) => setSelectedUserFilter(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg p-1.5 bg-white text-gray-700 outline-none focus:border-gray-400 font-medium"
                    >
                      <option value="all">All Developers</option>
                      {Array.from(new Set(activityLogs.map(log => log.user?._id).filter(Boolean)))
                        .map(id => {
                          const u = activityLogs.find(log => log.user?._id === id)?.user;
                          return u ? <option key={u._id} value={u._id}>{u.name}</option> : null;
                        })
                      }
                    </select>
                  </div>
                )}
                
                <button
                  onClick={subTab === 'queries' ? exportQueriesToCSV : exportProceduresToCSV}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition"
                >
                  📥 Export CSV
                </button>
              </div>
            )}
          </div>

          {activeTab === 'activity' && (
            <div className="px-6 bg-gray-50/50 border-b border-gray-100 flex gap-4">
              <button
                onClick={() => setSubTab('queries')}
                className={`py-3 text-xs font-bold border-b-2 transition ${
                  subTab === 'queries' ? 'text-gray-900 border-gray-900' : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                📝 All Queries
              </button>
              <button
                onClick={() => setSubTab('procedures')}
                className={`py-3 text-xs font-bold border-b-2 transition ${
                  subTab === 'procedures' ? 'text-gray-900 border-gray-900' : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                📜 Stored Procedure Audits
              </button>
            </div>
          )}

          {/* Tab Contents */}
          <div className="divide-y divide-gray-100">
            {activeTab === 'connections' ? (
              connections.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-4xl mb-4">🗄️</p>
                  <p className="text-gray-700 font-medium mb-2">Koi connection nahi hai</p>
                  <p className="text-gray-400 text-sm mb-6">Apna pehla database connect karo</p>
                  <button
                    onClick={() => navigate('/connections')}
                    className="px-6 py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition"
                  >
                    + Add Connection
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 bg-gray-50/30">
                  {connections.map(conn => (
                    <div
                      key={conn._id}
                      className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4 hover:shadow-md transition-all duration-200"
                    >
                      {/* Connection Header Info */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{getTypeIcon(conn.type)}</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap text-left">
                              <p className="text-sm font-semibold text-gray-900">{conn.name}</p>
                              {conn.user && conn.user._id !== user?.id && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-50 text-purple-600 border border-purple-100">
                                  Shared by {conn.user.name}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 text-left mt-0.5">
                              {conn.type === 'mongodb'
                                ? 'MongoDB'
                                : `${conn.host}:${conn.port}${conn.database ? ' / ' + conn.database : ''}`
                              }
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTypeBadgeColor(conn.type)}`}>
                            {conn.type}
                          </span>
                          {/* Share Button (Only if admin or owner) */}
                          {(user?.role === 'admin' || !conn.user || conn.user._id === user?.id) && (
                            <button
                              onClick={() => handleOpenShareModal(conn)}
                              className="px-2.5 py-1 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50 transition flex items-center gap-1 font-medium"
                            >
                              👥 Share
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (conn.database) {
                                navigate(`/connections/${conn._id}`);
                              } else {
                                navigate(`/connections/${conn._id}/select-db`);
                              }
                            }}
                            className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 transition font-medium flex items-center gap-1"
                          >
                            Open →
                          </button>
                        </div>
                      </div>

                      {/* Dropdown Selection */}
                      <div className="border-t border-gray-100 pt-4 flex flex-col gap-3">
                        <div className="flex items-center gap-2 max-w-xs text-left">
                          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            Query Tracker:
                          </label>
                          <select
                            value={selectedDevs[conn._id] || ''}
                            onChange={(e) => handleDevChange(conn._id, e.target.value)}
                            className="flex-1 text-xs border border-gray-200 rounded-lg p-1.5 bg-white text-gray-700 outline-none focus:border-gray-400 font-medium"
                          >
                            <option value="">-- Select Developer --</option>
                            {conn.user && (
                              <option value={conn.user._id}>
                                {conn.user.name} ({conn.user.role === 'admin' ? 'Admin' : 'Owner'})
                              </option>
                            )}
                            {conn.allowedUsers && conn.allowedUsers.map(u => (
                              <option key={u._id} value={u._id}>
                                {u.name} ({u.role})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Today's Query Log Table */}
                        {selectedDevs[conn._id] && (
                          <div className="mt-1 text-left">
                            {queriesLoading[conn._id] ? (
                              <p className="text-xs text-gray-400 italic">Queries load ho rahi hain...</p>
                            ) : !todayQueries[conn._id] || todayQueries[conn._id].length === 0 ? (
                              <p className="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-lg border border-gray-100">
                                Is developer ne aaj koi query run nahi ki.
                              </p>
                            ) : (
                              <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-52 overflow-y-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-[11px]">
                                  <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Dev</th>
                                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Database</th>
                                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Host</th>
                                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Time & Day</th>
                                      <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                                      <th className="px-3 py-2 text-right font-semibold text-gray-500">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white divide-y divide-gray-100">
                                    {todayQueries[conn._id].map(q => (
                                      <tr key={q._id} className="hover:bg-gray-50/50">
                                        <td className="px-3 py-2 font-medium text-gray-800">{q.user?.name || 'Unknown'}</td>
                                        <td className="px-3 py-2 text-gray-500">{q.database || conn.database || 'default'}</td>
                                        <td className="px-3 py-2 text-gray-500">{conn.host || 'localhost'}</td>
                                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDateDayTime(q.createdAt)}</td>
                                        <td className="px-3 py-2">
                                          <span className={`px-1 rounded-[3px] text-[9px] font-bold uppercase ${
                                            q.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                          }`}>
                                            {q.status}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <button
                                            onClick={() => handleViewQuery(q)}
                                            className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 border border-gray-200 rounded font-medium transition"
                                          >
                                            👁️ View
                                          </button>
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
                    </div>
                  ))}
                </div>
              )
            ) : activeTab === 'all-connections' ? (
              loadingAllConnections ? (
                <div className="p-16 text-center">
                  <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-500 text-sm">Fetching app connections...</p>
                </div>
              ) : allConnections.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-4xl mb-4">🔌</p>
                  <p className="text-gray-700 font-medium mb-2">Koi connection nahi mila</p>
                  <p className="text-gray-400 text-sm">Application se abhi koi connection linked nahi hai</p>
                </div>
              ) : (
                <div className="overflow-x-auto text-left">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Connection Info</th>
                        <th className="px-6 py-3.5">Type</th>
                        <th className="px-6 py-3.5">Database Name</th>
                        <th className="px-6 py-3.5">Host details / Conn String</th>
                        <th className="px-6 py-3.5">Created By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {allConnections.map(conn => (
                        <tr key={conn._id} className="hover:bg-gray-50/50 transition">
                          <td className="px-6 py-4">
                            <p className="text-sm font-semibold text-gray-900">{conn.name}</p>
                            <p className="text-xs text-gray-400 font-mono">ID: {conn._id}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTypeBadgeColor(conn.type)}`}>
                              {getTypeIcon(conn.type)} {conn.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                            {conn.database || <span className="text-gray-400 italic">None</span>}
                          </td>
                          <td className="px-6 py-4 text-xs font-mono text-gray-500 max-w-xs truncate">
                            {conn.type === 'mongodb'
                              ? conn.connectionString
                              : `${conn.host}:${conn.port}`
                            }
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                                {conn.user?.name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-900">{conn.user?.name || 'Unknown'}</p>
                                <p className="text-[10px] text-gray-400">{conn.user?.email || 'N/A'}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* Activity Tab */
              subTab === 'queries' ? (
                loadingActivity ? (
                  <div className="p-16 text-center">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500 text-sm">Fetching activity logs...</p>
                  </div>
                ) : activityLogs.length === 0 ? (
                  <div className="p-16 text-center">
                    <p className="text-4xl mb-4">📜</p>
                    <p className="text-gray-700 font-medium mb-2">Koi activity record nahi hai</p>
                    <p className="text-gray-400 text-sm">Database me chalaye gaye query yahan dikhenge</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 text-left">
                    {activityLogs
                      .filter(log => selectedUserFilter === 'all' || log.user?._id === selectedUserFilter)
                      .map(log => (
                        <div key={log._id} className="p-6 hover:bg-gray-50/50 transition">
                          <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                                {log.user?.name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900">{log.user?.name || 'Unknown User'}</span>
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                                    {log.user?.role || 'user'}
                                  </span>
                                  {isToday(log.createdAt) && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 animate-pulse">
                                      Today
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">{log.user?.email}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-gray-400 font-medium block">
                                {formatDateTime(log.createdAt)}
                              </span>
                              <div className="flex items-center justify-end gap-1.5 mt-1">
                                <span className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                <span className="text-xs font-semibold text-gray-600 capitalize">
                                  {log.status}
                                </span>
                                <span className="text-xs text-gray-400 ml-1.5">
                                  ({log.executionTime}ms)
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Query Box */}
                          <div className="mt-2 bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-100 overflow-x-auto border border-gray-800 shadow-inner max-h-40">
                            {log.query}
                          </div>

                          {/* Error info if failed */}
                          {log.status === 'failed' && log.error && (
                            <div className="mt-2 text-xs bg-red-50 text-red-700 border border-red-100 rounded-lg p-3 font-medium">
                              <strong>⚠️ Error:</strong> {log.error}
                            </div>
                          )}
                          {log.status === 'success' && log.rowsAffected !== undefined && (
                            <p className="text-xs text-gray-500 mt-2 font-medium">
                              📊 Rows Affected / Documents: <span className="font-semibold text-gray-700">{log.rowsAffected}</span>
                            </p>
                          )}
                        </div>
                      ))
                    }
                    {activityLogs.filter(log => selectedUserFilter === 'all' || log.user?._id === selectedUserFilter).length === 0 && (
                      <div className="p-12 text-center text-gray-400 text-sm">
                        Is developer ke liye aaj koi activity nahi mili.
                      </div>
                    )}
                  </div>
                )
              ) : (
                /* Stored Procedure Audits */
                loadingProcedures ? (
                  <div className="p-16 text-center">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500 text-sm">Fetching procedure audit logs...</p>
                  </div>
                ) : procedureAudits.length === 0 ? (
                  <div className="p-16 text-center">
                    <p className="text-4xl mb-4">📜</p>
                    <p className="text-gray-700 font-medium mb-2">Koi stored procedure audit record nahi hai</p>
                    <p className="text-gray-400 text-sm">CREATE, ALTER, ya DROP PROCEDURE queries yahan log honge</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {procedureAudits.map(audit => (
                      <div key={audit._id} className="p-6 hover:bg-gray-50/50 transition text-left">
                        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm animate-fadeIn">
                              {audit.user?.name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900">{audit.user?.name || 'Unknown User'}</span>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                                  {audit.user?.role || 'user'}
                                </span>
                                {isToday(audit.createdAt) && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 animate-pulse">
                                    Today
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">{audit.user?.email}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-gray-400 font-medium block">
                              {formatDateTime(audit.createdAt)}
                            </span>
                            <span className="text-[11px] text-gray-500 block mt-0.5 font-medium">
                              💻 Host: {audit.host}
                            </span>
                          </div>
                        </div>

                        {/* Audit specific details */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                          <span className="text-gray-500 font-medium">Procedure:</span>
                          <span className="font-mono font-bold bg-gray-100 text-gray-800 px-2 py-0.5 rounded border border-gray-200">
                            {audit.procedureName}
                          </span>

                          {audit.databaseName && (
                            <>
                              <span className="text-gray-500 font-medium ml-2">Database/Schema:</span>
                              <span className="font-mono font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                                {audit.databaseName}
                              </span>
                            </>
                          )}

                          <span className="text-gray-500 font-medium ml-2">Operation:</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            audit.operation === 'CREATE' ? 'bg-emerald-100 text-emerald-800' :
                            audit.operation === 'ALTER' ? 'bg-blue-100 text-blue-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {audit.operation}
                          </span>
                        </div>

                        {/* Collapsible SQL Query */}
                        <div className="mt-3">
                          <button
                            onClick={() => setExpandedAuditId(expandedAuditId === audit._id ? null : audit._id)}
                            className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 font-semibold transition"
                          >
                            <span>{expandedAuditId === audit._id ? '🔽 Hide SQL Statement' : '▶️ View SQL Statement'}</span>
                          </button>

                          {expandedAuditId === audit._id && (
                            <div className="mt-2 bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-100 overflow-auto whitespace-pre-wrap shadow-inner max-h-60 animate-fadeIn">
                              {audit.sqlText}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )
            )}
          </div>
        </div>

      </div>

      {/* Query Detail Modal Popup */}
      {showQueryModal && viewingQuery && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl w-full max-w-full h-full max-h-full sm:w-[550px] sm:h-[550px] flex flex-col overflow-hidden animate-fadeIn text-left">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  📄 Full SQL Query
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Executed by <span className="font-semibold text-gray-700">{viewingQuery.user?.name}</span> on <span className="font-medium text-gray-600">{formatDateDayTime(viewingQuery.createdAt)}</span>
                </p>
              </div>
              <button
                onClick={() => { setShowQueryModal(false); setViewingQuery(null); }}
                className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 flex-1 overflow-y-auto flex flex-col">
              <div className="relative group flex-1 flex flex-col min-h-[150px]">
                <div className="absolute top-2 right-2 opacity-80 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={() => handleCopyQuery(viewingQuery.query)}
                    className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded text-[10px] font-bold flex items-center gap-1 border border-gray-700 transition active:scale-95 shadow"
                  >
                    {copied ? '✓ Copied' : '📋 Copy Query'}
                  </button>
                </div>
                <div className="bg-gray-950 text-gray-100 rounded-lg p-4 pt-10 font-mono text-xs overflow-auto whitespace-pre-wrap flex-1 border border-gray-800 shadow-inner">
                  {viewingQuery.query}
                </div>
              </div>

              {/* Stats / Details */}
              <div className="grid grid-cols-2 gap-3 text-xs shrink-0">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                  <span className="text-gray-400 block font-medium uppercase tracking-wider text-[10px]">Status</span>
                  <span className={`font-bold mt-1 text-sm ${viewingQuery.status === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                    {viewingQuery.status === 'success' ? '🟢 SUCCESS' : '🔴 FAILED'}
                  </span>
                </div>
                
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                  <span className="text-gray-400 block font-medium uppercase tracking-wider text-[10px]">Execution Speed</span>
                  <span className="text-gray-800 font-bold mt-1 text-sm flex items-center gap-1">
                    ⚡ {viewingQuery.executionTime} ms
                  </span>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                  <span className="text-gray-400 block font-medium uppercase tracking-wider text-[10px]">Rows Affected</span>
                  <span className="text-gray-800 font-bold mt-1 text-sm">
                    📊 {viewingQuery.rowsAffected} rows
                  </span>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                  <span className="text-gray-400 block font-medium uppercase tracking-wider text-[10px]">Date & Day</span>
                  <span className="text-gray-800 font-semibold mt-1 text-[11px] truncate">
                    📅 {formatDateDayTime(viewingQuery.createdAt)}
                  </span>
                </div>
              </div>

              {viewingQuery.error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-xs font-mono shadow-sm flex items-start gap-2 shrink-0">
                  <span className="text-base">⚠️</span>
                  <div>
                    <strong className="block font-bold mb-0.5">Execution Error:</strong>
                    <span className="leading-relaxed">{viewingQuery.error}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end shrink-0">
              <button
                onClick={() => { setShowQueryModal(false); setViewingQuery(null); }}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg transition"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareModalOpen && sharingConn && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn text-left">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  👥 Share Access
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Share connection <span className="font-semibold text-gray-700">{sharingConn.name}</span>
                </p>
              </div>
              <button
                onClick={() => setShareModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {shareError && (
                <div className="mb-4 bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-lg border border-red-200">
                  ❌ {shareError}
                </div>
              )}
              {shareSuccess && (
                <div className="mb-4 bg-green-50 text-green-600 text-xs px-4 py-2.5 rounded-lg border border-green-200">
                  ✅ {shareSuccess}
                </div>
              )}

              <p className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wider">
                Select Developers / Viewers:
              </p>

              {usersList.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No developers or viewers found.
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                  {usersList.map(u => {
                    const isChecked = selectedUserIds.includes(u._id);
                    return (
                      <label
                        key={u._id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition ${
                          isChecked
                            ? 'bg-blue-50/50 border-blue-200'
                            : 'bg-white border-gray-100 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleUser(u._id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {u.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {u.email}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          u.role === 'developer' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
                        }`}>
                          {u.role}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShareModalOpen(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveShare}
                disabled={shareLoading || usersList.length === 0}
                className="flex-1 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
              >
                {shareLoading ? 'Saving...' : 'Save Access'}
              </button>
            </div>

          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}