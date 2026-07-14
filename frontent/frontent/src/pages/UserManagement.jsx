import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

export default function UserManagement() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'developer'
  });
  const [formLoading, setFormLoading] = useState(false);

  // Tabs inside page: 'permissions' or 'history'
  const [activeSubTab, setActiveSubTab] = useState('permissions');
  
  // Selected user for permissions toggle
  const [selectedUserId, setSelectedUserId] = useState('');
  const [perms, setPerms] = useState({
    backup: true,
    binlog: true,
    monitor: true,
    query: true,
    history: true,
    slowQuery: true,
    auditLogs: true,
    connections: true
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [userSearchQuery]);

  const getActivePermsList = (u) => {
    if (u.role === 'admin') return ['Master Bypass'];
    const list = [];
    if (u.permissions?.query ?? true) list.push('⚡ Query');
    if (u.permissions?.history ?? true) list.push('📜 History');
    if (u.permissions?.slowQuery ?? true) list.push('🐢 Slow Query');
    if (u.permissions?.auditLogs ?? true) list.push('🔍 Audit Logs');
    if (u.permissions?.backup ?? true) list.push('💾 Backup');
    if (u.permissions?.binlog ?? true) list.push('📡 WAL/Binlog');
    if (u.permissions?.monitor ?? true) list.push('📊 Monitor');
    if (u.permissions?.connections ?? true) list.push('⚙️ Connections');
    return list;
  };

  // Permissions History logs
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    // Only allow admin
    if (currentUser && currentUser.role !== 'admin') {
      navigate('/dashboard');
      return;
    }
    fetchUsers();
    fetchHistory();
  }, [currentUser]);

  useEffect(() => {
    if (users.length > 0 && !selectedUserId) {
      const firstNonSelf = users.find(u => u._id !== currentUser?.id) || users[0];
      setSelectedUserId(firstNonSelf?._id || '');
    }
  }, [users]);

  useEffect(() => {
    if (selectedUserId) {
      const u = users.find(x => x._id === selectedUserId);
      if (u) {
        setPerms({
          backup: u.permissions?.backup ?? true,
          binlog: u.permissions?.binlog ?? true,
          monitor: u.permissions?.monitor ?? true,
          query: u.permissions?.query ?? true,
          history: u.permissions?.history ?? true,
          slowQuery: u.permissions?.slowQuery ?? true,
          auditLogs: u.permissions?.auditLogs ?? true,
          connections: u.permissions?.connections ?? true,
        });
      }
    }
  }, [selectedUserId, users]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await API.get('/users');
      setUsers(res.data.users || []);
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await API.get('/audit-logs');
      // Filter only user-management and permission-related logs
      const filtered = (res.data.logs || []).filter(log =>
        ['UPDATE_USER_PERMISSIONS', 'CREATE_USER', 'DELETE_USER'].includes(log.action)
      );
      setHistoryLogs(filtered);
    } catch (err) {
      console.error('Failed to load permission history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const updateRole = async (id, role) => {
    try {
      setError('');
      setSuccess('');
      await API.put(`/users/${id}/role`, { role });
      setSuccess('User role updated successfully!');
      fetchUsers();
      fetchHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed!');
    }
  };

  const deleteUser = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete user ${name}?`)) return;
    try {
      setError('');
      setSuccess('');
      await API.delete(`/users/${id}`);
      setSuccess('User deleted successfully!');
      if (editingUser === id) {
        setEditingUser(null);
      }
      fetchUsers();
      fetchHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed!');
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await API.post('/users', form);
      setSuccess('New user created successfully!');
      setShowForm(false);
      setForm({ name: '', email: '', password: '', role: 'developer' });
      fetchUsers();
      fetchHistory();
      if (res.data.user?.id) {
        setSelectedUserId(res.data.user.id);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'User create failed!');
    } finally {
      setFormLoading(false);
    }
  };

  const savePermissions = async () => {
    setSaveLoading(true);
    setError('');
    setSuccess('');
    try {
      await API.put(`/users/${selectedUserId}/permissions`, { permissions: perms });
      setSuccess('Permissions saved successfully!');
      fetchUsers();
      fetchHistory();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save permissions!');
    } finally {
      setSaveLoading(false);
    }
  };

  const selectedUserObj = users.find(u => u._id === selectedUserId);

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearchQuery.toLowerCase())
  );
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-teal-100 border-t-teal-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-left">
      {/* Navbar */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      {/* Main Container - Width 90% */}
      <div className="w-[90%] max-w-[90%] mx-auto px-6 py-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Permissions & User Controls
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage developer feature access toggles and monitor configuration logs.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition shadow-sm self-start sm:self-center"
          >
            {showForm ? 'Cancel Creation' : '+ Create User'}
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
            <span>❌</span> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-600 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
            <span>✅</span> {success}
          </div>
        )}

        {/* Create User Form Overlay / Collapsible Card */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-1.5">
              👤 Create New User Profile
            </h3>
            <form onSubmit={createUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Name</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/50 outline-none focus:border-gray-500 focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/50 outline-none focus:border-gray-500 focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="Password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/50 outline-none focus:border-gray-500 focus:bg-white transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Role</label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/50 outline-none focus:border-gray-500 focus:bg-white transition"
                  >
                    <option value="developer">Developer</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition disabled:opacity-50"
                >
                  {formLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex border-b border-gray-200 mb-6 gap-6">
          <button
            onClick={() => setActiveSubTab('permissions')}
            className={`pb-2.5 text-sm font-semibold border-b-2 transition ${
              activeSubTab === 'permissions' ? 'border-[#0d9da4] text-[#0d9da4]' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            🔑 Access Permissions
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`pb-2.5 text-sm font-semibold border-b-2 transition ${
              activeSubTab === 'history' ? 'border-[#0d9da4] text-[#0d9da4]' : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            📜 Permission History
          </button>
        </div>

        {/* Permissions Subtab */}
        {activeSubTab === 'permissions' && (
          editingUser === null ? (
            <div>
              {/* Search Box */}
              <div className="mb-4 max-w-md relative text-left">
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={userSearchQuery}
                  onChange={e => setUserSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-250 rounded-xl text-xs bg-white focus:bg-white outline-none focus:border-[#0d9da4] focus:ring-1 focus:ring-[#0d9da4]/35 transition"
                />
                <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
              </div>

              {/* Table of users */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-left">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-150 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-left">
                    <tr>
                      <th className="px-6 py-4">User</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Permissions</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150">
                    {paginatedUsers.map(u => (
                      <tr key={u._id} className="hover:bg-gray-50/50 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-xs font-bold text-teal-700 shrink-0">
                              {u.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {u.name} {u._id === currentUser?.id && <span className="text-[10px] text-gray-400 font-normal ml-1">(You)</span>}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            u.role === 'admin' ? 'bg-gray-900 text-white' : u.role === 'developer' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-gray-50 text-gray-600 border border-gray-200'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 max-w-md">
                          <div className="flex flex-wrap gap-1.5">
                            {getActivePermsList(u).map(p => (
                              <span key={p} className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-teal-50 text-teal-700 border border-teal-100/50">
                                {p}
                              </span>
                            ))}
                            {getActivePermsList(u).length === 0 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-red-50 text-red-600 border border-red-100 italic">
                                No Permissions
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3 font-semibold">
                            <button
                              onClick={() => {
                                setSelectedUserId(u._id);
                                setEditingUser(u._id);
                              }}
                              className="text-xs text-[#0d9da4] hover:underline"
                            >
                              ✏️ Edit
                            </button>
                            {u._id !== currentUser?.id && (
                              <button
                                onClick={() => deleteUser(u._id, u.name)}
                                className="text-xs text-red-500 hover:underline"
                              >
                                ❌ Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {paginatedUsers.length === 0 && (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-xs text-gray-400">
                          No users found matching your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Pagination Footer */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-150 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-gray-500">
                      Showing <span className="font-semibold">{startIndex + 1}</span> to{' '}
                      <span className="font-semibold">
                        {Math.min(startIndex + itemsPerPage, filteredUsers.length)}
                      </span>{' '}
                      of <span className="font-semibold">{filteredUsers.length}</span> users
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 border border-gray-250 rounded-lg text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50 transition shadow-sm"
                      >
                        Previous
                      </button>
                      {[...Array(totalPages)].map((_, i) => (
                        <button
                          key={i + 1}
                          onClick={() => setCurrentPage(i + 1)}
                          className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition ${
                            currentPage === i + 1
                              ? 'bg-[#0d9da4] border-[#0d9da4] text-white'
                              : 'border-gray-250 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-250 rounded-lg text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 disabled:opacity-50 transition shadow-sm"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              {/* Back to List Button */}
              <div className="mb-4 flex justify-start">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-xs font-semibold text-gray-600 transition flex items-center gap-1.5 shadow-sm bg-white"
                >
                  ← Back to Users List
                </button>
              </div>

              {/* Single Column: Permission details for the selected user */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-left max-w-4xl mx-auto">
                {selectedUserObj ? (
                  <div>
                    
                    {/* User Title & Role Config */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-5">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{selectedUserObj.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{selectedUserObj.email}</p>
                      </div>

                      {/* Role update panel */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Role:</span>
                        {selectedUserObj._id !== currentUser?.id ? (
                          <select
                            value={selectedUserObj.role}
                            onChange={e => updateRole(selectedUserObj._id, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 font-semibold outline-none focus:border-gray-500"
                          >
                            <option value="admin">Admin</option>
                            <option value="developer">Developer</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-900 text-white uppercase">
                            {selectedUserObj.role}
                          </span>
                        )}

                        {/* Delete account */}
                        {selectedUserObj._id !== currentUser?.id && (
                          <button
                            onClick={() => deleteUser(selectedUserObj._id, selectedUserObj.name)}
                            className="text-xs px-2.5 py-1.5 border border-red-200 text-red-500 font-semibold rounded-lg hover:bg-red-50 transition"
                          >
                            Delete Account
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Permissions Settings Form */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Feature Tab Permissions</h4>
                      
                      {selectedUserObj.role === 'admin' ? (
                        <div className="bg-yellow-50 border border-yellow-200 text-yellow-850 text-xs px-4 py-3 rounded-lg mb-4">
                          ⚠️ <strong>Admin Permission Bypass:</strong> Admin accounts automatically hold master authorizations. Permissions cannot be customized or restricted for admins.
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { key: 'query', label: '⚡ Query Editor', desc: 'Allows running custom database queries' },
                          { key: 'history', label: '📜 Query History', desc: 'Allows viewing past queries execution logs' },
                          { key: 'slowQuery', label: '🐢 Slow Query Logs', desc: 'Allows access to connection slow-query metrics' },
                          { key: 'auditLogs', label: '🔍 Connection Audit Logs', desc: 'Allows viewing connection audit logs history' },
                          { key: 'backup', label: '💾 Backup & Restore', desc: 'Allows exporting/importing sql dumps' },
                          { key: 'binlog', label: '📡 WAL / Binlog Monitor', desc: 'Allows tracking database transactional event streams' },
                          { key: 'monitor', label: '📊 Health Monitor', desc: 'Allows viewing database system metrics' },
                          { key: 'connections', label: '⚙️ Manage Connections', desc: 'Allows registering or deleting database profiles' },
                        ].map(item => (
                          <label
                            key={item.key}
                            className={`border rounded-xl p-4 flex items-start gap-3 transition cursor-pointer select-none ${
                              perms[item.key] ? 'border-teal-250 bg-teal-50/10' : 'border-gray-200 bg-white hover:bg-gray-50/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedUserObj.role === 'admin' ? true : !!perms[item.key]}
                              disabled={selectedUserObj.role === 'admin' || saveLoading}
                              onChange={e => setPerms(prev => ({ ...prev, [item.key]: e.target.checked }))}
                              className="mt-1 w-4 h-4 text-[#0d9da4] border-gray-300 rounded focus:ring-[#0d9da4] accent-[#0d9da4]"
                            />
                            <div>
                              <span className="text-sm font-bold text-gray-900 block">{item.label}</span>
                              <span className="text-xs text-gray-400 mt-0.5 block">{item.desc}</span>
                            </div>
                          </label>
                        ))}
                      </div>

                      {/* Save button */}
                      {selectedUserObj.role !== 'admin' && (
                        <div className="mt-6 flex justify-end">
                          <button
                            onClick={savePermissions}
                            disabled={saveLoading}
                            className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                          >
                            {saveLoading ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                <span>Saving Toggles...</span>
                              </>
                            ) : (
                              <>
                                <span>💾 Save Permissions</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-400">
                    <p className="text-lg">👤 No user selected</p>
                    <p className="text-xs mt-1">Please select a user profile to configure details.</p>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* History Subtab */}
        {activeSubTab === 'history' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Permissions Audit Trail</h3>
              <button
                onClick={fetchHistory}
                className="text-xs text-[#0d9da4] hover:underline font-bold"
              >
                Refresh Logs
              </button>
            </div>
            
            {loadingHistory ? (
              <div className="p-12 text-center">
                <div className="w-6 h-6 border-2 border-teal-100 border-t-teal-600 rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs text-gray-400">Loading history logs...</p>
              </div>
            ) : historyLogs.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-sm">
                No permission updates logged in the audit trail yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Admin Profile</th>
                      <th className="px-6 py-3.5">Action</th>
                      <th className="px-6 py-3.5">Audit Log Details</th>
                      <th className="px-6 py-3.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {historyLogs.map(log => (
                      <tr key={log._id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center">
                              {log.user?.name?.charAt(0).toUpperCase() || 'A'}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-900">{log.user?.name || 'Unknown Admin'}</p>
                              <p className="text-[10px] text-gray-400">{log.user?.email || 'N/A'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase whitespace-nowrap ${
                            log.action === 'UPDATE_USER_PERMISSIONS' ? 'bg-purple-100 text-purple-700' :
                            log.action === 'CREATE_USER' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {log.action?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-600 max-w-md break-words">
                          {log.details}
                        </td>
                        <td className="px-6 py-4 text-[10px] text-gray-400 font-mono whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}