import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API from '../api/axios';
import CopyButtonContent from './CopyButtonContent';
import { copyToClipboard } from '../utils/clipboard';
import './AuditLogsPanel.css';

const DEFAULT_ACTIONS = [
  'CREATE_CONNECTION',
  'UPDATE_CONNECTION',
  'DELETE_CONNECTION',
  'TEST_CONNECTION',
  'INSERT_DATA',
  'UPDATE_DATA',
  'DELETE_DATA',
  'CREATE_TABLE',
  'ALTER_TABLE',
  'DROP_TABLE',
  'RUN_QUERY',
  'SLOW_QUERY',
  'EXPORT_BACKUP',
  'RESTORE_BACKUP',
  'CREATE_DB_USER',
  'DELETE_DB_USER',
  'UPDATE_DB_USER',
];

const PAGE_SIZES = [10, 20, 50, 100];

// Color by what the action does: destructive red, changes amber, additions green
const actionTone = (action = '') => {
  if (action === 'SLOW_QUERY') return 'orange';
  if (action === 'RUN_QUERY') return 'blue';
  if (action === 'TEST_CONNECTION') return 'indigo';
  if (action === 'EXPORT_BACKUP') return 'teal';
  if (/DELETE|DROP|RESTORE/.test(action)) return 'red';
  if (/UPDATE|ALTER/.test(action)) return 'amber';
  if (/CREATE|INSERT/.test(action)) return 'green';
  return 'slate';
};

const actionLabel = (action) => {
  if (!action) return 'Unknown';
  const words = action.toLowerCase().replace(/_/g, ' ').replace(/\bdb\b/, 'DB');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const initialsOf = (name) => {
  const parts = (name || '?').trim().split(/\s+/);
  return `${parts[0][0] || '?'}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '—', time: '' };
  return {
    day: date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
};

// Page numbers around the current page, with null marking a gap
const pageWindow = (current, total) => {
  const wanted = new Set([1, total, current - 1, current, current + 1]);
  const pages = [...wanted].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  return pages.flatMap((page, index) => (index > 0 && page - pages[index - 1] > 1 ? [null, page] : [page]));
};

export default function AuditLogsPanel({ connectionId, databases = [] }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedTargetDb, setSelectedTargetDb] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [copiedLogId, setCopiedLogId] = useState(null);
  const copyTimer = useRef(null);

  const fetchAuditLogs = useCallback(() => (
    API.get(`/connections/${connectionId}/audit-logs`)
      .then((res) => {
        setLogs(res.data.logs || []);
        setError('');
      })
      .catch((err) => {
        console.error(err);
        setError(err.response?.data?.message || 'Failed to fetch connection audit logs.');
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      })
  ), [connectionId]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAuditLogs();
  };

  const availableActions = useMemo(() => {
    const logActions = logs.map((log) => log.action).filter(Boolean);
    return Array.from(new Set([...DEFAULT_ACTIONS, ...logActions])).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const dbUpper = selectedTargetDb.toUpperCase();
    return logs.filter((log) => {
      if (term) {
        const haystack = [log.user?.email, log.user?.name, log.details, log.action].join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (selectedAction && log.action !== selectedAction) return false;
      if (dbUpper && !(log.details || '').toUpperCase().includes(dbUpper)) return false;
      return true;
    });
  }, [logs, searchTerm, selectedAction, selectedTargetDb]);

  const hasFilters = Boolean(searchTerm || selectedAction || selectedTargetDb);
  const totalLogs = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalLogs);
  const pageLogs = filteredLogs.slice(startIndex, endIndex);

  // Changing a filter or the page size goes back to page 1
  const applyFilter = (setter) => (event) => {
    setter(event.target.value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedAction('');
    setSelectedTargetDb('');
    setCurrentPage(1);
  };

  const handleCopy = async (log) => {
    if (!(await copyToClipboard(log.details || ''))) return;
    setCopiedLogId(log._id);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedLogId(null), 2000);
  };

  if (loading) {
    return (
      <div className="al-panel al-state">
        <span className="al-spinner" aria-hidden="true" />
        Loading audit logs...
      </div>
    );
  }

  return (
    <div className="al-panel text-left">
      {/* Title and filters */}
      <div className="al-toolbar">
        <div className="al-heading">
          <h3>Audit Logs</h3>
          <p>
            {hasFilters ? `${totalLogs} of ${logs.length}` : logs.length} {logs.length === 1 ? 'entry' : 'entries'} for this connection
          </p>
        </div>

        <div className="al-filters">
          <label className="al-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.5-4.5" />
            </svg>
            <input
              type="text"
              placeholder="Search user, action or details"
              aria-label="Search audit logs"
              value={searchTerm}
              onChange={applyFilter(setSearchTerm)}
            />
          </label>

          <select className="al-select" aria-label="Filter by database" value={selectedTargetDb} onChange={applyFilter(setSelectedTargetDb)}>
            <option value="">All databases</option>
            {databases.map((db, index) => {
              const name = typeof db === 'string' ? db : db.name;
              return <option key={name || index} value={name}>{name}</option>;
            })}
          </select>

          <select className="al-select" aria-label="Filter by action" value={selectedAction} onChange={applyFilter(setSelectedAction)}>
            <option value="">All actions</option>
            {availableActions.map((action) => (
              <option key={action} value={action}>{actionLabel(action)}</option>
            ))}
          </select>

          {hasFilters && (
            <button type="button" className="al-btn" onClick={clearFilters}>Clear</button>
          )}

          <button type="button" className="al-btn" onClick={handleRefresh} disabled={refreshing}>
            <svg className={refreshing ? 'al-spin' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 11-2.6-6.4L21 8M21 3v5h-5" />
            </svg>
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <p className="al-error" role="alert">{error}</p>
      )}

      {/* Table */}
      {totalLogs === 0 ? (
        !error && (
          <div className="al-state">
            <strong>{hasFilters ? 'No matching audit logs' : 'No audit logs yet'}</strong>
            <span>{hasFilters ? 'Try a different search or clear the filters.' : 'Activity on this connection will appear here.'}</span>
          </div>
        )
      ) : (
        <div className="al-table-wrap">
          <table className="al-table">
            <colgroup>
              <col className="al-col-time" />
              <col className="al-col-user" />
              <col className="al-col-action" />
              <col />
              <col className="al-col-toggle" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">User</th>
                <th scope="col">Action</th>
                <th scope="col">Details</th>
                <th scope="col"><span className="sr-only">Expand</span></th>
              </tr>
            </thead>
            <tbody>
              {pageLogs.map((log) => {
                const isExpanded = expandedLogId === log._id;
                const when = formatDate(log.createdAt);
                const userName = log.user?.name || 'Unknown user';
                return (
                  <Fragment key={log._id}>
                    <tr
                      className={`al-row ${isExpanded ? 'is-open' : ''}`}
                      onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                    >
                      <td>
                        <span className="al-primary">{when.day}</span>
                        <span className="al-secondary">{when.time}</span>
                      </td>
                      <td>
                        <div className="al-user">
                          <span className="al-avatar" aria-hidden="true">{initialsOf(log.user?.name)}</span>
                          <div className="min-w-0">
                            <span className="al-primary al-truncate" title={userName}>{userName}</span>
                            <span className="al-secondary al-truncate" title={log.user?.email || ''}>{log.user?.email || 'No email'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`al-action al-tone-${actionTone(log.action)}`}>{actionLabel(log.action)}</span>
                      </td>
                      <td>
                        <span className="al-details" title={log.details || ''}>{log.details || '—'}</span>
                      </td>
                      <td className="al-toggle-cell">
                        <button
                          type="button"
                          className="al-toggle"
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Hide details' : 'Show details'}
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedLogId(isExpanded ? null : log._id);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="al-detail-row">
                        <td colSpan={5}>
                          <div className="al-detail">
                            <dl className="al-detail-meta">
                              <div><dt>Time</dt><dd>{when.day}, {when.time}</dd></div>
                              <div><dt>User</dt><dd>{userName}</dd></div>
                              <div><dt>Email</dt><dd>{log.user?.email || 'No email'}</dd></div>
                              <div><dt>Role</dt><dd className="capitalize">{log.user?.role || 'Unknown'}</dd></div>
                              <div><dt>Action code</dt><dd className="al-mono">{log.action || 'Unknown'}</dd></div>
                            </dl>
                            <div className="al-detail-body">
                              <div className="al-detail-head">
                                <span>Details</span>
                                <button type="button" className={`al-copy ${copiedLogId === log._id ? 'is-copied' : ''}`} onClick={() => handleCopy(log)}>
                                  <CopyButtonContent copied={copiedLogId === log._id} />
                                </button>
                              </div>
                              <pre>{log.details || '—'}</pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalLogs > 0 && (
        <div className="al-footer">
          <div className="al-footer-info">
            <span>Showing <b>{startIndex + 1}</b>–<b>{endIndex}</b> of <b>{totalLogs}</b></span>
            <label>
              Rows
              <select
                className="al-select is-small"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>

          <nav className="al-pager" aria-label="Audit log pages">
            <button type="button" disabled={page === 1} onClick={() => setCurrentPage(page - 1)}>Previous</button>
            {pageWindow(page, totalPages).map((item, index) => (
              item === null ? (
                <span key={`gap-${index}`} className="al-gap" aria-hidden="true">…</span>
              ) : (
                <button key={item} type="button" className={item === page ? 'is-active' : ''} aria-current={item === page ? 'page' : undefined} onClick={() => setCurrentPage(item)}>
                  {item}
                </button>
              )
            ))}
            <button type="button" disabled={page === totalPages} onClick={() => setCurrentPage(page + 1)}>Next</button>
          </nav>
        </div>
      )}
    </div>
  );
}
