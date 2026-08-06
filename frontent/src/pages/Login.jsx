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
    <div className="min-h-screen w-full flex bg-white text-left">

      {/* FORM — left side */}
      <div className="w-full md:w-[55%] flex flex-col justify-center px-8 sm:px-16 md:px-24 py-12">
        <div className="flex items-center gap-3 mb-4">
          <img src="/allatone_logo.jpg" className="h-10 w-auto object-contain rounded" alt="Allatone Logo" />
          <div className="h-6 w-px bg-gray-200"></div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full">
            Database Monitoring System
          </span>
        </div>
        <h2 className="text-[22px] font-bold mb-1" style={{ color: '#0b7f86' }}>
          Sign In
        </h2>
        <p className="text-[12.5px] text-gray-500 leading-relaxed mb-6">
          A centralized administration portal to monitor live replication streams, execute secure queries, audit procedure logs, and manage system backups.
        </p>

        {error && <p className="text-rose-500 text-[12px] mb-3">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3.5 max-w-md">
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
            className="w-full px-3.5 py-2.5 rounded-lg text-[13px] outline-none border border-gray-200 transition-colors"
            onFocus={(e) => e.target.style.borderColor = '#0d9da4'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            required
            className="w-full px-3.5 py-2.5 rounded-lg text-[13px] outline-none border border-gray-200 transition-colors"
            onFocus={(e) => e.target.style.borderColor = '#0d9da4'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          />

          <div className="text-right">
            <Link to="/forgot-password" className="text-[11px] font-medium hover:underline" style={{ color: '#0b7f86' }}>
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-full text-white text-[13px] font-semibold shadow-sm hover:shadow-md transition disabled:opacity-60"
            style={{ backgroundColor: '#0d9da4' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-[12px] text-gray-400 mt-6 md:hidden">
          No account?{' '}
          <Link to="/signup" className="font-bold" style={{ color: '#0b7f86' }}>
            Sign Up
          </Link>
        </p>
      </div>

      {/* SIDE PANEL — right side (desktop only) */}
      <div
        className="hidden md:flex md:w-[45%] flex-col items-center justify-center text-center px-12 py-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0d9da4 0%, #0b7f86 100%)' }}
      >
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(252,230,136,0.25)' }}></div>
        <div className="absolute -bottom-20 -left-16 w-60 h-60 rounded-full blur-3xl bg-white/10"></div>

        <div className="relative z-10 max-w-xs">
          <h3 className="text-white text-[22px] font-bold mb-2">New here?</h3>
          <p className="text-teal-50/80 text-[13px] mb-6 leading-relaxed">
            Create an account and start<br />managing your data in minutes.
          </p>
          <Link
            to="/signup"
            className="inline-block px-8 py-2.5 rounded-full border-2 text-[13px] font-semibold transition hover:opacity-90"
            style={{ backgroundColor: '#fce688', color: '#0b7f86', borderColor: '#fce688' }}
          >
            Sign Up
          </Link>
        </div>

        <div className="absolute bottom-6 flex items-center gap-1.5 text-[10px] font-mono z-10" style={{ color: 'rgba(252,230,136,0.6)' }}>
          <span>●</span><span>DB</span><span>●</span><span>∞</span><span>●</span>
        </div>
      </div>

    </div>
  );
}