import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import SystemAuditLogsPanel from '../components/SystemAuditLogsPanel';
import Toast from '../components/Toast';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [filterType, setFilterType] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchConnText, setSearchConnText] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Table search across all connections
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableSearchTerm, setTableSearchTerm] = useState('');
  const [tableSearchResults, setTableSearchResults] = useState([]);
  const [tableSearchLoading, setTableSearchLoading] = useState(false);
  const [tableSearchError, setTableSearchError] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  // Tab state: 'connections', 'audit-logs', 'users', 'access-control', 'settings'
  const [activeTab, setActiveTab] = useState('connections');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  // Collect unique users involved in connections
  const allUsersInConnections = useMemo(() => {
    const userMap = new Map();
    connections.forEach(conn => {
      if (conn.user && conn.user._id) {
        userMap.set(conn.user._id, conn.user);
      }
      if (Array.isArray(conn.allowedUsers)) {
        conn.allowedUsers.forEach(u => {
          if (u && u._id) userMap.set(u._id, u);
        });
      }
    });
    return Array.from(userMap.values());
  }, [connections]);

  const userOptions = useMemo(() => {
    if (filterRole === 'all') return allUsersInConnections;
    return allUsersInConnections.filter(u => (u.role || '').toLowerCase() === filterRole.toLowerCase());
  }, [allUsersInConnections, filterRole]);

  // Filtered connections list
  const filteredConnections = useMemo(() => {
    return connections.filter(conn => {
      // Database type filter
      if (filterType !== 'all') {
        if ((conn.type || '').toLowerCase() !== filterType.toLowerCase()) {
          return false;
        }
      }

      // Role filter
      if (filterRole !== 'all') {
        const ownerRole = (conn.user?.role || '').toLowerCase();
        const allowedRoles = (conn.allowedUsers || []).map(u => (u.role || '').toLowerCase());
        const matchesRole = ownerRole === filterRole.toLowerCase() || allowedRoles.includes(filterRole.toLowerCase());
        if (!matchesRole) return false;
      }

      // User filter
      if (filterUser !== 'all') {
        const ownerId = conn.user?._id || conn.user;
        const allowedIds = (conn.allowedUsers || []).map(u => u._id || u);
        const matchesUser = ownerId === filterUser || allowedIds.includes(filterUser);
        if (!matchesUser) return false;
      }

      // Status filter
      if (filterStatus === 'connected' && conn.status === 'disconnected') {
        return false;
      }
      if (filterStatus === 'disconnected' && conn.status !== 'disconnected') {
        return false;
      }

      // Search text
      if (searchConnText.trim()) {
        const term = searchConnText.toLowerCase().trim();
        const connName = (conn.name || '').toLowerCase();
        const connHost = (conn.host || '').toLowerCase();
        const connDb = (conn.database || '').toLowerCase();
        const connType = (conn.type || '').toLowerCase();
        const ownerName = (conn.user?.name || '').toLowerCase();
        const matchesText =
          connName.includes(term) ||
          connHost.includes(term) ||
          connDb.includes(term) ||
          connType.includes(term) ||
          ownerName.includes(term);
        if (!matchesText) return false;
      }

      return true;
    });
  }, [connections, filterType, filterRole, filterUser, filterStatus, searchConnText]);

  const visibleConnections = useMemo(() => {
    if (!tableSearchTerm) return filteredConnections;
    const matchingConnectionIds = new Set(tableSearchResults.map(result => result.connectionId));
    return filteredConnections.filter(connection => matchingConnectionIds.has(connection._id));
  }, [filteredConnections, tableSearchResults, tableSearchTerm]);

  const searchTables = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setShowAutocomplete(false);
    const term = tableSearchQuery.trim();
    if (!term) {
      setTableSearchError('Enter a table or collection name to search.');
      setTableSearchResults([]);
      setTableSearchTerm('');
      return;
    }

    setTableSearchLoading(true);
    setTableSearchError('');
    setTableSearchResults([]);
    setTableSearchTerm('');

    const matches = [];
    const failures = [];
    await Promise.all(
      connections.map(async (connection) => {
        let databases = [];
        try {
          const response = await API.get(`/connections/${connection._id}/databases`);
          databases = response.data.databases || [];
          if (databases.length === 0 && connection.database) databases = [connection.database];
        } catch {
          failures.push(connection.name || connection._id);
          return;
        }

        await Promise.all(
          databases.map(async (databaseName) => {
            try {
              let tableOffset = 0;
              let hasMoreTables = true;
              const tables = [];
              while (hasMoreTables) {
                const response = await API.get(
                  `/connections/${connection._id}/objects?database=${encodeURIComponent(databaseName)}&summary=true&tableLimit=1000&tableOffset=${tableOffset}`
                );
                const objects = response.data.result || {};
                const pageTables = objects.tables || objects.collections || [];
                tables.push(...pageTables);
                tableOffset = (response.data.tableOffset || 0) + pageTables.length;
                hasMoreTables = !!response.data.tablesHasMore;
              }

              tables.forEach((table) => {
                const name =
                  typeof table === 'string'
                    ? table
                    : table.name || table.table_name || Object.values(table)[0];
                if (typeof name === 'string' && name.toLowerCase().includes(term.toLowerCase())) {
                  matches.push({
                    connectionId: connection._id,
                    connectionName: connection.name,
                    connectionType: connection.type,
                    database: databaseName,
                    table: name,
                  });
                }
              });
            } catch {
              failures.push(`${connection.name || connection._id} (${databaseName})`);
            }
          })
        );
      })
    );

    setTableSearchResults(matches);
    setTableSearchTerm(term);
    if (failures.length > 0) {
      setTableSearchError(`Could not search ${failures.length} connections: ${failures.join(', ')}`);
    }
    setTableSearchLoading(false);
  };

  // Activity & Procedures states
  const [activityLogs, setActivityLogs] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [selectedUserFilter, setSelectedUserFilter] = useState('all');
  const [subTab, setSubTab] = useState('queries');
  const [procedureAudits, setProcedureAudits] = useState([]);
  const [loadingProcedures, setLoadingProcedures] = useState(false);

  // Sharing Modal
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharingConn, setSharingConn] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');
  const [shareSearch, setShareSearch] = useState('');

  // Users Management state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const usersItemsPerPage = 5;

  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'developer',
    accessMode: 'read',
    permissions: {
      userManagement: false,
      backup: false,
      binlog: true,
      monitor: true,
      query: true,
      history: true,
      slowQuery: true,
      auditLogs: true,
      connections: false,
    },
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editUserModalUser, setEditUserModalUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'developer',
    accessMode: 'read',
    permissions: {},
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Edit Connection Modal States
  const [editConnectionModalConn, setEditConnectionModalConn] = useState(null);
  const [editConnForm, setEditConnForm] = useState({
    name: '',
    type: 'mysql',
    host: 'localhost',
    port: '3306',
    username: 'root',
    password: '',
    database: '',
    connectionString: '',
    ssl: false,
  });
  const [editConnLoading, setEditConnLoading] = useState(false);
  const [editConnTestLoading, setEditConnTestLoading] = useState(false);
  const [editConnError, setEditConnError] = useState('');
  const [editConnTestResult, setEditConnTestResult] = useState(null);

  const handleOpenEditConnModal = (conn) => {
    setEditConnectionModalConn(conn);
    setEditConnForm({
      name: conn.name || '',
      type: conn.type || 'mysql',
      host: conn.host || '',
      port: String(conn.port || (conn.type === 'mysql' ? 3306 : conn.type === 'postgresql' ? 5432 : '')),
      username: conn.username || '',
      password: '',
      database: conn.database || '',
      connectionString: conn.connectionString || '',
      ssl: !!conn.ssl,
    });
    setEditConnError('');
    setEditConnTestResult(null);
  };

  const handleTestEditConnection = async () => {
    setEditConnTestLoading(true);
    setEditConnError('');
    setEditConnTestResult(null);
    try {
      const res = await API.post('/connections/test', editConnForm);
      setEditConnTestResult({ success: true, message: res.data.message || 'Connection successful!' });
    } catch (err) {
      setEditConnTestResult({ success: false, message: err.response?.data?.message || 'Connection test failed!' });
    } finally {
      setEditConnTestLoading(false);
    }
  };

  const handleSaveEditConnection = async (e) => {
    e.preventDefault();
    setEditConnLoading(true);
    setEditConnError('');
    try {
      await API.put(`/connections/${editConnectionModalConn._id}`, editConnForm);
      showToast(`Connection '${editConnForm.name}' updated successfully!`);
      setEditConnectionModalConn(null);
      fetchConnections();
    } catch (err) {
      setEditConnError(err.response?.data?.error || err.response?.data?.message || 'Update failed!');
    } finally {
      setEditConnLoading(false);
    }
  };

  const handleOpenEditUser = (u) => {
    setEditUserModalUser(u);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      password: '',
      role: u.role === 'admin' ? 'admin' : 'developer',
      accessMode: u.accessMode || (u.role === 'readwrite' ? 'readwrite' : 'read'),
      allowedConnections: Array.isArray(u.allowedConnections) ? u.allowedConnections : [],
      permissions: u.permissions || {
        userManagement: false,
        backup: false,
        binlog: true,
        monitor: true,
        query: true,
        history: true,
        slowQuery: true,
        auditLogs: true,
        connections: true,
      },
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
      showToast(`User '${editForm.name}' updated successfully!`);
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
      showToast(`User '${createForm.name}' created successfully!`);
      setCreateUserModalOpen(false);
      setCreateForm({
        name: '',
        email: '',
        password: '',
        role: 'developer',
        accessMode: 'read',
        permissions: { userManagement: false, connections: false },
      });
      fetchUsers();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setCreateLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchConnections();
    fetchActivity();
  }, [user]);

  const fetchConnections = async () => {
    try {
      const res = await API.get('/connections');
      setConnections(res.data.connections || []);
    } catch (err) {
      console.error('Error fetching connections:', err);
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
      showToast(`User role updated successfully!`);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update user role.', 'error');
    }
  };

  const deleteUserInDashboard = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete user ${name}?`)) return;
    try {
      await API.delete(`/users/${id}`);
      showToast(`User account '${name}' deleted successfully!`);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete user.', 'error');
    }
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
      setUsersList(res.data.users || []);
      setSelectedUserIds(res.data.allowedUsers || []);
    } catch {
      setShareError('Failed to load sharing details.');
    }
  };

  const handleToggleUser = (userId) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
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
        developerIds: selectedUserIds,
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

  // Connection count calculations
  const mysqlCount = connections.filter((c) => c.type === 'mysql').length;
  const pgCount = connections.filter((c) => c.type === 'postgresql').length;
  const mongoCount = connections.filter((c) => c.type === 'mongodb').length;
  const oracleCount = connections.filter((c) => c.type === 'oracle').length;

  const filteredUsers = users.filter((u) => {
    const q = usersSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  });

  const totalUsersPages = Math.max(1, Math.ceil(filteredUsers.length / usersItemsPerPage));
  const paginatedUsers = filteredUsers.slice((usersPage - 1) * usersItemsPerPage, usersPage * usersItemsPerPage);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#091720]">
        <div className="text-center p-8">
          <div className="w-10 h-10 border-[3px] border-[#164356] border-t-[#00e5be] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#00e5be] text-sm font-semibold tracking-wide">Loading Unified Platform...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1c24] text-slate-100 flex flex-col selection:bg-[#00e5be]/30 selection:text-white">
      {/* Configure Global Navbar */}
      <Navbar variant="teal" />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Main Container */}
      <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex-1 flex flex-col gap-6">

        {/* 1. Secondary Sub-Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0e2430]/90 border border-[#16394c] p-2 rounded-2xl shadow-lg backdrop-blur-md">
          {/* Left sub-tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTab('connections')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'connections'
                  ? 'bg-[#153444] text-[#00e5be] border border-[#1d4c62] shadow-[0_0_12px_rgba(0,229,190,0.2)]'
                  : 'text-slate-300 hover:text-white hover:bg-[#122c3c]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <span>Connections</span>
            </button>

            <button
              onClick={() => setActiveTab('audit-logs')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'audit-logs'
                  ? 'bg-[#153444] text-[#00e5be] border border-[#1d4c62] shadow-[0_0_12px_rgba(0,229,190,0.2)]'
                  : 'text-slate-300 hover:text-white hover:bg-[#122c3c]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Audit</span>
            </button>

            <button
              onClick={() => navigate('/permissions')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-[#122c3c] transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Access Control</span>
            </button>

            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-[#122c3c] transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Settings</span>
            </button>
          </div>

          {/* Right: Quick Search input */}
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search..."
              value={searchConnText}
              onChange={(e) => setSearchConnText(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#091a24] border border-[#16394d] rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00e5be] transition shadow-inner"
            />
          </div>
        </div>

        {/* 2. Top 4 Engine Metrics Cards (Horizontal Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: MYSQL */}
          <div className="bg-[#0b222a]/95 border border-[#164856] rounded-2xl p-4 shadow-lg flex flex-col justify-between hover:border-[#00e5be]/40 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#09353e] border border-[#156170] flex items-center justify-center text-xl text-[#00e5be] shadow-inner">
                  <svg className="w-5 h-5 text-[#00e5be]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white tracking-wide">MYSQL</h4>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-black text-white">{mysqlCount || 3}</span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Active</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[10px] text-slate-300 font-mono">Read Ops/sec 634</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00e5be]"></span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">Latency 20.4ms</p>
              </div>
            </div>

            {/* Sparkline curve with glowing peaks */}
            <div className="mt-3 relative h-16 w-full flex items-end">
              <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[8px] font-mono text-slate-500">
                <span>200</span>
                <span>100</span>
                <span>0</span>
              </div>
              <div className="w-full pl-6 h-full flex items-end">
                <svg className="w-full h-12 overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="mysqlGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#00e5be" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,35 Q20,38 35,28 T65,10 T85,24 T100,20 L100,40 L0,40 Z"
                    fill="url(#mysqlGlow)"
                  />
                  <path
                    d="M0,35 Q20,38 35,28 T65,10 T85,24 T100,20"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="35" cy="28" r="2.5" fill="#f59e0b" />
                  <circle cx="65" cy="10" r="3" fill="#00e5be" />
                </svg>
              </div>
              <div className="absolute right-0 bottom-0">
                <span className="text-[10px] font-extrabold text-[#00e5be] bg-[#0c3937] border border-[#136154] px-1.5 py-0.5 rounded-md">
                  ↑ +12%
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: POSTGRES */}
          <div className="bg-[#101c34]/95 border border-[#1d3561] rounded-2xl p-4 shadow-lg flex flex-col justify-between hover:border-[#818cf8]/40 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#13264c] border border-[#23427f] flex items-center justify-center text-xl text-[#818cf8] shadow-inner font-bold">
                  M
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white tracking-wide">POSTGRES</h4>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-black text-white">{pgCount || 1}</span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Active</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[10px] text-slate-300 font-mono">Read Ops/sec 26</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#818cf8]"></span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">Latency 20.5ms</p>
              </div>
            </div>

            {/* Sparkline curve */}
            <div className="mt-3 relative h-16 w-full flex items-end">
              <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[8px] font-mono text-slate-500">
                <span>1000</span>
                <span>500</span>
                <span>0</span>
              </div>
              <div className="w-full pl-7 h-full flex items-end">
                <svg className="w-full h-12 overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path
                    d="M0,38 L35,38 Q50,38 55,8 T70,38 L100,38"
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="55" cy="8" r="3" fill="#818cf8" />
                  <circle cx="70" cy="38" r="2.5" fill="#38bdf8" />
                </svg>
              </div>
              <div className="absolute right-0 bottom-0">
                <span className="text-[10px] font-extrabold text-[#f87171] bg-[#36151c] border border-[#632230] px-1.5 py-0.5 rounded-md">
                  ↓ -28%
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: MONGODB */}
          <div className="bg-[#0b2824]/95 border border-[#144f45] rounded-2xl p-4 shadow-lg flex flex-col justify-between hover:border-[#34d399]/40 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0d3b33] border border-[#196b5d] flex items-center justify-center text-xl text-[#34d399] shadow-inner font-bold">
                  🍃
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white tracking-wide">MONGODB</h4>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-black text-white">{mongoCount || 1}</span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Active</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[10px] text-slate-300 font-mono">Read Ops/sec 16</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]"></span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">Latency 8.3ms</p>
              </div>
            </div>

            {/* Sparkline curve */}
            <div className="mt-3 relative h-16 w-full flex items-end">
              <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[8px] font-mono text-slate-500">
                <span>200</span>
                <span>100</span>
                <span>0</span>
              </div>
              <div className="w-full pl-6 h-full flex items-end">
                <svg className="w-full h-12 overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path
                    d="M0,36 Q25,38 45,28 T75,12 T100,32"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="45" cy="28" r="2.5" fill="#34d399" />
                  <circle cx="75" cy="12" r="3" fill="#6ee7b7" />
                </svg>
              </div>
              <div className="absolute right-0 bottom-0">
                <span className="text-[10px] font-extrabold text-[#34d399] bg-[#0c392c] border border-[#16634d] px-1.5 py-0.5 rounded-md">
                  ↑ +57%
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: ORACLE */}
          <div className="bg-[#29171e]/95 border border-[#562531] rounded-2xl p-4 shadow-lg flex flex-col justify-between hover:border-[#f87171]/40 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3f1925] border border-[#71283d] flex items-center justify-center text-xl text-[#f87171] shadow-inner font-bold">
                  🔴
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white tracking-wide">ORACLE</h4>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-black text-white">{oracleCount || 1}</span>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Active</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[10px] text-slate-300 font-mono">Read Ops/sec 11</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f87171]"></span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">Latency 13.6ms</p>
              </div>
            </div>

            {/* Sparkline curve */}
            <div className="mt-3 relative h-16 w-full flex items-end">
              <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[8px] font-mono text-slate-500">
                <span>200</span>
                <span>100</span>
                <span>0</span>
              </div>
              <div className="w-full pl-6 h-full flex items-end">
                <svg className="w-full h-12 overflow-visible" viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path
                    d="M0,38 L30,38 Q45,36 50,26 T70,36 T90,32 L100,38"
                    fill="none"
                    stroke="#f87171"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle cx="50" cy="26" r="2.5" fill="#f87171" />
                </svg>
              </div>
              <div className="absolute right-0 bottom-0">
                <span className="text-[10px] font-extrabold text-[#f87171] bg-[#36171d] border border-[#612431] px-1.5 py-0.5 rounded-md">
                  ↓ down%
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* 3. Main Body: Slim Left Sidebar Rail + Connections / Content Section */}
        <div className="flex gap-4 items-start">
          
          {/* Mini Left Rail */}
          <div className="hidden xl:flex flex-col items-center gap-5 bg-[#0e2430]/90 border border-[#16394c] p-2.5 rounded-2xl shadow-lg shrink-0">
            <button
              onClick={() => setActiveTab('connections')}
              title="Connections"
              className={`flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeTab === 'connections' ? 'text-[#00e5be] bg-[#143242]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <span>Connect</span>
            </button>

            <button
              onClick={() => setActiveTab('audit-logs')}
              title="Audit Logs"
              className={`flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                activeTab === 'audit-logs' ? 'text-[#00e5be] bg-[#143242]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Audit</span>
            </button>

            <button
              onClick={() => navigate('/permissions')}
              title="Access Control"
              className="flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-bold text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Access</span>
            </button>

            <button
              onClick={() => navigate('/query')}
              title="Data Hub"
              className="flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-bold text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              <span>Data Hub</span>
            </button>
          </div>

          {/* Main Work Area */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">

            {activeTab === 'connections' && (
              <>
                {/* Section Header: Title + Count + Add Connection Button */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    Your Connections
                  </h2>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#00e5be] bg-[#0c2832] border border-[#17525e] px-3 py-1 rounded-full">
                      {connections.length} connections
                    </span>

                    <button
                      onClick={() => navigate('/connections')}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-[#0d8692] to-[#00b4d8] hover:from-[#0fa1b0] hover:to-[#00e5be] text-white text-xs font-bold rounded-xl shadow-md hover:shadow-cyan-500/20 transition-all cursor-pointer"
                    >
                      <span>+</span>
                      <span>Add New Connection</span>
                    </button>
                  </div>
                </div>

                {/* Filter Toolbar matching screenshot */}
                <div className="bg-[#0e2531]/90 border border-[#163a4e] p-3 rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
                  
                  {/* Search select */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-[#091a24] text-slate-200 border border-[#1a445b] rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold focus:outline-none focus:border-[#00e5be] appearance-none cursor-pointer"
                      >
                        <option value="all">Search Connections...</option>
                        <option value="mysql">MySQL</option>
                        <option value="postgresql">PostgreSQL</option>
                        <option value="mongodb">MongoDB</option>
                        <option value="oracle">Oracle</option>
                      </select>
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        ▼
                      </span>
                    </div>

                    <button
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="p-1.5 bg-[#091a24] border border-[#1a445b] rounded-xl text-slate-300 hover:text-white"
                      title="Toggle Filter Options"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                    </button>
                  </div>

                  {/* Filter by Database Type pills */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-400">Filter by Database Type</span>

                    {/* All DB pill */}
                    <button
                      onClick={() => setFilterType('all')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        filterType === 'all'
                          ? 'bg-[#1b4332] text-[#52b788] border border-[#2d6a4f]'
                          : 'bg-[#102430] text-slate-300 border border-[#16394c] hover:bg-[#163547]'
                      }`}
                    >
                      <span>🗄️</span>
                      <span>Database Type</span>
                    </button>

                    {/* DB Types / PG pill */}
                    <button
                      onClick={() => setFilterType(filterType === 'postgresql' ? 'all' : 'postgresql')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        filterType === 'postgresql'
                          ? 'bg-[#1e2a4a] text-[#818cf8] border border-[#374c80]'
                          : 'bg-[#102430] text-slate-300 border border-[#16394c] hover:bg-[#163547]'
                      }`}
                    >
                      <span>🐘</span>
                      <span>Database Types</span>
                    </button>

                    {/* vsss pill */}
                    <button
                      onClick={() => {
                        setSearchConnText(searchConnText === 'vsss' ? '' : 'vsss');
                      }}
                      className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        searchConnText === 'vsss'
                          ? 'bg-[#18392b] text-[#52b788] border border-[#2d6a4f]'
                          : 'bg-[#102430] text-slate-300 border border-[#16394c] hover:bg-[#163547]'
                      }`}
                    >
                      vsss
                    </button>

                    {/* MongoDB pill */}
                    <button
                      onClick={() => setFilterType(filterType === 'mongodb' ? 'all' : 'mongodb')}
                      className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        filterType === 'mongodb'
                          ? 'bg-[#133e36] text-[#34d399] border border-[#1d5c50]'
                          : 'bg-[#102430] text-slate-300 border border-[#16394c] hover:bg-[#163547]'
                      }`}
                    >
                      MongoDB
                    </button>

                    {/* postgresql pill */}
                    <button
                      onClick={() => setFilterType(filterType === 'postgresql' ? 'all' : 'postgresql')}
                      className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        filterType === 'postgresql'
                          ? 'bg-[#3b2326] text-[#fca5a5] border border-[#6b3137]'
                          : 'bg-[#102430] text-[#f87171] border border-[#16394c] hover:bg-[#163547]'
                      }`}
                    >
                      postgresql
                    </button>
                  </div>

                  {/* Status Pills */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-400">Status</span>
                    <button
                      onClick={() => setFilterStatus(filterStatus === 'connected' ? 'all' : 'connected')}
                      className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        filterStatus === 'connected'
                          ? 'bg-[#133e33] text-[#34d399] border border-[#1e6150]'
                          : 'bg-[#102430] text-slate-300 border border-[#16394c]'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]"></span>
                      <span>Connected</span>
                    </button>

                    <button
                      onClick={() => setFilterStatus(filterStatus === 'disconnected' ? 'all' : 'disconnected')}
                      className={`px-2.5 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                        filterStatus === 'disconnected'
                          ? 'bg-[#3a2717] text-[#fbbf24] border border-[#664320]'
                          : 'bg-[#102430] text-[#f59e0b] border border-[#16394c]'
                      }`}
                    >
                      Disconnected
                    </button>

                    <button
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="px-3 py-1 rounded-xl font-semibold bg-[#102430] text-slate-300 border border-[#16394c] hover:bg-[#143242] transition-all cursor-pointer"
                    >
                      Advanced Filters
                    </button>
                  </div>
                </div>

                {/* Advanced Filter drawer */}
                {showAdvancedFilters && (
                  <div className="bg-[#0b1e28] border border-[#184258] rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fadeIn">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Filter by Role</label>
                      <select
                        value={filterRole}
                        onChange={(e) => {
                          setFilterRole(e.target.value);
                          setFilterUser('all');
                        }}
                        className="w-full bg-[#08151d] border border-[#173d52] rounded-xl px-3 py-1.5 text-xs text-white"
                      >
                        <option value="all">All Roles</option>
                        <option value="admin">👑 Admin</option>
                        <option value="developer">💻 Developer</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Filter by User</label>
                      <select
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                        className="w-full bg-[#08151d] border border-[#173d52] rounded-xl px-3 py-1.5 text-xs text-white"
                      >
                        <option value="all">All Users ({userOptions.length})</option>
                        {userOptions.map((u) => (
                          <option key={u._id} value={u._id}>
                            👤 {u.name} ({u.role || 'user'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        onClick={() => {
                          setFilterType('all');
                          setFilterRole('all');
                          setFilterUser('all');
                          setFilterStatus('all');
                          setSearchConnText('');
                          setTableSearchTerm('');
                          setTableSearchResults([]);
                        }}
                        className="w-full px-4 py-2 bg-rose-950/60 border border-rose-800 text-rose-300 font-bold rounded-xl text-xs hover:bg-rose-900/60 transition cursor-pointer"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  </div>
                )}

                {/* Connection Cards Grid (2 Columns) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {visibleConnections.map((conn) => {
                    const isShared = conn.user && conn.user._id !== (user?._id || user?.id);
                    const isHealthy = conn.status !== 'disconnected';

                    return (
                      <div
                        key={conn._id}
                        className="bg-[#0e2531]/95 border border-[#163a4e] hover:border-[#00e5be]/40 rounded-2xl p-4.5 shadow-lg flex flex-col justify-between transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          
                          {/* Left: Engine icon + name + host */}
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* DB Type Badge */}
                            <div className="w-11 h-11 rounded-2xl bg-[#091f2a] border border-[#15465a] flex items-center justify-center shrink-0 text-xl shadow-inner">
                              {conn.type === 'mysql' && (
                                <svg className="w-6 h-6 text-[#00e5be]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                                </svg>
                              )}
                              {conn.type === 'postgresql' && (
                                <span className="font-bold text-[#818cf8] text-base">M</span>
                              )}
                              {conn.type === 'mongodb' && <span>🍃</span>}
                              {conn.type === 'oracle' && <span>🔴</span>}
                              {!['mysql', 'postgresql', 'mongodb', 'oracle'].includes(conn.type) && <span>🗄️</span>}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-white group-hover:text-[#00e5be] transition-colors truncate">
                                  {conn.name}
                                </h3>

                                {isShared && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#3a2717] text-[#fbbf24] border border-[#664320]">
                                    Shared by {conn.user.name}
                                  </span>
                                )}

                                <span className="text-[10px] font-bold text-[#34d399] flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]"></span>
                                  {isHealthy ? 'Healthy' : 'Disconnected'}
                                </span>
                              </div>

                              <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                {conn.type === 'mongodb'
                                  ? 'MongoDB'
                                  : `${conn.host || 'localhost'}:${conn.port || (conn.type === 'mysql' ? 3306 : 5432)}`}
                              </p>
                            </div>
                          </div>

                          {/* Right: Metadata (Last Activity, IP:Port) */}
                          <div className="text-right text-[11px] font-mono shrink-0 hidden sm:block">
                            <p className="text-slate-400">Last Activity: 12:17 AM</p>
                            <p className="text-slate-500 mt-0.5">IP:Port: {conn.host || '127.0.0.1'}:{conn.port || 3306}</p>
                          </div>
                        </div>

                        {/* Bottom Actions Row */}
                        <div className="mt-4 pt-3 border-t border-[#143547] flex items-center justify-between gap-3 flex-wrap">
                          {/* Engine tag pill */}
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-lg ${
                              conn.type === 'mysql'
                                ? 'bg-[#0b3330] text-[#00e5be] border border-[#136154]'
                                : conn.type === 'postgresql'
                                ? 'bg-[#18233f] text-[#818cf8] border border-[#2b3c66]'
                                : conn.type === 'mongodb'
                                ? 'bg-[#312a14] text-[#fbbf24] border border-[#59481a]'
                                : 'bg-[#3b171f] text-[#f87171] border border-[#69202f]'
                            }`}
                          >
                            {conn.type}
                          </span>

                          <div className="flex items-center gap-2">
                            {/* Share button (admin only) */}
                            {user?.role === 'admin' && (
                              <button
                                onClick={() => handleOpenShareModal(conn)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#0a1e28] text-slate-300 hover:text-white border border-[#163a4e] transition cursor-pointer"
                              >
                                Share
                              </button>
                            )}

                            {/* Edit / Config button */}
                            {(user?.role === 'admin' || !conn.user || conn.user._id === (user?._id || user?.id)) && (
                              <button
                                onClick={() => handleOpenEditConnModal(conn)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#112a38] hover:bg-[#153444] text-slate-200 border border-[#1b435a] text-xs font-semibold transition cursor-pointer"
                              >
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span>Config</span>
                              </button>
                            )}

                            {/* Open > Button */}
                            <button
                              onClick={() => navigate(`/connections/${conn._id}`)}
                              className="flex items-center gap-1 px-4 py-1 rounded-lg bg-[#0e848e] hover:bg-[#119ea9] text-white text-xs font-bold shadow-md transition cursor-pointer"
                            >
                              <span>Open</span>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* 6th Slot: Search Table Across All Connections */}
                  <div className="bg-gradient-to-br from-[#0c313c] to-[#0a232c] border border-[#16606d] rounded-2xl p-4.5 shadow-xl flex flex-col justify-between relative overflow-hidden">
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                          Search Table Across All Connections
                        </h3>
                        <span className="text-xs text-[#00e5be]">✦</span>
                      </div>

                      <form onSubmit={searchTables} className="relative mt-2">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              placeholder="Search Table..."
                              value={tableSearchQuery}
                              onChange={(e) => {
                                setTableSearchQuery(e.target.value);
                                setShowAutocomplete(true);
                              }}
                              onFocus={() => setShowAutocomplete(true)}
                              className="w-full bg-[#081b24] border border-[#16515f] rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00e5be] shadow-inner"
                            />
                            {showAutocomplete && (
                              <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#f0f9fb] text-slate-800 rounded-xl shadow-2xl border border-teal-200 py-1.5 z-30 text-xs font-semibold animate-fadeIn">
                                <div
                                  onClick={() => {
                                    setTableSearchQuery('users');
                                    setShowAutocomplete(false);
                                  }}
                                  className="px-3.5 py-1.5 hover:bg-teal-100 cursor-pointer flex items-center gap-2"
                                >
                                  <span className="text-teal-600">Auto-completion</span>
                                  <span>users</span>
                                </div>
                                <div
                                  onClick={() => {
                                    setTableSearchQuery('localhost');
                                    setShowAutocomplete(false);
                                  }}
                                  className="px-3.5 py-1.5 hover:bg-teal-100 cursor-pointer flex items-center gap-2"
                                >
                                  <span className="text-teal-600">Auto-completion</span>
                                  <span>localhost</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <button
                            type="submit"
                            disabled={tableSearchLoading}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#0d828e] hover:bg-[#109da9] text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer shrink-0 disabled:opacity-60"
                          >
                            <svg className="w-3.5 h-3.5 text-cyan-200" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <span>{tableSearchLoading ? 'Searching...' : 'Execute Search'}</span>
                          </button>
                        </div>
                      </form>

                      {tableSearchError && (
                        <p className="mt-2 text-xs text-amber-400 font-mono">{tableSearchError}</p>
                      )}

                      {tableSearchResults.length > 0 && (
                        <div className="mt-3 max-h-36 overflow-y-auto space-y-1.5 pr-1">
                          {tableSearchResults.slice(0, 5).map((r, i) => (
                            <div
                              key={i}
                              onClick={() => navigate(`/connections/${r.connectionId}/db/${encodeURIComponent(r.database)}?table=${encodeURIComponent(r.table)}`)}
                              className="bg-[#09222c] hover:bg-[#0f2c38] border border-[#164b59] p-2 rounded-xl flex items-center justify-between text-xs cursor-pointer transition"
                            >
                              <span className="font-bold text-[#00e5be] truncate">{r.table}</span>
                              <span className="text-[10px] text-slate-400 font-mono truncate">{r.connectionName} · {r.database}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </>
            )}

            {/* Application Audit Logs Tab View */}
            {activeTab === 'audit-logs' && (
              <div className="bg-[#0e2531]/95 border border-[#163a4e] rounded-2xl p-6 shadow-xl">
                <SystemAuditLogsPanel />
              </div>
            )}

            {/* Users Tab View */}
            {activeTab === 'users' && user?.role === 'admin' && (
              <div className="bg-[#0e2531]/95 border border-[#163a4e] rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between flex-wrap gap-4 mb-5 pb-4 border-b border-[#143344]">
                  <div>
                    <h3 className="text-base font-bold text-white">System Users &amp; Roles</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Manage accounts, change roles, edit permissions.</p>
                  </div>

                  <button
                    onClick={() => setCreateUserModalOpen(true)}
                    className="px-4 py-2 bg-[#0e848e] hover:bg-[#119ea9] text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer"
                  >
                    + Add New User
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-[#081822] text-slate-400 uppercase text-[10px]">
                      <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#143344]">
                      {paginatedUsers.map((u) => (
                        <tr key={u._id} className="hover:bg-[#122836]">
                          <td className="px-4 py-3 font-semibold text-white">{u.name}</td>
                          <td className="px-4 py-3 font-mono">{u.email}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-md bg-[#133c36] text-[#00e5be] font-bold uppercase text-[10px]">
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 flex items-center gap-2">
                            <button
                              onClick={() => handleOpenEditUser(u)}
                              className="px-2.5 py-1 bg-[#102a38] hover:bg-[#16384c] text-teal-300 rounded-lg font-semibold cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteUserInDashboard(u._id, u.name)}
                              className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-lg font-semibold cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. Bottom 3 Overview Cards (Global Health, Connection Map, Recent Activity) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              
              {/* Card 1: Global Health Overview */}
              <div className="bg-[#0e2531]/90 border border-[#163a4e] rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white tracking-wide">Global Health Overview</h4>
                  <span className="text-[10px] font-mono text-[#00e5be]">99.98% Uptime</span>
                </div>
                <div className="h-20 w-full relative">
                  <svg className="w-full h-full" viewBox="0 0 100 35" preserveAspectRatio="none">
                    <path
                      d="M0,25 Q15,30 30,15 T60,10 T80,20 T100,8 L100,35 L0,35 Z"
                      fill="url(#healthGrad)"
                    />
                    <path
                      d="M0,25 Q15,30 30,15 T60,10 T80,20 T100,8"
                      fill="none"
                      stroke="#00e5be"
                      strokeWidth="2"
                    />
                    <defs>
                      <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00e5be" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#00e5be" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Zero packet drops across 5 active database clusters.</p>
              </div>

              {/* Card 2: Connection Status Map */}
              <div className="bg-[#0e2531]/90 border border-[#163a4e] rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white tracking-wide">Connection Status Map</h4>
                  <span className="text-[10px] font-mono text-[#34d399]">● 5/5 Online</span>
                </div>
                <div className="h-20 w-full flex items-center justify-center relative opacity-85">
                  <svg className="w-full h-full text-teal-400/25" viewBox="0 0 120 50" fill="currentColor">
                    <path d="M14 12c2-2 5-1 7 1s4 5 2 7-6 4-8 2-2-7-1-10zm25 8c3-3 8-1 9 2s-1 6-4 7-6-1-7-3 0-5 2-6zm45-6c4-3 10 0 12 4s-1 8-5 9-8-2-9-5 0-6 2-8zm-55 24c2-2 6-1 7 2s-1 5-4 5-5-2-5-4 0-2 2-3zm65-4c3-2 8 0 9 4s-2 7-5 7-7-2-7-5 1-4 3-6z" />
                    <circle cx="28" cy="18" r="2.5" fill="#00e5be" />
                    <circle cx="50" cy="22" r="2" fill="#818cf8" />
                    <circle cx="85" cy="16" r="2.5" fill="#34d399" />
                  </svg>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Clusters distributed across US-East, EU-Central &amp; AP-South.</p>
              </div>

              {/* Card 3: Recent Activity Feed */}
              <div className="bg-[#0e2531]/90 border border-[#163a4e] rounded-2xl p-4 shadow-lg flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-white tracking-wide">Recent Activity Feed</h4>
                  <span className="text-[10px] font-mono text-slate-400">Live</span>
                </div>
                <div className="space-y-1.5 max-h-20 overflow-y-auto pr-1">
                  {activityLogs.slice(0, 3).map((log, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] text-slate-300">
                      <span className="truncate max-w-[140px] text-[#00e5be]">{log.user?.name || 'VSS'}: {log.query || 'SELECT *'}</span>
                      <span className="text-slate-500 font-mono">Just now</span>
                    </div>
                  ))}
                  {activityLogs.length === 0 && (
                    <p className="text-[10px] text-slate-500">No recent query events.</p>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Real-time audit telemetry captured automatically.</p>
              </div>

            </div>

          </div>

        </div>

      </div>

      {/* Modals */}
      {/* 1. Edit Connection Modal */}
      {editConnectionModalConn && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0c1e28] border border-[#1b435a] rounded-2xl w-full max-w-lg p-6 shadow-2xl text-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#143344] mb-4">
              <h3 className="text-base font-bold text-white">Edit Connection: {editConnForm.name}</h3>
              <button
                onClick={() => setEditConnectionModalConn(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditConnection} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Connection Name</label>
                <input
                  type="text"
                  value={editConnForm.name}
                  onChange={(e) => setEditConnForm({ ...editConnForm, name: e.target.value })}
                  className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Host / Server</label>
                  <input
                    type="text"
                    value={editConnForm.host}
                    onChange={(e) => setEditConnForm({ ...editConnForm, host: e.target.value })}
                    className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Port</label>
                  <input
                    type="text"
                    value={editConnForm.port}
                    onChange={(e) => setEditConnForm({ ...editConnForm, port: e.target.value })}
                    className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Username</label>
                  <input
                    type="text"
                    value={editConnForm.username}
                    onChange={(e) => setEditConnForm({ ...editConnForm, username: e.target.value })}
                    className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Password</label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={editConnForm.password}
                    onChange={(e) => setEditConnForm({ ...editConnForm, password: e.target.value })}
                    className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Default Database / Schema</label>
                <input
                  type="text"
                  value={editConnForm.database}
                  onChange={(e) => setEditConnForm({ ...editConnForm, database: e.target.value })}
                  className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                />
              </div>

              {editConnError && (
                <p className="text-rose-400 font-mono text-[11px]">{editConnError}</p>
              )}
              {editConnTestResult && (
                <p className={`font-mono text-[11px] ${editConnTestResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {editConnTestResult.message}
                </p>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-[#143344]">
                <button
                  type="button"
                  onClick={handleTestEditConnection}
                  disabled={editConnTestLoading}
                  className="px-3 py-2 bg-[#102a38] text-teal-300 hover:text-white rounded-xl font-bold cursor-pointer"
                >
                  {editConnTestLoading ? 'Testing...' : 'Test Connection'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditConnectionModalConn(null)}
                    className="px-3 py-2 bg-transparent text-slate-400 hover:text-white rounded-xl font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editConnLoading}
                    className="px-4 py-2 bg-[#0d828e] hover:bg-[#109da9] text-white rounded-xl font-bold cursor-pointer"
                  >
                    {editConnLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Share Connection Modal */}
      {shareModalOpen && sharingConn && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0c1e28] border border-[#1b435a] rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#143344] mb-4">
              <h3 className="text-base font-bold text-white">Share Connection</h3>
              <button onClick={() => setShareModalOpen(false)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Grant selected team members permission to query and browse <span className="text-[#00e5be] font-bold">{sharingConn.name}</span>.
            </p>

            <div className="max-h-48 overflow-y-auto space-y-2 border border-[#163a4e] bg-[#08151d] p-3 rounded-xl mb-4">
              {usersList.map((u) => (
                <label key={u._id} className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u._id)}
                    onChange={() => handleToggleUser(u._id)}
                    className="rounded bg-[#0c1e28] border-[#163a4e] text-[#00e5be] focus:ring-0"
                  />
                  <span>{u.name} ({u.email})</span>
                </label>
              ))}
            </div>

            {shareError && <p className="text-rose-400 text-xs mb-2">{shareError}</p>}
            {shareSuccess && <p className="text-emerald-400 text-xs mb-2">{shareSuccess}</p>}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#143344]">
              <button
                onClick={() => setShareModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveShare}
                disabled={shareLoading}
                className="px-4 py-1.5 bg-[#0d828e] hover:bg-[#109da9] text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                {shareLoading ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Create User Modal */}
      {createUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0c1e28] border border-[#1b435a] rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#143344] mb-4">
              <h3 className="text-base font-bold text-white">Create New User</h3>
              <button onClick={() => setCreateUserModalOpen(false)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Role</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                >
                  <option value="developer">Developer</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {createError && <p className="text-rose-400 text-xs">{createError}</p>}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#143344]">
                <button
                  type="button"
                  onClick={() => setCreateUserModalOpen(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 bg-[#0d828e] hover:bg-[#109da9] text-white font-bold rounded-xl cursor-pointer"
                >
                  {createLoading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Edit User Modal */}
      {editUserModalUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0c1e28] border border-[#1b435a] rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-[#143344] mb-4">
              <h3 className="text-base font-bold text-white">Edit User: {editForm.name}</h3>
              <button onClick={() => setEditUserModalUser(null)} className="text-slate-400 hover:text-white font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full bg-[#08151d] border border-[#163a4e] rounded-xl px-3 py-2 text-white"
                >
                  <option value="developer">Developer</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {editError && <p className="text-rose-400 text-xs">{editError}</p>}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#143344]">
                <button
                  type="button"
                  onClick={() => setEditUserModalUser(null)}
                  className="px-3 py-2 text-slate-400 hover:text-white font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-[#0d828e] hover:bg-[#109da9] text-white font-bold rounded-xl cursor-pointer"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
