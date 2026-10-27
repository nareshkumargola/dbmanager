import { useEffect, useState } from 'react';
import API from '../api/axios';

const availableRoles = ['CONNECT', 'RESOURCE', 'SELECT_CATALOG_ROLE'];

export default function OracleUsersPanel({ connectionId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [editRoles, setEditRoles] = useState([]);
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await API.get(`/connections/${connectionId}/oracle-users`);
      setUsers(response.data.users || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to load Oracle users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    API.get(`/connections/${connectionId}/oracle-users`)
      .then(response => {
        if (active) setUsers(response.data.users || []);
      })
      .catch(requestError => {
        if (active) setError(requestError.response?.data?.message || 'Failed to load Oracle users.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [connectionId]);

  const toggleRole = (role, setCurrent) => {
    setCurrent(previous => previous.includes(role)
      ? previous.filter(value => value !== role)
      : [...previous, role]);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await API.post(`/connections/${connectionId}/oracle-users`, {
        username,
        password,
        roles
      });
      setMessage(response.data.message);
      setUsername('');
      setPassword('');
      setRoles([]);
      await fetchUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to create Oracle user.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRoles = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await API.put(
        `/connections/${connectionId}/oracle-users/${encodeURIComponent(editingUser)}/roles`,
        { roles: editRoles }
      );
      setMessage(response.data.message);
      setEditingUser(null);
      await fetchUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to update roles.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await API.put(
        `/connections/${connectionId}/oracle-users/${encodeURIComponent(passwordUser)}/password`,
        { password: newPassword }
      );
      setMessage(response.data.message);
      setPasswordUser(null);
      setNewPassword('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Drop Oracle user ${user.USERNAME || user.username} and all of their schema objects?`)) return;
    setError('');
    setMessage('');
    try {
      const response = await API.delete(
        `/connections/${connectionId}/oracle-users/${encodeURIComponent(user.USERNAME || user.username)}`
      );
      setMessage(response.data.message);
      await fetchUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to drop Oracle user.');
    }
  };

  const renderRoles = (selectedRoles, setter) => (
    <div className="flex flex-wrap gap-3">
      {availableRoles.map(role => (
        <label key={role} className="inline-flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={selectedRoles.includes(role)}
            onChange={() => toggleRole(role, setter)}
          />
          {role}
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-bold text-gray-900">Oracle Users & Roles</h2>
        <p className="mt-1 text-xs text-gray-500">
          Needs Oracle account-management privileges. New users receive CREATE SESSION and only the selected roles.
        </p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            value={username}
            onChange={event => setUsername(event.target.value)}
            placeholder="Username (e.g. APP_USER)"
            required
            pattern="[A-Za-z][A-Za-z0-9_$#]{0,127}"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={password}
            onChange={event => setPassword(event.target.value)}
            type="password"
            minLength={8}
            placeholder="Password (8+ characters)"
            required
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="md:col-span-2">{renderRoles(roles, setRoles)}</div>
          <button disabled={saving} className="w-fit rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Oracle User'}
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <p className="p-8 text-center text-sm text-gray-500">Loading Oracle users…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr><th className="px-5 py-3">Username</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => {
                  const name = user.USERNAME || user.username;
                  return (
                    <tr key={name}>
                      <td className="px-5 py-3 font-medium">{name}</td>
                      <td className="px-5 py-3">{user.ACCOUNT_STATUS || user.account_status}</td>
                      <td className="px-5 py-3">{String(user.CREATED || user.created || '').slice(0, 10)}</td>
                      <td className="space-x-3 px-5 py-3">
                        <button className="text-teal-700 hover:underline" onClick={async () => {
                          setError('');
                          try {
                            const response = await API.get(`/connections/${connectionId}/oracle-users/${encodeURIComponent(name)}/roles`);
                            setEditRoles(response.data.roles || []);
                            setEditingUser(name);
                          } catch (requestError) {
                            setError(requestError.response?.data?.message || 'Failed to load roles.');
                          }
                        }}>Roles</button>
                        <button className="text-teal-700 hover:underline" onClick={() => setPasswordUser(name)}>Password</button>
                        <button className="text-red-600 hover:underline" onClick={() => handleDelete(user)}>Drop</button>
                      </td>
                    </tr>
                  );
                })}
                {!users.length && <tr><td colSpan="4" className="p-8 text-center text-gray-500">No Oracle users returned.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingUser && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 font-semibold">Roles for {editingUser}</h3>
          {renderRoles(editRoles, setEditRoles)}
          <div className="mt-4 flex gap-2">
            <button disabled={saving} onClick={handleSaveRoles} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Save roles</button>
            <button onClick={() => setEditingUser(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {passwordUser && (
        <form onSubmit={handlePasswordChange} className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 font-semibold">Change password for {passwordUser}</h3>
          <div className="flex flex-wrap gap-2">
            <input value={newPassword} onChange={event => setNewPassword(event.target.value)} type="password" minLength={8} required placeholder="New password" className="rounded-lg border px-3 py-2 text-sm" />
            <button disabled={saving} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Update password</button>
            <button type="button" onClick={() => setPasswordUser(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
