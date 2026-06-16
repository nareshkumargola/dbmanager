import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';

export default function Connections() {
  const navigate = useNavigate();
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
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const res = await API.get('/connections');
      setConnections(res.data.connections);
    } catch (err) {
      setError('Connections load nahi hue');
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
      port: type === 'mysql' ? '3306' : type === 'postgresql' ? '5432' : '',
      connectionString: '',
    });
  };

  // Connection test karo
  const handleTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await API.post('/connections/test', form);
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
      await API.post('/connections', form);
      setSuccess('Connection save ho gaya!');
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
    if (!window.confirm(`"${name}" delete karoge?`)) return;
    try {
      await API.delete(`/connections/${id}`);
      setConnections(connections.filter(c => c._id !== id));
      setSuccess('Connection delete ho gaya!');
    } catch (err) {
      setError('Delete failed!');
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'mysql': return 'bg-blue-100 text-blue-700';
      case 'postgresql': return 'bg-indigo-100 text-indigo-700';
      case 'mongodb': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'mysql': return '🐬';
      case 'postgresql': return '🐘';
      case 'mongodb': return '🍃';
      default: return '🗄️';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-semibold text-gray-900">DB Manager</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Dashboard
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              Database Connections
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Apne databases connect karo aur manage karo
            </p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setTestResult(null); }}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition"
          >
            {showForm ? 'Cancel' : '+ Add Connection'}
          </button>
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
              Naya Connection Add Karo
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                />
              </div>

              {/* Database Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Database Type
                </label>
                <div className="flex gap-3">
                  {['mysql', 'postgresql', 'mongodb'].map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition ${form.type === type
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        }`}
                    >
                      {getTypeIcon(type)} {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* MongoDB — Connection String */}
              {form.type === 'mongodb' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Connection String
                  </label>
                  <input
                    type="text"
                    placeholder="mongodb://username:password@host:27017/dbname"
                    value={form.connectionString}
                    onChange={e => setForm({ ...form, connectionString: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500 font-mono"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">
                      Database Name
                    </label>
                    <input
                      type="text"
                      placeholder="mydb"
                      value={form.database}
                      onChange={e => setForm({ ...form, database: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                    />
                  </div>
                </div>
              ) : (
                /* MySQL / PostgreSQL Fields */
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                    <input
                      type="text"
                      placeholder="localhost"
                      value={form.host}
                      onChange={e => setForm({ ...form, host: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                    <input
                      type="number"
                      placeholder={form.type === 'mysql' ? '3306' : '5432'}
                      value={form.port}
                      onChange={e => setForm({ ...form, port: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                    <input
                      type="text"
                      placeholder="root"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      placeholder="Password"
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Database Name</label>
                    <input
                      type="text"
                      placeholder="mydb"
                      value={form.database}
                      onChange={e => setForm({ ...form, database: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                    />
                  </div>
                </div>
              )}

              {/* Test Result */}
              {testResult && (
                <div className={`px-4 py-3 rounded-lg text-sm ${testResult.success
                    ? 'bg-green-50 text-green-600'
                    : 'bg-red-50 text-red-600'
                  }`}>
                  {testResult.success ? '✅' : '❌'} {testResult.message}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testLoading}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition disabled:opacity-60"
                >
                  {testLoading ? 'Testing...' : '🔌 Test Connection'}
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex-1 py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition disabled:opacity-60"
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
              Koi connection nahi hai
            </p>
            <p className="text-gray-400 text-sm mb-4">
              Apna pehla database connection add karo
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
              <div
                key={conn._id}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <div className="flex items-center justify-between">

                  {/* Left — Info */}
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getTypeIcon(conn.type)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {conn.name}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTypeBadge(conn.type)}`}>
                          {conn.type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {conn.type === 'mongodb'
                          ? conn.connectionString?.substring(0, 40) + '...'
                          : `${conn.host}:${conn.port} / ${conn.database}`
                        }
                      </p>
                    </div>
                  </div>

                  {/* Right — Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (conn.database) {
                          navigate(`/connections/${conn._id}`);
                        } else {
                          navigate(`/connections/${conn._id}/select-db`);
                        }
                      }}
                      className="px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 transition"
                    >
                      Open →
                    </button>
                    <button
                      onClick={() => handleDelete(conn._id, conn.name)}
                      className="px-3 py-2 border border-red-200 text-red-500 text-xs rounded-lg hover:bg-red-50 transition"
                    >
                      Delete
                    </button>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}