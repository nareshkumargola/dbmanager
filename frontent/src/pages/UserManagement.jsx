import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import ConnectionSchemaSelector from '../components/ConnectionSchemaSelector';
import Toast from '../components/Toast';
import AdminPager from '../components/AdminPager';
import { PERMISSIONS, downloadCsv, enabledPermissionCount, initialsOf, permissionsOf, timeAgo, toLocalDateInput } from '../utils/adminHelpers';
import '../components/AdminPages.css';

const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

// One-click starting points; connection access is left untouched
const ROLE_PRESETS = [
  { id: 'analyst', label: 'Analyst', hint: 'Query and history only', keys: ['query', 'history', 'slowQuery'] },
  { id: 'developer', label: 'Developer', hint: 'Queries plus monitoring', keys: ['query', 'history', 'slowQuery', 'monitor', 'binlog', 'auditLogs'] },
  { id: 'dba', label: 'DBA', hint: 'Everything except users', keys: PERMISSIONS.map((p) => p.key).filter((key) => key !== 'userManagement') },
  { id: 'all', label: 'Full', hint: 'All modules', keys: PERMISSIONS.map((p) => p.key) },
  { id: 'none', label: 'None', hint: 'Remove all modules', keys: [] },
];

const HISTORY_ACTIONS = {
  UPDATE_USER_PERMISSIONS: { label: 'Permissions changed', tone: '' },
  UPDATE_USER: { label: 'User updated', tone: 'is-neutral' },
  CREATE_USER: { label: 'User created', tone: '' },
  DELETE_USER: { label: 'User deleted', tone: 'is-danger' },
};

const EMPTY_FORM = {
  name: '', email: '', password: '', role: 'developer', accessMode: 'read',
  permissions: { userManagement: false, connections: false },
};

const presetPerms = (keys) => Object.fromEntries(PERMISSIONS.map(({ key }) => [key, keys.includes(key)]));

const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const values = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(values, (value) => chars[value % chars.length]).join('');
};

export default function UserManagement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const selfId = String(currentUser?._id || currentUser?.id || '');
  const canOpenPage = isAdmin || Boolean(currentUser?.permissions?.userManagement);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'success') => setToast({ message, type }), []);
  const closeToast = useCallback(() => setToast(null), []);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('permissions');

  // Editor state: a draft that is only sent when saved
  const [selectedUserId, setSelectedUserId] = useState('');
  const [perms, setPerms] = useState(() => permissionsOf(null));
  const [accessMode, setAccessMode] = useState('read');
  const [allowedConnections, setAllowedConnections] = useState([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [copyFromId, setCopyFromId] = useState('');

  // Create-user modal
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // Permission history
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historySearch, setHistorySearch] = useState('');
  const [historyAction, setHistoryAction] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  const selectedUser = users.find((u) => u._id === selectedUserId);

  const loadDraft = useCallback((u) => {
    setSelectedUserId(u?._id || '');
    setPerms(permissionsOf(u));
    setAccessMode(u?.accessMode === 'readwrite' ? 'readwrite' : 'read');
    setAllowedConnections(Array.isArray(u?.allowedConnections) ? u.allowedConnections : []);
    setCopyFromId('');
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await API.get('/users');
      const list = res.data.users || [];
      setUsers(list);
      setError('');
      return list;
    } catch {
      setError('Failed to load users.');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await API.get('/audit-logs');
      setHistoryLogs((res.data.logs || []).filter((log) => HISTORY_ACTIONS[log.action]));
    } catch (err) {
      console.error('Failed to load permission history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const requestedUserId = searchParams.get('user');

  useEffect(() => {
    if (currentUser && !canOpenPage) {
      navigate('/dashboard');
      return;
    }
    fetchUsers().then((list) => {
      // Open the user from the link, otherwise the first person who isn't you
      const initial = list.find((u) => u._id === requestedUserId)
        || list.find((u) => String(u._id) !== selfId)
        || list[0];
      if (initial) loadDraft(initial);
    });
    if (isAdmin) fetchHistory();
    // Runs once per signed-in user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfId, canOpenPage]);

  const isDirty = useMemo(() => {
    if (!selectedUser) return false;
    return JSON.stringify(perms) !== JSON.stringify(permissionsOf(selectedUser))
      || accessMode !== (selectedUser.accessMode === 'readwrite' ? 'readwrite' : 'read')
      || JSON.stringify(allowedConnections) !== JSON.stringify(selectedUser.allowedConnections || []);
  }, [perms, accessMode, allowedConnections, selectedUser]);

  const isSelfSelected = selectedUser && String(selectedUser._id) === selfId;
  const canEdit = Boolean(selectedUser) && isAdmin && !isSelfSelected && selectedUser.role !== 'admin';

  const selectUser = (u) => {
    if (u._id === selectedUserId) return;
    if (isDirty && !window.confirm(`Discard unsaved changes for ${selectedUser?.name}?`)) return;
    loadDraft(u);
  };

  const openFromMatrix = (u) => {
    selectUser(u);
    setView('permissions');
  };

  const savePermissions = async () => {
    setSaveLoading(true);
    try {
      await API.put(`/users/${selectedUserId}/permissions`, { permissions: perms, accessMode, allowedConnections });
      showToast(`Permissions saved for ${selectedUser?.name || 'user'}`);
      // Reload so the draft matches exactly what the server stored
      const list = await fetchUsers();
      const fresh = list.find((u) => u._id === selectedUserId);
      if (fresh) loadDraft(fresh);
      fetchHistory();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save permissions.', 'error');
    } finally {
      setSaveLoading(false);
    }
  };

  const copyFromUser = (id) => {
    setCopyFromId(id);
    const source = users.find((u) => u._id === id);
    if (source) {
      setPerms(source.role === 'admin' ? presetPerms(PERMISSIONS.map((p) => p.key)) : permissionsOf(source));
      showToast(`Copied module permissions from ${source.name}. Save to apply.`);
    }
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try {
      await API.delete(`/users/${u._id}`);
      showToast(`${u.name} deleted`);
      const list = await fetchUsers();
      loadDraft(list.find((x) => String(x._id) !== selfId) || list[0]);
      fetchHistory();
    } catch (err) {
      showToast(err.response?.data?.message || 'Delete failed.', 'error');
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const res = await API.post('/users', form);
      showToast(`${form.name} created`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      const list = await fetchUsers();
      const created = list.find((u) => u._id === res.data.user?.id);
      if (created) loadDraft(created);
      fetchHistory();
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not create the user.', 'error');
    } finally {
      setFormLoading(false);
    }
  };

  const listUsers = users.filter((u) => {
    const q = listSearch.trim().toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  const visibleHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return historyLogs.filter((log) => (
      (historyAction === 'all' || log.action === historyAction)
      && (!q || [log.details, log.user?.name, log.user?.email].some((field) => field && field.toLowerCase().includes(q)))
    ));
  }, [historyLogs, historySearch, historyAction]);
  const historyTotalPages = Math.max(1, Math.ceil(visibleHistory.length / historyPageSize));
  const currentHistoryPage = Math.min(historyPage, historyTotalPages);
  const pageHistory = visibleHistory.slice((currentHistoryPage - 1) * historyPageSize, currentHistoryPage * historyPageSize);

  const exportMatrix = () => {
    downloadCsv(
      `access_review_${toLocalDateInput(new Date())}.csv`,
      ['Name', 'Email', 'Role', 'Access Mode', 'Connections', ...PERMISSIONS.map((p) => p.label)],
      users.map((u) => {
        const effective = permissionsOf(u);
        return [
          u.name,
          u.email,
          u.role,
          u.role === 'admin' ? 'Full' : (u.accessMode === 'readwrite' ? 'Read & Write' : 'Read Only'),
          u.role === 'admin' ? 'All' : (u.allowedConnections?.length || 0),
          ...PERMISSIONS.map((p) => (u.role === 'admin' || effective[p.key] ? 'Yes' : 'No')),
        ];
      })
    );
    showToast('Access review exported as CSV');
  };

  if (loading) {
    return (
      <div className="ap-page min-h-screen flex items-center justify-center">
        <div className="ap-spinner" />
      </div>
    );
  }

  const tabs = [
    { id: 'permissions', label: 'Edit Permissions' },
    { id: 'matrix', label: 'Access Overview' },
    ...(isAdmin ? [{ id: 'history', label: 'Change History' }] : []),
  ];

  return (
    <div className="ap-page min-h-screen bg-[#f4f7fb] dark:bg-[#0b0f19]">
      <Navbar backTo="/dashboard" backText="Dashboard" />
      {toast && <Toast toast={toast} onClose={closeToast} placement="top-right" />}

      <div className="w-[94%] max-w-[1500px] mx-auto py-5">
        <div className="ap-head">
          <div>
            <h2 className="ap-title">Permissions</h2>
            <p className="ap-sub">Control which modules and connections each person can use.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="ap-seg" role="tablist">
              {tabs.map((tab) => (
                <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => setView(tab.id)} className={view === tab.id ? 'is-active' : ''}>
                  {tab.label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <button type="button" onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }} className="ap-btn">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Create User
              </button>
            )}
          </div>
        </div>

        {error && <div className="ap-alert mb-3">{error}</div>}

        {/* ===== Edit Permissions: user list + editor ===== */}
        {view === 'permissions' && (
          <div className="ap-split">
            <div className="ap-card p-2.5">
              <div className="ap-search mb-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
                <input type="text" className="ap-input" placeholder="Search people..." value={listSearch} onChange={(e) => setListSearch(e.target.value)} />
              </div>
              <div className="space-y-0.5 max-h-[70vh] overflow-y-auto">
                {listUsers.map((u) => (
                  <button key={u._id} type="button" onClick={() => selectUser(u)} className={`ap-user-item ${u._id === selectedUserId ? 'is-active' : ''}`} aria-current={u._id === selectedUserId ? 'true' : undefined}>
                    <span className={`ap-avatar ${u.role === 'admin' ? 'is-admin' : ''}`}>{initialsOf(u.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">
                        {u.name}{String(u._id) === selfId && <span className="ml-1 font-normal text-slate-400">(you)</span>}
                      </span>
                      <span className="block truncate text-[11.5px] text-slate-500">{u.email}</span>
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 tabular-nums" title="Permissions enabled">
                      {u.role === 'admin' ? 'Admin' : `${enabledPermissionCount(u)}/${PERMISSIONS.length}`}
                    </span>
                  </button>
                ))}
                {listUsers.length === 0 && <p className="py-6 text-center text-[12.5px] text-slate-400">No matching people</p>}
              </div>
            </div>

            <div className="min-w-0">
              {!selectedUser ? (
                <div className="ap-card ap-empty"><p className="text-[14px] font-semibold">Select a person to edit their permissions</p></div>
              ) : (
                <>
                  <div className="ap-card p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`ap-avatar !w-11 !h-11 !text-[15px] ${selectedUser.role === 'admin' ? 'is-admin' : ''}`}>{initialsOf(selectedUser.name)}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[16px] font-bold truncate">{selectedUser.name}</h3>
                        <p className="text-[12.5px] text-slate-500 truncate">{selectedUser.email} · Last sign-in {timeAgo(selectedUser.lastLoginAt)}</p>
                      </div>
                      <span className={`ap-tag ${selectedUser.role === 'admin' ? 'is-dark' : ''} capitalize`}>{selectedUser.role}</span>
                      {isAdmin && !isSelfSelected && (
                        <button type="button" onClick={() => deleteUser(selectedUser)} className="ap-icon-btn is-danger" title="Delete user" aria-label={`Delete ${selectedUser.name}`}>
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg>
                        </button>
                      )}
                    </div>

                    {selectedUser.role === 'admin' && <div className="ap-note mt-3">Admins always have every permission on every connection. Change their role to Developer to restrict them.</div>}
                    {isSelfSelected && selectedUser.role !== 'admin' && <div className="ap-note mt-3">You can't change your own permissions. Ask an admin.</div>}
                    {!isAdmin && !isSelfSelected && selectedUser.role !== 'admin' && <div className="ap-note mt-3">Only admins can change permissions. This view is read-only.</div>}

                    {canEdit && (
                      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
                        <div>
                          <p className="ap-label">Query access</p>
                          <div className="ap-seg" role="group" aria-label="Query access">
                            {[['read', 'Read only'], ['readwrite', 'Read & Write']].map(([value, label]) => (
                              <button key={value} type="button" onClick={() => setAccessMode(value)} className={accessMode === value ? 'is-active' : ''}>{label}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="ap-label">Quick presets</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ROLE_PRESETS.map((preset) => (
                              <button key={preset.id} type="button" onClick={() => setPerms(presetPerms(preset.keys))} className="ap-chip" title={preset.hint}>{preset.label}</button>
                            ))}
                          </div>
                        </div>
                        <div className="min-w-[190px]">
                          <label className="ap-label" htmlFor="ap-copy-from">Copy from</label>
                          <select id="ap-copy-from" className="ap-select" value={copyFromId} onChange={(e) => copyFromUser(e.target.value)}>
                            <option value="">Choose a person...</option>
                            {users.filter((u) => u._id !== selectedUserId).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="ap-card p-4 mt-3">
                    {PERMISSION_GROUPS.map((group) => (
                      <div key={group} className="mb-4 last:mb-0">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{group}</p>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {PERMISSIONS.filter((p) => p.group === group).map((p) => {
                            const on = selectedUser.role === 'admin' || perms[p.key];
                            return (
                              <button
                                key={p.key}
                                type="button"
                                role="switch"
                                aria-checked={Boolean(on)}
                                disabled={!canEdit}
                                onClick={() => setPerms((current) => ({ ...current, [p.key]: !current[p.key] }))}
                                className={`ap-perm-card text-left ${on ? 'is-on' : ''} ${canEdit ? '' : 'is-readonly'}`}
                              >
                                <span className="min-w-0">
                                  <span className="block text-[13px] font-semibold">{p.label}</span>
                                  <span className="block text-[11.5px] text-slate-500">{p.desc}</span>
                                </span>
                                <span className={`ap-switch ${on ? 'is-on' : ''}`} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {canEdit && (
                    <div className="ap-card p-4 mt-3">
                      <ConnectionSchemaSelector
                        value={allowedConnections}
                        onChange={setAllowedConnections}
                        role={selectedUser.role}
                        defaultAccessMode={accessMode}
                      />
                    </div>
                  )}

                  {canEdit && isDirty && (
                    <div className="ap-savebar">
                      <span>You have unsaved changes for {selectedUser.name}</span>
                      <span className="flex gap-2">
                        <button type="button" onClick={() => loadDraft(selectedUser)} disabled={saveLoading} className="ap-btn-outline !h-8 !bg-transparent !text-slate-200 !border-slate-600">Discard</button>
                        <button type="button" onClick={savePermissions} disabled={saveLoading} className="ap-btn !h-8">{saveLoading ? 'Saving...' : 'Save changes'}</button>
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ===== Access Overview: who has what ===== */}
        {view === 'matrix' && (
          <div className="ap-card">
            <div className="ap-toolbar justify-between">
              <p className="text-[12.5px] text-slate-500">Everyone's access at a glance. Click a person to edit.</p>
              <button type="button" onClick={exportMatrix} className="ap-btn-outline">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
                Export access review
              </button>
            </div>
            <div className="overflow-x-auto ap-divider">
              <table className="ap-table ap-matrix">
                <thead>
                  <tr>
                    <th>Person</th>
                    {PERMISSIONS.map((p) => <th key={p.key} title={p.label}>{p.short}</th>)}
                    <th>Connections</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const effective = permissionsOf(u);
                    return (
                      <tr key={u._id}>
                        <td>
                          <button type="button" onClick={() => openFromMatrix(u)} className="flex items-center gap-2.5 text-left min-w-[190px] hover:text-teal-700 cursor-pointer">
                            <span className={`ap-avatar !w-7 !h-7 !text-[10.5px] ${u.role === 'admin' ? 'is-admin' : ''}`}>{initialsOf(u.name)}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{u.name}</span>
                              <span className="block text-[11px] text-slate-400 capitalize">{u.role}{u.role !== 'admin' && (u.accessMode === 'readwrite' ? ' · Read & Write' : ' · Read only')}</span>
                            </span>
                          </button>
                        </td>
                        {PERMISSIONS.map((p) => {
                          const on = u.role === 'admin' || effective[p.key];
                          return (
                            <td key={p.key} aria-label={`${p.label}: ${on ? 'yes' : 'no'}`}>
                              {on ? (
                                <span className="ap-yes"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg></span>
                              ) : <span className="ap-no" />}
                            </td>
                          );
                        })}
                        <td className="tabular-nums">{u.role === 'admin' ? 'All' : (u.allowedConnections?.length || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== Change History ===== */}
        {view === 'history' && (
          <div className="ap-card">
            <div className="ap-toolbar">
              <div className="ap-search">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
                <input type="text" className="ap-input" placeholder="Search changes or people..." value={historySearch} onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }} />
              </div>
              <div className="ap-seg" role="group" aria-label="Change type">
                <button type="button" onClick={() => { setHistoryAction('all'); setHistoryPage(1); }} className={historyAction === 'all' ? 'is-active' : ''}>All</button>
                {Object.entries(HISTORY_ACTIONS).map(([action, meta]) => (
                  <button key={action} type="button" onClick={() => { setHistoryAction(action); setHistoryPage(1); }} className={historyAction === action ? 'is-active' : ''}>{meta.label}</button>
                ))}
              </div>
              <button type="button" onClick={() => { setLoadingHistory(true); fetchHistory(); }} className="ap-btn-outline">Refresh</button>
            </div>

            {loadingHistory ? (
              <div className="ap-empty ap-divider"><div className="ap-spinner" /></div>
            ) : visibleHistory.length === 0 ? (
              <div className="ap-empty ap-divider">
                <p className="text-[14px] font-semibold">No changes found</p>
                <p className="mt-1 text-[12.5px] text-slate-500">User and permission changes will appear here.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto ap-divider">
                  <table className="ap-table">
                    <thead>
                      <tr><th>Changed by</th><th>Change</th><th>Details</th><th>When</th></tr>
                    </thead>
                    <tbody>
                      {pageHistory.map((log) => (
                        <tr key={log._id}>
                          <td>
                            <div className="flex items-center gap-2.5 min-w-[180px]">
                              <span className="ap-avatar !w-7 !h-7 !text-[10.5px]">{initialsOf(log.user?.name)}</span>
                              <span className="min-w-0">
                                <span className="block truncate font-semibold">{log.user?.name || 'Unknown'}</span>
                                <span className="block truncate text-[11px] text-slate-400">{log.user?.email || 'N/A'}</span>
                              </span>
                            </div>
                          </td>
                          <td><span className={`ap-tag ${HISTORY_ACTIONS[log.action].tone}`}>{HISTORY_ACTIONS[log.action].label}</span></td>
                          <td className="text-slate-600 max-w-xl break-words">{log.details}</td>
                          <td className="whitespace-nowrap text-slate-500" title={new Date(log.createdAt).toLocaleString('en-IN')}>{timeAgo(log.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <AdminPager
                  page={currentHistoryPage}
                  pageSize={historyPageSize}
                  total={visibleHistory.length}
                  noun="changes"
                  onPageChange={setHistoryPage}
                  onPageSizeChange={(size) => { setHistoryPageSize(size); setHistoryPage(1); }}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* ===== Create user ===== */}
      {showForm && (
        <div className="ap-modal-back" role="dialog" aria-modal="true" aria-label="Create user">
          <form onSubmit={createUser} className="ap-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold">Create User</h3>
              <button type="button" onClick={() => setShowForm(false)} className="ap-icon-btn" aria-label="Close">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="ap-label" htmlFor="ap-new-name">Full name</label>
                <input id="ap-new-name" className="ap-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="ap-label" htmlFor="ap-new-email">Email</label>
                <input id="ap-new-email" type="email" className="ap-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="sm:col-span-2">
                <label className="ap-label" htmlFor="ap-new-password">Password</label>
                <div className="flex gap-2">
                  <input id="ap-new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="ap-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                  <button type="button" onClick={() => setShowPassword((on) => !on)} className="ap-btn-outline">{showPassword ? 'Hide' : 'Show'}</button>
                  <button type="button" onClick={() => { setForm({ ...form, password: generatePassword() }); setShowPassword(true); }} className="ap-btn-outline">Generate</button>
                </div>
              </div>
              <div>
                <label className="ap-label" htmlFor="ap-new-role">Role</label>
                <select id="ap-new-role" className="ap-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="developer">Developer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {form.role === 'developer' && (
                <div>
                  <label className="ap-label" htmlFor="ap-new-mode">Query access</label>
                  <select id="ap-new-mode" className="ap-select" value={form.accessMode} onChange={(e) => setForm({ ...form, accessMode: e.target.value })}>
                    <option value="read">Read only (SELECT, SHOW, FIND)</option>
                    <option value="readwrite">Read &amp; Write (INSERT, UPDATE, DELETE)</option>
                  </select>
                </div>
              )}
            </div>

            {form.role === 'developer' && (
              <div className="mt-4 space-y-2">
                {PERMISSIONS.filter((p) => ['userManagement', 'connections'].includes(p.key)).map((p) => (
                  <label key={p.key} className={`ap-perm-card ${form.permissions?.[p.key] ? 'is-on' : ''}`}>
                    <span>
                      <span className="block text-[13px] font-semibold">{p.label}</span>
                      <span className="block text-[11.5px] text-slate-500">{p.desc}</span>
                    </span>
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-teal-600 cursor-pointer"
                      checked={Boolean(form.permissions?.[p.key])}
                      onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, [p.key]: e.target.checked } })}
                    />
                  </label>
                ))}
                <ConnectionSchemaSelector
                  value={form.allowedConnections || []}
                  onChange={(value) => setForm({ ...form, allowedConnections: value })}
                  role={form.role}
                  defaultAccessMode={form.accessMode || 'read'}
                />
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="ap-btn-outline">Cancel</button>
              <button type="submit" disabled={formLoading} className="ap-btn">{formLoading ? 'Creating...' : 'Create User'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
