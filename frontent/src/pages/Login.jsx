import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await API.post('/auth/login', form);
      login(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50/80 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-8 shadow-sm text-left">
        <div className="flex items-center gap-3 mb-6">
          <img src="/allatone_logo.jpg" className="h-10 w-auto object-contain rounded" alt="Allatone Logo" />
          <div className="h-6 w-px bg-gray-200"></div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full">
            Database Monitoring System
          </span>
        </div>

        <h2 className="text-2xl font-bold mb-1" style={{ color: '#0b7f86' }}>
          Sign In
        </h2>
        <p className="text-[12.5px] text-gray-500 leading-relaxed mb-6">
          A centralized administration portal to monitor live replication streams, execute secure queries, audit procedure logs, and manage system backups.
        </p>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-3.5 py-2.5 rounded-lg mb-4 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full px-3.5 py-2.5 rounded-lg text-[13px] outline-none border border-gray-200 transition-colors focus:border-[#0d9da4] bg-gray-50/50 focus:bg-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-700">Password</label>
              <Link to="/forgot-password" className="text-[11px] font-semibold hover:underline" style={{ color: '#0b7f86' }}>
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={form.password}
              onChange={handleChange}
              required
              className="w-full px-3.5 py-2.5 rounded-lg text-[13px] outline-none border border-gray-200 transition-colors focus:border-[#0d9da4] bg-gray-50/50 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-full text-white text-[13px] font-semibold shadow-sm hover:shadow-md transition disabled:opacity-60 cursor-pointer mt-2"
            style={{ backgroundColor: '#0d9da4' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}