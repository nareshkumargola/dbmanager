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
  const [shareSearch, setShareSearch] = useState('');

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const usersItemsPerPage = 5;

  // User creation & edit modal states
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'developer',
    accessMode: 'read',
    permissions: {
      userManagement: false,
      backup: true, binlog: true, monitor: true, query: true,
      history: true, slowQuery: true, auditLogs: true, connections: true
    }
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editUserModalUser, setEditUserModalUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', role: 'developer', accessMode: 'read', permissions: {} });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const handleOpenEditUser = (u) => {
    setEditUserModalUser(u);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      password: '', // Blank by default, enter to update
      role: u.role === 'admin' ? 'admin' : 'developer',
      accessMode: u.accessMode || (u.role === 'readwrite' ? 'readwrite' : 'read'),
      permissions: u.permissions ? {
        userManagement: !!u.permissions.userManagement,
        backup: u.permissions.backup !== undefined ? u.permissions.backup : true,
        binlog: u.permissions.binlog !== undefined ? u.permissions.binlog : true,
        monitor: u.permissions.monitor !== undefined ? u.permissions.monitor : true,
        query: u.permissions.query !== undefined ? u.permissions.query : true,
        history: u.permissions.history !== undefined ? u.permissions.history : true,
        slowQuery: u.permissions.slowQuery !== undefined ? u.permissions.slowQuery : true,
        auditLogs: u.permissions.auditLogs !== undefined ? u.permissions.auditLogs : true,
        connections: u.permissions.connections !== undefined ? u.permissions.connections : true
      } : {
        userManagement: false,
        backup: true, binlog: true, monitor: true, query: true,
        history: true, slowQuery: true, auditLogs: true, connections: true
      }
    });
    setEditError('');
  };

  const handleSaveEditUser = async (e) => {
    e.preventDefault();
    if (!editUserModalUser) return;
    setEditLoading(true);
    setEditError('');
    try {
      await API.put(`/users/${editUserModalUser._id}`, editForm);
      setEditUserModalUser(null);
      fetchUsers();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update user details.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleCreateUserSubmit = async (e) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError('');
    try {
      await API.post('/users', createForm);
      setCreateUserModalOpen(false);
      setCreateForm({ name: '', email: '', password: '', role: 'read' });
      fetchUsers();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setCreateLoading(false);
    }
  };

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

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const res = await API.get('/users');
      setUsers(res.data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const updateUserRoleInDashboard = async (id, newRole) => {
    try {
      await API.put(`/users/${id}/role`, { role: newRole });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update user role.');
    }
  };

  const deleteUserInDashboard = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete user ${name}?`)) return;
    try {
      await API.delete(`/users/${id}`);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete user.');
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
    } else if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab, subTab, user]);

  const filteredUsers = users.filter(u => {
    const q = usersSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  });

  const totalUsersPages = Math.max(1, Math.ceil(filteredUsers.length / usersItemsPerPage));
  const usersStartIndex = (usersPage - 1) * usersItemsPerPage;
  const paginatedUsers = filteredUsers.slice(usersStartIndex, usersStartIndex + usersItemsPerPage);

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
    const headers = ['User Name', 'Email', 'Role', 'Status', 'Execution Time (ms)', 'Full SQL Query', 'Rows Affected', 'Timestamp'];
    const rows = logsToExport.map(log => {
      const cleanQuery = (log.query || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
      const userName = (log.user?.name || 'Unknown').replace(/"/g, '""');
      const userEmail = (log.user?.email || 'N/A').replace(/"/g, '""');
      const userRole = (log.user?.role || 'user').replace(/"/g, '""');
      const timeFormatted = new Date(log.createdAt).toLocaleString('en-IN');

      return [
        `"${userName}"`,
        `"${userEmail}"`,
        `"${userRole}"`,
        log.status || 'success',
        log.executionTime || 0,
        `"${cleanQuery}"`,
        log.rowsAffected !== undefined ? log.rowsAffected : 0,
        `"${timeFormatted}"`
      ];
    });

    const csvContent = '\uFEFF' + [
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
    setShareSearch('');
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
    if (type === 'oracle') return '🔴';
    return '🗄️';
  };

  const getTypeBadgeColor = (type) => {
    if (type === 'mysql') return 'bg-teal-50 text-teal-700 ring-1 ring-teal-200';
    if (type === 'postgresql') return 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200';
    if (type === 'mongodb') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
    if (type === 'oracle') return 'bg-red-50 text-red-700 ring-1 ring-red-200';
    return 'bg-stone-100 text-stone-600 ring-1 ring-stone-200';
  };

  const mysqlCount = connections.filter(c => c.type === 'mysql').length;
  const pgCount = connections.filter(c => c.type === 'postgresql').length;
  const mongoCount = connections.filter(c => c.type === 'mongodb').length;
  const oracleCount = connections.filter(c => c.type === 'oracle').length;

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
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-150">
      {/* Navbar */}
      <Navbar variant="teal" />

      <div className="w-full px-5 sm:px-8 py-8">

        {/* Quick Actions Card with Dashboard Header */}
        <div className="mb-7 bg-gray-50/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-200/80 dark:border-gray-700/80">
            <div>
              <h2 className="text-[20px] font-bold text-teal-900 dark:text-teal-50 tracking-tight">Dashboard</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-3.5 rounded-full" style={{ backgroundColor: '#0d9da4' }}></div>
              <h3 className="text-[11px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider">Quick Actions</h3>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => setActiveTab('connections')}
              className={`px-4 py-2 text-[13px] rounded-lg transition-all flex items-center gap-2 font-semibold ${
                activeTab === 'connections'
                  ? 'text-white shadow-sm'
                  : 'ring-1 ring-teal-200 dark:ring-teal-700/50 text-teal-700 dark:text-teal-400 bg-white dark:bg-gray-700 hover:bg-teal-50 dark:hover:bg-gray-600'
              }`}
              style={activeTab === 'connections' ? { backgroundColor: '#0d9da4' } : {}}
            >
              <span className="text-base leading-none">🗄️</span> Connections
            </button>

            <button
              onClick={() => navigate('/connections')}
              className="px-4 py-2 ring-1 ring-teal-200 dark:ring-teal-700/50 text-teal-700 dark:text-teal-400 bg-white dark:bg-gray-700 text-[13px] rounded-lg hover:bg-teal-50 dark:hover:bg-gray-600 transition-all flex items-center gap-2 font-semibold"
            >
              <span className="text-base leading-none">⚙️</span> Manage Connections
            </button>

            {user?.role === 'admin' && (
              <>
                <div className="w-px h-6 bg-teal-200 dark:bg-teal-800 mx-1 self-center hidden sm:block"></div>

                <button
                  onClick={() => setActiveTab('audit-logs')}
                  className={`px-4 py-2 text-[13px] rounded-lg transition-all flex items-center gap-2 font-semibold ${
                    activeTab === 'audit-logs'
                      ? 'text-white shadow-sm'
                      : 'ring-1 ring-teal-200 dark:ring-teal-700/50 text-teal-700 dark:text-teal-400 bg-white dark:bg-gray-700 hover:bg-teal-50 dark:hover:bg-gray-600'
                  }`}
                  style={activeTab === 'audit-logs' ? { backgroundColor: '#0d9da4' } : {}}
                >
                  <span className="text-base leading-none">📜</span> Application Audit Logs
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-4 py-2 text-[13px] rounded-lg transition-all flex items-center gap-2 font-semibold ${
                    activeTab === 'users'
                      ? 'text-white shadow-sm'
                      : 'ring-1 ring-teal-200 dark:ring-teal-700/50 text-teal-700 dark:text-teal-400 bg-white dark:bg-gray-700 hover:bg-teal-50 dark:hover:bg-gray-600'
                  }`}
                  style={activeTab === 'users' ? { backgroundColor: '#0d9da4' } : {}}
                >
                  <span className="text-base leading-none">👥</span> System Users &amp; Roles
                </button>
                <button
                  onClick={() => navigate('/permissions')}
                  className="px-4 py-2 ring-1 ring-teal-200 dark:ring-teal-700/50 text-teal-700 dark:text-teal-400 bg-white dark:bg-gray-700 text-[13px] rounded-lg hover:bg-teal-50 dark:hover:bg-gray-600 transition-all flex items-center gap-2 font-semibold"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Application Permissions
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {activeTab === 'connections' && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-7">
            <div className="bg-gray-50/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200 text-gray-900 dark:text-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg ring-1 ring-teal-100 dark:ring-teal-900 bg-[#e3f6f6] dark:bg-teal-950/50">🐬</div>
                <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">MySQL</span>
              </div>
              <p className="text-[28px] font-bold tracking-tight leading-none" style={{ color: '#0d9da4' }}>{mysqlCount}</p>
              <p className="text-[12px] text-teal-700/60 dark:text-teal-400/70 mt-1.5">Active connections</p>
            </div>

            <div className="bg-gray-50/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200 text-gray-900 dark:text-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg ring-1 ring-cyan-100 dark:ring-cyan-900 bg-cyan-50 dark:bg-cyan-950/50">🐘</div>
                <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">Postgres</span>
              </div>
              <p className="text-[28px] font-bold text-cyan-700 dark:text-cyan-400 tracking-tight leading-none">{pgCount}</p>
              <p className="text-[12px] text-teal-700/60 dark:text-teal-400/70 mt-1.5">Active connections</p>
            </div>

            <div className="bg-gray-50/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200 text-gray-900 dark:text-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg ring-1 ring-amber-100 dark:ring-amber-900 bg-[#fdf6d8] dark:bg-amber-950/30">🍃</div>
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">MongoDB</span>
              </div>
              <p className="text-[28px] font-bold text-amber-700 dark:text-amber-400 tracking-tight leading-none">{mongoCount}</p>
              <p className="text-[12px] text-teal-700/60 dark:text-teal-400/70 mt-1.5">Active connections</p>
            </div>

            <div className="bg-gray-50/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all duration-200 text-gray-900 dark:text-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg ring-1 ring-red-100 dark:ring-red-900 bg-red-50 dark:bg-red-950/50">🔴</div>
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Oracle</span>
              </div>
              <p className="text-[28px] font-bold text-red-700 dark:text-red-400 tracking-tight leading-none">{oracleCount}</p>
              <p className="text-[12px] text-teal-700/60 dark:text-teal-400/70 mt-1.5">Active connections</p>
            </div>
          </div>
        )}

        {/* Main Content Box */}
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="px-6 border-b border-teal-100 dark:border-gray-800 bg-teal-50/40 dark:bg-gray-800/40 flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-[14px] font-bold text-teal-900 dark:text-teal-50 py-4 tracking-tight">
              {activeTab === 'audit-logs'
                ? 'System Activity Audit Trail — Admin View'
                : 'Your Connections'}
            </h3>

            {activeTab === 'connections' && (
              <div className="flex items-center gap-3 my-3">
                {connections.length > 0 && (
                  <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400 bg-white dark:bg-gray-850 ring-1 ring-teal-200 dark:ring-teal-800 px-2.5 py-1 rounded-full">
                    {connections.length} connections
                  </span>
                )}
                <button
                  onClick={() => navigate('/connections')}
                  title="Add / Manage Connections"
                  className="w-8 h-8 rounded-lg text-white font-bold text-lg flex items-center justify-center shadow-sm hover:opacity-90 transition-all active:scale-95 cursor-pointer"
                  style={{ backgroundColor: '#0d9da4' }}
                >
                  +
                </button>
              </div>
            )}
          </div>

          {/* Tab Contents */}
          <div className="divide-y divide-teal-50 dark:divide-gray-800">
            {activeTab === 'connections' && (
              connections.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-4xl mb-4">🗄️</p>
                  <p className="text-teal-900 dark:text-teal-50 font-semibold mb-1.5">No connections yet</p>
                  <p className="text-teal-700/60 dark:text-teal-400/60 text-[13px] mb-6">Connect your first database to get started</p>
                  <button
                    onClick={() => navigate('/connections')}
                    className="px-5 py-2.5 text-white text-[13px] font-semibold rounded-lg hover:opacity-90 transition-opacity shadow-sm"
                    style={{ backgroundColor: '#0d9da4' }}
                  >
                    + Add Connection
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-6 bg-teal-50/20 dark:bg-gray-900/40">
                  {connections.map(conn => (
                    <div
                      key={conn._id}
                      onClick={() => navigate(`/connections/${conn._id}`)}
                      className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col gap-4 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer group"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg ring-1 ring-teal-100 dark:ring-teal-900 flex items-center justify-center text-xl shrink-0 bg-[#f0f9f7] dark:bg-teal-950/40">
                            {getTypeIcon(conn.type)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap text-left">
                              <p className="text-[14px] font-bold text-teal-900 dark:text-teal-50 group-hover:text-[#0d9da4] transition-colors">{conn.name}</p>
                              {conn.user && conn.user._id !== (user?._id || user?.id) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 ring-1 ring-amber-100 dark:ring-amber-900/30">
                                  Shared by {conn.user.name}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-teal-700/60 dark:text-teal-400/70 text-left mt-0.5 font-mono">
                              {conn.type === 'mongodb'
                                ? 'MongoDB'
                                : `${conn.host}:${conn.port}${conn.database ? ' / ' + conn.database : ''}`
                              }
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${getTypeBadgeColor(conn.type)}`}>
                            {conn.type}
                          </span>
                          {(user?.role === 'admin' || !conn.user || conn.user._id === (user?._id || user?.id)) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenShareModal(conn);
                              }}
                              className="px-2.5 py-1.5 ring-1 ring-teal-200 dark:ring-teal-700 text-teal-700 dark:text-teal-400 bg-white dark:bg-gray-800 text-[12px] rounded-lg hover:bg-teal-50 dark:hover:bg-gray-700 transition-all flex items-center gap-1 font-semibold cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                              </svg>
                              Share
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/connections/${conn._id}`);
                            }}
                            className="px-3.5 py-1.5 text-white text-[12px] rounded-lg hover:opacity-90 transition-opacity font-semibold flex items-center gap-1 shadow-sm cursor-pointer"
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

            {activeTab === 'audit-logs' && user?.role === 'admin' && (
              <div className="p-6 bg-teal-50/20">
                <SystemAuditLogsPanel />
              </div>
            )}

            {activeTab === 'users' && user?.role === 'admin' && (
              <div className="p-6 bg-teal-50/20 dark:bg-gray-900/40 text-left">
                <div className="bg-white dark:bg-gray-850 rounded-xl border border-gray-250 dark:border-gray-800 p-5 shadow-xs">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-4">
                    <div>
                      <h3 className="text-md font-bold text-gray-900 dark:text-gray-50">Registered Users &amp; Roles</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Manage accounts, change roles (Read, ReadWrite, Admin), edit credentials &amp; permissions.</p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                      {/* Search users */}
                      <div className="w-full md:w-72 relative">
                        <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400 text-xs">🔍</span>
                        <input
                          type="text"
                          placeholder="Search users by name, email or role..."
                          value={usersSearch}
                          onChange={e => {
                            setUsersSearch(e.target.value);
                            setUsersPage(1);
                          }}
                          className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl text-xs bg-gray-50 dark:bg-gray-800 focus:bg-white dark:focus:bg-gray-750 text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-[#0d9da4] focus:border-[#0d9da4] transition font-medium"
                        />
                      </div>

                      {/* + Create User Button */}
                      <button
                        onClick={() => {
                          setCreateForm({
                            name: '',
                            email: '',
                            password: '',
                            role: 'developer',
                            accessMode: 'read',
                            permissions: {
                              userManagement: false,
                              backup: true, binlog: true, monitor: true, query: true,
                              history: true, slowQuery: true, auditLogs: true, connections: true
                            }
                          });
                          setCreateError('');
                          setCreateUserModalOpen(true);
                        }}
                        style={{ backgroundColor: '#0d9da4' }}
                        className="px-3.5 py-2 text-white text-xs font-bold rounded-xl hover:opacity-90 transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <span>➕</span> Create User
                      </button>
                    </div>
                  </div>

                  {usersLoading ? (
                    <div className="text-center py-10">
                      <div className="w-8 h-8 border-3 border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-xs text-gray-400 font-semibold">Loading users list...</p>
                    </div>
                  ) : users.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-sm text-gray-400 italic">No registered users found.</p>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-gray-200 dark:border-gray-850 rounded-xl bg-gray-50/50 dark:bg-gray-850/50">
                      <p className="text-xs text-gray-450 italic">No matching users found for "{usersSearch}"</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-800 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          <tr>
                            <th className="px-5 py-3">User Details</th>
                            <th className="px-5 py-3">Current Role</th>
                            <th className="px-5 py-3">Update Role</th>
                            <th className="px-5 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-150 dark:divide-gray-800">
                          {paginatedUsers.map(u => (
                            <tr key={u._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[#e3f6f6] dark:bg-teal-950/40 text-[#0d9da4] border border-teal-100/50 dark:border-teal-900/40">
                                    {u.name?.charAt(0).toUpperCase() || 'U'}
                                  </div>
                                  <div>
                                    <p className="font-bold text-gray-900 dark:text-gray-100">{u.name}</p>
                                    <p className="text-gray-400 dark:text-gray-500 text-[11px] font-mono mt-0.5">{u.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                    u.role === 'admin'
                                      ? 'bg-gray-950 dark:bg-gray-900 text-white border border-gray-900 dark:border-gray-800'
                                      : 'bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-400 border border-teal-150 dark:border-teal-900/30'
                                  }`}>
                                    {u.role === 'admin' ? 'Admin' : 'Developer'}
                                  </span>

                                  {u.role !== 'admin' && (
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                      (u.accessMode === 'readwrite' || u.role === 'readwrite')
                                        ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40'
                                        : 'bg-teal-50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-400 border border-teal-150 dark:border-teal-900/30'
                                    }`}>
                                      {(u.accessMode === 'readwrite' || u.role === 'readwrite') ? '⚡ Read/Write' : '🔒 Read Only'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-5 py-3.5">
                                {u._id !== user.id ? (
                                  <select
                                    value={u.role === 'admin' ? 'admin' : 'developer'}
                                    onChange={e => updateUserRoleInDashboard(u._id, e.target.value)}
                                    className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold outline-none focus:border-[#0d9da4] focus:ring-1 focus:ring-[#0d9da4] cursor-pointer"
                                  >
                                    <option value="developer">Developer</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                ) : (
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">Self Account</span>
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                {u._id !== user.id ? (
                                  <div className="flex items-center justify-end gap-2">
                                    {/* Edit Icon Button */}
                                    <button
                                      onClick={() => handleOpenEditUser(u)}
                                      className="p-1.5 rounded-lg border border-teal-200 dark:border-teal-900/50 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-[#0d9da4] transition cursor-pointer"
                                      title="Edit User Details, Email, Password & Permissions"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>

                                    {/* Delete Icon Button */}
                                    <button
                                      onClick={() => deleteUserInDashboard(u._id, u.name)}
                                      className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 transition cursor-pointer"
                                      title="Delete User Account"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-gray-400 dark:text-gray-500 italic font-medium">Locked</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Premium Pagination Footer */}
                      {totalUsersPages > 1 && (
                        <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-150 dark:border-gray-750 flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Showing <span className="font-semibold text-gray-800 dark:text-gray-200">{usersStartIndex + 1}</span> to{' '}
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                              {Math.min(usersStartIndex + usersItemsPerPage, filteredUsers.length)}
                            </span>{' '}
                            of <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredUsers.length}</span> users
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setUsersPage(prev => Math.max(prev - 1, 1))}
                              disabled={usersPage === 1}
                              className="px-2.5 py-1.5 border border-gray-250 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-750 disabled:opacity-50 transition shadow-sm cursor-pointer"
                            >
                              Previous
                            </button>
                            {Array.from({ length: totalUsersPages }).map((_, i) => (
                              <button
                                key={i}
                                onClick={() => setUsersPage(i + 1)}
                                className={`px-2.5 py-1.5 border rounded-lg text-xs font-semibold transition ${
                                  usersPage === i + 1
                                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                                    : 'border-gray-200 dark:border-gray-750 text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer'
                                }`}
                              >
                                {i + 1}
                              </button>
                            ))}
                            <button
                              onClick={() => setUsersPage(prev => Math.min(prev + 1, totalUsersPages))}
                              disabled={usersPage === totalUsersPages}
                              className="px-2.5 py-1.5 border border-gray-250 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-750 disabled:opacity-50 transition shadow-sm cursor-pointer"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                Select users to grant connection access
              </p>

              {/* Search Box */}
              {usersList.length > 0 && (
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="🔍 Search users by name, email or role..."
                    value={shareSearch}
                    onChange={e => setShareSearch(e.target.value)}
                    className="w-full px-3 py-1.5 border border-teal-100 rounded-lg text-xs outline-none bg-white focus:border-teal-400"
                  />
                </div>
              )}

              {usersList.length === 0 ? (
                <p className="text-[13px] text-teal-700/50 text-center py-6">
                  No registered users found.
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1.5 ring-1 ring-teal-50 rounded-xl p-2.5 bg-teal-50/30">
                  {usersList.filter(u => {
                    const q = shareSearch.toLowerCase();
                    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
                  }).length === 0 ? (
                    <p className="text-[12px] text-teal-650 text-center py-4">No matching users found.</p>
                  ) : (
                    usersList.filter(u => {
                      const q = shareSearch.toLowerCase();
                      return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
                    }).map(u => {
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
                            u.role === 'admin'
                              ? 'bg-gray-900 text-white'
                              : u.role === 'readwrite'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-teal-100 text-teal-800'
                          }`}>
                            {u.role === 'read' ? 'Read User' : u.role === 'readwrite' ? 'ReadWrite User' : u.role}
                          </span>
                        </label>
                      );
                    })
                  )}
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

      {/* Create User Modal */}
      {createUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs text-left">
          <div className="bg-white dark:bg-gray-850 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-gray-150 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>➕</span> Create New User Account
              </h3>
              <button
                onClick={() => setCreateUserModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              {createError && (
                <div className="bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-lg border border-red-200">
                  ❌ {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={createForm.name}
                  onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. john@example.com"
                  value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={createForm.password}
                  onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  System Role
                </label>
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100 font-semibold cursor-pointer"
                >
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {createForm.role === 'developer' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Developer Query Permission
                    </label>
                    <select
                      value={createForm.accessMode || 'read'}
                      onChange={e => setCreateForm({ ...createForm, accessMode: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100 font-semibold cursor-pointer"
                    >
                      <option value="read">🔒 Read-Only Access (SELECT, SHOW, FIND)</option>
                      <option value="readwrite">⚡ Read & Write Access (SELECT, INSERT, UPDATE, DELETE)</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-gray-150 dark:border-gray-800">
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider text-[10px]">
                      Module Access Permissions
                    </label>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        { key: 'userManagement', label: 'Database Users Manager (Default Unchecked)' },
                        { key: 'query', label: 'Query Editor' },
                        { key: 'connections', label: 'Connection Manager' },
                        { key: 'monitor', label: 'Health & Monitor' },
                        { key: 'auditLogs', label: 'Audit Logs' },
                        { key: 'binlog', label: 'Binlog Poller' },
                        { key: 'backup', label: 'Backup & Restore' },
                        { key: 'history', label: 'Query History' },
                        { key: 'slowQuery', label: 'Slow Query' }
                      ].map(perm => (
                        <label key={perm.key} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-750 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                          <input
                            type="checkbox"
                            checked={!!createForm.permissions?.[perm.key]}
                            onChange={e => setCreateForm({
                              ...createForm,
                              permissions: {
                                ...(createForm.permissions || {}),
                                [perm.key]: e.target.checked
                              }
                            })}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4"
                          />
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-150 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setCreateUserModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  style={{ backgroundColor: '#0d9da4' }}
                  className="px-5 py-2 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
                >
                  {createLoading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUserModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs text-left">
          <div className="bg-white dark:bg-gray-850 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-gray-150 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>✏️</span> Edit User: {editUserModalUser.name}
              </h3>
              <button
                onClick={() => setEditUserModalUser(null)}
                className="text-gray-400 hover:text-gray-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              {editError && (
                <div className="bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-lg border border-red-200">
                  ❌ {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Change Password <span className="text-[10px] text-gray-400 font-normal">(Leave blank to keep current password)</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={editForm.password}
                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Account Role
                </label>
                <select
                  value={editForm.role}
                  onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100 font-semibold cursor-pointer"
                >
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editForm.role === 'developer' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Developer Query Permission
                  </label>
                  <select
                    value={editForm.accessMode}
                    onChange={e => setEditForm({ ...editForm, accessMode: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 dark:text-gray-100 font-semibold cursor-pointer"
                  >
                    <option value="read">🔒 Read-Only Access (SELECT, SHOW, FIND)</option>
                    <option value="readwrite">⚡ Read & Write Access (SELECT, INSERT, UPDATE, DELETE)</option>
                  </select>
                </div>
              )}

              {editForm.role !== 'admin' && (
                <div className="pt-2 border-t border-gray-150 dark:border-gray-800">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider text-[10px]">
                    Module Access Permissions
                  </label>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { key: 'userManagement', label: 'Database Users Manager (Default Unchecked)' },
                      { key: 'query', label: 'Query Editor' },
                      { key: 'connections', label: 'Connection Manager' },
                      { key: 'monitor', label: 'Health & Monitor' },
                      { key: 'auditLogs', label: 'Audit Logs' },
                      { key: 'binlog', label: 'Binlog Poller' },
                      { key: 'backup', label: 'Backup & Restore' },
                      { key: 'history', label: 'Query History' },
                      { key: 'slowQuery', label: 'Slow Query' }
                    ].map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-750 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                        <input
                          type="checkbox"
                          checked={!!editForm.permissions[perm.key]}
                          onChange={e => setEditForm({
                            ...editForm,
                            permissions: {
                              ...editForm.permissions,
                              [perm.key]: e.target.checked
                            }
                          })}
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4"
                        />
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-150 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditUserModalUser(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  style={{ backgroundColor: '#0d9da4' }}
                  className="px-5 py-2 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
                >
                  {editLoading ? 'Saving...' : 'Save User Changes'}
                </button>
              </div>
            </form>
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