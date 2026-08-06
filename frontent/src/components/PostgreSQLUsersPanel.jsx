import { useState, useEffect } from 'react';
import API from '../api/axios';

export default function PostgreSQLUsersPanel({ connectionId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Create User States
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsSuperuser, setNewIsSuperuser] = useState(false);
  const [newCanCreateDb, setNewCanCreateDb] = useState(false);
  const [newCanCreateRole, setNewCanCreateRole] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // Manage Privileges Modal States
  const [manageUser, setManageUser] = useState(null); // { username, isSuperuser, canCreateDb, canCreateRole }
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [canCreateDb, setCanCreateDb] = useState(false);
  const [canCreateRole, setCanCreateRole] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);

  // Change Password States
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState('');
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [connectionId]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await API.get(`/connections/${connectionId}/pg-users`);
      setUsers(res.data.users || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to load PostgreSQL users.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;

    try {
      setCreateLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await API.post(`/connections/${connectionId}/pg-users`, {
        username: newUsername,
        password: newPassword,
        isSuperuser: newIsSuperuser,
        canCreateDb: newCanCreateDb,
        canCreateRole: newCanCreateRole
      });
      setSuccessMsg(res.data.message || 'PostgreSQL user created successfully!');
      setCreateUserOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewIsSuperuser(false);
      setNewCanCreateDb(false);
      setNewCanCreateRole(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create PostgreSQL user.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenManage = (user) => {
    setManageUser(user);
    setIsSuperuser(user.isSuperuser);
    setCanCreateDb(user.canCreateDb);
    setCanCreateRole(user.canCreateRole);
  };

  const handleSavePrivileges = async () => {
    if (!manageUser) return;
    try {
      setManageLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await API.put(
        `/connections/${connectionId}/pg-users/${manageUser.username}/roles`,
        { isSuperuser, canCreateDb, canCreateRole }
      );
      setSuccessMsg(res.data.message || 'Privileges updated successfully!');
      setManageUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update privileges.');
    } finally {
      setManageLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPasswordValue) return;

    try {
      setPasswordLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await API.put(
        `/connections/${connectionId}/pg-users/${passwordUser}/password`,
        { password: newPasswordValue }
      );
      setSuccessMsg(res.data.message || 'Password updated successfully!');
      setChangePasswordOpen(false);
      setNewPasswordValue('');
      setPasswordUser('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDeleteUser = async (username) => {
    if (!window.confirm(`Are you sure you want to drop user/role "${username}"?`)) return;

    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await API.delete(`/connections/${connectionId}/pg-users/${username}`);
      setSuccessMsg(res.data.message || 'User deleted successfully!');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      
      {/* Header Info */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">🐘 PostgreSQL User & Role Manager</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Manage Postgres login roles, superuser options, and passwords.</p>
        </div>
        <button
          onClick={() => setCreateUserOpen(true)}
          style={{ backgroundColor: '#0d9da4', color: '#ffffff' }}
          className="px-4 py-2 text-xs font-bold rounded-lg hover:opacity-90 transition-opacity shrink-0"
        >
          + Create Postgres User
        </button>
      </div>

      {/* Message Notifications */}
      {successMsg && (
        <div className="bg-green-50 text-green-700 text-xs px-4 py-3 rounded-lg border border-green-200">
          ✅ {successMsg}
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 text-xs px-4 py-3 rounded-lg border border-red-200">
          ❌ {error}
        </div>
      )}

      {/* User listing table */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-gray-200 text-center text-gray-500">
          <div className="w-8 h-8 border-[3px] border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mx-auto mb-3"></div>
          Fetching database users list...
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-gray-200 text-center text-gray-400 italic text-xs">
          No PostgreSQL login users found on this host.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Username / Role</th>
                  <th className="px-5 py-3.5">Attributes</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150">
                {users.map(u => (
                  <tr key={u.username} className="hover:bg-gray-50/40 transition-colors">
                    <td className="px-5 py-4 font-bold text-gray-900 font-mono">
                      {u.username}
                    </td>
                    
                    <td className="px-5 py-4 flex gap-1.5 flex-wrap">
                      {u.isSuperuser && (
                        <span className="bg-red-50 text-red-700 border border-red-200 text-[9px] font-bold px-2 py-0.5 rounded">SUPERUSER</span>
                      )}
                      {u.canCreateDb && (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold px-2 py-0.5 rounded">CREATE DB</span>
                      )}
                      {u.canCreateRole && (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold px-2 py-0.5 rounded">CREATE ROLE</span>
                      )}
                      {!u.isSuperuser && !u.canCreateDb && !u.canCreateRole && (
                        <span className="bg-gray-50 text-gray-500 border border-gray-200 text-[9px] px-2 py-0.5 rounded">NORMAL USER</span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => handleOpenManage(u)}
                          className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded"
                        >
                          Modify Privileges
                        </button>
                        <button
                          onClick={() => {
                            setPasswordUser(u.username);
                            setChangePasswordOpen(true);
                          }}
                          className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-bold rounded"
                        >
                          Change Password
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.username)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded border border-rose-200"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {createUserOpen && (
        <div className="fixed inset-0 z-50 bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-250 w-full max-w-md overflow-hidden animate-fadeIn">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Create PostgreSQL User</h3>
              <button onClick={() => setCreateUserOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none focus:border-teal-400"
                  placeholder="e.g. read_only_api"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none focus:border-teal-400"
                  placeholder="Password"
                />
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Attributes</label>
                
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={newIsSuperuser}
                    onChange={e => setNewIsSuperuser(e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Superuser Status</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={newCanCreateDb}
                    onChange={e => setNewCanCreateDb(e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Create Databases (CREATEDB)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={newCanCreateRole}
                    onChange={e => setNewCanCreateRole(e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Create Roles (CREATEROLE)</span>
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setCreateUserOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  style={{ backgroundColor: '#0d9da4', color: '#ffffff' }}
                  className="px-5 py-2 text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {createLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODIFY ROLES/PRIVILEGES MODAL */}
      {manageUser && (
        <div className="fixed inset-0 z-50 bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-250 w-full max-w-sm overflow-hidden animate-fadeIn">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Modify Roles: {manageUser.username}</h3>
              <button onClick={() => setManageUser(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={isSuperuser}
                    onChange={e => setIsSuperuser(e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Superuser Status</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={canCreateDb}
                    onChange={e => setCanCreateDb(e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Create Databases (CREATEDB)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={canCreateRole}
                    onChange={e => setCanCreateRole(e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Create Roles (CREATEROLE)</span>
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setManageUser(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePrivileges}
                  disabled={manageLoading}
                  style={{ backgroundColor: '#0d9da4', color: '#ffffff' }}
                  className="px-5 py-2 text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {manageLoading ? 'Saving...' : 'Save Roles'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL */}
      {changePasswordOpen && (
        <div className="fixed inset-0 z-50 bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-250 w-full max-w-sm overflow-hidden animate-fadeIn">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Change Password: {passwordUser}</h3>
              <button onClick={() => setChangePasswordOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <form onSubmit={handleChangePassword} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPasswordValue}
                  onChange={e => setNewPasswordValue(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none focus:border-teal-400"
                  placeholder="Enter new password"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setChangePasswordOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  style={{ backgroundColor: '#0d9da4', color: '#ffffff' }}
                  className="px-5 py-2 text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {passwordLoading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
