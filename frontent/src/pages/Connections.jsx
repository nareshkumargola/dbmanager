import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';

export default function Connections() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => setToast({ message, type });
  const hasPermission = (permKey) => {
    if (user?.role === 'admin') return true;
    if (!user?.permissions) return false;
    return !!user.permissions[permKey];
  };
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Filter States (Database Type, Role, User, Search)
  const [filterType, setFilterType] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [searchConnText, setSearchConnText] = useState('');

  // Collect all unique users involved in connections
  const allUsersInConnections = useMemo(() => {
    const userMap = new Map();
    connections.forEach(conn => {
      if (conn.user && conn.user._id) {
        userMap.set(conn.user._id, conn.user);
      }
      if (Array.isArray(conn.allowedUsers)) {
        conn.allowedUsers.forEach(u => {
          if (u && u._id) userMap.set(u._id, u);
        });
      }
    });
    return Array.from(userMap.values());
  }, [connections]);

  // Cascading user options based on selected role
  const userOptions = useMemo(() => {
    if (filterRole === 'all') return allUsersInConnections;
    return allUsersInConnections.filter(u => (u.role || '').toLowerCase() === filterRole.toLowerCase());
  }, [allUsersInConnections, filterRole]);

  // Filtered connections list
  const filteredConnections = useMemo(() => {
    return connections.filter(conn => {
      // 1. Database Type Filter
      if (filterType !== 'all') {
        if ((conn.type || '').toLowerCase() !== filterType.toLowerCase()) {
          return false;
        }
      }

      // 2. Role Filter
      if (filterRole !== 'all') {
        const ownerRole = (conn.user?.role || '').toLowerCase();
        const allowedRoles = (conn.allowedUsers || []).map(u => (u.role || '').toLowerCase());
        const matchesRole = ownerRole === filterRole.toLowerCase() || allowedRoles.includes(filterRole.toLowerCase());
        if (!matchesRole) return false;
      }

      // 3. User Filter
      if (filterUser !== 'all') {
        const ownerId = conn.user?._id || conn.user;
        const allowedIds = (conn.allowedUsers || []).map(u => u._id || u);
        const matchesUser = ownerId === filterUser || allowedIds.includes(filterUser);
        if (!matchesUser) return false;
      }

      // Search text
      if (searchConnText.trim()) {
        const term = searchConnText.toLowerCase().trim();
        const connName = (conn.name || '').toLowerCase();
        const connHost = (conn.host || '').toLowerCase();
        const connDb = (conn.database || '').toLowerCase();
        const connType = (conn.type || '').toLowerCase();
        const ownerName = (conn.user?.name || '').toLowerCase();
        const matchesText = connName.includes(term) || connHost.includes(term) || connDb.includes(term) || connType.includes(term) || ownerName.includes(term);
        if (!matchesText) return false;
      }

      return true;
    });
  }, [connections, filterType, filterRole, filterUser, searchConnText]);

  // Edit Connection Modal States
  const [editConnectionModalConn, setEditConnectionModalConn] = useState(null);
  const [editConnForm, setEditConnForm] = useState({
    name: '', type: 'mysql', host: 'localhost', port: '3306', username: 'root', password: '', database: '', connectionString: '', ssl: false
  });
  const [editConnLoading, setEditConnLoading] = useState(false);
  const [editConnTestLoading, setEditConnTestLoading] = useState(false);
  const [editConnError, setEditConnError] = useState('');
  const [editConnTestResult, setEditConnTestResult] = useState(null);

  const handleOpenEditModal = (conn) => {
    setEditConnectionModalConn(conn);
    setEditConnForm({
      name: conn.name || '',
      type: conn.type || 'mysql',
      host: conn.host || '',
      port: String(conn.port || (conn.type === 'mysql' ? 3306 : conn.type === 'postgresql' ? 5432 : '')),
      username: conn.username || '',
      password: '',
      database: conn.database || '',
      connectionString: conn.connectionString || '',
      ssl: !!conn.ssl
    });
    setEditConnError('');
    setEditConnTestResult(null);
  };

  const handleTestEditConnection = async () => {
    setEditConnTestLoading(true);
    setEditConnError('');
    setEditConnTestResult(null);
    try {
      const res = await API.post('/connections/test', editConnForm);
      setEditConnTestResult({ success: true, message: res.data.message || 'Connection successful!' });
    } catch (err) {
      setEditConnTestResult({ success: false, message: err.response?.data?.message || 'Connection test failed!' });
    } finally {
      setEditConnTestLoading(false);
    }
  };

  const handleSaveEditConnection = async (e) => {
    e.preventDefault();
    setEditConnLoading(true);
    setEditConnError('');
    try {
      await API.put(`/connections/${editConnectionModalConn._id}`, editConnForm);
      showToast(`Connection '${editConnForm.name}' updated successfully!`);
      setEditConnectionModalConn(null);
      fetchConnections();
    } catch (err) {
      setEditConnError(err.response?.data?.error || err.response?.data?.message || 'Update failed!');
    } finally {
      setEditConnLoading(false);
    }
  };

  const [form, setForm] = useState({
    name: '',
    type: 'mysql',
    host: 'localhost',
    port: '3306',
    username: 'root',
    password: '',
    database: '',
    connectionString: '',
    ssl: false,
  });

  const [mongoMode, setMongoMode] = useState('structured');

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const res = await API.get('/connections');
      setConnections(res.data.connections);
    } catch (err) {
      setError('Failed to load connections');
    } finally {
      setLoading(false);
    }
  };

  // Type change hone pe default port set karo
  const handleTypeChange = (type) => {
    setTestResult(null);
    setForm({
      ...form,
      type,
      host: type === 'mongodb' ? '127.0.0.1' : 'localhost',
      port: type === 'mysql' ? '3306' : type === 'postgresql' ? '5432' : type === 'oracle' ? '1521' : '27017',
      username: type === 'mysql' ? 'root' : type === 'postgresql' ? 'postgres' : type === 'oracle' ? 'system' : '',
      connectionString: '',
      database: '',
      ssl: false,
    });
  };

  const getProcessedForm = () => {
    if (form.type === 'mongodb' && mongoMode === 'structured') {
      let uri = 'mongodb://';
      if (form.username && form.password) {
        uri += `${encodeURIComponent(form.username)}:${encodeURIComponent(form.password)}@`;
      } else if (form.username) {
        uri += `${encodeURIComponent(form.username)}@`;
      }
      uri += `${form.host || '127.0.0.1'}:${form.port || 27017}`;
      if (form.database) {
        uri += `/${form.database}`;
      }
      return { ...form, connectionString: uri };
    }
    return form;
  };

  // Connection test karo
  const handleTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const processedForm = getProcessedForm();
      const res = await API.post('/connections/test', processedForm);
      setTestResult({ success: true, message: res.data.message });
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection failed!'
      });
    } finally {
      setTestLoading(false);
    }
  };

  // Connection save karo
  const handleSave = async (e) => {
    e.preventDefault();
    setSaveLoading(true);
    setError('');
    setSuccess('');
    try {
      const processedForm = getProcessedForm();
      await API.post('/connections', processedForm);
      setSuccess('Connection saved successfully!');
      setShowForm(false);
      setTestResult(null);
      setForm({
        name: '', type: 'mysql', host: 'localhost',
        port: '3306', username: 'root', password: '',
        database: '', connectionString: '',
      });
      fetchConnections();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Save failed!');
    } finally {
      setSaveLoading(false);
    }
  };

  // Connection delete karo
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await API.delete(`/connections/${id}`);
      setConnections(connections.filter(c => c._id !== id));
      setSuccess('Connection deleted successfully!');
    } catch (err) {
      setError('Delete failed!');
    }
  };

  // Sharing Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharingConn, setSharingConn] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');
  const [shareSearch, setShareSearch] = useState('');

  const handleOpenShareModal = async (conn) => {
    setSharingConn(conn);
    setShareModalOpen(true);
    setShareError('');
    setShareSuccess('');
    setSelectedUserIds([]);
    setShareSearch('');
    try {
      const res = await API.get(`/connections/${conn._id}/share`);
      setUsersList(res.data.users);
      setSelectedUserIds(res.data.allowedUsers);
    } catch (err) {
      setShareError('Failed to load sharing details.');
    }
  };

  const handleToggleUser = (userId) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleSaveShare = async () => {
    setShareLoading(true);
    setShareError('');
    setShareSuccess('');
    try {
      await API.put(`/connections/${sharingConn._id}/share`, {
        developerIds: selectedUserIds
      });
      setShareSuccess('Access updated successfully!');
      fetchConnections();
      setTimeout(() => setShareModalOpen(false), 1000);
    } catch (err) {
      setShareError(err.response?.data?.message || 'Failed to update access.');
    } finally {
      setShareLoading(false);
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'mysql': return 'bg-blue-100 text-blue-700';
      case 'postgresql': return 'bg-indigo-100 text-indigo-700';
      case 'mongodb': return 'bg-green-100 text-green-700';
      case 'oracle': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'mysql': return '🐬';
      case 'postgresql': return '🐘';
      case 'mongodb': return '🍃';
      case 'oracle': return '🔴';
      default: return '🗄️';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <style>{`
        .custom-focus:focus {
          border-color: #0d9da4 !important;
          box-shadow: 0 0 0 2px rgba(13, 157, 164, 0.15) !important;
        }
        .gradient-btn {
          background: #0d9da4 !important;
          color: #ffffff !important;
          border: none !important;
          font-weight: 600 !important;
        }
        .gradient-btn:hover {
          background: #0b858b !important;
        }
        .gradient-border-left {
          border-left: 4px solid #0d9da4 !important;
        }
        .text-teal-light {
          color: #0d9da4 !important;
          opacity: 0.85 !important;
        }
      `}</style>

      {/* Navbar */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      {loading ? (
        <div className="w-[90%] mx-auto py-8 flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mb-4"></div>
          <p className="text-sm text-teal-light">Loading connections...</p>
        </div>
      ) : (
        <div className="w-[90%] mx-auto py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              Database Connections
            </h2>
            <p className="text-sm text-teal-light mt-1">
              Connect and manage your databases
            </p>
          </div>
          {hasPermission('connections') && (
            <button
              onClick={() => { setShowForm(!showForm); setTestResult(null); }}
              className="px-4 py-2 gradient-btn text-sm rounded-lg transition"
            >
              {showForm ? 'Cancel' : '+ Add Connection'}
            </button>
          )}
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
            ❌ {error}
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-50 text-green-600 text-sm px-4 py-3 rounded-lg">
            ✅ {success}
          </div>
        )}

        {/* Add Connection Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Add New Connection
            </h3>

            <form onSubmit={handleSave} className="space-y-4">

              {/* Connection Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Connection Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Company MySQL, Analytics DB"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Database Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  {['mysql', 'postgresql', 'mongodb', 'oracle'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition ${form.type === type
                          ? 'gradient-btn'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        }`}
                    >
                      {getTypeIcon(type)} {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Connection Form Fields */}
              {form.type === 'mongodb' && mongoMode === 'uri' ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-medium text-gray-700">
                      Connection String
                    </label>
                    <button
                      type="button"
                      onClick={() => setMongoMode('structured')}
                      className="text-xs text-[#0d9da4] hover:underline font-bold"
                    >
                      Switch to Structured Fields
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="mongodb://username:password@host:27017/"
                    value={form.connectionString}
                    onChange={e => setForm({ ...form, connectionString: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition font-mono custom-focus"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {form.type === 'mongodb' && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setMongoMode('uri')}
                        className="text-xs text-[#0d9da4] hover:underline font-bold"
                      >
                        Switch to Raw Connection URI
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                      <input
                        type="text"
                        placeholder={form.type === 'mongodb' ? '127.0.0.1' : 'localhost'}
                        value={form.host}
                        onChange={e => setForm({ ...form, host: e.target.value })}
                        required
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                      <input
                        type="number"
                        placeholder={form.type === 'mysql' ? '3306' : form.type === 'postgresql' ? '5432' : '27017'}
                        value={form.port}
                        onChange={e => setForm({ ...form, port: e.target.value })}
                        required
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                      <input
                        type="text"
                        placeholder={form.type === 'mysql' ? 'root' : form.type === 'postgresql' ? 'postgres' : 'admin'}
                        value={form.username}
                        onChange={e => setForm({ ...form, username: e.target.value })}
                        required={form.type !== 'mongodb'}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input
                        type="password"
                        placeholder="Password"
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                      />
                    </div>
                    {form.type !== 'mongodb' && (
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {form.type === 'oracle' ? 'Service Name / SID (Required)' : 'Default Database (Optional)'}
                        </label>
                        <input
                          type="text"
                          placeholder={form.type === 'oracle' ? 'ORCL or XE' : 'e.g. my_database'}
                          value={form.database}
                          onChange={e => setForm({ ...form, database: e.target.value })}
                          required={form.type === 'oracle'}
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none bg-gray-50/50 focus:bg-white transition custom-focus"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SSL Configuration Checkbox */}
              {form.type !== 'mongodb' && (
                <div className="flex items-center gap-2 mt-3 mb-1 bg-gray-50/50 p-2.5 rounded-lg border border-gray-100">
                  <input
                    type="checkbox"
                    id="ssl"
                    checked={form.ssl || false}
                    onChange={e => setForm({ ...form, ssl: e.target.checked })}
                    className="w-4 h-4 rounded text-teal-600 border-gray-300 focus:ring-teal-500 cursor-pointer"
                  />
                  <label htmlFor="ssl" className="text-xs font-bold text-gray-750 cursor-pointer select-none">
                    🔒 Enable SSL/TLS Connection (Required for cloud DBaaS like AWS RDS, Aiven, Clever Cloud)
                  </label>
                </div>
              )}
              {testResult && (
                <div className={`px-4 py-3 rounded-lg text-sm ${testResult.success
                    ? 'bg-green-50 text-green-600'
                    : 'bg-red-50 text-red-600'
                  }`}>
                  {testResult.success ? '✅' : '❌'} {testResult.message}
                </div>
              )}

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testLoading}
                  className="flex-1 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition disabled:opacity-60"
                >
                  {testLoading ? 'Testing...' : '🔌 Test Connection'}
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex-1 py-2.5 gradient-btn text-sm rounded-lg transition disabled:opacity-60"
                >
                  {saveLoading ? 'Saving...' : '💾 Save Connection'}
                </button>
              </div>

            </form>
          </div>
        )}

        {/* Connection Filters Bar */}
        {connections.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3 pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-base">🔍</span>
                <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  Filter Connections
                </h3>
                <span className="text-[11px] bg-teal-50 text-[#0d9da4] px-2.5 py-0.5 rounded-full font-bold">
                  Showing {filteredConnections.length} of {connections.length} connections
                </span>
              </div>

              {(filterType !== 'all' || filterRole !== 'all' || filterUser !== 'all' || searchConnText) && (
                <button
                  onClick={() => {
                    setFilterType('all');
                    setFilterRole('all');
                    setFilterUser('all');
                    setSearchConnText('');
                  }}
                  className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer flex items-center gap-1 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100 transition-all"
                >
                  ✕ Reset Filters
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {/* 1. Database Type Filter */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  1. Database Type:
                </label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50/50 font-semibold text-gray-800 outline-none focus:border-teal-500 focus:bg-white cursor-pointer"
                >
                  <option value="all">All Database Types</option>
                  <option value="mysql">🐬 MySQL</option>
                  <option value="postgresql">🐘 PostgreSQL</option>
                  <option value="mongodb">🍃 MongoDB</option>
                  <option value="oracle">🔴 Oracle</option>
                </select>
              </div>

              {/* 2. Role Filter */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  2. Role:
                </label>
                <select
                  value={filterRole}
                  onChange={(e) => {
                    setFilterRole(e.target.value);
                    setFilterUser('all'); // Reset user when role changes
                  }}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50/50 font-semibold text-gray-800 outline-none focus:border-teal-500 focus:bg-white cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">👑 Admin</option>
                  <option value="developer">💻 Developer</option>
                </select>
              </div>

              {/* 3. User Filter (Cascading) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1 flex items-center justify-between">
                  <span>3. User:</span>
                  <span className="text-[10px] font-extrabold text-[#0d9da4]">
                    ({userOptions.length} {filterRole !== 'all' ? `matching ${filterRole}` : 'total'})
                  </span>
                </label>
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50/50 font-semibold text-gray-800 outline-none focus:border-teal-500 focus:bg-white cursor-pointer"
                >
                  <option value="all">All Users ({userOptions.length} available)</option>
                  {userOptions.map((u) => (
                    <option key={u._id} value={u._id}>
                      👤 {u.name} ({u.role || 'user'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search text */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  Search Connection:
                </label>
                <input
                  type="text"
                  placeholder="Name, host, DB..."
                  value={searchConnText}
                  onChange={(e) => setSearchConnText(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50/50 outline-none focus:border-teal-500 focus:bg-white text-gray-800"
                />
              </div>
            </div>
          </div>
        )}

        {/* Connections List */}
        {connections.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-3xl mb-3">🗄️</p>
            <p className="text-gray-700 font-medium mb-1">
              No connections found
            </p>
            <p className="text-teal-light text-sm mb-4">
              Add your first database connection to get started
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="text-sm text-gray-900 underline"
            >
              + Add Connection
            </button>
          </div>
        ) : filteredConnections.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-gray-800 font-bold mb-1">
              No matching connections found
            </p>
            <p className="text-gray-500 text-xs mb-4">
              No connections match your selected Database Type ({filterType}), Role ({filterRole}), or User filter.
            </p>
            <button
              onClick={() => {
                setFilterType('all');
                setFilterRole('all');
                setFilterUser('all');
                setSearchConnText('');
              }}
              className="px-4 py-2 bg-teal-50 text-[#0d9da4] border border-teal-200 font-bold text-xs rounded-lg hover:bg-teal-100 transition-all cursor-pointer"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredConnections.map(conn => (
              <div key={conn._id} className="flex items-stretch gap-3">
                <div
                  onClick={() => navigate(`/connections/${conn._id}`)}
                  className="flex-1 bg-white rounded-xl border border-gray-200 p-5 shadow-sm gradient-border-left cursor-pointer hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between flex-wrap gap-4">

                    {/* Left — Info */}
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{getTypeIcon(conn.type)}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap text-left">
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-[#0d9da4] transition-colors">
                            {conn.name}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTypeBadge(conn.type)}`}>
                            {conn.type}
                          </span>
                          {/* Shared Badge */}
                          {conn.user && conn.user._id !== (user?._id || user?.id) && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">
                              Shared by {conn.user.name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-teal-light mt-0.5 text-left font-mono">
                          {conn.type === 'mongodb'
                            ? conn.connectionString?.substring(0, 40) + '...'
                            : `${conn.host}:${conn.port} / ${conn.database}`
                          }
                        </p>
                      </div>
                    </div>

                    {/* Right — Actions */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/connections/${conn._id}`);
                        }}
                        className="px-4 py-2 gradient-btn text-xs rounded-lg transition cursor-pointer"
                      >
                        Open →
                      </button>

                      {/* Edit Button (Only if admin or owner) */}
                      {(user?.role === 'admin' || !conn.user || conn.user._id === (user?._id || user?.id)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditModal(conn);
                          }}
                          className="px-3 py-2 border border-teal-200 text-[#0d9da4] hover:bg-teal-50 text-xs rounded-lg transition font-medium cursor-pointer"
                        >
                          ✏️ Edit
                        </button>
                      )}

                      {/* Delete Button (Only if admin or owner) */}
                      {(user?.role === 'admin' || !conn.user || conn.user._id === (user?._id || user?.id)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(conn._id, conn.name);
                          }}
                          className="px-3 py-2 border border-red-200 text-red-500 text-xs rounded-lg hover:bg-red-50 transition font-medium cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Button Cards Outside on the Right Side */}
                <div className="flex gap-2 shrink-0 items-center">
                  {(conn.type === 'mysql' || conn.type === 'mongodb' || conn.type === 'postgresql') && hasPermission('userManagement') && (
                    <button
                      onClick={() => navigate(`/connections/${conn._id}/users`)}
                      className="w-[95px] h-[76px] shrink-0 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl shadow-sm transition flex flex-col items-center justify-center gap-1.5"
                      title={conn.type === 'mysql' ? "Manage MySQL Users" : conn.type === 'mongodb' ? "Manage MongoDB Users" : "Manage PostgreSQL Users"}
                    >
                      <span className="text-xl">👤</span>
                      <span className="text-[9px] font-bold tracking-wider uppercase text-gray-600 text-center leading-tight px-1">Users Manage</span>
                    </button>
                  )}

                  {hasPermission('monitor') && (
                    <button
                      onClick={() => navigate(`/connections/${conn._id}/monitor`)}
                      className="w-[95px] h-[76px] shrink-0 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl shadow-sm transition flex flex-col items-center justify-center gap-1.5"
                      title="Monitor Database Server"
                    >
                      <span className="text-xl">📊</span>
                      <span className="text-[9px] font-bold tracking-wider uppercase text-gray-600 text-center leading-tight px-1">Monitor</span>
                    </button>
                  )}

                  {(conn.type === 'mysql' || conn.type === 'mongodb' || conn.type === 'postgresql') && hasPermission('binlog') && (
                    <button
                      onClick={() => navigate(`/connections/${conn._id}/binlog`)}
                      className="w-[95px] h-[76px] shrink-0 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl shadow-sm transition flex flex-col items-center justify-center gap-1.5"
                      title={conn.type === 'mysql' ? "Monitor MySQL Binlogs" : (conn.type === 'postgresql' ? "Monitor PostgreSQL WAL" : "Monitor MongoDB Oplog")}
                    >
                      <span className="text-xl">📡</span>
                      <span className="text-[9px] font-bold tracking-wider uppercase text-gray-600 text-center leading-tight px-1">
                        {conn.type === 'mysql' ? 'Binlog Monitor' : (conn.type === 'postgresql' ? 'WAL Monitor' : 'Oplog Monitor')}
                      </span>
                    </button>
                  )}

                  {(conn.type === 'mysql' || conn.type === 'mongodb' || conn.type === 'postgresql') && hasPermission('backup') && (
                    <button
                      onClick={() => navigate(`/connections/${conn._id}/backup`)}
                      className="w-[95px] h-[76px] shrink-0 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl shadow-sm transition flex flex-col items-center justify-center gap-1.5"
                      title={conn.type === 'mysql' ? "Backup & Restore MySQL Server" : conn.type === 'mongodb' ? "Backup & Restore MongoDB" : "Backup & Restore PostgreSQL"}
                    >
                      <span className="text-xl">💾</span>
                      <span className="text-[9px] font-bold tracking-wider uppercase text-gray-600 text-center leading-tight px-1">Backup / Restore</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
      )}

      {/* Edit Connection Modal */}
      {editConnectionModalConn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs text-left">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-gray-200 shadow-xl overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>✏️</span> Edit Connection: {editConnectionModalConn.name}
              </h3>
              <button
                onClick={() => setEditConnectionModalConn(null)}
                className="text-gray-400 hover:text-gray-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditConnection} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {editConnError && (
                <div className="bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-lg border border-red-200">
                  ❌ {editConnError}
                </div>
              )}

              {editConnTestResult && (
                <div className={`text-xs px-4 py-2.5 rounded-lg border ${
                  editConnTestResult.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'
                }`}>
                  {editConnTestResult.success ? '✅' : '❌'} {editConnTestResult.message}
                </div>
              )}

              {/* Connection Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Connection Name
                </label>
                <input
                  type="text"
                  required
                  value={editConnForm.name}
                  onChange={e => setEditConnForm({ ...editConnForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                />
              </div>

              {/* Database Type */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Database Engine
                </label>
                <select
                  value={editConnForm.type}
                  onChange={e => setEditConnForm({
                    ...editConnForm,
                    type: e.target.value,
                    port: e.target.value === 'mysql' ? '3306' : e.target.value === 'postgresql' ? '5432' : '27017'
                  })}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4] font-semibold cursor-pointer"
                >
                  <option value="mysql">🐬 MySQL</option>
                  <option value="postgresql">🐘 PostgreSQL</option>
                  <option value="mongodb">🍃 MongoDB</option>
                  <option value="oracle">🔴 Oracle</option>
                </select>
              </div>

              {/* Host & Port */}
              {editConnForm.type !== 'mongodb' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Host / Server IP</label>
                    <input
                      type="text"
                      required
                      value={editConnForm.host}
                      onChange={e => setEditConnForm({ ...editConnForm, host: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Port</label>
                    <input
                      type="number"
                      required
                      value={editConnForm.port}
                      onChange={e => setEditConnForm({ ...editConnForm, port: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                    />
                  </div>
                </div>
              )}

              {/* Username & Password */}
              {editConnForm.type !== 'mongodb' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">DB Username</label>
                    <input
                      type="text"
                      required
                      value={editConnForm.username}
                      onChange={e => setEditConnForm({ ...editConnForm, username: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      DB Password <span className="text-[10px] text-gray-400 font-normal">(Blank = keep current)</span>
                    </label>
                    <input
                      type="password"
                      placeholder="Leave blank to keep existing"
                      value={editConnForm.password}
                      onChange={e => setEditConnForm({ ...editConnForm, password: e.target.value })}
                      className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                    />
                  </div>
                </div>
              )}

              {/* Database Name */}
              {editConnForm.type !== 'mongodb' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Default Database Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. main_db"
                    value={editConnForm.database}
                    onChange={e => setEditConnForm({ ...editConnForm, database: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                  />
                </div>
              )}

              {/* MongoDB Connection String */}
              {editConnForm.type === 'mongodb' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">MongoDB Connection URI</label>
                  <input
                    type="text"
                    required
                    placeholder="mongodb://localhost:27017/dbname"
                    value={editConnForm.connectionString}
                    onChange={e => setEditConnForm({ ...editConnForm, connectionString: e.target.value })}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:border-[#0d9da4]"
                  />
                </div>
              )}

              {/* Modal Footer */}
              <div className="pt-4 flex items-center justify-between border-t border-gray-150">
                <button
                  type="button"
                  onClick={handleTestEditConnection}
                  disabled={editConnTestLoading}
                  className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  {editConnTestLoading ? 'Testing...' : '🧪 Test Connection'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditConnectionModalConn(null)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editConnLoading}
                    style={{ backgroundColor: '#0d9da4' }}
                    className="px-5 py-2 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
                  >
                    {editConnLoading ? 'Saving...' : 'Save Connection Changes'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}