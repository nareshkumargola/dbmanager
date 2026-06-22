import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

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

  useEffect(() => {
    fetchUsers();
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await API.get('/users');
      setUsers(res.data.users);
    } catch (err) {
      setError('Users load nahi hue');
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (id, role) => {
    try {
      setError('');
      setSuccess('');
      await API.put(`/users/${id}/role`, { role });
      setSuccess('Role update ho gaya!');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed!');
    }
  };

  const deleteUser = async (id, name) => {
    if (!window.confirm(`${name} ko delete karoge?`)) return;
    try {
      setError('');
      setSuccess('');
      await API.delete(`/users/${id}`);
      setSuccess('User delete ho gaya!');
      setUsers(users.filter(u => u._id !== id));
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
      await API.post('/users', form);
      setSuccess('Naya user ban gaya!');
      setShowForm(false);
      setForm({ name: '', email: '', password: '', role: 'developer' });
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'User create failed!');
    } finally {
      setFormLoading(false);
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return 'bg-gray-900 text-white';
      case 'developer':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-600';
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
              User Management
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {users.length} users registered
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition"
          >
            {showForm ? 'Cancel' : '+ New User'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
            ❌ {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-4 bg-green-50 text-green-600 text-sm px-4 py-3 rounded-lg">
            ✅ {success}
          </div>
        )}

        {/* New User Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Naya User Banao
            </h3>
            <form onSubmit={createUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="email@gmail.com"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="Strong password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:border-gray-500 bg-white"
                  >
                    <option value="developer">Developer</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={formLoading}
                className="w-full py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition disabled:opacity-60"
              >
                {formLoading ? 'Ban raha hai...' : 'User Banao'}
              </button>
            </form>
          </div>
        )}

        {/* Users List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">
              Saare Users
            </h3>
          </div>

          {users.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-400 text-sm">Koi user nahi mila</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map((user) => (
                <div
                  key={user._id}
                  className="px-6 py-4 flex items-center justify-between"
                >
                  {/* Left — User Info */}
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">
                      {user.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {user.name}
                        </p>
                        {/* Current user badge */}
                        {user._id === currentUser?._id && (
                          <span className="text-xs text-gray-400">(You)</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>

                  {/* Right — Role + Actions */}
                  <div className="flex items-center gap-3">
                    {/* Role Dropdown */}
                    {user._id !== currentUser?._id ? (
                      <select
                        value={user.role}
                        onChange={e => updateRole(user._id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none bg-white"
                      >
                        <option value="admin">Admin</option>
                        <option value="developer">Developer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getRoleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    )}

                    {/* Delete Button */}
                    {user._id !== currentUser?._id && (
                      <button
                        onClick={() => deleteUser(user._id, user.name)}
                        className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}