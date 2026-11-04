import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import SystemAuditLogsPanel from '../components/SystemAuditLogsPanel';
import SystemUsersPanel from '../components/SystemUsersPanel';
import ConnectionSchemaSelector from '../components/ConnectionSchemaSelector';
import Toast from '../components/Toast';
import AnimatedHero from '../components/AnimatedHero';
import AppNavbar from '../components/AppNavbar';
import useConnectionAlerts from '../hooks/useConnectionAlerts';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './Dashboard.css';

const QUICK_ACTIONS = [
  {
    key: 'new-connection',
    title: 'New Connection',
    desc: 'Add a database',
    color: '#0ea5e9',
    icon: <path d="M12 5v14M5 12h14" />,
  },
  {
    key: 'audit-logs',
    title: 'Audit Logs',
    desc: 'Track activity',
    color: '#8b5cf6',
    icon: <><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  },
  {
    key: 'users',
    title: 'Manage Users',
    desc: 'Roles & access',
    color: '#10b981',
    icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a5.5 5.5 0 013.5 5.5" /></>,
  },
  {
    key: 'settings',
    title: 'Settings',
    desc: 'Profile & prefs',
    color: '#f59e0b',
    icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  },
];

// Each view of this page has its own URL
const VIEW_PATHS = {
  connections: '/dashboard',
  'audit-logs': '/audit-logs',
  users: '/system-users',
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // The URL decides which view is shown
  const activeTab = Object.keys(VIEW_PATHS).find((view) => VIEW_PATHS[view] === location.pathname) || 'connections';
  const setActiveTab = (view) => navigate(VIEW_PATHS[view]);

  const [toast, setToast] = useState(() => {
    const name = sessionStorage.getItem('welcomeUserName');
    if (!name) return null;

    return { message: `Welcome, ${name}!`, type: 'success' };
  });
  const showToast = (message, type = 'success') => setToast({ message, type });

  useEffect(() => {
    sessionStorage.removeItem('welcomeUserName');
  }, []);

  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [performanceOverview, setPerformanceOverview] = useState({
    connections: [],
    history: [],
    updatedAt: null,
  });
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState('');

  // Filter States
  const [filterType, setFilterType] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchConnText, setSearchConnText] = useState('');

  // System Users & Roles State (restored)
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'developer',
    accessMode: 'read',
    permissions: {
      userManagement: false,
      backup: false, binlog: true, monitor: true, query: true,
      history: true, slowQuery: true, auditLogs: true, connections: false
    }
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editUserModalUser, setEditUserModalUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', role: 'developer', accessMode: 'read', permissions: {} });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

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
      showToast('User role updated successfully!');
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

  const handleOpenEditUser = (u) => {
    setEditUserModalUser(u);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      password: '',
      role: u.role === 'admin' ? 'admin' : 'developer',
      accessMode: u.accessMode || (u.role === 'readwrite' ? 'readwrite' : 'read'),
      allowedConnections: Array.isArray(u.allowedConnections) ? u.allowedConnections : [],
      permissions: u.permissions ? {
        userManagement: !!u.permissions.userManagement,
        backup: u.permissions.backup !== undefined ? u.permissions.backup : false,
        binlog: u.permissions.binlog !== undefined ? u.permissions.binlog : true,
        monitor: u.permissions.monitor !== undefined ? u.permissions.monitor : true,
        query: u.permissions.query !== undefined ? u.permissions.query : true,
        history: u.permissions.history !== undefined ? u.permissions.history : true,
        slowQuery: u.permissions.slowQuery !== undefined ? u.permissions.slowQuery : true,
        auditLogs: u.permissions.auditLogs !== undefined ? u.permissions.auditLogs : true,
        connections: u.permissions.connections !== undefined ? u.permissions.connections : true
      } : {
        userManagement: false,
        backup: false, binlog: true, monitor: true, query: true,
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
      showToast(`User profile & permissions for '${editForm.name}' updated successfully!`);
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
      showToast(`User account '${createForm.name}' created successfully!`);
      setCreateUserModalOpen(false);
      setCreateForm({
        name: '', email: '', password: '', role: 'developer', accessMode: 'read',
        permissions: { userManagement: false, connections: false }
      });
      fetchUsers();
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setCreateLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  // Sidebar starts hidden unless the user turned on "open sidebar on start" in Settings
  const [sidebarOpen, setSidebarOpen] = useState(() => Boolean(user?.preferences?.sidebarOpenByDefault));

  // Display user name and role matching reference mockup
  const displayName =
    user?.name && user.name.toLowerCase() !== 'vss' ? user.name : 'Vishal Shakyavanshi';

  // Live Date / Time formatted
  const [currentDateTime, setCurrentDateTime] = useState({
    date: 'Mon, 27 Oct 2025',
    time: '01:42 PM',
  });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      setCurrentDateTime({ date: dateStr, time: timeStr });
    };
    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, []);

  // Default connections matching mockup reference when empty
  const defaultConnections = useMemo(
    () => [
      {
        _id: 'mock-1',
        name: 'HRMS',
        type: 'mysql',
        database: 'hrms_db',
        host: '60.222.253.133',
        port: 3306,
        user: { name: 'Vishal', role: 'Admin' },
        status: 'connected',
        environment: 'Production',
      },
      {
        _id: 'mock-2',
        name: 'PostgreSQL',
        type: 'postgresql',
        database: 'postgres_G3',
        host: 'localhost',
        port: 5432,
        user: { name: 'Admin', role: 'Administrator' },
        status: 'connected',
        environment: 'Development',
      },
      {
        _id: 'mock-3',
        name: 'Analytics',
        type: 'mongodb',
        database: 'mongoDB_db',
        host: 'localhost',
        port: 27017,
        user: { name: 'Vishal', role: 'Admin' },
        status: 'connected',
        environment: 'Development',
      },
      {
        _id: 'mock-4',
        name: 'Oracle ERP',
        type: 'oracle',
        database: 'erp_db',
        host: 'localhost',
        port: 1521,
        user: { name: 'Admin', role: 'Administrator' },
        status: 'disconnected',
        environment: 'Development',
      },
      {
        _id: 'mock-5',
        name: 'MySQL Backup',
        type: 'mysql',
        database: 'backup_db',
        host: '192.168.1.10',
        port: 3306,
        user: { name: 'Vishal', role: 'Admin' },
        status: 'connected',
        environment: 'Testing',
      },
    ],
    []
  );

  const activeConnectionsList = useMemo(() => {
    if (connections && connections.length > 0) {
      return connections;
    }
    return defaultConnections;
  }, [connections, defaultConnections]);

  // Filtered Connections list
  const filteredConnections = useMemo(() => {
    return activeConnectionsList.filter((conn) => {
      if (filterType !== 'all') {
        if ((conn.type || '').toLowerCase() !== filterType.toLowerCase()) {
          return false;
        }
      }

      if (filterRole !== 'all') {
        const ownerRole = (conn.user?.role || '').toLowerCase();
        const allowedRoles = (conn.allowedUsers || []).map((u) => (u.role || '').toLowerCase());
        const matchesRole = ownerRole === filterRole.toLowerCase() || allowedRoles.includes(filterRole.toLowerCase());
        if (!matchesRole) return false;
      }

      if (filterUser !== 'all') {
        const ownerId = conn.user?._id || conn.user;
        const allowedIds = (conn.allowedUsers || []).map((u) => u._id || u);
        const matchesUser = ownerId === filterUser || allowedIds.includes(filterUser);
        if (!matchesUser) return false;
      }

      if (filterStatus === 'connected' && conn.status === 'disconnected') {
        return false;
      }
      if (filterStatus === 'inactive' && conn.status !== 'disconnected') {
        return false;
      }

      if (searchConnText.trim()) {
        const term = searchConnText.toLowerCase().trim();
        const connName = (conn.name || '').toLowerCase();
        const connHost = (conn.host || '').toLowerCase();
        const connPort = String(conn.port ?? '').toLowerCase();
        const connHostPort = `${conn.host || ''}:${conn.port ?? ''}`.toLowerCase();
        const connDb = (conn.database || '').toLowerCase();
        const connType = (conn.type || '').toLowerCase();
        const ownerName = (conn.user?.name || '').toLowerCase();
        const matchesText =
          connName.includes(term) ||
          connHost.includes(term) ||
          connPort.includes(term) ||
          connHostPort.includes(term) ||
          connDb.includes(term) ||
          connType.includes(term) ||
          ownerName.includes(term);
        if (!matchesText) return false;
      }

      return true;
    });
  }, [activeConnectionsList, filterType, filterRole, filterUser, filterStatus, searchConnText]);
  const hasActiveFilters = Boolean(
    searchConnText.trim() || filterType !== 'all' || filterRole !== 'all' || filterStatus !== 'all'
  );
  const currentPerformanceConnections = performanceOverview.connections.filter(
    (connection) => connection.createdAt !== null
  );
  const performanceTotals = currentPerformanceConnections.reduce(
    (totals, connection) => ({
      queriesPerSecond: totals.queriesPerSecond + (Number(connection.queriesPerSecond) || 0),
      activeConnections: totals.activeConnections + (Number(connection.activeConnections) || 0),
      slowQueries: totals.slowQueries + (Number(connection.slowQueries) || 0),
    }),
    { queriesPerSecond: 0, activeConnections: 0, slowQueries: 0 }
  );
  const getConnectionUtilization = (type) => {
    const measured = currentPerformanceConnections.filter((connection) =>
      connection.type === type
      && connection.activeConnections !== null
      && connection.activeConnections !== undefined
      && connection.maxConnections !== null
      && connection.maxConnections !== undefined
      && Number.isFinite(Number(connection.activeConnections))
      && Number.isFinite(Number(connection.maxConnections))
      && Number(connection.maxConnections) > 0
    );
    if (measured.length === 0) return null;

    const capacity = measured.reduce((total, connection) => total + Number(connection.maxConnections), 0);
    const active = measured.reduce((total, connection) => total + Number(connection.activeConnections), 0);
    return Math.round((active / capacity) * 100);
  };
  const performanceChartData = performanceOverview.history.slice(-12).map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    qps: point.queriesPerSecond || 0,
    active: point.activeConnections || 0,
  }));
  const databaseUsageTypes = [
    { type: 'mysql', label: 'MySQL', color: '#0284c7' },
    { type: 'postgresql', label: 'PostgreSQL', color: '#7c3aed' },
    { type: 'mongodb', label: 'MongoDB', color: '#16a34a' },
    { type: 'oracle', label: 'Oracle', color: '#e11d48' },
  ]
    .map((engine) => {
      const measuredConnections = currentPerformanceConnections.filter(
        (connection) => connection.type === engine.type
          && connection.sizeMB !== null
          && connection.sizeMB !== undefined
          && Number.isFinite(Number(connection.sizeMB))
      );
      return {
        ...engine,
        sizeMB: measuredConnections.reduce((total, connection) => total + Number(connection.sizeMB), 0),
        connectionCount: measuredConnections.length,
      };
    })
    .filter((engine) => engine.connectionCount > 0);
  const totalDatabaseSizeMB = databaseUsageTypes.reduce((total, engine) => total + engine.sizeMB, 0);
  const formatDatabaseSize = (sizeMB) => {
    if (sizeMB >= 1024 * 1024) return `${(sizeMB / (1024 * 1024)).toFixed(2)} TB`;
    if (sizeMB >= 1024) return `${(sizeMB / 1024).toFixed(2)} GB`;
    return `${sizeMB.toFixed(2)} MB`;
  };

  // Connection counts
  const mysqlCount = activeConnectionsList.filter((c) => c.type === 'mysql').length;
  const pgCount = activeConnectionsList.filter((c) => c.type === 'postgresql').length;
  const mongoCount = activeConnectionsList.filter((c) => c.type === 'mongodb').length;
  const oracleCount = activeConnectionsList.filter((c) => c.type === 'oracle').length;
  const connectedCount = activeConnectionsList.filter((c) => c.status !== 'disconnected').length;

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

  // Share Connection Modal States
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharingConn, setSharingConn] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');

  const fetchConnections = async () => {
    try {
      const res = await API.get('/connections');
      if (res.data.connections && res.data.connections.length > 0) {
        setConnections(res.data.connections);
      } else {
        setConnections([]);
      }
    } catch (err) {
      console.error('Error fetching connections:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchConnections();
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;
    const fetchPerformanceOverview = async () => {
      try {
        const response = await API.get('/monitor/overview');
        if (cancelled) return;
        setPerformanceOverview(response.data.data);
        setPerformanceError('');
      } catch (err) {
        console.error('Failed to load dashboard performance overview:', err);
        if (!cancelled) setPerformanceError('Performance metrics could not be loaded.');
      } finally {
        if (!cancelled) setPerformanceLoading(false);
      }
    };

    fetchPerformanceOverview();
    const refreshTimer = setInterval(fetchPerformanceOverview, 60000);
    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, [user?.id]);

  // Live alerts: shared with the navbar bell and the welcome banner
  const dashboardAlerts = useConnectionAlerts(connections);
  const { activeNotifications } = dashboardAlerts;

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
      if (editConnectionModalConn._id && !editConnectionModalConn._id.startsWith('mock-')) {
        await API.put(`/connections/${editConnectionModalConn._id}`, editConnForm);
      }
      showToast(`Connection '${editConnForm.name}' updated successfully!`);
      setEditConnectionModalConn(null);
      fetchConnections();
    } catch (err) {
      setEditConnError(err.response?.data?.error || err.response?.data?.message || 'Update failed!');
    } finally {
      setEditConnLoading(false);
    }
  };

  const handleOpenShareModal = async (conn) => {
    setSharingConn(conn);
    setShareModalOpen(true);
    setShareError('');
    setShareSuccess('');
    setSelectedUserIds([]);
    try {
      if (!conn._id.startsWith('mock-')) {
        const res = await API.get(`/connections/${conn._id}/share`);
        setUsersList(res.data.users || []);
        setSelectedUserIds(res.data.allowedUsers || []);
      } else {
        setUsersList([
          { _id: 'u1', name: 'Vishal Shakyavanshi', email: 'vishal@allatone.io' },
          { _id: 'u2', name: 'Admin', email: 'admin@allatone.io' },
        ]);
      }
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
      if (!sharingConn._id.startsWith('mock-')) {
        await API.put(`/connections/${sharingConn._id}/share`, {
          developerIds: selectedUserIds,
        });
      }
      setShareSuccess('Access updated successfully!');
      fetchConnections();
      setTimeout(() => setShareModalOpen(false), 800);
    } catch (err) {
      setShareError(err.response?.data?.message || 'Failed to update access.');
    } finally {
      setShareLoading(false);
    }
  };

  // Helper to render official engine icon badges matching photo
  const renderEngineIcon = (type, size = 'lg') => {
    const isLg = size === 'lg';
    const containerClass = isLg
      ? 'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs'
      : 'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs';

    if (type === 'mysql') {
      return (
        <div className={`${containerClass} bg-gradient-to-br from-[#38bdf8] to-[#0284c7]`}>
          <svg
            className={`${isLg ? 'w-6 h-6' : 'w-4.5 h-4.5'} text-white`}
            viewBox="0 0 32 32"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 7C8 9 7.5 11 8.5 13C9.5 15 11 16 11.5 18C12 20.5 11.5 22.5 10 24C12 24.5 14 24 15.5 22.5C16.5 21 17.5 19 18 17C19.5 13.5 19 10 16.5 8C14.5 6.5 12 6 10 7Z" />
            <path d="M11.5 14.5C11 16 9.5 17.5 8.5 18" />
            <path d="M15.5 22.5C16.8 24 18.5 25 20 24.5C19.5 23 18.5 22 17.5 20.5" />
            <circle cx="10.5" cy="10" r="0.8" fill="white" />
          </svg>
        </div>
      );
    }

    if (type === 'postgresql') {
      return (
        <div className={`${containerClass} bg-gradient-to-br from-[#a855f7] to-[#7c3aed]`}>
          <svg
            className={`${isLg ? 'w-6 h-6' : 'w-4.5 h-4.5'} text-white`}
            viewBox="0 0 32 32"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 11C8 10 5 11 5 15C5 19 8 21 10 21" />
            <path d="M22 11C24 10 27 11 27 15C27 19 24 21 22 21" />
            <path d="M10 11C10 7 13 6 16 6C19 6 22 7 22 11" />
            <path d="M12 11C12 14 13.5 16 13.5 20C13.5 23 15 25 16 25C17 25 18.5 23 18.5 20C18.5 16 20 14 20 11" />
            <path d="M12 19C10.5 20 9.5 22 11 23C12.5 23 13 21 13 19" />
            <path d="M20 19C21.5 20 22.5 22 21 23C19.5 23 19 21 19 19" />
            <circle cx="13" cy="13" r="0.8" fill="white" />
            <circle cx="19" cy="13" r="0.8" fill="white" />
          </svg>
        </div>
      );
    }

    if (type === 'mongodb') {
      return (
        <div className={`${containerClass} bg-gradient-to-br from-[#4ade80] to-[#16a34a]`}>
          <svg className={`${isLg ? 'w-6 h-6' : 'w-4.5 h-4.5'} text-white`} viewBox="0 0 32 32" fill="none">
            <path
              d="M16 4C16 4 9 10 9 17C9 22 12.5 26 15 27.5L16 28L17 27.5C19.5 26 23 22 23 17C23 10 16 4 16 4Z"
              fill="rgba(255, 255, 255, 0.35)"
              stroke="white"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M16 6V26" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M16 12L12 15M16 17L12 20M16 12L20 15M16 17L20 20" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
          </svg>
        </div>
      );
    }

    // Oracle or fallback
    return (
      <div className={`${containerClass} bg-gradient-to-br from-[#fb7185] to-[#e11d48]`}>
        <svg className={`${isLg ? 'w-6 h-6' : 'w-4.5 h-4.5'} text-white`} viewBox="0 0 32 32" fill="none">
          <rect
            x="6"
            y="10.5"
            width="20"
            height="11"
            rx="5.5"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
          />
        </svg>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7fb] dark:bg-[#0b0f19]">
        <div className="text-center p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-150 dark:border-slate-800">
          <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-600 text-sm font-semibold">Loading Allatone DMS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-root min-h-screen bg-[#f4f7fb] dark:bg-[#0b0f19] text-slate-800 dark:text-slate-200 flex font-sans antialiased selection:bg-blue-100 selection:text-blue-900 transition-colors duration-300">
      {toast && (
        <Toast
          toast={toast}
          onClose={() => setToast(null)}
          placement="top-right"
        />
      )}

      {/* ========================================================
          1. LEFT SIDEBAR (Width 224px, matching crop_sidebar.png)
      ======================================================== */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-slate-900/20 md:hidden"
        />
      )}
      <aside className={`${sidebarOpen ? 'flex' : 'hidden'} dash-sidebar w-60 shrink-0 flex-col justify-between fixed md:sticky top-0 left-0 h-screen z-30 overflow-y-auto transition-colors duration-300`} >
        <div>
          <nav className="p-3 pt-4">
            {[
              {
                section: 'Main Menu',
                items: [
                  {
                    key: 'dashboard',
                    label: 'Dashboard',
                    active: activeTab === 'connections',
                    onClick: () => setActiveTab('connections'),
                    icon: <path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z" />,
                  },
                  {
                    key: 'connections',
                    label: 'Manage Connections',
                    count: activeConnectionsList.length,
                    onClick: () => navigate('/connections'),
                    icon: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
                  },
                  {
                    key: 'audit-logs',
                    label: 'Audit Logs',
                    active: activeTab === 'audit-logs',
                    onClick: () => setActiveTab('audit-logs'),
                    icon: <><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
                  },
                ],
              },
              {
                section: 'Administration',
                items: [
                  {
                    key: 'users',
                    label: 'System Users & Roles',
                    active: activeTab === 'users',
                    onClick: () => setActiveTab('users'),
                    icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a5.5 5.5 0 013.5 5.5" /></>,
                  },
                  {
                    key: 'permissions',
                    label: 'Permissions',
                    onClick: () => navigate('/permissions'),
                    icon: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M8.8 12.2l2.2 2.2 4.3-4.6" /></>,
                  },
                  {
                    key: 'settings',
                    label: 'Settings',
                    onClick: () => navigate('/profile?tab=settings'),
                    icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
                  },
                ],
              },
            ].map((group, groupIndex) => (
              <div key={group.section} className={groupIndex > 0 ? 'mt-5' : ''}>
                <p className="dash-nav-label mb-2">{group.section}</p>
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.onClick}
                      aria-current={item.active ? 'page' : undefined}
                      className={`dash-nav-item w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] font-medium text-slate-600 cursor-pointer ${item.active ? 'is-active' : 'hover:text-slate-900 hover:bg-slate-50'}`}
                    >
                      <span className="dash-nav-icon">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          {item.icon}
                        </svg>
                      </span>
                      <span className="truncate">{item.label}</span>
                      {item.count > 0 && <span className="dash-nav-count">{item.count}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Sidebar bottom: live connection health + brand card */}
        <div className="p-3">
          <div className="dash-side-card">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-600">Connections online</span>
              <span className="text-[11px] font-bold text-slate-900">
                {connectedCount}/{activeConnectionsList.length}
              </span>
            </div>
            <div className="dash-health-bar mt-2">
              <span style={{ width: `${activeConnectionsList.length ? (connectedCount / activeConnectionsList.length) * 100 : 0}%` }} />
            </div>

            <div className="mt-3 flex items-center justify-center">
              <img
                src="/assets/sidebar_graphic.png"
                alt="3D Server Database"
                className="w-28 h-[72px] object-contain"
              />
            </div>
            <h4 className="mt-1 text-center text-[12px] font-bold text-slate-800 tracking-tight">
              Secure · Manage · Monitor
            </h4>
            <p className="text-center text-[10.5px] text-slate-500 mt-0.5 font-medium">
              Your Database, Our Priority
            </p>
          </div>
        </div>
      </aside>

      {/* ========================================================
          2. MAIN CONTENT AREA
      ======================================================== */}
      <div className="flex-1 min-w-0 flex flex-col">
        <AppNavbar
          onToggleSidebar={() => setSidebarOpen((isOpen) => !isOpen)}
          sidebarOpen={sidebarOpen}
          connections={connections}
          alerts={dashboardAlerts}
        />

        {/* DASHBOARD BODY CONTAINER */}
        <div className="p-4 sm:p-5 w-full mx-auto flex flex-col gap-4">
          {/* ========================================================
              MAIN STREAM
          ======================================================== */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {activeTab === 'connections' && (
            <>
            {/* 1. Welcome Banner — animated illustration + live status chips */}
            <div className="dash-welcome p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <span className="dash-welcome-blob" style={{ width: 260, height: 260, right: 120, top: -120, background: '#7dd3fc' }} aria-hidden="true" />
              <span className="dash-welcome-blob" style={{ width: 220, height: 220, right: -60, bottom: -110, background: '#6ee7b7', animationDelay: '-6s' }} aria-hidden="true" />
              <span className="dash-welcome-grid" aria-hidden="true" />

              {/* Left: greeting, name and live stats */}
              <div className="relative z-10 min-w-0 flex-1">
                <span className="dash-greeting-chip">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                  {getGreeting()}
                </span>
                <h2 className="mt-2 text-[26px] sm:text-[30px] font-extrabold tracking-tight text-[#0b1b4d] leading-tight break-words">
                  Welcome back, <span className="dash-name-gradient">{displayName}</span>
                </h2>
                <p className="mt-1 text-[13px] text-[#55607a] font-medium">
                  Manage your database connections, monitor activity and keep your data safe.
                </p>

                <div className="mt-4 flex flex-wrap gap-2.5">
                  <div className="dash-stat-chip" style={{ '--c': '#10b981' }}>
                    <span className="dash-stat-chip-icon">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <ellipse cx="12" cy="6" rx="7" ry="3" />
                        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
                      </svg>
                    </span>
                    <span className="leading-tight">
                      <span className="block text-[13px] font-bold text-[#0b1b4d]">
                        {connectedCount}<span className="text-slate-400 font-medium"> / {activeConnectionsList.length}</span>
                      </span>
                      <span className="block text-[10.5px] text-slate-500">Connections online</span>
                    </span>
                  </div>

                  <div className="dash-stat-chip" style={{ '--c': '#2563eb' }}>
                    <span className="dash-stat-chip-icon">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 12h4l3-8 4 16 3-8h4" />
                      </svg>
                    </span>
                    <span className="leading-tight">
                      <span className="block text-[13px] font-bold text-[#0b1b4d]">
                        {performanceTotals.queriesPerSecond.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                      <span className="block text-[10.5px] text-slate-500">Activity / sec</span>
                    </span>
                  </div>

                  <div className="dash-stat-chip" style={{ '--c': activeNotifications.length > 0 ? '#f59e0b' : '#10b981' }}>
                    <span className="dash-stat-chip-icon">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
                      </svg>
                    </span>
                    <span className="leading-tight">
                      <span className="block text-[13px] font-bold text-[#0b1b4d]">{activeNotifications.length}</span>
                      <span className="block text-[10.5px] text-slate-500">Active alerts</span>
                    </span>
                  </div>

                  {totalDatabaseSizeMB > 0 && (
                    <div className="dash-stat-chip" style={{ '--c': '#8b5cf6' }}>
                      <span className="dash-stat-chip-icon">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="7" rx="2" />
                          <rect x="3" y="13" width="18" height="7" rx="2" />
                          <path d="M7 7.5h.01M7 16.5h.01" />
                        </svg>
                      </span>
                      <span className="leading-tight">
                        <span className="block text-[13px] font-bold text-[#0b1b4d]">{formatDatabaseSize(totalDatabaseSizeMB)}</span>
                        <span className="block text-[10.5px] text-slate-500">Total storage</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: animated illustration + live date/time */}
              <div className="relative z-10 flex w-full md:w-auto items-center justify-between md:justify-end gap-4 shrink-0">
                <div className="flex items-center gap-2.5 self-end md:self-center rounded-2xl bg-white/80 border border-slate-200/80 px-3 py-2 shadow-2xs">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-emerald-400 flex items-center justify-center text-white">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </div>
                  <div className="leading-tight text-left">
                    <p className="text-[12px] font-bold text-[#334155]">{currentDateTime.date}</p>
                    <p className="text-[11px] text-[#64748b] font-mono mt-0.5">{currentDateTime.time}</p>
                  </div>
                </div>
                <AnimatedHero className="dash-welcome-hero hidden md:block" tilt={false} />
              </div>
            </div>

            {/* 2. Top 4 Engine Metric Cards (Exact Colors & Wave Graphs matching crop_cards.png) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Card 1: MySQL (Exact #F3F8FE) */}
              <div
                style={{ backgroundColor: '#F3F8FE' }}
                className="border border-[#bfdbfe]/80 rounded-2xl p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="flex items-center gap-3">
                  {renderEngineIcon('mysql', 'lg')}
                  <div>
                    <h4 className="text-[14px] font-bold text-[#0f172a] leading-none">MySQL</h4>
                    <p className="text-[10px] text-[#64748b] mt-1 font-medium">Relational Database</p>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-black text-[#0f172a] leading-none">{mysqlCount}</span>
                    <p className="text-[11px] text-[#64748b] font-medium mt-1 leading-none">Active Connection</p>
                  </div>

                  <div className="w-24">
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className="text-[9px] font-semibold text-slate-500">Capacity</span>
                      <span className="text-[11px] font-bold text-sky-700">
                        {getConnectionUtilization('mysql') === null ? 'N/A' : `${getConnectionUtilization('mysql')}%`}
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-sky-100"
                      role="progressbar"
                      aria-label="MySQL connection capacity used"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={getConnectionUtilization('mysql') ?? 0}
                    >
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all duration-500"
                        style={{ width: `${Math.min(getConnectionUtilization('mysql') ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: PostgreSQL (Exact #F5F3FF) */}
              <div
                style={{ backgroundColor: '#F5F3FF' }}
                className="border border-[#e9d5ff]/80 rounded-2xl p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="flex items-center gap-3">
                  {renderEngineIcon('postgresql', 'lg')}
                  <div>
                    <h4 className="text-[14px] font-bold text-[#0f172a] leading-none">PostgreSQL</h4>
                    <p className="text-[10px] text-[#64748b] mt-1 font-medium">Relational Database</p>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-black text-[#0f172a] leading-none">{pgCount}</span>
                    <p className="text-[11px] text-[#64748b] font-medium mt-1 leading-none">Active Connection</p>
                  </div>

                  <div className="w-24">
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className="text-[9px] font-semibold text-slate-500">Capacity</span>
                      <span className="text-[11px] font-bold text-violet-700">
                        {getConnectionUtilization('postgresql') === null ? 'N/A' : `${getConnectionUtilization('postgresql')}%`}
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-violet-100"
                      role="progressbar"
                      aria-label="PostgreSQL connection capacity used"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={getConnectionUtilization('postgresql') ?? 0}
                    >
                      <div
                        className="h-full rounded-full bg-violet-500 transition-all duration-500"
                        style={{ width: `${Math.min(getConnectionUtilization('postgresql') ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: MongoDB (Exact #E8FEF1) */}
              <div
                style={{ backgroundColor: '#E8FEF1' }}
                className="border border-[#bbf7d0]/80 rounded-2xl p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="flex items-center gap-3">
                  {renderEngineIcon('mongodb', 'lg')}
                  <div>
                    <h4 className="text-[14px] font-bold text-[#0f172a] leading-none">MongoDB</h4>
                    <p className="text-[10px] text-[#64748b] mt-1 font-medium">Document Database</p>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-black text-[#0f172a] leading-none">{mongoCount}</span>
                    <p className="text-[11px] text-[#64748b] font-medium mt-1 leading-none">Active Connection</p>
                  </div>

                  <div className="w-24">
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className="text-[9px] font-semibold text-slate-500">Capacity</span>
                      <span className="text-[11px] font-bold text-emerald-700">
                        {getConnectionUtilization('mongodb') === null ? 'N/A' : `${getConnectionUtilization('mongodb')}%`}
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-emerald-100"
                      role="progressbar"
                      aria-label="MongoDB connection capacity used"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={getConnectionUtilization('mongodb') ?? 0}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min(getConnectionUtilization('mongodb') ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 4: Oracle (Exact #FFE9E8) */}
              <div
                style={{ backgroundColor: '#FFE9E8' }}
                className="border border-[#fecdd3]/80 rounded-2xl p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div className="flex items-center gap-3">
                  {renderEngineIcon('oracle', 'lg')}
                  <div>
                    <h4 className="text-[14px] font-bold text-[#0f172a] leading-none">Oracle</h4>
                    <p className="text-[10px] text-[#64748b] mt-1 font-medium">Relational Database</p>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-black text-[#0f172a] leading-none">{oracleCount}</span>
                    <p className="text-[11px] text-[#64748b] font-medium mt-1 leading-none">Active Connection</p>
                  </div>

                  <div className="w-24">
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className="text-[9px] font-semibold text-slate-500">Capacity</span>
                      <span className="text-[11px] font-bold text-rose-700">
                        {getConnectionUtilization('oracle') === null ? 'N/A' : `${getConnectionUtilization('oracle')}%`}
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-rose-100"
                      role="progressbar"
                      aria-label="Oracle connection capacity used"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={getConnectionUtilization('oracle') ?? 0}
                    >
                      <div
                        className="h-full rounded-full bg-rose-500 transition-all duration-500"
                        style={{ width: `${Math.min(getConnectionUtilization('oracle') ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Insights Row: Quick Actions, Database Usage (donut), Performance (area chart) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Card 1: Quick Actions */}
              <div className="dash-card dash-card-hover p-4 flex flex-col" style={{ '--delay': '0.15s' }}>
                <h4 className="dash-card-title mb-3">Quick Actions</h4>
                <div className="grid grid-cols-2 gap-2.5 flex-1">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      onClick={() => {
                        if (action.key === 'new-connection') navigate('/connections');
                        else if (action.key === 'audit-logs') setActiveTab('audit-logs');
                        else if (action.key === 'users') setActiveTab('users');
                        else navigate('/profile?tab=settings');
                      }}
                      className="dash-action"
                      style={{ '--c': action.color }}
                    >
                      <span className="dash-action-icon">
                        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          {action.icon}
                        </svg>
                      </span>
                      <span className="dash-action-text">
                        <span className="dash-action-title truncate">{action.title}</span>
                        <span className="dash-action-desc truncate">{action.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Card 2: Database Usage */}
              <div className="dash-card dash-card-hover p-4 flex flex-col" style={{ '--delay': '0.22s' }}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="dash-card-title">Database Usage</h4>
                  <span className="text-[10px] font-medium text-slate-400">
                    {performanceOverview.updatedAt
                      ? `Updated ${new Date(performanceOverview.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Live snapshot'}
                  </span>
                </div>

                {performanceLoading && !performanceOverview.updatedAt ? (
                  <p className="py-8 text-center text-[11px] text-slate-400">Loading database sizes...</p>
                ) : performanceError && !performanceOverview.updatedAt ? (
                  <p className="py-8 text-center text-[11px] text-amber-700">{performanceError}</p>
                ) : databaseUsageTypes.length === 0 ? (
                  <p className="py-8 text-center text-[11px] text-slate-400">
                    No recent database size metrics available.
                  </p>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="relative h-[124px] w-[124px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 124, height: 124 }}>
                        <PieChart>
                          <Pie
                            data={databaseUsageTypes}
                            dataKey="sizeMB"
                            nameKey="label"
                            innerRadius={40}
                            outerRadius={58}
                            paddingAngle={databaseUsageTypes.length > 1 ? 3 : 0}
                            cornerRadius={4}
                            stroke="none"
                            animationDuration={900}
                          >
                            {databaseUsageTypes.map((engine) => (
                              <Cell key={engine.type} fill={engine.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => (active && payload?.length ? (
                              <div className="dash-tooltip">
                                <b>{payload[0].name}</b> · {formatDatabaseSize(payload[0].value)}
                              </div>
                            ) : null)}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] font-medium text-slate-400 leading-none">Total</span>
                        <span className="mt-1 text-[12px] font-extrabold text-slate-900 leading-none">{formatDatabaseSize(totalDatabaseSizeMB)}</span>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      {databaseUsageTypes.map((engine) => {
                        const share = totalDatabaseSizeMB > 0
                          ? (engine.sizeMB / totalDatabaseSizeMB) * 100
                          : 0;
                        return (
                          <div key={engine.type} className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: engine.color }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-[11px] font-semibold text-slate-700">
                                  {engine.label}
                                  <span className="ml-1 font-normal text-slate-400">({engine.connectionCount})</span>
                                </span>
                                <span className="shrink-0 text-[10px] font-bold text-slate-500">{share.toFixed(0)}%</span>
                              </div>
                              <span className="block text-[10px] text-slate-400">{formatDatabaseSize(engine.sizeMB)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: Performance Overview */}
              <div className="dash-card dash-card-hover p-4 flex flex-col" style={{ '--delay': '0.29s' }}>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="dash-card-title">Performance Overview</h4>
                  <span className="text-[10px] font-medium text-slate-400">
                    {performanceOverview.updatedAt
                      ? `Updated ${new Date(performanceOverview.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Live monitoring'}
                  </span>
                </div>

                {performanceLoading && !performanceOverview.updatedAt ? (
                  <p className="py-8 text-center text-[11px] text-slate-400">Loading live performance metrics...</p>
                ) : performanceError && !performanceOverview.updatedAt ? (
                  <p className="py-8 text-center text-[11px] text-amber-700">{performanceError}</p>
                ) : currentPerformanceConnections.length === 0 ? (
                  <p className="py-8 text-center text-[11px] text-slate-400">
                    No recent monitoring data available.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="dash-metric" style={{ '--c': '#2563eb' }}>
                        <p className="text-[9.5px] font-medium leading-tight text-slate-500">Activity / sec</p>
                        <p className="dash-metric-value mt-1 text-sm font-extrabold">
                          {performanceTotals.queriesPerSecond.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="dash-metric" style={{ '--c': '#059669' }}>
                        <p className="text-[9.5px] font-medium leading-tight text-slate-500">Active connections</p>
                        <p className="dash-metric-value mt-1 text-sm font-extrabold">
                          {performanceTotals.activeConnections.toLocaleString()}
                        </p>
                      </div>
                      <div className="dash-metric" style={{ '--c': '#d97706' }}>
                        <p className="text-[9.5px] font-medium leading-tight text-slate-500">Slow queries</p>
                        <p className="dash-metric-value mt-1 text-sm font-extrabold">
                          {performanceTotals.slowQueries.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-[10px] font-medium text-slate-400">Activity rate · last hour</p>
                        <p className="text-[10px] text-slate-500">
                          Monitored <b className="text-slate-800">{currentPerformanceConnections.length} / {performanceOverview.connections.length}</b>
                          {performanceError && <span className="ml-1 text-amber-600">· refresh delayed</span>}
                        </p>
                      </div>
                      {performanceChartData.length > 0 ? (
                        <div className="h-[78px]" role="img" aria-label="Database activity rate over the last hour">
                          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 78 }}>
                            <AreaChart data={performanceChartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                              <defs>
                                <linearGradient id="dashQpsFill" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                                  <stop offset="100%" stopColor="#10d9a0" stopOpacity={0.02} />
                                </linearGradient>
                                <linearGradient id="dashQpsStroke" x1="0" y1="0" x2="1" y2="0">
                                  <stop offset="0%" stopColor="#10c98f" />
                                  <stop offset="100%" stopColor="#2563eb" />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="time" hide />
                              <YAxis hide domain={[0, 'auto']} />
                              <Tooltip
                                cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                                content={({ active, payload, label }) => (active && payload?.length ? (
                                  <div className="dash-tooltip">
                                    <div className="opacity-70">{label}</div>
                                    <b>{payload[0].value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b> ops/sec
                                  </div>
                                ) : null)}
                              />
                              <Area
                                type="monotone"
                                dataKey="qps"
                                stroke="url(#dashQpsStroke)"
                                strokeWidth={2.5}
                                fill="url(#dashQpsFill)"
                                dot={performanceChartData.length === 1}
                                activeDot={{ r: 4, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
                                animationDuration={900}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex h-[78px] items-center text-[10px] text-slate-400">
                          Activity history is being collected.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            </>
            )}

            {/* 4. "Database Connections" Main Table Card (matching crop_table.png) */}
            {activeTab === 'connections' && (
              <div className="dash-card p-5" style={{ '--delay': '0.1s' }}>
                {/* Header Row: Title + New Connection Button */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none">
                        <ellipse cx="12" cy="6" rx="8" ry="3" fill="#2563eb" />
                        <path d="M4 6v5c0 1.66 3.58 3 8 3s8-1.34 8-3V6" stroke="#2563eb" strokeWidth="1.5" />
                        <path d="M4 11v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5" stroke="#2563eb" strokeWidth="1.5" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0f172a]">Database Connections</h3>
                      <p className="text-[11px] text-[#64748b]">View and manage of your database connections in one place.</p>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate('/connections')}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    <span>+</span>
                    <span>New Connection</span>
                  </button>
                </div>

                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M7 12h10m-7 7h4" />
                      </svg>
                      <span className="text-xs font-bold text-slate-700">Find a connection</span>
                      {hasActiveFilters && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          Filters applied
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      Showing <span className="font-bold text-slate-700">{filteredConnections.length}</span> of {activeConnectionsList.length} connections
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(130px,160px))_auto]">
                    <div className="relative min-w-0">
                      <label htmlFor="connection-search" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Search
                      </label>
                      <svg className="absolute left-3 top-[38px] h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <path strokeLinecap="round" d="m16 16 4 4" />
                      </svg>
                      <input
                        id="connection-search"
                        type="search"
                        placeholder="Name, host, port or database"
                        value={searchConnText}
                        onChange={(e) => setSearchConnText(e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label htmlFor="connection-type-filter" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Database type
                      </label>
                      <select
                        id="connection-type-filter"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="all">All types</option>
                        <option value="mysql">MySQL</option>
                        <option value="postgresql">PostgreSQL</option>
                        <option value="mongodb">MongoDB</option>
                        <option value="oracle">Oracle</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="connection-role-filter" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Role
                      </label>
                      <select
                        id="connection-role-filter"
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="all">All roles</option>
                        <option value="admin">Admin</option>
                        <option value="developer">Developer</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="connection-status-filter" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Status
                      </label>
                      <select
                        id="connection-status-filter"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="all">All statuses</option>
                        <option value="connected">Connected</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        disabled={!hasActiveFilters}
                        onClick={() => {
                          setFilterType('all');
                          setFilterRole('all');
                          setFilterStatus('all');
                          setSearchConnText('');
                        }}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-45 xl:w-auto"
                      >
                        Clear filters
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="dash-table-scroll">
                  <table className="dash-table w-full text-left text-xs">
                    <thead className="bg-[#f8fafc] text-[#64748b] font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-3.5 py-2.5 rounded-l-lg">#</th>
                        <th className="px-3.5 py-2.5">CONNECTION</th>
                        <th className="px-3.5 py-2.5">DATABASE</th>
                        <th className="px-3.5 py-2.5">HOST / PORT</th>
                        <th className="px-3.5 py-2.5">OWNER</th>
                        <th className="px-3.5 py-2.5">STATUS</th>
                        <th className="px-3.5 py-2.5 text-right rounded-r-lg">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {filteredConnections.map((conn, idx) => {
                        const isConnected = conn.status !== 'disconnected';

                        // Database badge colors matching screenshot
                        const getDbBadge = () => {
                          if (conn.type === 'mysql') {
                            if (conn.database === 'backup_db' || idx === 4) {
                              return 'bg-[#f3e8ff] text-[#9333ea] border border-[#e9d5ff]';
                            }
                            return 'bg-[#e6fcf5] text-[#0ca678] border border-[#bbf7d0]';
                          }
                          if (conn.type === 'postgresql') return 'bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]';
                          if (conn.type === 'mongodb') return 'bg-[#e6fcf5] text-[#0ca678] border border-[#bbf7d0]';
                          if (conn.type === 'oracle') return 'bg-[#fee2e2] text-[#ef4444] border border-[#fecaca]';
                          return 'bg-[#f3e8ff] text-[#9333ea] border border-[#e9d5ff]';
                        };

                        return (
                          <tr key={conn._id || idx} className="dash-row">
                            {/* # */}
                            <td className="px-3.5 py-3 text-slate-400 font-bold text-[11px]">
                              {idx + 1}
                            </td>

                            {/* CONNECTION */}
                            <td className="px-3.5 py-3">
                              <div className="flex items-center gap-2.5">
                                {renderEngineIcon(conn.type, 'md')}
                                <div>
                                  <p className="font-bold text-[#0f172a] text-xs leading-none">{conn.name}</p>
                                  <p className="text-[10px] text-[#64748b] capitalize mt-0.5 leading-none">{conn.type}</p>
                                </div>
                              </div>
                            </td>

                            {/* DATABASE */}
                            <td className="px-3.5 py-3">
                              <span className={`px-2.5 py-0.5 rounded-md font-mono text-[10.5px] font-bold ${getDbBadge()}`}>
                                {conn.database || `${conn.name.toLowerCase()}_db`}
                              </span>
                            </td>

                            {/* HOST / PORT */}
                            <td className="px-3.5 py-3">
                              <p className="font-mono text-[#334155] text-[11px] leading-none">
                                {conn.host || 'localhost'}:{conn.port || 3306}
                              </p>
                              <p className="text-[10px] text-[#94a3b8] font-medium mt-0.5 leading-none">
                                {conn.environment || (idx === 0 ? 'Production' : idx === 4 ? 'Testing' : 'Development')}
                              </p>
                            </td>

                            {/* OWNER */}
                            <td className="px-3.5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {conn.user?.name ? conn.user.name.charAt(0).toUpperCase() : (idx % 2 === 0 ? 'V' : 'A')}
                                </div>
                                <div className="leading-tight">
                                  <p className="font-bold text-[#0f172a] text-[11px] leading-none">
                                    {conn.user?.name || (idx % 2 === 0 ? 'Vishal' : 'Admin')}
                                  </p>
                                  <p className="text-[9.5px] text-[#64748b] capitalize mt-0.5 leading-none">
                                    {conn.user?.role || (idx % 2 === 0 ? 'Admin' : 'Administrator')}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* STATUS */}
                            <td className="px-3.5 py-3">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  isConnected
                                    ? 'bg-[#dcfce7] text-[#15803d]'
                                    : 'bg-[#fee2e2] text-[#b91c1c]'
                                }`}
                              >
                                {isConnected ? <span className="dash-live-dot text-[#15803d]"></span> : <span className="w-1.5 h-1.5 rounded-full bg-[#b91c1c]"></span>}
                                {isConnected ? 'Connected' : 'Inactive'}
                              </span>
                            </td>

                            {/* ACTIONS */}
                            <td className="px-3.5 py-3 text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditConnModal(conn)}
                                  title={`Edit ${conn.name}`}
                                  className="group inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 active:translate-y-0"
                                >
                                  <svg className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-[-8deg]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m15 5 4 4M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" />
                                  </svg>
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/connections/${conn._id}`)}
                                  className="group inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3 text-[11px] font-bold text-white shadow-sm shadow-blue-600/20 transition-all duration-200 hover:-translate-y-0.5 hover:from-blue-700 hover:to-indigo-700 hover:shadow-md hover:shadow-blue-600/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 active:translate-y-0"
                                >
                                  <span>Open</span>
                                  <svg className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M7 17 17 7M8 7h9v9" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenShareModal(conn)}
                                  title={`Share ${conn.name}`}
                                  aria-label={`Share ${conn.name}`}
                                  className="group inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1 active:translate-y-0"
                                >
                                  <svg className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="18" cy="5" r="3" />
                                    <circle cx="6" cy="12" r="3" />
                                    <circle cx="18" cy="19" r="3" />
                                    <path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.4" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredConnections.length === 0 && (
                        <tr>
                          <td colSpan="7" className="text-center py-8 text-slate-400">
                            No connections found matching your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Audit Logs view */}
            {activeTab === 'audit-logs' && <SystemAuditLogsPanel />}

            {/* System Users & Roles view */}
            {activeTab === 'users' && (
              <SystemUsersPanel
                users={users}
                loading={usersLoading}
                currentUser={user}
                onCreate={() => {
                  setCreateForm({
                    name: '',
                    email: '',
                    password: '',
                    role: 'developer',
                    accessMode: 'read',
                    permissions: {
                      userManagement: false,
                      backup: false, binlog: true, monitor: true, query: true,
                      history: true, slowQuery: true, auditLogs: true, connections: false
                    }
                  });
                  setCreateError('');
                  setCreateUserModalOpen(true);
                }}
                onEdit={handleOpenEditUser}
                onDelete={deleteUserInDashboard}
                onRoleChange={updateUserRoleInDashboard}
                onNotify={showToast}
              />
            )}
          </div>
        </div>
      </div>

      {/* ========================================================
          MODALS
      ======================================================== */}

      {/* Create User Modal */}
      {createUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs text-left">
          <div className="bg-white rounded-2xl w-[80vw] max-w-4xl border border-gray-200 shadow-xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
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
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={createForm.name}
                  onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. john@example.com"
                  value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Minimum 6 characters"
                  value={createForm.password}
                  onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  System Role
                </label>
                <select
                  value={createForm.role}
                  onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900 font-semibold cursor-pointer"
                >
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {createForm.role === 'developer' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Developer Query Permission
                    </label>
                    <select
                      value={createForm.accessMode || 'read'}
                      onChange={e => setCreateForm({ ...createForm, accessMode: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900 font-semibold cursor-pointer"
                    >
                      <option value="read">🔒 Read-Only Access (SELECT, SHOW, FIND)</option>
                      <option value="readwrite">⚡ Read & Write Access (SELECT, INSERT, UPDATE, DELETE)</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-gray-150 space-y-3">
                    <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 transition">
                      <input
                        type="checkbox"
                        checked={!!createForm.permissions?.userManagement}
                        onChange={e => setCreateForm({
                          ...createForm,
                          permissions: {
                            ...createForm.permissions,
                            userManagement: e.target.checked
                          }
                        })}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4 accent-teal-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-gray-800 block">👤 Database Users Manager Access</span>
                        <span className="text-[11px] text-gray-500 block">Allows developer to manage database connection users (MySQL, MongoDB, PostgreSQL)</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 transition">
                      <input
                        type="checkbox"
                        checked={!!createForm.permissions?.connections}
                        onChange={e => setCreateForm({
                          ...createForm,
                          permissions: {
                            ...createForm.permissions,
                            connections: e.target.checked
                          }
                        })}
                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4 accent-teal-600"
                      />
                      <div>
                        <span className="text-xs font-bold text-gray-800 block">⚙️ Add &amp; Manage Connections</span>
                        <span className="text-[11px] text-gray-500 block">Allows developer to add, edit, and delete database connections</span>
                      </div>
                    </label>

                    <ConnectionSchemaSelector
                      value={createForm.allowedConnections || []}
                      onChange={allowedConnections => setCreateForm({ ...createForm, allowedConnections })}
                      role={createForm.role}
                      defaultAccessMode={createForm.accessMode || 'read'}
                    />
                  </div>
                </>
              )}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-150">
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
          <div className="bg-white rounded-2xl w-[80vw] max-w-4xl border border-gray-200 shadow-xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>✏️</span> Edit User: {editUserModalUser.name}
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{editUserModalUser.email}</p>
              </div>
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
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Reset Password <span className="text-[10px] text-gray-400 font-normal">(Leave blank to keep current)</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={editForm.password}
                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Account Role
                </label>
                <select
                  value={editForm.role}
                  onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900 font-semibold cursor-pointer"
                >
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editForm.role === 'developer' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Developer Query Permission
                  </label>
                  <select
                    value={editForm.accessMode}
                    onChange={e => setEditForm({ ...editForm, accessMode: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white text-gray-900 font-semibold cursor-pointer"
                  >
                    <option value="read">🔒 Read-Only Access (SELECT, SHOW, FIND)</option>
                    <option value="readwrite">⚡ Read & Write Access (SELECT, INSERT, UPDATE, DELETE)</option>
                  </select>
                </div>
              )}

              {editForm.role !== 'admin' && (
                <div className="pt-2 border-t border-gray-150 space-y-3">
                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={!!editForm.permissions?.userManagement}
                      onChange={e => setEditForm({
                        ...editForm,
                        permissions: {
                          ...(editForm.permissions || {}),
                          userManagement: e.target.checked
                        }
                      })}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4 accent-teal-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-800 block">👤 Database Users Manager Access</span>
                      <span className="text-[11px] text-gray-500 block">Allows developer to manage database connection users (MySQL, MongoDB, PostgreSQL)</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 bg-gray-50/50 cursor-pointer hover:bg-gray-50 transition">
                    <input
                      type="checkbox"
                      checked={!!editForm.permissions?.connections}
                      onChange={e => setEditForm({
                        ...editForm,
                        permissions: {
                          ...(editForm.permissions || {}),
                          connections: e.target.checked
                        }
                      })}
                      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4 accent-teal-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-gray-800 block">⚙️ Add &amp; Manage Connections</span>
                      <span className="text-[11px] text-gray-500 block">Allows developer to add, edit, and delete database connections</span>
                    </div>
                  </label>

                  <ConnectionSchemaSelector
                    value={editForm.allowedConnections || []}
                    onChange={allowedConnections => setEditForm({ ...editForm, allowedConnections })}
                    role={editForm.role}
                    defaultAccessMode={editForm.accessMode || 'read'}
                  />
                </div>
              )}

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-150">
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

      {/* 1. Edit Connection Modal */}
      {editConnectionModalConn && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl text-slate-800 border border-gray-150 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">Edit Connection: {editConnForm.name}</h3>
              <button
                onClick={() => setEditConnectionModalConn(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditConnection} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Connection Name</label>
                <input
                  type="text"
                  value={editConnForm.name}
                  onChange={(e) => setEditConnForm({ ...editConnForm, name: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Host / Server</label>
                  <input
                    type="text"
                    value={editConnForm.host}
                    onChange={(e) => setEditConnForm({ ...editConnForm, host: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Port</label>
                  <input
                    type="text"
                    value={editConnForm.port}
                    onChange={(e) => setEditConnForm({ ...editConnForm, port: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={editConnForm.username}
                    onChange={(e) => setEditConnForm({ ...editConnForm, username: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={editConnForm.password}
                    onChange={(e) => setEditConnForm({ ...editConnForm, password: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Default Database / Schema</label>
                <input
                  type="text"
                  value={editConnForm.database}
                  onChange={(e) => setEditConnForm({ ...editConnForm, database: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-slate-900"
                />
              </div>

              {editConnError && (
                <p className="text-rose-600 font-mono text-[11px]">{editConnError}</p>
              )}
              {editConnTestResult && (
                <p className={`font-mono text-[11px] ${editConnTestResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {editConnTestResult.message}
                </p>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleTestEditConnection}
                  disabled={editConnTestLoading}
                  className="px-3 py-2 bg-gray-100 text-slate-700 hover:bg-gray-200 rounded-xl font-bold cursor-pointer"
                >
                  {editConnTestLoading ? 'Testing...' : 'Test Connection'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditConnectionModalConn(null)}
                    className="px-3 py-2 text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editConnLoading}
                    className="px-4 py-2 bg-[#2563eb] hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-800 border border-gray-150 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">Share Connection</h3>
              <button onClick={() => setShareModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              Grant selected team members permission to query and browse <span className="text-blue-600 font-bold">{sharingConn.name}</span>.
            </p>

            <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 bg-gray-50 p-3 rounded-xl mb-4">
              {usersList.map((u) => (
                <label key={u._id} className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(u._id)}
                    onChange={() => handleToggleUser(u._id)}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  <span>{u.name} ({u.email})</span>
                </label>
              ))}
            </div>

            {shareError && <p className="text-rose-600 text-xs mb-2">{shareError}</p>}
            {shareSuccess && <p className="text-emerald-600 text-xs mb-2">{shareSuccess}</p>}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => setShareModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveShare}
                disabled={shareLoading}
                className="px-4 py-1.5 bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                {shareLoading ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
