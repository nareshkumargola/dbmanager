// Shared helpers for the admin pages: Audit Logs, System Users & Roles, Permissions

export const PERMISSIONS = [
  { key: 'query', group: 'Data access', label: 'Query Editor', short: 'Query', desc: 'Run SQL / NoSQL queries and scripts' },
  { key: 'history', group: 'Data access', label: 'Query History', short: 'History', desc: 'See past query runs' },
  { key: 'slowQuery', group: 'Data access', label: 'Slow Queries', short: 'Slow', desc: 'Inspect slow queries and logs' },
  { key: 'monitor', group: 'Monitoring', label: 'Monitor Controls', short: 'Monitor', desc: 'Manage alert settings and resolve alerts' },
  { key: 'binlog', group: 'Monitoring', label: 'WAL / Binlog Streaming', short: 'Binlog', desc: 'Watch live transaction logs' },
  { key: 'auditLogs', group: 'Monitoring', label: 'Audit Logs', short: 'Audit', desc: 'View database action audit trails' },
  { key: 'backup', group: 'Administration', label: 'Backup & Restore', short: 'Backup', desc: 'Export dumps and restore backups' },
  { key: 'connections', group: 'Administration', label: 'Manage Connections', short: 'Connect', desc: 'Add, edit and delete connections' },
  { key: 'userManagement', group: 'Administration', label: 'Users Manager', short: 'Users', desc: 'Manage database users and view app permissions' },
];

// Effective module permissions; a missing value is on, except userManagement
export const permissionsOf = (user) => Object.fromEntries(
  PERMISSIONS.map(({ key }) => [key, user?.permissions?.[key] ?? key !== 'userManagement'])
);

export const enabledPermissionCount = (user) => (
  user?.role === 'admin'
    ? PERMISSIONS.length
    : Object.values(permissionsOf(user)).filter(Boolean).length
);

export const initialsOf = (name) => (
  String(name || '?').split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase()
);

export const timeAgo = (value) => {
  if (!value) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// YYYY-MM-DD in the viewer's time zone (toISOString would shift the day in IST)
export const toLocalDateInput = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

// CSV cell: quoted, and text a spreadsheet would run as a formula is neutralised
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const downloadCsv = (fileName, headers, rows) => {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  // Leading byte-order mark so Excel reads the file as UTF-8
  const blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
