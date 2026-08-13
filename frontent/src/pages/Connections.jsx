import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

export default function Connections() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
        ) : (
          <div className="space-y-3">
            {connections.map(conn => (
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



    </div>
  );
}