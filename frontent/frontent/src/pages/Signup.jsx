import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'developer' });
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
      const res = await API.post('/auth/signup', form);
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

      {/* SIDE PANEL — left side (desktop only) */}
      <div
        className="hidden md:flex md:w-[45%] flex-col items-center justify-center text-center px-12 py-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0d9da4 0%, #0b7f86 100%)' }}
      >
        <div className="absolute -top-16 -left-10 w-56 h-56 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(252,230,136,0.25)' }}></div>
        <div className="absolute -bottom-20 -right-16 w-60 h-60 rounded-full blur-3xl bg-white/10"></div>

        <div className="relative z-10 max-w-xs">
          <h3 className="text-white text-[22px] font-bold mb-2">Already have an account?</h3>
          <p className="text-teal-50/80 text-[13px] mb-6 leading-relaxed">
            Sign in to keep managing your<br />databases and connections.
          </p>
          <Link
            to="/login"
            className="inline-block px-8 py-2.5 rounded-full border-2 border-white text-white text-[13px] font-semibold hover:bg-white/10 transition"
          >
            Sign In
          </Link>
        </div>

        <div className="absolute bottom-6 flex items-center gap-1.5 text-[10px] font-mono z-10" style={{ color: 'rgba(252,230,136,0.6)' }}>
          <span>●</span><span>DB</span><span>●</span><span>∞</span><span>●</span>
        </div>
      </div>

      {/* FORM — right side */}
      <div className="w-full md:w-[55%] flex flex-col justify-center px-8 sm:px-16 md:px-24 py-12">
        <div className="flex items-center gap-3 mb-4">
          <img src="/allatone_logo.jpg" className="h-10 w-auto object-contain rounded" alt="Allatone Logo" />
          <div className="h-6 w-px bg-gray-200"></div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full">
            Database Monitoring System
          </span>
        </div>
        <h2 className="text-[22px] font-bold mb-1" style={{ color: '#0b7f86' }}>
          Create Account
        </h2>
        <p className="text-[12.5px] text-gray-500 leading-relaxed mb-5">
          Register today to establish secure database credentials, track transactions, execute SQL scripts, and monitor server vitals in real-time.
        </p>

        {error && <p className="text-rose-500 text-[12px] mb-2">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-2.5 max-w-md">
          <input
            type="text"
            name="name"
            placeholder="Full name"
            value={form.name}
            onChange={handleChange}
            required
            className="w-full px-3.5 py-2 rounded-lg text-[13px] outline-none border border-gray-200 transition-colors"
            onFocus={(e) => e.target.style.borderColor = '#0d9da4'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          />
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
            className="w-full px-3.5 py-2 rounded-lg text-[13px] outline-none border border-gray-200 transition-colors"
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
            className="w-full px-3.5 py-2 rounded-lg text-[13px] outline-none border border-gray-200 transition-colors"
            onFocus={(e) => e.target.style.borderColor = '#0d9da4'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          />
          <select
            name="role"
            value={form.role}
            onChange={handleChange}
            className="w-full px-3.5 py-2 rounded-lg text-[13px] outline-none border border-gray-200 bg-white transition-colors"
            onFocus={(e) => e.target.style.borderColor = '#0d9da4'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          >
            <option value="developer">Developer</option>
            <option value="viewer">Viewer</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-1 rounded-full text-white text-[13px] font-semibold shadow-sm hover:shadow-md transition disabled:opacity-60"
            style={{ backgroundColor: '#0d9da4' }}
          >
            {loading ? 'Creating…' : 'Sign Up'}
          </button>
        </form>

        <p className="text-[12px] text-gray-400 mt-5 md:hidden">
          Already have an account?{' '}
          <Link to="/login" className="font-bold" style={{ color: '#0b7f86' }}>
            Sign In
          </Link>
        </p>
      </div>

    </div>
  );
}