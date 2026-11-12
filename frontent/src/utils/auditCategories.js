// Audit log action groups, shared by the Audit Logs page and its Download box
export const AUDIT_CATEGORIES = [
  { id: 'queries', label: 'Queries', actions: ['RUN_QUERY', 'SLOW_QUERY'] },
  { id: 'data', label: 'Data & Schema', actions: ['INSERT_DATA', 'UPDATE_DATA', 'DELETE_DATA', 'CREATE_TABLE', 'ALTER_TABLE', 'DROP_TABLE', 'CREATE_DATABASE', 'ALTER_DATABASE', 'DROP_DATABASE'] },
  { id: 'backups', label: 'Backups', actions: ['EXPORT_BACKUP', 'RESTORE_BACKUP'] },
  { id: 'users', label: 'Users & Access', actions: ['CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'UPDATE_USER_PERMISSIONS', 'CREATE_DB_USER', 'UPDATE_DB_USER', 'DELETE_DB_USER', 'PROFILE_UPDATE', 'PASSWORD_CHANGE', 'MFA_ENABLE', 'MFA_DISABLE', 'MFA_RESET', 'MFA_BACKUP_CODES'] },
  { id: 'connections', label: 'Connections', actions: ['CREATE_CONNECTION', 'UPDATE_CONNECTION', 'DELETE_CONNECTION', 'TEST_CONNECTION'] },
  { id: 'signins', label: 'Sign-ins', actions: ['LOGIN', 'LOGOUT', 'MFA_FAILED', 'MFA_BACKUP_USED'] },
];

export const ALL_AUDIT_ACTIONS = AUDIT_CATEGORIES.flatMap((category) => category.actions);

// Actions that destroy data or change who can do what
export const SENSITIVE_AUDIT_ACTIONS = new Set(['DELETE_DATA', 'DROP_TABLE', 'DROP_DATABASE', 'RESTORE_BACKUP', 'DELETE_CONNECTION', 'DELETE_USER', 'DELETE_DB_USER', 'UPDATE_USER_PERMISSIONS', 'PASSWORD_CHANGE', 'MFA_DISABLE', 'MFA_RESET', 'MFA_FAILED', 'MFA_BACKUP_USED']);
