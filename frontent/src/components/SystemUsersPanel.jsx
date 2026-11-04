import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminPager from './AdminPager';
import { PERMISSIONS, copyText, downloadCsv, enabledPermissionCount, initialsOf, timeAgo, toLocalDateInput } from '../utils/adminHelpers';
import './AdminPages.css';

const FILTERS = [
  { id: 'all', label: 'All users', test: () => true, icon: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14.5a5.5 5.5 0 013.5 5.5" /></> },
  { id: 'admin', label: 'Admins', test: (u) => u.role === 'admin', icon: <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" /> },
  { id: 'readwrite', label: 'Developers · Read & Write', test: (u) => u.role !== 'admin' && u.accessMode === 'readwrite', icon: <path d="m15 5 4 4M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" /> },
  { id: 'read', label: 'Developers · Read only', test: (u) => u.role !== 'admin' && u.accessMode !== 'readwrite', icon: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></> },
];

const SORTS = {
  newest: { label: 'Newest first', compare: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) },
  name: { label: 'Name A–Z', compare: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) },
  login: { label: 'Last sign-in', compare: (a, b) => new Date(b.lastLoginAt || 0) - new Date(a.lastLoginAt || 0) },
};

const accessLabel = (u) => (u.accessMode === 'readwrite' ? 'Read & Write' : 'Read Only');
const connectionsLabel = (u) => (u.role === 'admin' ? 'All' : String(u.allowedConnections?.length || 0));

export default function SystemUsersPanel({ users, loading, currentUser, onCreate, onEdit, onDelete, onRoleChange, onNotify }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const isAdmin = currentUser?.role === 'admin';
  const selfId = String(currentUser?._id || currentUser?.id || '');

  const counts = useMemo(() => Object.fromEntries(
    FILTERS.map((f) => [f.id, users.filter(f.test).length])
  ), [users]);

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter).test;
    return users
      .filter((u) => test(u) && (!q || [u.name, u.email, u.role, u.jobTitle].some((field) => field && String(field).toLowerCase().includes(q))))
      .sort(SORTS[sort].compare);
  }, [users, search, filter, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = visibleUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const changeRole = (u, role) => {
    const warning = role === 'admin'
      ? `Make ${u.name} an Admin? They will get full access to every feature and connection.`
      : `Change ${u.name} to Developer? They will lose admin access.`;
    if (window.confirm(warning)) onRoleChange(u._id, role);
  };

  const exportUsers = () => {
    downloadCsv(
      `system_users_${toLocalDateInput(new Date())}.csv`,
      ['Name', 'Email', 'Job Title', 'Role', 'Access Mode', 'Permissions Enabled', 'Connections', 'Last Sign-in', 'Created'],
      visibleUsers.map((u) => [
        u.name,
        u.email,
        u.jobTitle || '',
        u.role,
        u.role === 'admin' ? 'Full' : accessLabel(u),
        `${enabledPermissionCount(u)}/${PERMISSIONS.length}`,
        connectionsLabel(u),
        u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '',
        u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '',
      ])
    );
    onNotify(`Exported ${visibleUsers.length} users as CSV`);
  };

  const copyEmail = async (email) => {
    if (await copyText(email)) onNotify('Email copied');
    else onNotify('Could not copy to the clipboard.', 'error');
  };

  return (
    <div className="ap-page">
      <div className="ap-head">
        <div>
          <h2 className="ap-title">System Users &amp; Roles</h2>
          <p className="ap-sub">Manage who can sign in, their role, and how much they can change.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => navigate('/permissions')} className="ap-btn-outline">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M8.8 12.2l2.2 2.2 4.3-4.6" /></svg>
            Permissions
          </button>
          <button type="button" onClick={exportUsers} disabled={visibleUsers.length === 0} className="ap-btn-outline">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            Export CSV
          </button>
          {isAdmin && (
            <button type="button" onClick={onCreate} className="ap-btn">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Create User
            </button>
          )}
        </div>
      </div>

      {/* Stat tiles double as role filters */}
      <div className="ap-stats">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFilter(f.id); setPage(1); }}
            aria-pressed={filter === f.id}
            className={`ap-stat ${filter === f.id ? 'is-active' : ''}`}
          >
            <span className="ap-stat-icon">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{f.icon}</svg>
            </span>
            <div>
              <div className="ap-stat-value">{counts[f.id]}</div>
              <div className="ap-stat-label">{f.label}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="ap-card">
        <div className="ap-toolbar">
          <div className="ap-search">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></svg>
            <input
              type="text"
              className="ap-input"
              placeholder="Search by name, email, role or job title..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            {search && (
              <button type="button" className="ap-search-clear" onClick={() => { setSearch(''); setPage(1); }} aria-label="Clear search">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <label className="ap-field-inline">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="ap-select !w-auto">
              {Object.entries(SORTS).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="ap-empty ap-divider">
            <div className="ap-spinner" />
            <p className="mt-3 text-[13px] text-slate-500">Loading users...</p>
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="ap-empty ap-divider">
            <p className="text-[14px] font-semibold">{users.length === 0 ? 'No users yet' : 'No matching users'}</p>
            <p className="mt-1 text-[12.5px] text-slate-500">{users.length === 0 ? 'Create the first account to get started.' : 'Try a different search or filter.'}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto ap-divider">
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Connections</th>
                    <th>Last sign-in</th>
                    <th>Joined</th>
                    <th className="!text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageUsers.map((u) => {
                    const isSelf = String(u._id) === selfId;
                    const enabled = enabledPermissionCount(u);
                    return (
                      <tr key={u._id}>
                        <td>
                          <div className="flex items-center gap-3 min-w-[220px]">
                            <span className={`ap-avatar ${u.role === 'admin' ? 'is-admin' : ''}`}>{initialsOf(u.name)}</span>
                            <div className="min-w-0">
                              <p className="font-semibold truncate">
                                {u.name}
                                {isSelf && <span className="ap-tag is-neutral ml-1.5">You</span>}
                              </p>
                              <button type="button" onClick={() => copyEmail(u.email)} className="ap-mono text-[11.5px] text-slate-500 hover:text-teal-700 cursor-pointer" title="Copy email">
                                {u.email}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td>
                          {isAdmin && !isSelf ? (
                            <select
                              value={u.role === 'admin' ? 'admin' : 'developer'}
                              onChange={(e) => changeRole(u, e.target.value)}
                              className="ap-select !h-8 !w-[116px] font-semibold"
                              aria-label={`Role of ${u.name}`}
                            >
                              <option value="developer">Developer</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span className={`ap-tag ${u.role === 'admin' ? 'is-dark' : ''}`}>{u.role === 'admin' ? 'Admin' : 'Developer'}</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center gap-2 mb-1">
                            {u.role === 'admin'
                              ? <span className="ap-tag">Full access</span>
                              : <span className={`ap-tag ${u.accessMode === 'readwrite' ? 'is-warn' : ''}`}>{accessLabel(u)}</span>}
                          </div>
                          <div className="flex items-center gap-2" title={`${enabled} of ${PERMISSIONS.length} permissions enabled`}>
                            <div className="ap-meter"><span style={{ width: `${(enabled / PERMISSIONS.length) * 100}%` }} /></div>
                            <span className="text-[11px] text-slate-500 tabular-nums">{enabled}/{PERMISSIONS.length}</span>
                          </div>
                        </td>
                        <td className="tabular-nums">{connectionsLabel(u)}</td>
                        <td className="whitespace-nowrap text-slate-600" title={u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'No sign-in recorded yet'}>
                          {timeAgo(u.lastLoginAt)}
                        </td>
                        <td className="whitespace-nowrap text-slate-600">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => navigate(`/permissions?user=${u._id}`)} className="ap-icon-btn" title="Open permissions" aria-label={`Permissions of ${u.name}`}>
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M8.8 12.2l2.2 2.2 4.3-4.6" /></svg>
                            </button>
                            {isAdmin && !isSelf && (
                              <>
                                <button type="button" onClick={() => onEdit(u)} className="ap-icon-btn" title="Edit details and password" aria-label={`Edit ${u.name}`}>
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" /></svg>
                                </button>
                                <button type="button" onClick={() => onDelete(u._id, u.name)} className="ap-icon-btn is-danger" title="Delete user" aria-label={`Delete ${u.name}`}>
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <AdminPager
              page={currentPage}
              pageSize={pageSize}
              total={visibleUsers.length}
              noun="users"
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </>
        )}
      </div>
    </div>
  );
}
