import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import EngineIcon from '../components/EngineIcon';
import './Connections.css';

const ENGINE_META = {
  mysql: { label: 'MySQL', logLabel: 'Binlog' },
  postgresql: { label: 'PostgreSQL', logLabel: 'WAL' },
  mongodb: { label: 'MongoDB', logLabel: 'Oplog' },
  oracle: { label: 'Oracle', logLabel: 'Redo' },
};

const ENGINE_COLORS = {
  mysql: '#0284c7',
  postgresql: '#4f46e5',
  mongodb: '#15803d',
  oracle: '#dc2626',
};

const COLOR_THEMES = [
  { key: 'teal', label: 'Teal', swatch: '#0d9488' },
  { key: 'blue', label: 'Ocean Blue', swatch: '#2563eb' },
  { key: 'violet', label: 'Violet', swatch: '#7c3aed' },
  { key: 'rose', label: 'Rose', swatch: '#e11d48' },
  { key: 'amber', label: 'Amber', swatch: '#b45309' },
  { key: 'engine', label: 'By database type', swatch: 'conic-gradient(#0284c7 0 25%, #4f46e5 0 50%, #15803d 0 75%, #dc2626 0)' },
  { key: 'midnight', label: 'Midnight', swatch: '#0f172a' },
];
const THEME_KEYS = COLOR_THEMES.map((theme) => theme.key);
const LAYOUT_STORAGE_KEY = 'connectionsLayout';
const MAX_VISIBLE_CONNECTIONS = 10;
const DEFAULT_LAYOUT = { view: 'cards', cardTheme: 'teal', rowTheme: 'teal' };

// The choice is only a display preference, so a blocked or corrupt store falls back to the default
const readLayout = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)) || {};
    return {
      view: saved.view === 'rows' ? 'rows' : 'cards',
      cardTheme: THEME_KEYS.includes(saved.cardTheme) ? saved.cardTheme : DEFAULT_LAYOUT.cardTheme,
      rowTheme: THEME_KEYS.includes(saved.rowTheme) ? saved.rowTheme : DEFAULT_LAYOUT.rowTheme,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
};

export default function Connections() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });
  const hasPermission = (permKey) => {
    if (user?.role === 'admin') return true;
    if (!user?.permissions) return false;
    return !!user.permissions[permKey];
  };
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Filter States (Database Type, Role, User, Search)
  const [filterType, setFilterType] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [searchConnText, setSearchConnText] = useState('');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableSearchTerm, setTableSearchTerm] = useState('');
  const [tableSearchResults, setTableSearchResults] = useState([]);
  const [tableSearchLoading, setTableSearchLoading] = useState(false);
  const [tableSearchError, setTableSearchError] = useState('');

  // Collect all unique users involved in connections
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

  // Cascading user options based on selected role
  const userOptions = useMemo(() => {
    if (filterRole === 'all') return allUsersInConnections;
    return allUsersInConnections.filter(u => (u.role || '').toLowerCase() === filterRole.toLowerCase());
  }, [allUsersInConnections, filterRole]);

  // Filtered connections list
  const filteredConnections = useMemo(() => {
    return connections.filter(conn => {
      // 1. Database Type Filter
      if (filterType !== 'all') {
        if ((conn.type || '').toLowerCase() !== filterType.toLowerCase()) {
          return false;
        }
      }

      // 2. Role Filter
      if (filterRole !== 'all') {
        const ownerRole = (conn.user?.role || '').toLowerCase();
        const allowedRoles = (conn.allowedUsers || []).map(u => (u.role || '').toLowerCase());
        const matchesRole = ownerRole === filterRole.toLowerCase() || allowedRoles.includes(filterRole.toLowerCase());
        if (!matchesRole) return false;
      }

      // 3. User Filter
      if (filterUser !== 'all') {
        const ownerId = conn.user?._id || conn.user;
        const allowedIds = (conn.allowedUsers || []).map(u => u._id || u);
        const matchesUser = ownerId === filterUser || allowedIds.includes(filterUser);
        if (!matchesUser) return false;
      }

      // Search text
      if (searchConnText.trim()) {
        const term = searchConnText.toLowerCase().trim();
        const connName = (conn.name || '').toLowerCase();
        const connHost = (conn.host || '').toLowerCase();
        const connDb = (conn.database || '').toLowerCase();
        const connType = (conn.type || '').toLowerCase();
        const ownerName = (conn.user?.name || '').toLowerCase();
        const matchesText = connName.includes(term) || connHost.includes(term) || connDb.includes(term) || connType.includes(term) || ownerName.includes(term);
        if (!matchesText) return false;
      }

      return true;
    });
  }, [connections, filterType, filterRole, filterUser, searchConnText]);

  const visibleConnections = useMemo(() => {
    if (!tableSearchTerm) return filteredConnections;
    const matchingConnectionIds = new Set(tableSearchResults.map(result => result.connectionId));
    return filteredConnections.filter(connection => matchingConnectionIds.has(connection._id));
  }, [filteredConnections, tableSearchResults, tableSearchTerm]);

  const searchTables = async (event) => {
    event.preventDefault();
    const term = tableSearchQuery.trim();
    if (!term) {
      setTableSearchError('Enter a table name to search.');
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
    await Promise.all(connections.map(async connection => {
      let databases;
      try {
        const response = await API.get(`/connections/${connection._id}/databases`);
        databases = response.data.databases || [];
        if (databases.length === 0 && connection.database) databases = [connection.database];
      } catch {
        failures.push(connection.name || connection._id);
        return;
      }

      await Promise.all(databases.map(async databaseName => {
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

          tables.forEach(table => {
            const name = typeof table === 'string'
              ? table
              : table.name || table.table_name || Object.values(table)[0];
            if (typeof name === 'string' && name.toLowerCase().includes(term.toLowerCase())) {
              matches.push({
                connectionId: connection._id,
                connectionName: connection.name,
                connectionType: connection.type,
                database: databaseName,
                table: name
              });
            }
          });
        } catch {
          failures.push(`${connection.name || connection._id} (${databaseName})`);
        }
      }));
    }));

    setTableSearchResults(matches);
    setTableSearchTerm(term);
    if (failures.length > 0) {
      setTableSearchError(`Could not search ${failures.length} connection/database${failures.length === 1 ? '' : 's'}: ${failures.join(', ')}`);
    }
    setTableSearchLoading(false);
  };

  // Edit Connection Modal States
  const [editConnectionModalConn, setEditConnectionModalConn] = useState(null);
  const [editConnForm, setEditConnForm] = useState({
    name: '', type: 'mysql', host: 'localhost', port: '3306', username: 'root', password: '', database: '', connectionString: '', ssl: false, accessMode: 'readwrite'
  });
  const [editConnLoading, setEditConnLoading] = useState(false);
  const [editConnTestLoading, setEditConnTestLoading] = useState(false);
  const [editConnError, setEditConnError] = useState('');
  const [editConnTestResult, setEditConnTestResult] = useState(null);

  const handleOpenEditModal = (conn) => {
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
      accessMode: conn.accessMode || 'readwrite'
    });
    setEditConnError('');
    setEditConnTestResult(null);
  };

  const handleTestEditConnection = async () => {
    setEditConnTestLoading(true);
    setEditConnError('');
    setEditConnTestResult(null);
    try {
      const res = await API.post('/connections/test', { ...editConnForm, connectionId: editConnectionModalConn._id });
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

  const [form, setForm] = useState({
    name: '',
    type: 'mysql',
    host: 'localhost',
    port: '3306',
    username: 'root',
    password: '',
    database: '',
    connectionString: '',
    ssl: false,
    accessMode: 'readwrite',
  });

  const [mongoMode, setMongoMode] = useState('structured');

  useEffect(() => {
    let active = true;
    API.get('/connections')
      .then(res => { if (active) setConnections(res.data.connections); })
      .catch(() => { if (active) setError('Failed to load connections'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function fetchConnections() {
    try {
      setLoading(true);
      const res = await API.get('/connections');
      setConnections(res.data.connections);
    } catch {
      setError('Failed to load connections');
    } finally {
      setLoading(false);
    }
  }

  // Type change hone pe default port set karo
  const handleTypeChange = (type) => {
    setTestResult(null);
    setForm({
      ...form,
      type,
      host: type === 'mongodb' ? '127.0.0.1' : 'localhost',
      port: type === 'mysql' ? '3306' : type === 'postgresql' ? '5432' : type === 'oracle' ? '1521' : '27017',
      username: type === 'mysql' ? 'root' : type === 'postgresql' ? 'postgres' : type === 'oracle' ? 'system' : '',
      connectionString: '',
      database: '',
      ssl: false,
    });
  };

  const getProcessedForm = () => {
    if (form.type === 'mongodb' && mongoMode === 'structured') {
      let uri = 'mongodb://';
      if (form.username && form.password) {
        uri += `${encodeURIComponent(form.username)}:${encodeURIComponent(form.password)}@`;
      } else if (form.username) {
        uri += `${encodeURIComponent(form.username)}@`;
      }
      uri += `${form.host || '127.0.0.1'}:${form.port || 27017}`;
      if (form.database) {
        uri += `/${form.database}`;
      }
      return { ...form, connectionString: uri };
    }
    return form;
  };

  // Connection test karo
  const handleTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const processedForm = getProcessedForm();
      const res = await API.post('/connections/test', processedForm);
      setTestResult({ success: true, message: res.data.message });
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection failed!'
      });
    } finally {
      setTestLoading(false);
    }
  };

  // Connection save karo
  const handleSave = async (e) => {
    e.preventDefault();
    setSaveLoading(true);
    setError('');
    setSuccess('');
    try {
      const processedForm = getProcessedForm();
      await API.post('/connections', processedForm);
      setSuccess('Connection saved successfully!');
      setShowForm(false);
      setTestResult(null);
      setForm({
        name: '', type: 'mysql', host: 'localhost',
        port: '3306', username: 'root', password: '',
        database: '', connectionString: '', accessMode: 'readwrite',
      });
      fetchConnections();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Save failed!');
    } finally {
      setSaveLoading(false);
    }
  };

  // Connection delete karo
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await API.delete(`/connections/${id}`);
      setConnections(connections.filter(c => c._id !== id));
      setSuccess('Connection deleted successfully!');
    } catch {
      setError('Delete failed!');
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'mysql': return '🐬';
      case 'postgresql': return '🐘';
      case 'mongodb': return '🍃';
      case 'oracle': return '🔴';
      default: return '🗄️';
    }
  };

  const typeCounts = connections.reduce((counts, conn) => {
    counts[conn.type] = (counts[conn.type] || 0) + 1;
    return counts;
  }, {});

  // Admins and connection owners can edit / delete
  const canManage = (conn) =>
    user?.role === 'admin' || !conn.user || conn.user._id === (user?._id || user?.id);

  const hasActiveFilters = Boolean(
    filterType !== 'all' || filterRole !== 'all' || filterUser !== 'all' || searchConnText || tableSearchTerm
  );

  const resetFilters = () => {
    setFilterType('all');
    setFilterRole('all');
    setFilterUser('all');
    setSearchConnText('');
    setTableSearchQuery('');
    setTableSearchTerm('');
    setTableSearchResults([]);
    setTableSearchError('');
  };

  const [layout, setLayout] = useState(readLayout);
  const activeThemeKey = layout.view === 'rows' ? layout.rowTheme : layout.cardTheme;
  const activeTheme = COLOR_THEMES.find((theme) => theme.key === activeThemeKey);

  const updateLayout = (changes) => {
    const next = { ...layout, ...changes };
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not saved; the choice still applies until the page reloads
    }
  };

  // Longer lists scroll inside the list. The height comes from the 10th item, because
  // card and row heights change with the view and the screen width.
  const listRef = useRef(null);
  const listScrolls = visibleConnections.length > MAX_VISIBLE_CONNECTIONS;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const measure = () => {
      const items = list.querySelectorAll(':scope > .cx-card, :scope > .cx-row');
      if (items.length <= MAX_VISIBLE_CONNECTIONS) {
        list.style.maxHeight = '';
        return;
      }
      const lastVisible = items[MAX_VISIBLE_CONNECTIONS - 1];
      const style = getComputedStyle(list);
      const edges = parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      list.style.maxHeight = `${lastVisible.offsetTop + lastVisible.offsetHeight + edges}px`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [visibleConnections, layout.view, activeThemeKey, loading]);

  // "By database type" gives every card or row its own accent
  const accentStyle = (conn) => (
    activeThemeKey === 'engine' && ENGINE_COLORS[conn.type] ? { '--cx-accent': ENGINE_COLORS[conn.type] } : {}
  );

  const connectionDetails = (conn) => {
    const meta = ENGINE_META[conn.type] || { label: conn.type, logLabel: 'Log' };
    const supported = Boolean(ENGINE_META[conn.type]);
    return {
      meta,
      hostPort: `${conn.host || 'localhost'}:${conn.port || (conn.type === 'postgresql' ? 5432 : 3306)}`,
      isDisconnected: conn.status === 'disconnected',
      isShared: Boolean(conn.user && conn.user._id !== (user?._id || user?.id)),
      tools: [
        supported && hasPermission('userManagement') && {
          key: 'users',
          label: 'Users',
          color: '#7c3aed',
          to: `/connections/${conn._id}/users`,
          title: `Manage ${meta.label} Users`,
          icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a5.5 5.5 0 013.5 5.5" /></>,
        },
        {
          key: 'monitor',
          label: 'Monitor',
          color: '#0284c7',
          to: `/connections/${conn._id}/monitor`,
          title: 'Monitor Database Server',
          icon: <path d="M3 12h4l3-8 4 16 3-8h4" />,
        },
        supported && hasPermission('binlog') && {
          key: 'binlog',
          label: `${meta.logLabel} Monitor`,
          color: '#059669',
          to: `/connections/${conn._id}/binlog`,
          title: `Monitor ${meta.label} ${meta.logLabel}`,
          icon: <><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16" /><circle cx="5" cy="19" r="1.5" /></>,
        },
        supported && hasPermission('backup') && {
          key: 'backup',
          label: 'Backup',
          color: '#d97706',
          to: `/connections/${conn._id}/backup`,
          title: `Backup & Restore ${meta.label}`,
          icon: <><path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0117.8 8.2 4 4 0 0117 18" /><path d="M12 20v-8M9 14.5l3-3 3 3" /></>,
        },
      ].filter(Boolean),
    };
  };

  const renderToolIcon = (tool) => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tool.icon}
    </svg>
  );

  const renderManageButtons = (conn) => canManage(conn) && (
    <>
      <button type="button" onClick={() => handleOpenEditModal(conn)} className="cx-icon-btn" title={`Edit ${conn.name}`} aria-label={`Edit ${conn.name}`}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 5 4 4M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" />
        </svg>
      </button>
      <button type="button" onClick={() => handleDelete(conn._id, conn.name)} className="cx-icon-btn is-danger" title={`Delete ${conn.name}`} aria-label={`Delete ${conn.name}`}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
        </svg>
      </button>
    </>
  );

  const renderOpenButton = (conn) => (
    <button type="button" onClick={() => navigate(`/connections/${conn._id}`)} className="cx-open-btn">
      Open
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  );

  return (
    <div className="cx-page min-h-screen">
      <style>{`
        .custom-focus:focus {
          border-color: #0d9da4 !important;
          box-shadow: 0 0 0 2px rgba(13, 157, 164, 0.15) !important;
        }
        .gradient-btn {
          background: #0d9da4 !important;
          color: #ffffff !important;
          border: none !important;
          font-weight: 600 !important;
        }
        .gradient-btn:hover {
          background: #0b858b !important;
        }
        .gradient-border-left {
          border-left: 4px solid #0d9da4 !important;
        }
        .text-teal-light {
          color: #0d9da4 !important;
          opacity: 0.85 !important;
        }
      `}</style>

      {/* Navbar */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      {loading ? (
        <div className="w-[90%] mx-auto py-8 flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mb-4"></div>
          <p className="text-sm text-teal-light">Loading connections...</p>
        </div>
      ) : (
        <div className="w-[92%] max-w-[1500px] mx-auto py-6">
          {/* Header */}
          <div className="cx-hero p-5 sm:p-6 mb-5">
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Connection Manager
                </span>
                <h2 className="mt-2 text-[28px] font-extrabold tracking-tight text-[#0b1b4d] leading-tight">
                  Database <span className="cx-title-gradient">Connections</span>
                </h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  Connect, monitor and manage all your databases in one place.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {!showForm && (
                  <button
                    type="button"
                    onClick={() => navigate('/query', { state: { batchMode: true } })}
                    className="cx-btn-ghost"
                    title="Open All Connection Query"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M7 9l3 3-3 3M13 15h4" />
                    </svg>
                    All Connection Query
                  </button>
                )}
                {hasPermission('connections') && (
                  <button
                    type="button"
                    onClick={() => { setShowForm(!showForm); setTestResult(null); }}
                    className="cx-btn-primary"
                  >
                    {showForm ? (
                      'Cancel'
                    ) : (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Add Connection
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Per-engine counts — click to filter */}
            {connections.length > 0 && (
              <div className="relative z-10 mt-5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`cx-engine-chip ${filterType === 'all' ? 'is-active' : ''}`}

                >
                  <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-[#0d9488] text-white">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                      <ellipse cx="12" cy="6" rx="7" ry="3" />
                      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
                    </svg>
                  </span>
                  <span className="text-left leading-tight">
                    <span className="block text-[13px] font-bold text-slate-900">{connections.length}</span>
                    <span className="block text-[10px] text-slate-500">All connections</span>
                  </span>
                </button>
                {Object.entries(ENGINE_META).map(([type, meta]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(filterType === type ? 'all' : type)}
                    className={`cx-engine-chip ${filterType === type ? 'is-active' : ''}`}

                  >
                    <span className="cx-chip-logo"><EngineIcon type={type} size={20} /></span>
                    <span className="text-left leading-tight">
                      <span className="block text-[13px] font-bold text-slate-900">{typeCounts[type] || 0}</span>
                      <span className="block text-[10px] text-slate-500">{meta.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

        {/* Error / Success */}
        {error && (
          <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
            ❌ {error}
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-50 text-green-600 text-sm px-4 py-3 rounded-lg">
            ✅ {success}
          </div>
        )}

        {/* Add Connection Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Add New Connection
            </h3>

            <form onSubmit={handleSave} className="space-y-4">

              {/* Connection Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Connection Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Company MySQL, Analytics DB"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Database Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {['mysql', 'postgresql', 'mongodb', 'oracle'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition ${form.type === type
                          ? 'gradient-btn'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        }`}
                    >
                      {getTypeIcon(type)} {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Connection Form Fields */}
              {form.type === 'mongodb' && mongoMode === 'uri' ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-medium text-gray-700">
                      Connection String
                    </label>
                    <button
                      type="button"
                      onClick={() => setMongoMode('structured')}
                      className="text-xs text-[#0d9da4] hover:underline font-bold"
                    >
                      Switch to Structured Fields
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="mongodb://username:password@host:27017/"
                    value={form.connectionString}
                    onChange={e => setForm({ ...form, connectionString: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition font-mono custom-focus"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {form.type === 'mongodb' && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setMongoMode('uri')}
                        className="text-xs text-[#0d9da4] hover:underline font-bold"
                      >
                        Switch to Raw Connection URI
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                      <input
                        type="text"
                        placeholder={form.type === 'mongodb' ? '127.0.0.1' : 'localhost'}
                        value={form.host}
                        onChange={e => setForm({ ...form, host: e.target.value })}
                        required
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                      <input
                        type="number"
                        placeholder={form.type === 'mysql' ? '3306' : form.type === 'postgresql' ? '5432' : '27017'}
                        value={form.port}
                        onChange={e => setForm({ ...form, port: e.target.value })}
                        required
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                      <input
                        type="text"
                        placeholder={form.type === 'mysql' ? 'root' : form.type === 'postgresql' ? 'postgres' : 'admin'}
                        value={form.username}
                        onChange={e => setForm({ ...form, username: e.target.value })}
                        required={form.type !== 'mongodb'}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input
                        type="password"
                        placeholder="Password"
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    {form.type !== 'mongodb' && (
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {form.type === 'oracle' ? 'Service Name / SID (Required)' : 'Default Database (Optional)'}
                        </label>
                        <input
                          type="text"
                          placeholder={form.type === 'oracle' ? 'ORCL or XE' : 'e.g. my_database'}
                          value={form.database}
                          onChange={e => setForm({ ...form, database: e.target.value })}
                          required={form.type === 'oracle'}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Connection Access Mode */}
              <div className="bg-gray-50/50 p-3 rounded-lg border border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">Connection Access Mode</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="connection-access-mode" value="read" checked={form.accessMode === 'read'} onChange={e => setForm({ ...form, accessMode: e.target.value })} className="text-amber-600 focus:ring-amber-500" />
                    Read Only
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="connection-access-mode" value="readwrite" checked={form.accessMode === 'readwrite'} onChange={e => setForm({ ...form, accessMode: e.target.value })} className="text-teal-600 focus:ring-teal-500" />
                    Read &amp; Write
                  </label>
                </div>
              </div>

              {/* SSL Configuration Checkbox */}
              {form.type !== 'mongodb' && (
                <div className="flex items-center gap-2 mt-3 mb-1 bg-gray-50/50 p-2.5 rounded-lg border border-gray-100">
                  <input
                    type="checkbox"
                    id="ssl"
                    checked={form.ssl || false}
                    onChange={e => setForm({ ...form, ssl: e.target.checked })}
                    className="w-4 h-4 rounded text-teal-600 border-gray-300 focus:ring-teal-500 cursor-pointer"
                  />
                  <label htmlFor="ssl" className="text-xs font-bold text-gray-750 cursor-pointer select-none">
                    🔒 Enable SSL/TLS Connection (Required for cloud DBaaS like AWS RDS, Aiven, Clever Cloud)
                  </label>
                </div>
              )}
              {testResult && (
                <div className={`px-4 py-3 rounded-lg text-sm ${testResult.success
                    ? 'bg-green-50 text-green-600'
                    : 'bg-red-50 text-red-600'
                  }`}>
                  {testResult.success ? '✅' : '❌'} {testResult.message}
                </div>
              )}

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testLoading}
                  className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition disabled:opacity-60"
                >
                  {testLoading ? 'Testing...' : '🔌 Test Connection'}
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex-1 py-2.5 gradient-btn text-sm rounded-lg transition disabled:opacity-60"
                >
                  {saveLoading ? 'Saving...' : '💾 Save Connection'}
                </button>
              </div>

            </form>
          </div>
        )}

        {/* Filter toolbar */}
        {connections.length > 0 && (
          <div className="cx-toolbar p-3.5 mb-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="cx-input flex-1 min-w-[220px]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search connections by name, host, DB..."
                  value={searchConnText}
                  onChange={(e) => setSearchConnText(e.target.value)}
                />
              </label>

              <div className="cx-seg overflow-x-auto max-w-full">
                {[['all', 'All'], ...Object.entries(ENGINE_META).map(([type, meta]) => [type, meta.label])].map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(type)}
                    className={filterType === type ? 'is-active' : ''}
                  >
                    {label}
                    <span className="cx-seg-count">{type === 'all' ? connections.length : (typeCounts[type] || 0)}</span>
                  </button>
                ))}
              </div>

              <label className="cx-input w-[150px]" title="Filter by role">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
                </svg>
                <select
                  value={filterRole}
                  onChange={(e) => {
                    setFilterRole(e.target.value);
                    setFilterUser('all'); // Reset user when role changes
                  }}
                  aria-label="Role"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="developer">Developer</option>
                </select>
              </label>

              <label className="cx-input w-[200px]" title="Filter by user">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21a8 8 0 0116 0" />
                </svg>
                <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} aria-label="User">
                  <option value="all">All Users ({userOptions.length})</option>
                  {userOptions.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} ({u.role || 'user'})
                    </option>
                  ))}
                </select>
              </label>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-[38px] px-3 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 transition cursor-pointer"
                >
                  ✕ Reset
                </button>
              )}
            </div>

            <form onSubmit={searchTables} className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
              <label htmlFor="connections-table-search" className="text-[11.5px] font-semibold text-slate-500 shrink-0">
                Search tables across connections
              </label>
              <label className="cx-input flex-1 min-w-[220px]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 10h18M9 4v16" />
                </svg>
                <input
                  id="connections-table-search"
                  type="search"
                  placeholder="Enter a table or collection name..."
                  value={tableSearchQuery}
                  onChange={event => setTableSearchQuery(event.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={tableSearchLoading}
                className="cx-btn-primary !h-[38px] disabled:opacity-60"
              >
                {tableSearchLoading ? 'Searching...' : 'Search Tables'}
              </button>
              {tableSearchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setTableSearchQuery('');
                    setTableSearchTerm('');
                    setTableSearchResults([]);
                    setTableSearchError('');
                  }}
                  className="cx-btn-ghost !h-[38px]"
                >
                  Clear
                </button>
              )}
              <span className="ml-auto text-[11.5px] font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full">
                Showing {visibleConnections.length} of {connections.length}
              </span>
            </form>
            {tableSearchError && (
              <p role="status" className="mt-2 text-xs text-amber-700">{tableSearchError}</p>
            )}
            {tableSearchTerm && !tableSearchLoading && (
              <p className="mt-2 text-xs text-slate-500">
                {tableSearchResults.length
                  ? `${tableSearchResults.length} matching table${tableSearchResults.length === 1 ? '' : 's'} found for "${tableSearchTerm}".`
                  : 'No matching tables found.'}
              </p>
            )}
          </div>
        )}

        {tableSearchResults.length > 0 && (
          <div className="cx-toolbar mb-5 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h4 className="text-xs font-bold text-slate-800">Matching tables</h4>
            </div>
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">
              {tableSearchResults.map((result, index) => (
                <div key={`${result.connectionId}-${result.database}-${result.table}-${index}`} className="flex items-center justify-between gap-3 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-teal-900">{result.table}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {result.connectionName} · {result.database} · {result.connectionType}
                    </p>
                  </div>
                  <button
                    type="button"
                    title={`Open ${result.table}`}
                    aria-label={`Open ${result.table} in ${result.connectionName}`}
                    onClick={() => navigate(`/connections/${result.connectionId}/db/${encodeURIComponent(result.database)}?table=${encodeURIComponent(result.table)}`)}
                    className="cx-icon-btn shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 6H19v5.5M19 6l-8 8m6-1v5.5A1.5 1.5 0 0115.5 20h-11A1.5 1.5 0 013 18.5v-11A1.5 1.5 0 014.5 6H10" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connections grid */}
        {connections.length === 0 ? (
          <div className="cx-toolbar p-12 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[#0d9488] text-white">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <ellipse cx="12" cy="6" rx="7" ry="3" />
                <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
              </svg>
            </div>
            <p className="text-slate-800 font-bold mb-1">No connections yet</p>
            <p className="text-slate-500 text-sm mb-4">Add your first database connection to get started</p>
            <button type="button" onClick={() => setShowForm(true)} className="cx-btn-primary">
              + Add Connection
            </button>
          </div>
        ) : visibleConnections.length === 0 ? (
          <div className="cx-toolbar p-10 text-center">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-slate-800 font-bold mb-1">
              {tableSearchTerm ? 'No connections contain matching tables' : 'No matching connections found'}
            </p>
            <p className="text-slate-500 text-xs mb-4">
              No connections match your selected Database Type ({filterType}), Role ({filterRole}), or User filter.
            </p>
            <button type="button" onClick={resetFilters} className="cx-btn-ghost">
              Clear All Filters
            </button>
          </div>
        ) : (
          <>
          {/* View and color theme options */}
          <div className="cx-viewbar">
            <div className="cx-seg" role="group" aria-label="Connection view">
              <button type="button" className={layout.view === 'cards' ? 'is-active' : ''} aria-pressed={layout.view === 'cards'} onClick={() => updateLayout({ view: 'cards' })}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
                </svg>
                Cards
              </button>
              <button type="button" className={layout.view === 'rows' ? 'is-active' : ''} aria-pressed={layout.view === 'rows'} onClick={() => updateLayout({ view: 'rows' })}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
                Rows
              </button>
            </div>

            <div className="cx-theme-picker" role="radiogroup" aria-label={`${layout.view === 'rows' ? 'Row' : 'Card'} color theme`}>
              <span className="cx-theme-label">
                {layout.view === 'rows' ? 'Row' : 'Card'} theme: <b>{activeTheme.label}</b>
              </span>
              {COLOR_THEMES.map((theme) => (
                <button
                  key={theme.key}
                  type="button"
                  role="radio"
                  aria-checked={activeThemeKey === theme.key}
                  aria-label={theme.label}
                  title={theme.label}
                  className={`cx-swatch ${activeThemeKey === theme.key ? 'is-active' : ''}`}
                  style={{ background: theme.swatch }}
                  onClick={() => updateLayout(layout.view === 'rows' ? { rowTheme: theme.key } : { cardTheme: theme.key })}
                />
              ))}
            </div>
          </div>

          {layout.view === 'rows' ? (
            <div ref={listRef} className={`cx-list cx-rows cxt-${activeThemeKey} ${listScrolls ? 'is-scroll' : ''}`}>
              <div className="cx-row-head" aria-hidden="true">
                <span>Connection</span>
                <span>Host</span>
                <span>Database</span>
                <span>Status</span>
                <span>Tools</span>
                <span className="text-right">Actions</span>
              </div>
              {visibleConnections.map((conn) => {
                const { meta, hostPort, isDisconnected, isShared, tools } = connectionDetails(conn);
                return (
                  <div key={conn._id} className="cx-row" style={accentStyle(conn)} onClick={() => navigate(`/connections/${conn._id}`)}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="cx-card-logo is-small"><EngineIcon type={conn.type} size={22} /></span>
                      <div className="min-w-0">
                        <p className="cx-name truncate text-[13.5px] font-bold">{conn.name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <span className="cx-badge">{meta.label}</span>
                          <span className="cx-badge">{conn.accessMode === 'read' ? 'Read Only' : 'Read & Write'}</span>
                          {isShared && <span className="cx-badge">Shared by {conn.user.name}</span>}
                        </div>
                      </div>
                    </div>
                    <span className="cx-row-mono" data-label="Host" title={hostPort}>{hostPort}</span>
                    <span className="cx-row-mono" data-label="Database" title={conn.database || ''}>{conn.database || '—'}</span>
                    <span className={`cx-status ${isDisconnected ? 'is-off' : ''}`} data-label="Status">
                      {isDisconnected ? 'Disconnected' : 'Connected'}
                    </span>
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {tools.map((tool) => (
                        <button key={tool.key} type="button" onClick={() => navigate(tool.to)} className="cx-row-tool" style={{ '--t': tool.color }} title={tool.title} aria-label={tool.title}>
                          {renderToolIcon(tool)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {renderOpenButton(conn)}
                      {renderManageButtons(conn)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
          <div ref={listRef} className={`cx-list grid gap-4 md:grid-cols-2 2xl:grid-cols-3 cxt-${activeThemeKey} ${listScrolls ? 'is-scroll' : ''}`}>
            {visibleConnections.map((conn, index) => {
              const { meta, hostPort, isDisconnected, isShared, tools } = connectionDetails(conn);

              return (
                <div
                  key={conn._id}
                  onClick={() => navigate(`/connections/${conn._id}`)}
                  className="cx-card"
                  style={{ '--delay': `${Math.min(index, 8) * 0.05}s`, ...accentStyle(conn) }}
                >
                  <div className="p-4 pb-3 flex items-start gap-3">
                    <span className="cx-card-logo">
                      <EngineIcon type={conn.type} size={30} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="cx-name truncate text-[15px] font-bold">{conn.name}</p>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${isDisconnected ? 'bg-rose-400' : 'bg-emerald-500 animate-pulse'}`} title={isDisconnected ? 'Disconnected' : 'Connected'} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="cx-badge">{meta.label}</span>
                        <span className="cx-badge">
                          {conn.accessMode === 'read' ? 'Read Only' : 'Read & Write'}
                        </span>
                        {isShared && (
                          <span className="cx-badge">Shared by {conn.user.name}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <dl className="cx-meta mx-4">
                    <dt>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" />
                      </svg>
                      Host
                    </dt>
                    <dd title={hostPort}>{hostPort}</dd>
                    <dt>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
                      </svg>
                      Database
                    </dt>
                    <dd title={conn.database || ''}>{conn.database || '—'}</dd>
                  </dl>

                  {tools.length > 0 && (
                    <div className="cx-tools px-4 pt-3" onClick={(e) => e.stopPropagation()}>
                      {tools.map((tool) => (
                        <button
                          key={tool.key}
                          type="button"
                          onClick={() => navigate(tool.to)}
                          className="cx-tool"
                          style={{ '--t': tool.color }}
                          title={tool.title}
                        >
                          <span className="cx-tool-icon">{renderToolIcon(tool)}</span>
                          {tool.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex items-center gap-2 p-4 pt-3" onClick={(e) => e.stopPropagation()}>
                    {renderOpenButton(conn)}
                    {renderManageButtons(conn)}
                  </div>
                </div>
              );
            })}
          </div>
          )}
          </>
        )}

      </div>
      )}

      {/* Edit Connection Modal */}
      {editConnectionModalConn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs text-left">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-gray-200 shadow-xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>✏️</span> Edit Connection: {editConnectionModalConn.name}
              </h3>
              <button
                onClick={() => setEditConnectionModalConn(null)}
                className="text-gray-400 hover:text-gray-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditConnection} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {editConnError && (
                <div className="bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-lg border border-red-200">
                  ❌ {editConnError}
                </div>
              )}

              {editConnTestResult && (
                <div className={`text-xs px-4 py-2.5 rounded-lg border ${
                  editConnTestResult.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'
                }`}>
                  {editConnTestResult.success ? '✅' : '❌'} {editConnTestResult.message}
                </div>
              )}

              {/* Connection Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Connection Name
                </label>
                <input
                  type="text"
                  required
                  value={editConnForm.name}
                  onChange={e => setEditConnForm({ ...editConnForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                />
              </div>

              {/* Database Type */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Database Engine
                </label>
                <select
                  value={editConnForm.type}
                  onChange={e => setEditConnForm({
                    ...editConnForm,
                    type: e.target.value,
                    port: e.target.value === 'mysql' ? '3306' : e.target.value === 'postgresql' ? '5432' : '27017'
                  })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] font-semibold cursor-pointer"
                >
                  <option value="mysql">🐬 MySQL</option>
                  <option value="postgresql">🐘 PostgreSQL</option>
                  <option value="mongodb">🍃 MongoDB</option>
                  <option value="oracle">🔴 Oracle</option>
                </select>
              </div>

              {/* Host & Port */}
              {editConnForm.type !== 'mongodb' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Host / Server IP</label>
                    <input
                      type="text"
                      required
                      value={editConnForm.host}
                      onChange={e => setEditConnForm({ ...editConnForm, host: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Port</label>
                    <input
                      type="number"
                      required
                      value={editConnForm.port}
                      onChange={e => setEditConnForm({ ...editConnForm, port: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                    />
                  </div>
                </div>
              )}

              {/* Username & Password */}
              {editConnForm.type !== 'mongodb' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">DB Username</label>
                    <input
                      type="text"
                      required
                      value={editConnForm.username}
                      onChange={e => setEditConnForm({ ...editConnForm, username: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      DB Password <span className="text-[10px] text-gray-400 font-normal">(Blank = keep current)</span>
                    </label>
                    <input
                      type="password"
                      placeholder="Leave blank to keep existing"
                      value={editConnForm.password}
                      onChange={e => setEditConnForm({ ...editConnForm, password: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                    />
                  </div>
                </div>
              )}

              {/* Database Name */}
              {editConnForm.type !== 'mongodb' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Default Database Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. main_db"
                    value={editConnForm.database}
                    onChange={e => setEditConnForm({ ...editConnForm, database: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                  />
                </div>
              )}

              {/* MongoDB Connection String */}
              {editConnForm.type === 'mongodb' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">MongoDB Connection URI</label>
                  <input
                    type="text"
                    required
                    placeholder="mongodb://localhost:27017/dbname"
                    value={editConnForm.connectionString}
                    onChange={e => setEditConnForm({ ...editConnForm, connectionString: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    The password is hidden as ****. Leave it to keep the current one. If you change the host, enter the password again.
                  </p>
                </div>
              )}

              {/* Connection Access Mode */}
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <label className="block text-xs font-bold text-gray-700 mb-2">Connection Access Mode</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input type="radio" name="edit-connection-access-mode" value="read" checked={editConnForm.accessMode === 'read'} onChange={e => setEditConnForm({ ...editConnForm, accessMode: e.target.value })} className="text-amber-600 focus:ring-amber-500" />
                    Read Only
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input type="radio" name="edit-connection-access-mode" value="readwrite" checked={editConnForm.accessMode === 'readwrite'} onChange={e => setEditConnForm({ ...editConnForm, accessMode: e.target.value })} className="text-teal-600 focus:ring-teal-500" />
                    Read &amp; Write
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 flex items-center justify-between border-t border-gray-150">
                <button
                  type="button"
                  onClick={handleTestEditConnection}
                  disabled={editConnTestLoading}
                  className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  {editConnTestLoading ? 'Testing...' : '🧪 Test Connection'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditConnectionModalConn(null)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editConnLoading}
                    style={{ backgroundColor: '#0d9da4' }}
                    className="px-5 py-2 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
                  >
                    {editConnLoading ? 'Saving...' : 'Save Connection Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}