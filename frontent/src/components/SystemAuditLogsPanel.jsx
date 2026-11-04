import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API from '../api/axios';
import Toast from './Toast';
import AdminPager from './AdminPager';
import { copyText, downloadCsv, escapeHtml, initialsOf, timeAgo, toLocalDateInput } from '../utils/adminHelpers';
import './AdminPages.css';

// Quick category chips (client-side, on top of the server filters)
const CATEGORIES = [
  { id: 'queries', label: 'Queries', actions: ['RUN_QUERY', 'SLOW_QUERY'] },
  { id: 'data', label: 'Data & Schema', actions: ['INSERT_DATA', 'UPDATE_DATA', 'DELETE_DATA', 'CREATE_TABLE', 'ALTER_TABLE', 'DROP_TABLE', 'CREATE_DATABASE', 'ALTER_DATABASE', 'DROP_DATABASE'] },
  { id: 'backups', label: 'Backups', actions: ['EXPORT_BACKUP', 'RESTORE_BACKUP'] },
  { id: 'users', label: 'Users & Access', actions: ['CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'UPDATE_USER_PERMISSIONS', 'CREATE_DB_USER', 'UPDATE_DB_USER', 'DELETE_DB_USER', 'PROFILE_UPDATE', 'PASSWORD_CHANGE'] },
  { id: 'connections', label: 'Connections', actions: ['CREATE_CONNECTION', 'UPDATE_CONNECTION', 'DELETE_CONNECTION', 'TEST_CONNECTION'] },
  { id: 'signins', label: 'Sign-ins', actions: ['LOGIN', 'LOGOUT'] },
];
const ALL_ACTIONS = CATEGORIES.flatMap((category) => category.actions);

// Actions that destroy data or change who can do what
const SENSITIVE_ACTIONS = new Set(['DELETE_DATA', 'DROP_TABLE', 'DROP_DATABASE', 'RESTORE_BACKUP', 'DELETE_CONNECTION', 'DELETE_USER', 'DELETE_DB_USER', 'UPDATE_USER_PERMISSIONS', 'PASSWORD_CHANGE']);

const DATE_PRESETS = [
  { id: 'all', label: 'All time', days: null },
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: '7 days', days: 6 },
  { id: '30d', label: '30 days', days: 29 },
];

const AUTO_REFRESH_MS = 30000;

const dayLabel = (value) => {
  const date = new Date(value);
  const key = toLocalDateInput(date);
  const now = new Date();
  if (key === toLocalDateInput(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === toLocalDateInput(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export default function SystemAuditLogsPanel() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);

  // Server-side filters
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [queryType, setQueryType] = useState('');
  const [selectedConnection, setSelectedConnection] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  // Client-side view state
  const [tableSearch, setTableSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Only the newest request may update the list
  const latestRequest = useRef(0);
  const paramsKey = JSON.stringify(Object.fromEntries(Object.entries({
    userId: selectedUser,
    action: selectedAction,
    startDate,
    endDate,
    queryType,
    connectionId: selectedConnection,
    role: selectedRole,
  }).filter(([, value]) => value)));
  const [loadedKey, setLoadedKey] = useState(null);
  const loading = loadedKey !== paramsKey;

  const fetchSystemLogs = useCallback(async () => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;
    try {
      const res = await API.get('/audit-logs', { params: JSON.parse(paramsKey) });
      if (requestId !== latestRequest.current) return;
      setLogs(res.data.logs || []);
      setError('');
      setLastUpdated(new Date());
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      console.error(err);
      setError(err.response?.status === 403 ? 'Audit logs are available to admins only.' : 'Failed to load system audit logs.');
    } finally {
      if (requestId === latestRequest.current) {
        setLoadedKey(paramsKey);
        setRefreshing(false);
      }
    }
  }, [paramsKey]);

  useEffect(() => {
    fetchSystemLogs();
  }, [fetchSystemLogs]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(fetchSystemLogs, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchSystemLogs]);

  useEffect(() => {
    API.get('/users').then((res) => setUsers(res.data.users || [])).catch((e) => console.error('Failed to load users list:', e));
    API.get('/connections').then((res) => setConnections(res.data.connections || [])).catch((e) => console.error('Failed to load connections list:', e));
  }, []);

  // Back to page 1 whenever the visible set changes
  const viewKey = `${paramsKey}|${tableSearch}|${category}|${sensitiveOnly}|${pageSize}`;
  const [prevViewKey, setPrevViewKey] = useState(viewKey);
  if (prevViewKey !== viewKey) {
    setPrevViewKey(viewKey);
    setCurrentPage(1);
  }

  const userHasConnection = (userObj, connId) => (
    Array.isArray(userObj.allowedConnections) && userObj.allowedConnections.some((c) => (
      typeof c === 'string' ? c === connId : c.connectionId === connId
    ))
  );

  const handleUserChange = (userId) => {
    setSelectedUser(userId);
    const userObj = users.find((u) => u._id === userId);
    if (!userObj) return;
    if (userObj.role) setSelectedRole(userObj.role);
    if (selectedConnection && selectedConnection !== 'global' && userObj.role !== 'admin' && !userHasConnection(userObj, selectedConnection)) {
      setSelectedConnection('');
    }
  };

  const handleConnectionChange = (connId) => {
    setSelectedConnection(connId);
    if (!connId || connId === 'global' || !selectedUser) return;
    const userObj = users.find((u) => u._id === selectedUser);
    if (userObj && userObj.role !== 'admin' && !userHasConnection(userObj, connId)) setSelectedUser('');
  };

  const handleRoleChange = (role) => {
    setSelectedRole(role);
    if (!role || !selectedUser) return;
    const userObj = users.find((u) => u._id === selectedUser);
    if (userObj && (userObj.role || '').toLowerCase() !== role.toLowerCase()) setSelectedUser('');
  };

  const availableUsers = users.filter((u) => {
    if (selectedRole && (u.role || '').toLowerCase() !== selectedRole.toLowerCase()) return false;
    if (selectedConnection && selectedConnection !== 'global') {
      return u.role === 'admin' || userHasConnection(u, selectedConnection);
    }
    return true;
  });

  const selectedUserObj = users.find((u) => u._id === selectedUser);
  const availableConnections = selectedUserObj && selectedUserObj.role !== 'admin'
    ? connections.filter((conn) => userHasConnection(selectedUserObj, conn._id))
    : connections;

  const activePreset = useMemo(() => {
    if (!startDate && !endDate) return 'all';
    const today = toLocalDateInput(new Date());
    if (endDate !== today) return null;
    return DATE_PRESETS.find((preset) => {
      if (preset.days === null) return false;
      const from = new Date();
      from.setDate(from.getDate() - preset.days);
      return toLocalDateInput(from) === startDate;
    })?.id ?? null;
  }, [startDate, endDate]);

  const applyPreset = (preset) => {
    if (preset.days === null) {
      setStartDate('');
      setEndDate('');
      return;
    }
    const from = new Date();
    from.setDate(from.getDate() - preset.days);
    setStartDate(toLocalDateInput(from));
    setEndDate(toLocalDateInput(new Date()));
  };

  const handleClearFilters = () => {
    setSelectedUser('');
    setSelectedAction('');
    setStartDate('');
    setEndDate('');
    setQueryType('');
    setTableSearch('');
    setSelectedConnection('');
    setSelectedRole('');
    setCategory('all');
    setSensitiveOnly(false);
  };

  const advancedFilterCount = [selectedUser, selectedAction, startDate, endDate, queryType, selectedConnection, selectedRole].filter(Boolean).length;
  const hasAnyFilter = advancedFilterCount > 0 || tableSearch || category !== 'all' || sensitiveOnly;

  const categoryCounts = useMemo(() => {
    const counts = {};
    logs.forEach((log) => {
      const match = CATEGORIES.find((c) => c.actions.includes(log.action));
      if (match) counts[match.id] = (counts[match.id] || 0) + 1;
    });
    return counts;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    const categoryActions = CATEGORIES.find((c) => c.id === category)?.actions;
    return logs.filter((log) => {
      if (categoryActions && !categoryActions.includes(log.action)) return false;
      if (sensitiveOnly && !SENSITIVE_ACTIONS.has(log.action)) return false;
      if (!q) return true;
      return [log.details, log.user?.name, log.user?.email, log.connection?.name, log.action, new Date(log.createdAt).toLocaleString()]
        .some((field) => field && String(field).toLowerCase().includes(q));
    });
  }, [logs, tableSearch, category, sensitiveOnly]);

  const stats = useMemo(() => {
    const today = toLocalDateInput(new Date());
    return {
      total: logs.length,
      today: logs.filter((log) => toLocalDateInput(new Date(log.createdAt)) === today).length,
      people: new Set(logs.map((log) => log.user?._id).filter(Boolean)).size,
      sensitive: logs.filter((log) => SENSITIVE_ACTIONS.has(log.action)).length,
    };
  }, [logs]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const currentItems = filteredLogs.slice((page - 1) * pageSize, page * pageSize);

  // Exports use exactly what the filters currently show
  const exportToExcel = () => {
    if (filteredLogs.length === 0) return;
    downloadCsv(
      `system_audit_logs_${toLocalDateInput(new Date())}.csv`,
      ['Timestamp', 'User Name', 'User Email', 'Role', 'Connection', 'Action', 'Details'],
      filteredLogs.map((log) => [
        new Date(log.createdAt).toLocaleString(),
        log.user?.name || 'Unknown',
        log.user?.email || 'N/A',
        log.user?.role || 'N/A',
        log.connection?.name || 'Global System',
        log.action,
        log.details || '',
      ])
    );
    setToast({ message: `Exported ${filteredLogs.length} records as CSV`, type: 'success' });
  };

  const exportToPDF = async () => {
    if (filteredLogs.length === 0) return;
    const element = document.createElement('div');
    element.style.padding = '24px';
    element.style.fontFamily = 'system-ui, sans-serif';
    element.style.fontSize = '10px';
    // Log text can hold anything a user typed, so every value is escaped before going into HTML
    element.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0d9488;padding-bottom:12px;margin-bottom:18px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:#0d9488;">ALLATONE DMS</div>
          <div style="font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;">Audit &amp; Compliance Trail</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:14px;font-weight:bold;color:#111827;">System Activity Audit Trail</div>
          <div style="font-size:8px;color:#6b7280;margin-top:2px;">${filteredLogs.length} records · Generated ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;text-align:left;">
        <thead>
          <tr style="background-color:#f3f4f6;color:#374151;">
            ${['Timestamp', 'User', 'Connection', 'Action', 'Details'].map((h) => `<th style="padding:6px;border:1px solid #e5e7eb;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${filteredLogs.map((log) => `
            <tr style="color:#4b5563;">
              <td style="padding:6px;border:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(new Date(log.createdAt).toLocaleString())}</td>
              <td style="padding:6px;border:1px solid #e5e7eb;">${escapeHtml(log.user?.name || 'Unknown')}<br/><span style="font-size:7px;color:#9ca3af;">${escapeHtml(log.user?.email || '')}</span></td>
              <td style="padding:6px;border:1px solid #e5e7eb;">${escapeHtml(log.connection?.name || 'Global System')}</td>
              <td style="padding:6px;border:1px solid #e5e7eb;"><strong>${escapeHtml(log.action)}</strong></td>
              <td style="padding:6px;border:1px solid #e5e7eb;font-size:8px;font-family:monospace;max-width:250px;overflow-wrap:break-word;">${escapeHtml((log.details || '').substring(0, 120))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    try {
      const mod = await import('html2pdf.js');
      const html2pdf = mod.default || mod;
      await html2pdf().set({
        margin: 10,
        filename: `system_audit_report_${toLocalDateInput(new Date())}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' },
      }).from(element).save();
    } catch (e) {
      console.error('PDF generation failed', e);
      setToast({ message: 'PDF download failed.', type: 'error' });
    }
  };

  const handleCopyDetails = async (text) => {
    const ok = await copyText(text || '');
    setToast(ok ? { message: 'Details copied', type: 'success' } : { message: 'Could not copy to the clipboard.', type: 'error' });
  };

  let lastDay = null;

  return (
    <div className="ap-page">
      {toast && <Toast toast={toast} onClose={closeToast} placement="top-right" />}

      <div className="ap-head">
        <div>
          <h2 className="ap-title">Audit Logs</h2>
          <p className="ap-sub">
            Every important action across the system.
            {lastUpdated && ` Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((on) => !on)}
            aria-pressed={autoRefresh}
            className={`ap-btn-outline ${autoRefresh ? 'is-active' : ''}`}
            title="Reload the logs every 30 seconds"
          >
            <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-teal-500 animate-pulse' : 'bg-slate-300'}`} />
            Auto-refresh
          </button>
          <button
            type="button"
            onClick={() => { setRefreshing(true); fetchSystemLogs(); }}
            disabled={refreshing}
            className="ap-btn-outline"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" /></svg>
            Refresh
          </button>
          <button type="button" onClick={exportToExcel} disabled={filteredLogs.length === 0} className="ap-btn-outline">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            CSV
          </button>
          <button type="button" onClick={exportToPDF} disabled={filteredLogs.length === 0} className="ap-btn">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></svg>
            PDF report
          </button>
        </div>
      </div>

      <div className="ap-stats">
        <div className="ap-stat">
          <span className="ap-stat-icon"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M9 8h6M9 12h6M9 16h4" /></svg></span>
          <div><div className="ap-stat-value">{stats.total.toLocaleString()}</div><div className="ap-stat-label">Records loaded</div></div>
        </div>
        <button type="button" className={`ap-stat ${activePreset === 'today' ? 'is-active' : ''}`} onClick={() => applyPreset(DATE_PRESETS[activePreset === 'today' ? 0 : 1])} title="Show only today">
          <span className="ap-stat-icon"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg></span>
          <div><div className="ap-stat-value">{stats.today.toLocaleString()}</div><div className="ap-stat-label">Today</div></div>
        </button>
        <div className="ap-stat">
          <span className="ap-stat-icon"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a5.5 5.5 0 013.5 5.5" /></svg></span>
          <div><div className="ap-stat-value">{stats.people.toLocaleString()}</div><div className="ap-stat-label">Active people</div></div>
        </div>
        <button type="button" className={`ap-stat ${sensitiveOnly ? 'is-active' : ''}`} onClick={() => setSensitiveOnly((on) => !on)} aria-pressed={sensitiveOnly} title="Deletes, drops, restores and access changes">
          <span className="ap-stat-icon is-danger"><svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01" /></svg></span>
          <div><div className="ap-stat-value">{stats.sensitive.toLocaleString()}</div><div className="ap-stat-label">Sensitive actions</div></div>
        </button>
      </div>

      <div className="ap-card">
        {/* Search, date presets, filter toggle */}
        <div className="ap-toolbar">
          <div className="ap-search">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
            <input type="text" className="ap-input" placeholder="Search details, people, connections..." value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} />
            {tableSearch && (
              <button type="button" className="ap-search-clear" onClick={() => setTableSearch('')} aria-label="Clear search">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <div className="ap-seg" role="group" aria-label="Date range">
            {DATE_PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => applyPreset(preset)} className={activePreset === preset.id ? 'is-active' : ''}>{preset.label}</button>
            ))}
          </div>
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className={`ap-btn-outline ${filtersOpen || advancedFilterCount ? 'is-active' : ''}`}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
            Filters{advancedFilterCount > 0 && ` (${advancedFilterCount})`}
          </button>
          {hasAnyFilter && <button type="button" onClick={handleClearFilters} className="ap-btn-outline">Clear all</button>}
        </div>

        {filtersOpen && (
          <div className="ap-divider grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3">
            <div>
              <label className="ap-label" htmlFor="ap-user">Person</label>
              <select id="ap-user" className="ap-select" value={selectedUser} onChange={(e) => handleUserChange(e.target.value)}>
                <option value="">All people ({availableUsers.length})</option>
                {availableUsers.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.role || 'user'})</option>)}
              </select>
            </div>
            <div>
              <label className="ap-label" htmlFor="ap-role">Role</label>
              <select id="ap-role" className="ap-select" value={selectedRole} onChange={(e) => handleRoleChange(e.target.value)}>
                <option value="">All roles</option>
                <option value="admin">Admin</option>
                <option value="developer">Developer</option>
              </select>
            </div>
            <div>
              <label className="ap-label" htmlFor="ap-conn">Connection</label>
              <select id="ap-conn" className="ap-select" value={selectedConnection} onChange={(e) => handleConnectionChange(e.target.value)}>
                <option value="">All connections ({availableConnections.length})</option>
                <option value="global">Global system logs</option>
                {availableConnections.map((c) => <option key={c._id} value={c._id}>{c.name} ({String(c.type).toUpperCase()})</option>)}
              </select>
            </div>
            <div>
              <label className="ap-label" htmlFor="ap-action">Exact action</label>
              <select id="ap-action" className="ap-select" value={selectedAction} onChange={(e) => setSelectedAction(e.target.value)}>
                <option value="">All actions</option>
                {ALL_ACTIONS.map((action) => <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="ap-label" htmlFor="ap-op">Query type</label>
              <select
                id="ap-op"
                className="ap-select"
                value={queryType}
                onChange={(e) => setQueryType(e.target.value)}
                disabled={selectedAction !== '' && selectedAction !== 'RUN_QUERY' && selectedAction !== 'SLOW_QUERY'}
              >
                <option value="">All operations</option>
                <option value="select">Read (SELECT / FIND)</option>
                <option value="insert">Insert</option>
                <option value="update">Update</option>
                <option value="delete">Delete / Drop</option>
              </select>
            </div>
            <div>
              <label className="ap-label" htmlFor="ap-from">From</label>
              <input id="ap-from" type="date" className="ap-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="ap-label" htmlFor="ap-to">To</label>
              <input id="ap-to" type="date" className="ap-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        )}

        {/* Category chips */}
        <div className="ap-divider flex flex-wrap gap-1.5 p-3">
          <button type="button" onClick={() => setCategory('all')} className={`ap-chip ${category === 'all' ? 'is-active' : ''}`}>
            All <span className="ap-chip-count">{logs.length.toLocaleString()}</span>
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`ap-chip ${category === c.id ? 'is-active' : ''}`}>
              {c.label} <span className="ap-chip-count">{(categoryCounts[c.id] || 0).toLocaleString()}</span>
            </button>
          ))}
        </div>

        {error && <div className="ap-alert mx-3 mb-3">{error}</div>}

        {/* Timeline */}
        <div className="ap-divider">
          {loading ? (
            <div className="ap-empty">
              <div className="ap-spinner" />
              <p className="mt-3 text-[13px] text-slate-500">Loading audit logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="ap-empty">
              <div className="ap-empty-icon"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M9 8h6M9 12h6M9 16h4" /></svg></div>
              <p className="text-[14px] font-semibold">No matching activity</p>
              <p className="mt-1 text-[12.5px] text-slate-500">{hasAnyFilter ? 'Try removing some filters.' : 'Nothing has been logged yet.'}</p>
              {hasAnyFilter && <button type="button" onClick={handleClearFilters} className="ap-btn-outline mt-3">Clear all filters</button>}
            </div>
          ) : (
            currentItems.map((log) => {
              const isOpen = expandedLogId === log._id;
              const sensitive = SENSITIVE_ACTIONS.has(log.action);
              const day = dayLabel(log.createdAt);
              const showDay = day !== lastDay;
              lastDay = day;
              return (
                <div key={log._id}>
                  {showDay && <div className="ap-day">{day}</div>}
                  <div className={`ap-log ${isOpen ? 'is-open' : ''}`}>
                    <button type="button" className="ap-log-row" onClick={() => setExpandedLogId(isOpen ? null : log._id)} aria-expanded={isOpen}>
                      <span className="ap-log-time">{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={`ap-avatar !w-7 !h-7 !text-[10.5px] ${log.user?.role === 'admin' ? 'is-admin' : ''}`} title={log.user?.email || ''}>{initialsOf(log.user?.name)}</span>
                      <span className="w-32 shrink-0 truncate text-[12.5px] font-semibold">{log.user?.name || 'Unknown'}</span>
                      <span className={`ap-tag ${sensitive ? 'is-danger' : ''}`}>{(log.action || 'ACTION').replace(/_/g, ' ')}</span>
                      <span className="ap-tag is-neutral hidden md:inline-flex max-w-[140px]"><span className="truncate">{log.connection?.name || 'System'}</span></span>
                      <span className="ap-log-details">{log.details}</span>
                      <svg className="ap-log-chevron w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                    {isOpen && (
                      <div className="ap-log-expanded">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[12px] text-slate-500">
                          <span>{new Date(log.createdAt).toLocaleString()} ({timeAgo(log.createdAt)})</span>
                          <span className="ap-mono">{log.user?.email || 'N/A'}</span>
                          <span className="capitalize">{log.user?.role || 'unknown role'}</span>
                          {log.connection && <span>{log.connection.name} · {String(log.connection.type).toUpperCase()}</span>}
                        </div>
                        <pre className="ap-code">{log.details}</pre>
                        <button type="button" onClick={() => handleCopyDetails(log.details)} className="ap-btn-outline !h-8 mt-2">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
                          Copy details
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!loading && filteredLogs.length > 0 && (
          <AdminPager
            page={page}
            pageSize={pageSize}
            total={filteredLogs.length}
            noun="records"
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  );
}
