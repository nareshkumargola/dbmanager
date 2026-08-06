import { useState, useEffect } from 'react';
import API from '../api/axios';

export default function MongoDBUsersPanel({ connectionId }) {
  const [users, setUsers] = useState([]);
  const [databases, setDatabases] = useState([]);
  const [selectedDb, setSelectedDb] = useState('admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal States
  const [manageUser, setManageUser] = useState(null); // Selected user: { user, db, roles }
  const [privileges, setPrivileges] = useState({}); // { read: true, readWrite: false, ... }
  const [manageLoading, setManageLoading] = useState(false);
  
  // Create User States
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createUserDb, setCreateUserDb] = useState('admin');
  const [selectedRoles, setSelectedRoles] = useState(['read']);
  const [createLoading, setCreateLoading] = useState(false);

  // Change Password States
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const AVAILABLE_ROLES = ['read', 'readWrite', 'dbAdmin', 'userAdmin', 'dbOwner', 'root'];

  useEffect(() => {
    fetchDatabases();
  }, [connectionId]);

  useEffect(() => {
    fetchUsers();
  }, [connectionId, selectedDb]);

  const fetchDatabases = async () => {
    try {
      const res = await API.get(`/connections/${connectionId}/databases`);
      setDatabases(res.data.databases || []);
    } catch (e) {
      console.error('Error loading databases:', e);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await API.get(`/connections/${connectionId}/mongo-users?database=${selectedDb}`);
      setUsers(res.data.users || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load MongoDB users.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenManage = (user) => {
    setManageUser(user);
    const initialPrivs = {};
    AVAILABLE_ROLES.forEach(r => {
      initialPrivs[r] = user.roles.some(ur => ur.role === r);
    });
    setPrivileges(initialPrivs);
  };

  const handleSaveRoles = async () => {
    if (!manageUser) return;
    try {
      setManageLoading(true);
      setError('');
      setSuccessMsg('');

      const updatedRoles = Object.keys(privileges)
        .filter(r => privileges[r])
        .map(r => ({ role: r, db: manageUser.db }));

      const res = await API.put(
        `/connections/${connectionId}/mongo-users/${manageUser.user}/${manageUser.db}/roles`,
        { roles: updatedRoles }
      );
      setSuccessMsg(res.data.message || 'Roles updated successfully!');
      setManageUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update roles.');
    } finally {
      setManageLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    try {
      setCreateLoading(true);
      setError('');
      setSuccessMsg('');

      const mappedRoles = selectedRoles.map(r => ({ role: r, db: createUserDb }));

      const res = await API.post(`/connections/${connectionId}/mongo-users`, {
        username: newUsername,
        password: newPassword,
        database: createUserDb,
        roles: mappedRoles
      });

      setSuccessMsg(res.data.message || 'MongoDB user created successfully!');
      setCreateUserOpen(false);
      setNewUsername('');
      setNewPassword('');
      setSelectedRoles(['read']);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create user.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!manageUser) return;
    if (!window.confirm(`Are you sure you want to drop user "${manageUser.user}" from database "${manageUser.db}"?`)) return;
    try {
      setManageLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await API.delete(
        `/connections/${connectionId}/mongo-users/${manageUser.user}/${manageUser.db}`
      );
      setSuccessMsg(res.data.message || 'User deleted successfully!');
      setManageUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete user.');
    } finally {
      setManageLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!manageUser || !passwordInput) return;
    try {
      setPasswordLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await API.put(
        `/connections/${connectionId}/mongo-users/${manageUser.user}/${manageUser.db}/password`,
        { password: passwordInput }
      );
      setSuccessMsg(res.data.message || 'Password updated successfully!');
      setChangePasswordOpen(false);
      setPasswordInput('');
    } catch (err) {
      setError(err.response?.data?.message || 'Password update failed.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleToggleRoleCheckbox = (role) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Alert Messages */}
      {error && (
        <div className="bg-red-50 text-red-600 text-xs px-4 py-3 rounded-lg border border-red-200">
          ❌ {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 text-green-600 text-xs px-4 py-3 rounded-lg border border-green-200">
          ✅ {successMsg}
        </div>
      )}

      {/* Action Header Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
            Target Database:
          </label>
          <select
            value={selectedDb}
            onChange={e => setSelectedDb(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none bg-gray-50/50 focus:bg-white focus:border-gray-400 transition"
          >
            <option value="admin">admin (Global)</option>
            {databases.map(db => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => { setCreateUserOpen(true); setError(''); setSuccessMsg(''); }}
          style={{ background: '#0d9da4', color: '#ffffff' }}
          className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-[#0b858b] transition"
        >
          ➕ Create MongoDB User
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-150">
            <tr>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User Name</th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Authentication DB</th>
              <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned Roles</th>
              <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                  <div className="w-8 h-8 border-[3px] border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mx-auto mb-3"></div>
                  Loading MongoDB users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                  <span className="text-2xl block mb-2">👤</span>
                  No MongoDB users defined in database "{selectedDb}"
                </td>
              </tr>
            ) : (
              users.map((u, i) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-semibold text-gray-900">{u.user}</td>
                  <td className="px-6 py-4 font-mono text-xs">{u.db}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-gray-400 italic">No roles</span>
                      ) : (
                        u.roles.map((r, roleIdx) => (
                          <span
                            key={roleIdx}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-[#0d9da4] border border-teal-100"
                          >
                            {r.role}@{r.db}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleOpenManage(u)}
                      className="px-3.5 py-1.5 border border-gray-200 text-gray-800 hover:bg-gray-50 text-xs font-semibold rounded-lg shadow-xs transition"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal 1: Manage User Roles & Actions */}
      {manageUser && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Manage User Access</h3>
                <p className="text-xs font-mono text-gray-500 mt-1">
                  User: <span className="font-semibold text-gray-700">{manageUser.user}@{manageUser.db}</span>
                </p>
              </div>
              <button
                onClick={() => setManageUser(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-left">
              {manageLoading ? (
                <div className="text-center py-12">
                  <div className="w-8 h-8 border-[3px] border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-sm text-gray-500">Updating user...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Assigned Roles</h4>
                    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 border border-gray-150 rounded-lg">
                      {AVAILABLE_ROLES.map((role) => (
                        <label
                          key={role}
                          className="flex items-center gap-2.5 text-xs text-gray-700 font-semibold cursor-pointer select-none py-1 hover:text-gray-900"
                        >
                          <input
                            type="checkbox"
                            checked={!!privileges[role]}
                            onChange={() => setPrivileges(prev => ({ ...prev, [role]: !prev[role] }))}
                            className="w-4 h-4 text-[#0d9da4] border-gray-300 rounded focus:ring-[#0d9da4] cursor-pointer"
                          />
                          <span>{role}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => setChangePasswordOpen(true)}
                      className="px-3.5 py-1.5 border border-gray-250 hover:bg-gray-50 text-xs font-bold rounded-lg transition"
                    >
                      🔑 Change Password
                    </button>
                    <button
                      onClick={handleDeleteUser}
                      className="px-3.5 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition"
                    >
                      🗑️ Drop User
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setManageUser(null)}
                className="px-4 py-2 border border-gray-250 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRoles}
                disabled={manageLoading}
                style={{ background: '#0d9da4', color: '#ffffff' }}
                className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-[#0b858b] transition"
              >
                Save Roles
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal 2: Create User */}
      {createUserOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Create MongoDB User</h3>
              <button
                onClick={() => setCreateUserOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateUser}>
              <div className="p-6 space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    placeholder="e.g. app_user"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white focus:border-gray-400 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Secret Password"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white focus:border-gray-400 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Target Database</label>
                  <select
                    value={createUserDb}
                    onChange={e => setCreateUserDb(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white focus:border-gray-400 transition"
                  >
                    <option value="admin">admin (Global)</option>
                    {databases.map(db => (
                      <option key={db} value={db}>{db}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-600">Roles</label>
                  <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 border border-gray-150 rounded-lg max-h-40 overflow-y-auto">
                    {AVAILABLE_ROLES.map(role => (
                      <label key={role} className="flex items-center gap-2 text-xs text-gray-700 font-semibold cursor-pointer select-none py-0.5">
                        <input
                          type="checkbox"
                          checked={selectedRoles.includes(role)}
                          onChange={() => handleToggleRoleCheckbox(role)}
                          className="w-4 h-4 text-[#0d9da4] border-gray-300 rounded focus:ring-[#0d9da4]"
                        />
                        <span>{role}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateUserOpen(false)}
                  className="px-4 py-2 border border-gray-250 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  style={{ background: '#0d9da4', color: '#ffffff' }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-[#0b858b] transition"
                >
                  {createLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Modal 3: Change Password */}
      {changePasswordOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-fadeIn">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-sm w-full overflow-hidden flex flex-col">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Change Password</h3>
              <button
                onClick={() => setChangePasswordOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleChangePassword}>
              <div className="p-6 text-left">
                <label className="block text-xs font-semibold text-gray-600 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="New Secret Password"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white focus:border-gray-400 transition"
                />
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setChangePasswordOpen(false)}
                  className="px-4 py-2 border border-gray-250 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  style={{ background: '#0d9da4', color: '#ffffff' }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-[#0b858b] transition"
                >
                  {passwordLoading ? 'Updating...' : 'Change Password'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
