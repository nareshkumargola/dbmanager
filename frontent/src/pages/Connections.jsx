import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import EngineIcon from '../components/EngineIcon';
import ConnectionPager from '../components/ConnectionPager';
import { CLOUD_PROVIDERS, DEFAULT_PORTS, cloudLabel } from '../utils/cloudProviders';
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
  { key: 'sky', label: 'Sky Blue', swatch: '#0ea5e9' },
  { key: 'blue', label: 'Ocean Blue', swatch: '#2563eb' },
  { key: 'violet', label: 'Violet', swatch: '#7c3aed' },
  { key: 'rose', label: 'Rose', swatch: '#e11d48' },
  { key: 'amber', label: 'Amber', swatch: '#b45309' },
  { key: 'engine', label: 'By database type', swatch: 'conic-gradient(#0284c7 0 25%, #4f46e5 0 50%, #15803d 0 75%, #dc2626 0)' },
  { key: 'midnight', label: 'Midnight', swatch: '#0f172a' },
];
const THEME_KEYS = COLOR_THEMES.map((theme) => theme.key);

// Small outline icons for the Add Connection labels
const FIELD_ICONS = {
  name: <path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" />,
  type: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></>,
  host: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  port: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0V8zM12 17v4" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  shield: <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />,
  cloud: <path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0117.8 8.2 4 4 0 0117 18H7z" />,
  service: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />,
  code: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />,
  cert: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M7 9h10M7 13h6M15 17l1.5 4 1.5-1 1.5 1-1.5-4" /></>,
};

function FieldLabel({ icon, htmlFor, id, children }) {
  return (
    <label className="cx-label" htmlFor={htmlFor} id={id}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{FIELD_ICONS[icon]}</svg>
      <span>{children}</span>
    </label>
  );
}

const DATABASE_TYPES = ['mysql', 'postgresql', 'mongodb', 'oracle'];

// Chip colors for each cloud provider, dark enough for the count text to stay readable
const PROVIDER_CHIP_COLORS = {
  aws: '#b45309',
  azure: '#0078d4',
  gcp: '#1a73e8',
  atlas: '#00684a',
  oci: '#c74634',
  ibm: '#0f62fe',
  alibaba: '#c2410c',
};
const cloudLogo = (key) => CLOUD_PROVIDERS.find((provider) => provider.key === key)?.logo;

// Host part of a connection string, e.g. cluster0.example.net from mongodb+srv://user:****@cluster0.example.net/db
const stringHostOf = (conn) => (conn.connectionString
  ? conn.connectionString.replace(/^[a-z+]+:\/\//i, '').split('@').pop().split(/[/?]/)[0]
  : '');
const LAYOUT_STORAGE_KEY = 'connectionsLayout';
const DEFAULT_LAYOUT = { view: 'cards', cardTheme: 'engine', rowTheme: 'sky' };
const ROWS_PER_PAGE = 10;
// 12 fills whole lines in both the 2- and 3-column card grids
const CARDS_PER_PAGE = 12;

const formatAddedOn = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
};

// The choice is only a display preference, so a blocked or corrupt store falls back to the default
const readLayout = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY)) || {};
    return {
      view: saved.view === 'rows' ? 'rows' : 'cards',
      cardTheme: THEME_KEYS.includes(saved.cardColor) ? saved.cardColor : DEFAULT_LAYOUT.cardTheme,
      rowTheme: THEME_KEYS.includes(saved.rowColor) ? saved.rowColor : DEFAULT_LAYOUT.rowTheme,
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
  // 'all', 'database', 'cloud', or one cloud provider's key
  const [filterSource, setFilterSource] = useState('all');
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

      // Database or cloud, and which cloud provider
      if (filterSource === 'database' && conn.cloudProvider) return false;
      if (filterSource === 'cloud' && !conn.cloudProvider) return false;
      if (!['all', 'database', 'cloud'].includes(filterSource) && conn.cloudProvider !== filterSource) return false;

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
        const cloudText = cloudLabel(conn.cloudProvider, conn.cloudService).toLowerCase();
        const stringHost = stringHostOf(conn).toLowerCase();
        const matchesText = connName.includes(term) || connHost.includes(term) || connDb.includes(term) || connType.includes(term) || ownerName.includes(term) || cloudText.includes(term) || stringHost.includes(term);
        if (!matchesText) return false;
      }

      return true;
    });
  }, [connections, filterType, filterSource, filterRole, filterUser, searchConnText]);

  // Counts for the location filter
  const sourceCounts = useMemo(() => connections.reduce((counts, conn) => {
    const place = conn.cloudProvider ? 'cloud' : 'database';
    counts[place] = (counts[place] || 0) + 1;
    if (conn.cloudProvider) counts[conn.cloudProvider] = (counts[conn.cloudProvider] || 0) + 1;
    return counts;
  }, {}), [connections]);

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
      caCertificate: conn.caCertificate || '',
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

  // Add Connection tabs: Database, or Cloud Services with a provider and service
  const [addTab, setAddTab] = useState('database');
  const [cloudProviderKey, setCloudProviderKey] = useState(null);
  const [cloudServiceKey, setCloudServiceKey] = useState(null);
  const [cloudCa, setCloudCa] = useState('');
  const isCloudTab = addTab === 'cloud';
  const cloudProvider = CLOUD_PROVIDERS.find((provider) => provider.key === cloudProviderKey);
  const cloudService = cloudProvider?.services.find((service) => service.key === cloudServiceKey);
  const showConnectionFields = !isCloudTab || Boolean(cloudService);

  const clearCloudChoice = () => {
    setCloudProviderKey(null);
    setCloudServiceKey(null);
    setCloudCa('');
  };

  const chooseAddTab = (tab) => {
    if (tab === addTab) return;
    setAddTab(tab);
    clearCloudChoice();
    setMongoMode('structured');
    setTestResult(null);
    setForm((current) => ({
      ...current,
      type: 'mysql',
      host: 'localhost',
      port: '3306',
      username: 'root',
      password: '',
      database: '',
      connectionString: '',
      ssl: false,
    }));
  };

  const chooseCloudService = (provider, service) => {
    if (provider.key === cloudProviderKey && service.key === cloudServiceKey) return;
    setCloudProviderKey(provider.key);
    setCloudServiceKey(service.key);
    setCloudCa('');
    setMongoMode(service.engine === 'mongodb' ? 'uri' : 'structured');
    setTestResult(null);
    setForm((current) => ({
      ...current,
      type: service.engine,
      host: '',
      port: service.port || DEFAULT_PORTS[service.engine],
      username: '',
      password: '',
      database: '',
      connectionString: '',
      ssl: true,
    }));
  };

  const chooseCloudProvider = (provider) => {
    if (provider.key === cloudProviderKey) return;
    const available = provider.services.filter((service) => !service.comingSoon);
    if (available.length === 1) {
      chooseCloudService(provider, available[0]);
      return;
    }
    setCloudProviderKey(provider.key);
    setCloudServiceKey(null);
    setTestResult(null);
  };

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
    const cloudFields = isCloudTab && cloudService
      ? { cloudProvider: cloudProvider.key, cloudService: cloudService.label, caCertificate: cloudCa }
      : {};
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
      return { ...form, ...cloudFields, connectionString: uri };
    }
    return { ...form, ...cloudFields };
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
      setAddTab('database');
      clearCloudChoice();
      setMongoMode('structured');
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

  const typeCounts = connections.reduce((counts, conn) => {
    counts[conn.type] = (counts[conn.type] || 0) + 1;
    return counts;
  }, {});

  // Admins and connection owners can edit / delete
  const canManage = (conn) =>
    user?.role === 'admin' || !conn.user || conn.user._id === (user?._id || user?.id);

  // Choosing cloud swaps the header chips from database types to cloud providers. The type
  // chips are hidden then, so their filter is cleared rather than left on out of sight.
  const isCloudFilter = filterSource !== 'all' && filterSource !== 'database';
  const chooseSource = (value) => {
    setFilterSource(value);
    if (value !== 'all' && value !== 'database') setFilterType('all');
  };

  const hasActiveFilters = Boolean(
    filterType !== 'all' || filterSource !== 'all' || filterRole !== 'all' || filterUser !== 'all' || searchConnText || tableSearchTerm
  );

  const resetFilters = () => {
    setFilterType('all');
    setFilterSource('all');
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
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ view: next.view, cardColor: next.cardTheme, rowColor: next.rowTheme }));
    } catch {
      // Not saved; the choice still applies until the page reloads
    }
  };

  // The form replaces the page content, so it starts at the top
  useEffect(() => {
    if (showForm) window.scrollTo({ top: 0 });
  }, [showForm]);

  // Both views are split into pages. A changed list or view goes back to page 1.
  const pageSize = layout.view === 'rows' ? ROWS_PER_PAGE : CARDS_PER_PAGE;
  const listKey = `${layout.view}|${visibleConnections.map((conn) => conn._id).join()}`;
  const [listPageState, setListPageState] = useState({ key: listKey, page: 1 });
  if (listPageState.key !== listKey) setListPageState({ key: listKey, page: 1 });
  const pageCount = Math.max(1, Math.ceil(visibleConnections.length / pageSize));
  const listPage = listPageState.key === listKey ? Math.min(listPageState.page, pageCount) : 1;
  const firstListIndex = (listPage - 1) * pageSize;
  const pageConnections = visibleConnections.slice(firstListIndex, firstListIndex + pageSize);

  // A new page starts at the top of the list, below the sticky navbar
  const listTopRef = useRef(null);
  const setListPage = (page) => {
    setListPageState({ key: listKey, page });
    const top = listTopRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) window.scrollTo({ top: window.scrollY + top - 90 });
  };
  const listPager = (
    <ConnectionPager
      page={listPage}
      pageCount={pageCount}
      firstIndex={firstListIndex}
      shownCount={pageConnections.length}
      total={visibleConnections.length}
      onPageChange={setListPage}
    />
  );

  const [openRowMenu, setOpenRowMenu] = useState(null);
  useEffect(() => {
    if (!openRowMenu) return undefined;
    const close = () => setOpenRowMenu(null);
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openRowMenu]);

  // "By database type" gives every card or row its own accent
  const accentStyle = (conn) => (
    activeThemeKey === 'engine' && ENGINE_COLORS[conn.type] ? { '--cx-accent': ENGINE_COLORS[conn.type] } : {}
  );

  const connectionDetails = (conn) => {
    const meta = ENGINE_META[conn.type] || { label: conn.type, logLabel: 'Log' };
    const supported = Boolean(ENGINE_META[conn.type]);
    return {
      meta,
      hostPort: stringHostOf(conn) ||`${conn.host || 'localhost'}:${conn.port || (conn.type === 'postgresql' ? 5432 : 3306)}`,
      isDisconnected: conn.status === 'disconnected',
      isShared: Boolean(conn.user && conn.user._id !== (user?._id || user?.id)),
      cloudText: cloudLabel(conn.cloudProvider, conn.cloudService),
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
        <div className="w-full px-4 sm:px-6 py-6">
          {/* Header. The Add Connection form takes the page while it is open. */}
          {!showForm && (
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
                {hasPermission('connections') && (
                  <button
                    type="button"
                    onClick={() => { setShowForm(true); setTestResult(null); }}
                    className="cx-btn-primary"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add Connection
                  </button>
                )}
              </div>
            </div>

            {/* Counts per database type, or per cloud provider when cloud is chosen. Click to filter. */}
            {connections.length > 0 && (
              <div className="relative z-10 mt-5 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => { setFilterType('all'); setFilterSource('all'); }}
                  className={`cx-engine-chip ${filterType === 'all' && filterSource === 'all' ? 'is-active' : ''}`}
                  title={isCloudFilter ? 'Show all connections' : undefined}
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
                {!isCloudFilter && Object.entries(ENGINE_META).map(([type, meta]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(filterType === type ? 'all' : type)}
                    className={`cx-engine-chip ${filterType === type ? 'is-active' : ''}`}
                    style={{ '--chip': ENGINE_COLORS[type] }}
                  >
                    <span className="cx-chip-logo"><EngineIcon type={type} size={20} /></span>
                    <span className="text-left leading-tight">
                      <span className="block text-[13px] font-bold text-slate-900">{typeCounts[type] || 0}</span>
                      <span className="block text-[10px] text-slate-500">{meta.label}</span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => chooseSource(filterSource === 'cloud' ? 'all' : 'cloud')}
                  className={`cx-engine-chip ${filterSource === 'cloud' ? 'is-active' : ''}`}
                  style={{ '--chip': '#0891b2' }}
                >
                  <span className="cx-chip-logo">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0117.8 8.2 4 4 0 0117 18H7z" />
                    </svg>
                  </span>
                  <span className="text-left leading-tight">
                    <span className="block text-[13px] font-bold text-slate-900">{sourceCounts.cloud || 0}</span>
                    <span className="block text-[10px] text-slate-500">Cloud</span>
                  </span>
                </button>
                {isCloudFilter && CLOUD_PROVIDERS.map((provider) => (
                  <button
                    key={provider.key}
                    type="button"
                    onClick={() => chooseSource(filterSource === provider.key ? 'cloud' : provider.key)}
                    className={`cx-engine-chip ${filterSource === provider.key ? 'is-active' : ''}`}
                    style={{ '--chip': PROVIDER_CHIP_COLORS[provider.key] }}
                  >
                    <span className="cx-chip-logo"><img src={provider.logo} alt="" /></span>
                    <span className="text-left leading-tight">
                      <span className="block text-[13px] font-bold text-slate-900">{sourceCounts[provider.key] || 0}</span>
                      <span className="block text-[10px] text-slate-500">{provider.label}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}

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
          <div className="cx-add-form mb-6">
            <aside className="cx-add-intro">
              <svg className="cx-add-intro-icon" viewBox="0 0 48 48" aria-hidden="true">
                <defs>
                  <linearGradient id="cxIntroIcon" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#8b7bff" />
                    <stop offset="1" stopColor="#3b6cf6" />
                  </linearGradient>
                </defs>
                <ellipse cx="24" cy="10" rx="16" ry="6" fill="url(#cxIntroIcon)" />
                <path d="M8 16c0 3.3 7.2 6 16 6s16-2.7 16-6v7c0 3.3-7.2 6-16 6S8 26.3 8 23v-7zM8 29c0 3.3 7.2 6 16 6s16-2.7 16-6v7c0 3.3-7.2 6-16 6S8 39.3 8 36v-7z" fill="url(#cxIntroIcon)" opacity="0.85" />
              </svg>
              <div>
                <h2>Add New <span>Connection</span></h2>
                <p>Connect your database to manage and monitor it with ease.</p>
              </div>
              <div className="cx-add-art" aria-hidden="true">
                <svg className="cx-add-cylinder" viewBox="0 0 220 240">
                  <defs>
                    <linearGradient id="cxCylBody" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#1e40af" />
                      <stop offset="0.45" stopColor="#3b82f6" />
                      <stop offset="1" stopColor="#1e3a8a" />
                    </linearGradient>
                    <linearGradient id="cxCylTop" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#bfdbfe" />
                      <stop offset="1" stopColor="#60a5fa" />
                    </linearGradient>
                    <filter id="cxGlow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="3" /></filter>
                  </defs>
                  <ellipse cx="110" cy="200" rx="100" ry="26" fill="#dfe6ff" />
                  <ellipse cx="110" cy="194" rx="78" ry="18" fill="#eef2ff" stroke="#c7d2fe" />
                  <ellipse cx="110" cy="130" rx="104" ry="44" fill="none" stroke="#c7d2fe" strokeDasharray="4 6" />
                  <path d="M60 58v120a50 15 0 0 0 100 0V58" fill="url(#cxCylBody)" />
                  <path d="M60 98a50 15 0 0 0 100 0" fill="none" stroke="#22d3ee" strokeWidth="6" filter="url(#cxGlow)" />
                  <path d="M60 98a50 15 0 0 0 100 0" fill="none" stroke="#a5f3fc" strokeWidth="2" />
                  <path d="M60 140a50 15 0 0 0 100 0" fill="none" stroke="#a78bfa" strokeWidth="6" filter="url(#cxGlow)" />
                  <path d="M60 140a50 15 0 0 0 100 0" fill="none" stroke="#e9d5ff" strokeWidth="2" />
                  <ellipse cx="110" cy="58" rx="50" ry="15" fill="url(#cxCylTop)" />
                </svg>
                <span className="cx-add-chip is-mysql"><EngineIcon type="mysql" size={30} /><small>MySQL</small></span>
                <span className="cx-add-chip is-postgresql"><EngineIcon type="postgresql" size={30} /><small>PostgreSQL</small></span>
                <span className="cx-add-chip is-oracle"><EngineIcon type="oracle" size={30} /><small>Oracle</small></span>
                <span className="cx-add-chip is-mongodb"><EngineIcon type="mongodb" size={30} /><small>MongoDB</small></span>
                <span className="cx-add-chip is-azure"><img src={cloudLogo('azure')} alt="" /><small>Azure</small></span>
                <span className="cx-add-chip is-aws"><img src={cloudLogo('aws')} alt="" /><small>AWS</small></span>
              </div>
              <ul className="cx-add-points">
                {['Multi-Database Support', 'Secure & Reliable', 'Real-time Monitoring'].map((point) => (
                  <li key={point}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
                    {point}
                  </li>
                ))}
              </ul>
            </aside>

            <div className="cx-add-main">
            <div className="cx-add-top">
            <div className="cx-add-tabs" role="tablist" aria-label="Connection category">
              <button type="button" role="tab" aria-selected={!isCloudTab} className={!isCloudTab ? 'is-active' : ''} onClick={() => chooseAddTab('database')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>
                Database
              </button>
              <button type="button" role="tab" aria-selected={isCloudTab} className={isCloudTab ? 'is-active' : ''} onClick={() => chooseAddTab('cloud')}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0117.8 8.2 4 4 0 0117 18H7z" /></svg>
                Cloud Services
              </button>
            </div>
              <div className="cx-add-top-right">
                {(isCloudTab ? Boolean(cloudService) : form.ssl && (form.type === 'mysql' || form.type === 'postgresql')) && (
                  <span className="cx-add-secure">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
                    Secure Connection
                  </span>
                )}
                <button type="button" className="cx-btn-ghost" onClick={() => { setShowForm(false); setTestResult(null); }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                  Cancel
                </button>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-5">

              {/* Cloud provider and service */}
              {isCloudTab && (
                <>
                  <div>
                    <FieldLabel icon="cloud">Cloud Provider</FieldLabel>
                    <div className="cx-cloud-providers">
                      {CLOUD_PROVIDERS.map((provider) => (
                        <button
                          key={provider.key}
                          type="button"
                          aria-pressed={cloudProviderKey === provider.key}
                          className={`cx-cloud-card ${cloudProviderKey === provider.key ? 'is-active' : ''}`}
                          onClick={() => chooseCloudProvider(provider)}
                        >
                          <span className="cx-cloud-mark" aria-hidden="true"><img src={provider.logo} alt="" /></span>
                          <span className="cx-cloud-text">
                            <b>{provider.label}</b>
                            <small>{provider.summary}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {cloudProvider && (
                    <div>
                      <FieldLabel icon="service">Service</FieldLabel>
                      <div className="cx-cloud-services">
                        {cloudProvider.services.map((service) => (
                          <button
                            key={service.key}
                            type="button"
                            disabled={service.comingSoon}
                            aria-pressed={cloudServiceKey === service.key}
                            className={`cx-cloud-service ${cloudServiceKey === service.key ? 'is-active' : ''}`}
                            onClick={() => chooseCloudService(cloudProvider, service)}
                          >
                            {service.comingSoon ? (
                              <>
                                <span className="cx-cloud-service-name">{service.label}</span>
                                <span className="cx-cloud-soon">Coming soon</span>
                              </>
                            ) : (
                              <>
                                <EngineIcon type={service.engine} size={20} />
                                <span className="cx-cloud-service-name">{service.label}</span>
                              </>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {cloudService && (
                    <p className="cx-cloud-note">
                      {cloudService.tip || `Copy the endpoint and port from your ${cloudProvider.label} console.`} Allow this server's IP address in your {cloudProvider.label} network settings or firewall. SSL is always on and the server's certificate is checked.
                    </p>
                  )}
                </>
              )}

              {/* Connection Name */}
              {showConnectionFields && (
              <>
              <div>
                <FieldLabel icon="name" htmlFor="cx-field-name">Connection Name</FieldLabel>
                <input
                  id="cx-field-name"
                  type="text"
                  placeholder="e.g. Company MySQL, Analytics DB"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                />
              </div>

              {!isCloudTab && (
              <div>
                <FieldLabel icon="type" id="cx-field-type">Database Type</FieldLabel>
                <div className="cx-type-grid" role="radiogroup" aria-labelledby="cx-field-type">
                  {DATABASE_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={form.type === type}
                      onClick={() => handleTypeChange(type)}
                      className={`cx-type-card ${form.type === type ? 'is-active' : ''}`}
                    >
                      <span className="cx-type-logo"><EngineIcon type={type} size={34} /></span>
                      {ENGINE_META[type].label}
                      {form.type === type && (
                        <span className="cx-type-check" aria-hidden="true">
                          <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* MongoDB connects with host and port, or with a connection URL */}
              {form.type === 'mongodb' && !isCloudTab && (
                <div>
                  <FieldLabel icon="code" id="cx-field-mongo-mode">Connect Using</FieldLabel>
                  <div className="cx-mongo-mode" role="radiogroup" aria-labelledby="cx-field-mongo-mode">
                    <button type="button" role="radio" aria-checked={mongoMode === 'structured'} className={mongoMode === 'structured' ? 'is-active' : ''} onClick={() => setMongoMode('structured')}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">{FIELD_ICONS.host}</svg>
                      Host &amp; Port
                    </button>
                    <button type="button" role="radio" aria-checked={mongoMode === 'uri'} className={mongoMode === 'uri' ? 'is-active' : ''} onClick={() => setMongoMode('uri')}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">{FIELD_ICONS.name}</svg>
                      Connection URL
                    </button>
                  </div>
                </div>
              )}

              {/* Connection Form Fields */}
              {form.type === 'mongodb' && mongoMode === 'uri' ? (
                <div>
                  <FieldLabel icon="code" htmlFor="cx-field-uri">Connection String</FieldLabel>
                  <input
                    id="cx-field-uri"
                    type="text"
                    placeholder={cloudService?.uriHint || 'mongodb://username:password@host:27017/'}
                    value={form.connectionString}
                    onChange={e => setForm({ ...form, connectionString: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition font-mono custom-focus"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel icon="host" htmlFor="cx-field-host">{isCloudTab ? 'Endpoint / Host' : 'Host'}</FieldLabel>
                      <input
                        id="cx-field-host"
                        type="text"
                        placeholder={cloudService?.hostHint || (form.type === 'mongodb' ? '127.0.0.1' : 'localhost')}
                        value={form.host}
                        onChange={e => setForm({ ...form, host: e.target.value })}
                        required
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    <div>
                      <FieldLabel icon="port" htmlFor="cx-field-port">Port</FieldLabel>
                      <input
                        id="cx-field-port"
                        type="number"
                        placeholder={form.type === 'mysql' ? '3306' : form.type === 'postgresql' ? '5432' : '27017'}
                        value={form.port}
                        onChange={e => setForm({ ...form, port: e.target.value })}
                        required
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    <div>
                      <FieldLabel icon="user" htmlFor="cx-field-user">Username</FieldLabel>
                      <input
                        id="cx-field-user"
                        type="text"
                        placeholder={form.type === 'mysql' ? 'root' : form.type === 'postgresql' ? 'postgres' : 'admin'}
                        value={form.username}
                        onChange={e => setForm({ ...form, username: e.target.value })}
                        required={form.type !== 'mongodb'}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    <div>
                      <FieldLabel icon="lock" htmlFor="cx-field-password">Password</FieldLabel>
                      <input
                        id="cx-field-password"
                        type="password"
                        placeholder="Password"
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    {form.type !== 'mongodb' && (
                      <div className="sm:col-span-2">
                        <FieldLabel icon="database" htmlFor="cx-field-database">
                          {form.type === 'oracle' ? 'Service Name / SID (Required)' : 'Default Database (Optional)'}
                        </FieldLabel>
                        <input
                          id="cx-field-database"
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

              {isCloudTab && cloudProvider?.ca && form.type !== 'oracle' && form.type !== 'mongodb' && (
                <div>
                  <FieldLabel icon="cert" htmlFor="cx-field-ca">
                    CA Certificate ({cloudProvider.ca === 'required' ? 'Required' : 'Optional'})
                  </FieldLabel>
                  <textarea
                    id="cx-field-ca"
                    className="cx-cloud-ca"
                    rows={4}
                    spellCheck={false}
                    placeholder="-----BEGIN CERTIFICATE-----"
                    value={cloudCa}
                    required={cloudProvider.ca === 'required'}
                    onChange={e => setCloudCa(e.target.value)}
                  />
                  <p className="cx-cloud-hint">{cloudProvider.caHint}</p>
                </div>
              )}

              {/* Connection Access Mode */}
              <div>
                <p className="cx-label" id="cx-field-access">
                  <svg viewBox="0 0 24 24" aria-hidden="true">{FIELD_ICONS.shield}</svg>
                  <span>Connection Access <em>Mode</em></span>
                </p>
                <div className="cx-access-options" role="radiogroup" aria-labelledby="cx-field-access">
                  <label className={`cx-access-card ${form.accessMode === 'read' ? 'is-active' : ''}`}>
                    <input type="radio" name="connection-access-mode" value="read" checked={form.accessMode === 'read'} onChange={e => setForm({ ...form, accessMode: e.target.value })} />
                    <span className="cx-access-text">
                      <b>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
                        Read Only
                      </b>
                      <small>Only allow read operations</small>
                    </span>
                  </label>
                  <label className={`cx-access-card ${form.accessMode === 'readwrite' ? 'is-active' : ''}`}>
                    <input type="radio" name="connection-access-mode" value="readwrite" checked={form.accessMode === 'readwrite'} onChange={e => setForm({ ...form, accessMode: e.target.value })} />
                    <span className="cx-access-text">
                      <b>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" /></svg>
                        Read &amp; Write
                      </b>
                      <small>Allow read and write operations</small>
                    </span>
                  </label>
                </div>
              </div>

              {/* SSL Configuration Checkbox */}
              {form.type !== 'mongodb' && !isCloudTab && (
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
              <div className="cx-add-actions">
                <button type="button" onClick={handleTest} disabled={testLoading} className="cx-test-btn">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 01-14.3 4.9M4 12a8 8 0 0114.3-4.9M18 3v4.5h-4.5M6 21v-4.5h4.5" /></svg>
                  {testLoading ? 'Testing...' : 'Test Connection'}
                </button>
                <button type="submit" disabled={saveLoading} className="cx-save-btn">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v13a2 2 0 01-2 2H7a2 2 0 01-2-2V3z" /><path d="M8 3v5h7V3M8 21v-6h8v6" /></svg>
                  {saveLoading ? 'Saving...' : 'Save Connection'}
                  {!saveLoading && <svg className="cx-save-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>}
                </button>
              </div>
              </>
              )}

            </form>
            </div>
          </div>
        )}

        {/* Filter toolbar */}
        {!showForm && connections.length > 0 && (
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

              <label className="cx-input w-[250px]" title="Filter by database or cloud provider">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0117.8 8.2 4 4 0 0117 18H7z" />
                </svg>
                <select value={filterSource} onChange={(e) => chooseSource(e.target.value)} aria-label="Database or cloud">
                  <option value="all">Database &amp; Cloud ({connections.length})</option>
                  <option value="database">Database ({sourceCounts.database || 0})</option>
                  <option value="cloud">Cloud Services ({sourceCounts.cloud || 0})</option>
                  <optgroup label="Cloud provider">
                    {CLOUD_PROVIDERS.map((provider) => (
                      <option key={provider.key} value={provider.key}>{provider.label} ({sourceCounts[provider.key] || 0})</option>
                    ))}
                  </optgroup>
                </select>
              </label>

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

        {!showForm && tableSearchResults.length > 0 && (
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
        {!showForm && (connections.length === 0 ? (
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
              No connections match the selected filters.
            </p>
            <button type="button" onClick={resetFilters} className="cx-btn-ghost">
              Clear All Filters
            </button>
          </div>
        ) : (
          <>
          {/* View and color theme options */}
          <div className="cx-viewbar" ref={listTopRef}>
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
            <div className={`cx-list cx-rows cxt-${activeThemeKey}`}>
              {pageConnections.map((conn) => {
                const { hostPort, isShared, cloudText, tools } = connectionDetails(conn);
                const isInactive = conn.isActive === false;
                const menuOpen = openRowMenu === conn._id;
                return (
                  <div key={conn._id} className={`cx-row ${menuOpen ? 'is-menu-open' : ''}`} style={accentStyle(conn)} onClick={() => navigate(`/connections/${conn._id}`)}>
                    <span className="cx-row-logo">
                      <EngineIcon type={conn.type} size={40} />
                      {conn.type === 'oracle' && <small>ORACLE</small>}
                    </span>

                    <div className="cx-row-main">
                      <div className="cx-row-title">
                        <p className="cx-name" title={conn.name}>{conn.name}</p>
                        <span className={`cx-state ${isInactive ? 'is-off' : ''}`}>{isInactive ? 'Inactive' : 'Active'}</span>
                      </div>
                      <p className="cx-row-sub" title={conn.database || 'Any'}>
                        Database: {conn.database || 'Any'}
                      </p>
                      {cloudText && <span className="cx-badge is-cloud">{cloudText}</span>}
                      {isShared && <span className="cx-badge is-shared">Shared by {conn.user.name}</span>}
                    </div>

                    <dl className="cx-row-facts">
                      <div>
                        <dt><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>Connection ID</dt>
                        <dd title={String(conn._id)}>{String(conn._id).slice(-6)}</dd>
                      </div>
                      <div>
                        <dt><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>Added On</dt>
                        <dd>{formatAddedOn(conn.createdAt)}</dd>
                      </div>
                      <div>
                        <dt><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></svg>Host</dt>
                        <dd title={hostPort}>{hostPort}</dd>
                      </div>
                    </dl>

                    <div className="cx-row-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="cx-row-view" onClick={() => navigate(`/connections/${conn._id}`)}>
                        Open
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </button>
                      {canManage(conn) && (
                        <button type="button" className="cx-row-delete" onClick={() => handleDelete(conn._id, conn.name)} aria-label={`Delete ${conn.name}`}>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg>
                          Delete
                        </button>
                      )}
                      <div className="cx-row-more">
                        <button
                          type="button"
                          className="cx-row-more-btn"
                          aria-label={`More options for ${conn.name}`}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          title="More options"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenRowMenu(menuOpen ? null : conn._id);
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                        </button>
                        {menuOpen && (
                          <div className="cx-row-menu" role="menu">
                            {tools.map((tool) => (
                              <button key={tool.key} type="button" role="menuitem" style={{ '--t': tool.color }} onClick={() => navigate(tool.to)}>
                                <span className="cx-tool-icon">{renderToolIcon(tool)}</span>
                                {tool.label}
                              </button>
                            ))}
                            {canManage(conn) && (
                              <button type="button" role="menuitem" style={{ '--t': '#475569' }} onClick={() => { setOpenRowMenu(null); handleOpenEditModal(conn); }}>
                                <span className="cx-tool-icon">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" /></svg>
                                </span>
                                Edit
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {listPager}
            </div>
          ) : (
          <>
          <div className={`cx-list grid gap-4 md:grid-cols-2 2xl:grid-cols-3 cxt-${activeThemeKey}`}>
            {pageConnections.map((conn, index) => {
              const { meta, hostPort, isDisconnected, isShared, cloudText, tools } = connectionDetails(conn);

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
                        <span className="cx-badge is-engine">{meta.label}</span>
                        <span className={`cx-badge ${conn.accessMode === 'read' ? 'is-read' : 'is-write'}`}>
                          {conn.accessMode === 'read' ? 'Read Only' : 'Read & Write'}
                        </span>
                        {cloudText && <span className="cx-badge is-cloud">{cloudText}</span>}
                        {isShared && (
                          <span className="cx-badge is-shared">Shared by {conn.user.name}</span>
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
          <div className="mt-4">{listPager}</div>
          </>
          )}
          </>
        ))}

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

              {/* CA certificate of a cloud database */}
              {CLOUD_PROVIDERS.find((provider) => provider.key === editConnectionModalConn.cloudProvider)?.ca && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">CA Certificate</label>
                  <textarea
                    className="cx-cloud-ca"
                    rows={4}
                    spellCheck={false}
                    placeholder="-----BEGIN CERTIFICATE-----"
                    value={editConnForm.caCertificate}
                    onChange={e => setEditConnForm({ ...editConnForm, caCertificate: e.target.value })}
                  />
                  <p className="cx-cloud-hint">SSL is always on for this connection, and the server's certificate is checked.</p>
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