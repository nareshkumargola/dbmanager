import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import SystemAuditLogsPanel from '../components/SystemAuditLogsPanel';
import Toast from '../components/Toast';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  // Filter States
  const [filterType, setFilterType] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchConnText, setSearchConnText] = useState('');
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const globalSearchRef = useRef(null);

  // Active view tab (connections or audit-logs)
  const [activeTab, setActiveTab] = useState('connections');
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 768
  );

  // User profile dropdown & theme
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Display user name and role matching reference mockup
  const displayName =
    user?.name && user.name.toLowerCase() !== 'vss' ? user.name : 'Vishal Shakyavanshi';
  const displayRole = user?.role || 'Admin';

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
  const globalSearchResults = filteredConnections.slice(0, 6);

  // Connection counts
  const mysqlCount = activeConnectionsList.filter((c) => c.type === 'mysql').length;
  const pgCount = activeConnectionsList.filter((c) => c.type === 'postgresql').length;
  const mongoCount = activeConnectionsList.filter((c) => c.type === 'mongodb').length;
  const oracleCount = activeConnectionsList.filter((c) => c.type === 'oracle').length;

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

  const handleLogout = () => {
    logout();
    navigate('/login');
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
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7fb]">
        <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-150">
          <div className="w-10 h-10 border-[3px] border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-600 text-sm font-semibold">Loading Allatone DMS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-800 flex font-sans antialiased selection:bg-blue-100 selection:text-blue-900">
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
      <aside className={`${sidebarOpen ? 'flex' : 'hidden'} w-56 bg-white border-r border-gray-150 shrink-0 flex-col justify-between fixed md:sticky top-0 left-0 h-screen z-30`}>
        <div>
          {/* Navigation Links matching crop_sidebar.png */}
          <nav className="p-3 space-y-1">
            {/* 1. Dashboard (Active) */}
            <button
              onClick={() => setActiveTab('connections')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'connections'
                  ? 'bg-[#eff6ff] text-[#2563eb]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4 text-[#2563eb]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Dashboard</span>
            </button>

            {/* 2. Manage Connections */}
            <button
              onClick={() => navigate('/connections')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-gray-50 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="7" />
                <path strokeLinecap="round" d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
              <span>Manage Connections</span>
            </button>

            {/* 4. Audit Logs */}
            <button
              onClick={() => setActiveTab(activeTab === 'audit-logs' ? 'connections' : 'audit-logs')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'audit-logs'
                  ? 'bg-[#eff6ff] text-[#2563eb] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Audit Logs</span>
            </button>

            {/* 5. Users & Roles */}
            <button
              onClick={() => navigate('/permissions')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-gray-50 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Users &amp; Roles</span>
            </button>

            {/* 6. Permissions */}
            <button
              onClick={() => navigate('/permissions')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-gray-50 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Permissions</span>
            </button>

            {/* 7. Settings */}
            <button
              onClick={() => navigate('/profile')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-gray-50 transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Bottom Elements matching crop_sidebar.png */}
        <div className="p-3 space-y-3">
          {/* Card: Secure • Manage • Monitor */}
          <div className="bg-gradient-to-b from-[#f8fafc] to-[#eff6ff] border border-blue-100 rounded-2xl p-3 text-center">
            <div className="w-full flex items-center justify-center mb-1">
              <img
                src="/assets/sidebar_graphic.png"
                alt="3D Server Database"
                className="w-32 h-20 object-contain drop-shadow-sm"
              />
            </div>
            <h4 className="text-[11px] font-bold text-slate-800 tracking-tight">
              Secure · Manage · Monitor
            </h4>
            <p className="text-[9.5px] text-slate-400 mt-0.5 font-medium">
              Your Database, Our Priority
            </p>
          </div>

        </div>
      </aside>

      {/* ========================================================
          2. MAIN CONTENT AREA
      ======================================================== */}
      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
        {/* TOP HEADER BAR */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-150 px-4 sm:px-6 py-2.5 flex flex-wrap xl:flex-nowrap items-center gap-3 shadow-2xs">
          <button
            type="button"
            onClick={() => setSidebarOpen((isOpen) => !isOpen)}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-expanded={sidebarOpen}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl border border-gray-200 text-slate-600 hover:bg-gray-50 hover:text-blue-600 transition cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
              {sidebarOpen ? <path d="m16 9-3 3 3 3" /> : <path d="m13 9 3 3-3 3" />}
            </svg>
          </button>

          {/* Brand stays in the navbar instead of the sidebar */}
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2.5 shrink-0 text-left cursor-pointer"
          >
            <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-sky-500 to-cyan-400 p-0.5 shadow-md shadow-blue-500/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white drop-shadow-xs" viewBox="0 0 24 24" fill="none">
                <ellipse cx="12" cy="6" rx="8" ry="3" fill="#ffffff" fillOpacity="0.95" />
                <path d="M4 6v5c0 1.66 3.58 3 8 3s8-1.34 8-3V6" stroke="#ffffff" strokeWidth="1.5" />
                <path d="M4 11v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5" stroke="#ffffff" strokeWidth="1.5" />
                <path d="M4 16v3c0 1.66 3.58 3 8 3s8-1.34 8-3v-3" stroke="#ffffff" strokeWidth="1.5" />
              </svg>
            </span>
            <span>
              <span className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight text-slate-900 leading-none">Allatone</span>
                <span className="bg-[#0ea5e9] text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full leading-none">DMS</span>
              </span>
              <span className="hidden sm:block text-[9.5px] text-slate-400 font-medium mt-1 leading-none">
                Database Management System
              </span>
            </span>
          </button>

          {/* Global Search Input */}
          <div className="relative order-last xl:order-none w-full xl:w-auto xl:flex-1 xl:max-w-sm" ref={globalSearchRef}>
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search connections, databases, hosts, ports..."
              value={searchConnText}
              onChange={(e) => setSearchConnText(e.target.value)}
              onFocus={() => setGlobalSearchOpen(true)}
              onBlur={() => setGlobalSearchOpen(false)}
              className="w-full pl-8 pr-16 py-1.5 bg-[#f8fafc] border border-gray-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
            />
            <span className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-[10px] font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded border border-gray-200 h-5 my-auto">
              Ctrl + K
            </span>
            {globalSearchOpen && searchConnText.trim() && (
              <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-gray-200 bg-white py-1 shadow-lg z-40">
                {globalSearchResults.length > 0 ? (
                  globalSearchResults.map((conn) => (
                    <button
                      key={conn._id || conn.name}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSearchConnText(conn.name || '');
                        setActiveTab('connections');
                        setGlobalSearchOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 transition flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-800">{conn.name}</span>
                        <span className="block truncate text-[10px] text-slate-500">{conn.database || conn.type}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                        {conn.host || 'localhost'}:{conn.port || 3306}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-slate-500">No connections found.</p>
                )}
              </div>
            )}
          </div>

          {/* Right Header Status & Controls */}
          <div className="ml-auto flex items-center gap-3.5 shrink-0">
            {/* System Online Badge */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <div className="leading-tight">
                <p className="text-xs font-bold text-slate-800 leading-none">System Online</p>
                <p className="text-[9.5px] text-slate-400 mt-0.5 leading-none">All Services Running</p>
              </div>
            </div>

            {/* Notification Bell with Badge */}
            <button className="relative w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 border border-gray-200/80 flex items-center justify-center text-slate-600 transition cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                6
              </span>
            </button>

            {/* Dark / Light Mode Toggle Pill */}
            <div
              onClick={toggleTheme}
              className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-full cursor-pointer hover:bg-gray-200 transition"
              title="Toggle Light / Dark mode"
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${theme === 'dark' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-400'}`}>
                🌙
              </span>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${theme === 'light' ? 'bg-white text-amber-500 shadow-2xs' : 'text-slate-400'}`}>
                ☀️
              </span>
            </div>

            {/* User Profile Pill */}
            <div className="relative" ref={userDropdownRef}>
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-gray-100 transition cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                  VS
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <p className="text-xs font-bold text-slate-800 leading-none">{displayName}</p>
                  <p className="text-[10px] text-slate-400 capitalize mt-0.5 leading-none">{displayRole}</p>
                </div>
              </button>

              {/* Profile Dropdown Menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-150 py-2 z-50 text-slate-700 animate-fadeIn">
                  <div className="px-4 py-2 border-b border-gray-100 mb-1">
                    <p className="text-xs font-bold text-slate-900 truncate">{displayName}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user?.email || 'admin@allatone.io'}</p>
                  </div>
                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      navigate('/profile');
                    }}
                    className="w-full px-4 py-2 text-left text-xs hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 font-medium cursor-pointer"
                  >
                    My Profile &amp; Settings
                  </button>
                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      navigate('/status');
                    }}
                    className="w-full px-4 py-2 text-left text-xs hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 font-medium cursor-pointer"
                  >
                    System Status
                  </button>
                  <div className="my-1 border-t border-gray-100"></div>
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-medium cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* DASHBOARD BODY CONTAINER */}
        <div className="p-4 sm:p-5 w-full mx-auto flex flex-col gap-4">
          {/* ========================================================
              MAIN STREAM
          ======================================================== */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* 1. Welcome Banner (Identical to crop_welcome.png) */}
            <div
              style={{
                background: 'linear-gradient(90deg, #ffffff 0%, #f7faff 45%, #eff6ff 75%, #f5f3ff 100%)',
              }}
              className="border border-[#bfdbfe]/70 rounded-2xl p-4.5 shadow-2xs relative overflow-hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
            >
              {/* Flowing silk ribbon wave art matching crop_welcome.png */}
              <div className="absolute inset-y-0 right-28 left-1/2 pointer-events-none opacity-50 hidden lg:block">
                <svg className="w-full h-full" viewBox="0 0 600 120" preserveAspectRatio="none" fill="none">
                  <path
                    d="M 10,70 C 80,10 160,110 260,50 C 340,-10 420,80 500,40 C 540,20 580,50 600,30"
                    stroke="#38bdf8"
                    strokeWidth="10"
                    strokeOpacity="0.4"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 20,80 C 100,20 180,115 280,60 C 360,5 440,85 520,45"
                    stroke="#818cf8"
                    strokeWidth="7"
                    strokeOpacity="0.35"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 40,65 C 120,5 200,105 300,55 C 380,15 460,75 540,40"
                    stroke="#c084fc"
                    strokeWidth="6"
                    strokeOpacity="0.3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {/* Left Welcome text */}
              <div className="relative z-10 min-w-0 flex-1 lg:ml-8">
                <p className="text-xs font-semibold text-[#2563eb]">Welcome back,</p>
                <h2 className="text-2xl font-black text-[#0f172a] tracking-tight mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 break-words">{displayName}</span>
                  <span className="shrink-0">👏</span>
                </h2>
                <p className="text-xs text-[#64748b] mt-1 font-medium break-words">
                  Manage your database connections, monitor activity and keep your data safe.
                </p>
              </div>

              {/* Right Side: 3D Blue Database Cylinder + Live Date/Time */}
              <div className="relative z-10 flex w-full lg:w-auto items-center justify-end gap-4 shrink-0">
                {/* 3D Glossy Blue Database Cylinder matching crop_welcome.png */}
                <div className="w-12 h-12 relative flex items-center justify-center shrink-0">
                  <img
                    src="/assets/welcome_db_cylinder.png"
                    alt="3D Database Cylinder"
                    className="w-12 h-12 object-contain drop-shadow-sm"
                  />
                </div>

                {/* Date & Time pill matching crop_welcome.png */}
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/95 border border-slate-200/80 flex items-center justify-center text-slate-500 shadow-2xs">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                      <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
                      <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
                      <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                    </svg>
                  </div>
                  <div className="leading-tight text-left">
                    <p className="text-[11px] font-bold text-[#334155]">{currentDateTime.date}</p>
                    <p className="text-[10px] text-[#64748b] font-mono mt-0.5">{currentDateTime.time}</p>
                  </div>
                </div>
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

                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold text-[#16a34a] flex items-center gap-0.5 mb-1 leading-none">
                      ↑ 100%
                    </span>
                    {/* Delicate smooth wave matching crop_cards.png */}
                    <div className="w-22 h-6">
                      <svg className="w-full h-full" viewBox="0 0 100 28" fill="none">
                        <defs>
                          <linearGradient id="mysqlWaveFade" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M 0 18 Q 14 26 28 16 T 56 18 T 80 8 T 100 6 L 100 28 L 0 28 Z" fill="url(#mysqlWaveFade)" />
                        <path d="M 0 18 Q 14 26 28 16 T 56 18 T 80 8 T 100 6" stroke="#0ea5e9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
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

                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold text-[#16a34a] flex items-center gap-0.5 mb-1 leading-none">
                      ↑ 100%
                    </span>
                    {/* Delicate smooth wave matching crop_cards.png */}
                    <div className="w-22 h-6">
                      <svg className="w-full h-full" viewBox="0 0 100 28" fill="none">
                        <defs>
                          <linearGradient id="pgWaveFade" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M 0 20 Q 15 28 30 16 T 60 14 T 82 8 T 100 10 L 100 28 L 0 28 Z" fill="url(#pgWaveFade)" />
                        <path d="M 0 20 Q 15 28 30 16 T 60 14 T 82 8 T 100 10" stroke="#a855f7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
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

                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold text-[#16a34a] flex items-center gap-0.5 mb-1 leading-none">
                      ↑ 100%
                    </span>
                    {/* Delicate smooth wave matching crop_cards.png */}
                    <div className="w-22 h-6">
                      <svg className="w-full h-full" viewBox="0 0 100 28" fill="none">
                        <defs>
                          <linearGradient id="mongoWaveFade" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M 0 22 Q 18 28 35 14 T 68 18 T 88 10 T 100 6 L 100 28 L 0 28 Z" fill="url(#mongoWaveFade)" />
                        <path d="M 0 22 Q 18 28 35 14 T 68 18 T 88 10 T 100 6" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
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

                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-bold text-[#e11d48] flex items-center gap-1 mb-1 leading-none">
                      <span className="w-2 h-2 rounded-full bg-[#e11d48]"></span>
                      0%
                    </span>
                    {/* Delicate smooth wave matching crop_cards.png */}
                    <div className="w-22 h-6">
                      <svg className="w-full h-full" viewBox="0 0 100 28" fill="none">
                        <defs>
                          <linearGradient id="oracleWaveFade" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M 0 20 Q 20 26 40 18 T 70 20 T 90 12 T 100 8 L 100 28 L 0 28 Z" fill="url(#oracleWaveFade)" />
                        <path d="M 0 20 Q 20 26 40 18 T 70 20 T 90 12 T 100 8" stroke="#f43f5e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. "Database Connections" Main Table Card (matching crop_table.png) */}
            {activeTab === 'connections' && (
              <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs">
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

                {/* Filter Toolbar (Strictly 1 single line matching crop_table.png) */}
                <div className="flex items-center justify-between gap-3 mb-3.5 pb-3 border-b border-gray-100 text-xs">
                  <div className="flex items-center gap-2.5 overflow-x-auto py-0.5">
                    {/* Search by name, host, database */}
                    <div className="relative w-48 shrink-0">
                      <span className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-slate-400">
                        🔍
                      </span>
                      <input
                        type="text"
                        placeholder="Search by name, host, port, database..."
                        value={searchConnText}
                        onChange={(e) => setSearchConnText(e.target.value)}
                        className="w-full pl-7 pr-2.5 py-1.5 bg-[#f8fafc] border border-gray-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    {/* Database Type select */}
                    <div className="flex flex-col shrink-0">
                      <label className="text-[9.5px] font-semibold text-slate-400 leading-tight mb-0.5">Database Type</label>
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-[#f8fafc] border border-gray-200 rounded-xl px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                      >
                        <option value="all">All</option>
                        <option value="mysql">MySQL</option>
                        <option value="postgresql">PostgreSQL</option>
                        <option value="mongodb">MongoDB</option>
                        <option value="oracle">Oracle</option>
                      </select>
                    </div>

                    {/* Role select */}
                    <div className="flex flex-col shrink-0">
                      <label className="text-[9.5px] font-semibold text-slate-400 leading-tight mb-0.5">Role</label>
                      <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="bg-[#f8fafc] border border-gray-200 rounded-xl px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                      >
                        <option value="all">All</option>
                        <option value="admin">Admin</option>
                        <option value="developer">Developer</option>
                      </select>
                    </div>

                    {/* Status select */}
                    <div className="flex flex-col shrink-0">
                      <label className="text-[9.5px] font-semibold text-slate-400 leading-tight mb-0.5">Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-[#f8fafc] border border-gray-200 rounded-xl px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                      >
                        <option value="all">All</option>
                        <option value="connected">Connected</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>

                    {/* Clear Filters Button */}
                    <div className="flex items-end shrink-0 pt-3">
                      <button
                        onClick={() => {
                          setFilterType('all');
                          setFilterRole('all');
                          setFilterStatus('all');
                          setSearchConnText('');
                        }}
                        className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer transition"
                      >
                        Clear Filters
                      </button>
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-400 font-medium shrink-0 hidden md:inline-block">
                    Showing {filteredConnections.length} of {activeConnectionsList.length} connections
                  </span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
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
                          <tr key={conn._id || idx} className="hover:bg-gray-50/80 transition-colors">
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
                                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#15803d]' : 'bg-[#b91c1c]'}`}></span>
                                {isConnected ? 'Connected' : 'Inactive'}
                              </span>
                            </td>

                            {/* ACTIONS */}
                            <td className="px-3.5 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => handleOpenEditConnModal(conn)}
                                  className="px-2 py-1 border border-gray-200 text-slate-700 hover:bg-gray-50 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => navigate(`/connections/${conn._id}`)}
                                  className="px-2.5 py-1 bg-[#2563eb] hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                >
                                  <span>Open</span>
                                  <span>↗</span>
                                </button>
                                <button
                                  onClick={() => handleOpenShareModal(conn)}
                                  title="Options"
                                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                                >
                                  ⋮
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

            {/* Audit Logs View (if tab activated) */}
            {activeTab === 'audit-logs' && (
              <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-xs">
                <SystemAuditLogsPanel />
              </div>
            )}

            {/* 4. Bottom Row: 3 Widget Cards (matching crop_bottom.png) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Card 1: Quick Actions */}
              <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                <h4 className="text-xs font-bold text-[#0f172a] tracking-tight mb-2.5">Quick Actions</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => navigate('/connections')}
                    className="p-2 bg-[#0ea5e9] hover:bg-sky-600 text-white rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <span>+</span>
                    <span>New Connection</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('audit-logs')}
                    className="p-2 bg-[#8b5cf6] hover:bg-purple-600 text-white rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <span>📜</span>
                    <span>View Audit Logs</span>
                  </button>

                  <button
                    onClick={() => navigate('/permissions')}
                    className="p-2 bg-[#10b981] hover:bg-emerald-600 text-white rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <span>👥</span>
                    <span>Manage Users</span>
                  </button>

                  <button
                    onClick={() => navigate('/profile')}
                    className="p-2 bg-white hover:bg-gray-50 border border-gray-200 text-slate-700 rounded-xl text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>⚙️</span>
                    <span>Settings</span>
                  </button>
                </div>
              </div>

              {/* Card 2: Database Usage */}
              <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold text-[#0f172a] tracking-tight">Database Usage</h4>
                  <span className="text-[10px] text-blue-600 font-semibold cursor-pointer">Last 7 Days</span>
                </div>

                <div className="flex items-end justify-between gap-3 h-20 pt-1 px-2">
                  {/* MySQL bar (42%) */}
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] font-bold text-[#0ea5e9]">42%</span>
                    <div className="w-full bg-[#0ea5e9] rounded-t-md" style={{ height: '42%' }}></div>
                    <span className="text-[9px] text-[#64748b] font-medium">MySQL</span>
                  </div>

                  {/* PostgreSQL bar (42%) */}
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] font-bold text-[#8b5cf6]">42%</span>
                    <div className="w-full bg-[#8b5cf6] rounded-t-md" style={{ height: '42%' }}></div>
                    <span className="text-[9px] text-[#64748b] font-medium">PostgreSQL</span>
                  </div>

                  {/* MongoDB bar (23%) */}
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] font-bold text-[#22c55e]">23%</span>
                    <div className="w-full bg-[#22c55e] rounded-t-md" style={{ height: '23%' }}></div>
                    <span className="text-[9px] text-[#64748b] font-medium">MongoDB</span>
                  </div>

                  {/* Oracle bar (2%) */}
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] font-bold text-[#f43f5e]">2%</span>
                    <div className="w-full bg-[#f43f5e] rounded-t-md" style={{ height: '8%' }}></div>
                    <span className="text-[9px] text-[#64748b] font-medium">Oracle</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Performance Overview */}
              <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-bold text-[#0f172a] tracking-tight">Performance Overview</h4>
                </div>

                <div className="flex items-center justify-between gap-3">
                  {/* Left smooth blue sparkline matching crop_bottom.png */}
                  <div className="h-14 w-28">
                    <svg className="w-full h-full" viewBox="0 0 100 35" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d="M0,25 Q15,30 30,15 T60,20 T85,8 T100,6 L100,35 L0,35 Z" fill="url(#perfGrad)" />
                      <path d="M0,25 Q15,30 30,15 T60,20 T85,8 T100,6" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </div>

                  {/* Right stats */}
                  <div className="text-right space-y-1">
                    <div>
                      <p className="text-[9.5px] text-[#64748b]">Avg. Response Time</p>
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs font-black text-[#0f172a]">12 ms</span>
                        <span className="text-[9px] text-[#10b981] font-bold">↑ 45%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9.5px] text-[#64748b]">Total Queries (Today)</p>
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs font-black text-[#0f172a]">12,384</span>
                        <span className="text-[9px] text-[#10b981] font-bold">↑ 32%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          MODALS
      ======================================================== */}
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
