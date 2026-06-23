import { useState, useEffect } from 'react';
import API from '../api/axios';

export default function MySQLUsersPanel({ connectionId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal States
  const [manageUser, setManageUser] = useState(null); // Selected user: { user, host }
  const [privileges, setPrivileges] = useState({});
  const [privilegeNames, setPrivilegeNames] = useState({});
  const [manageLoading, setManageLoading] = useState(false);
  
  // Create User States
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newHost, setNewHost] = useState('%');
  const [newPassword, setNewPassword] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Change Password States
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [connectionId]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await API.get(`/connections/${connectionId}/mysql-users`);
      setUsers(res.data.users || []);
    } catch (err) {
      setError(err.response?.data?.message || 'MySQL users load nahi ho paaye.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenManage = async (user) => {
    try {
      setError('');
      setManageUser(user);
      setManageLoading(true);
      const res = await API.get(
        `/connections/${connectionId}/mysql-users/${user.user}/${encodeURIComponent(user.host)}`
      );
      setPrivileges(res.data.privileges || {});
      setPrivilegeNames(res.data.privilegeNames || {});
    } catch (err) {
      setError(err.response?.data?.message || 'User privileges load nahi ho paayi.');
      setManageUser(null);
    } finally {
      setManageLoading(false);
    }
  };

  const handleSavePrivileges = async () => {
    if (!manageUser) return;
    try {
      setManageLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await API.put(
        `/connections/${connectionId}/mysql-users/${manageUser.user}/${encodeURIComponent(manageUser.host)}/privileges`,
        { privileges }
      );
      setSuccessMsg(res.data.message || 'Permissions successfully update ho gayi hain!');
      setManageUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Permissions update nahi ho paayi.');
    } finally {
      setManageLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newHost) return;
    try {
      setCreateLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await API.post(`/connections/${connectionId}/mysql-users`, {
        username: newUsername,
        host: newHost,
        password: newPassword
      });
      setSuccessMsg(res.data.message || 'MySQL User successfully create ho gaya!');
      setCreateUserOpen(false);
      setNewUsername('');
      setNewHost('%');
      setNewPassword('');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'User create nahi ho paaya.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!manageUser) return;
    if (!window.confirm(`Kya aap sach mein user '${manageUser.user}@${manageUser.host}' ko delete karna chahte hain?`)) return;
    try {
      setManageLoading(true);
      setError('');
      setSuccessMsg('');
      const res = await API.delete(
        `/connections/${connectionId}/mysql-users/${manageUser.user}/${encodeURIComponent(manageUser.host)}`
      );
      setSuccessMsg(res.data.message || 'User successfully delete ho gaya!');
      setManageUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'User delete nahi ho paaya.');
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
        `/connections/${connectionId}/mysql-users/${manageUser.user}/${encodeURIComponent(manageUser.host)}/password`,
        { password: passwordInput }
      );
      setSuccessMsg(res.data.message || 'Password successfully change ho gaya!');
      setChangePasswordOpen(false);
      setPasswordInput('');
    } catch (err) {
      setError(err.response?.data?.message || 'Password update nahi ho paaya.');
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm animate-pulse">Loading MySQL Users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <span>❌</span> {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2 animate-fade-in">
          <span>✅</span> {successMsg}
        </div>
      )}

      {/* Header and Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">👤 MySQL Users & Permissions</h2>
          <p className="text-sm text-gray-500 mt-1">
            Database users ko list karein, unke permissions manage karein aur grants/revoke operations chalayein
          </p>
        </div>
        <button
          onClick={() => setCreateUserOpen(true)}
          className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg shadow-sm transition"
        >
          + Create New User
        </button>
      </div>

      {/* Users List Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Host</th>
              <th className="px-6 py-4">Permissions (Active Global Privs)</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
            {users.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-12 text-center text-gray-400">
                  <span className="text-2xl block mb-2">👤</span>
                  Koi MySQL user nahi mila ya access denied hai.
                </td>
              </tr>
            ) : (
              users.map((u, i) => (
                <tr key={i} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 font-semibold text-gray-900">{u.user}</td>
                  <td className="px-6 py-4 font-mono text-xs">{u.host}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                      {u.grantedCount} / {u.totalCount} privs
                    </span>
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

      {/* Modal 1: Manage User Privileges */}
      {manageUser && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Manage User Permissions</h3>
                <p className="text-xs font-mono text-gray-500 mt-1">
                  User: <span className="font-semibold text-gray-700">{manageUser.user}@{manageUser.host}</span>
                </p>
              </div>
              <button
                onClick={() => setManageUser(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {manageLoading ? (
                <div className="text-center py-12">
                  <p className="text-sm text-gray-500 animate-pulse">Loading privileges...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Global Privileges Checklist</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg max-h-[350px] overflow-y-auto">
                      {Object.keys(privileges).map((key) => (
                        <label
                          key={key}
                          className="flex items-start gap-2.5 text-xs text-gray-700 font-semibold cursor-pointer select-none py-1 hover:text-gray-900"
                        >
                          <input
                            type="checkbox"
                            checked={privileges[key]}
                            onChange={() => setPrivileges(prev => ({ ...prev, [key]: !prev[key] }))}
                            className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900 cursor-pointer mt-0.5"
                          />
                          <span>{privilegeNames[key] || key}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Actions Grid */}
                  <div className="flex flex-wrap items-center justify-between border-t border-gray-100 pt-4 gap-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setChangePasswordOpen(true)}
                        className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-xs font-bold rounded-lg transition"
                      >
                        🔑 Change Password
                      </button>
                      <button
                        onClick={handleDeleteUser}
                        className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition"
                      >
                        🗑️ Delete User
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setManageUser(null)}
                className="px-4 py-2 border border-gray-200 hover:bg-gray-150 text-xs font-bold rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePrivileges}
                disabled={manageLoading}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-lg disabled:opacity-60 transition"
              >
                {manageLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Create New MySQL User */}
      {createUserOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <form
            onSubmit={handleCreateUser}
            className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Create New MySQL User</h3>
              <button
                type="button"
                onClick={() => setCreateUserOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ashish"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:bg-white focus:border-gray-400 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Host</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. % or localhost"
                  value={newHost}
                  onChange={(e) => setNewHost(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:bg-white focus:border-gray-400 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Password (Optional)</label>
                <input
                  type="password"
                  placeholder="Leave empty for no password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:bg-white focus:border-gray-400 transition"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreateUserOpen(false)}
                className="px-4 py-2 border border-gray-200 hover:bg-gray-150 text-xs font-bold rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createLoading}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-lg disabled:opacity-60 transition"
              >
                {createLoading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 3: Change User Password */}
      {changePasswordOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <form
            onSubmit={handleChangePassword}
            className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-sm w-full overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-md font-bold text-gray-900">Change Password</h3>
              <button
                type="button"
                onClick={() => setChangePasswordOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-semibold"
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-xs text-gray-500">
                User: <span className="font-mono text-gray-700">{manageUser?.user}@{manageUser?.host}</span>
              </p>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Password</label>
                <input
                  type="password"
                  required
                  placeholder="Enter new password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:bg-white focus:border-gray-400 transition"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setChangePasswordOpen(false)}
                className="px-4 py-2 border border-gray-200 hover:bg-gray-150 text-xs font-bold rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={passwordLoading}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-lg disabled:opacity-60 transition"
              >
                {passwordLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
