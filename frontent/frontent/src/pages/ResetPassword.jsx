import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../api/axios';

export default function ResetPassword() {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match!');
      return;
    }

    setLoading(true);
    try {
      const res = await API.post(`/auth/reset-password/${token}`, { password });
      setMessage(res.data.message || 'Password has been reset successfully! You can now log in.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Token is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-white text-left">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-lg">
        <h2 className="text-xl font-bold mb-1" style={{ color: '#0b7f86' }}>
          Choose New Password
        </h2>
        <p className="text-xs text-gray-400 mb-6">Enter a strong, secure new password below.</p>

        {error && <div className="bg-red-50 text-red-700 text-xs px-4 py-3 rounded-lg border border-red-200 mb-4">❌ {error}</div>}
        {message && <div className="bg-green-50 text-green-700 text-xs px-4 py-3 rounded-lg border border-green-200 mb-4">✅ {message}</div>}

        {!message && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">New Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-[13px] outline-none border border-gray-200 focus:border-[#0d9da4] transition-colors"
                placeholder="Enter new password"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Confirm Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-[13px] outline-none border border-gray-200 focus:border-[#0d9da4] transition-colors"
                placeholder="Confirm password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-full text-white text-[13px] font-semibold shadow-sm hover:shadow-md transition disabled:opacity-60"
              style={{ backgroundColor: '#0d9da4' }}
            >
              {loading ? 'Resetting Password...' : 'Save New Password'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-xs">
          <Link to="/login" className="font-bold hover:underline" style={{ color: '#0b7f86' }}>
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
