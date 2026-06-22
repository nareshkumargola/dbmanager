import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'developer'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
        <div className="flex flex-col md:flex-row">

          {/* LEFT SIDE - Branding Section (exactly same as Login) */}
          <div className="md:w-1/2 bg-gradient-to-br from-gray-800 to-gray-950 p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-white/5 rounded-full blur-3xl"></div>

            <div className="relative z-10">
              {/* COINFINITY */}
              <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white drop-shadow-lg">
                COINFINITY
              </h1>

              {/* INFINITY */}
              <div className="mt-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-white/20 max-w-16"></div>
                <p className="text-2xl md:text-3xl font-semibold text-white/90 tracking-wide">
                  INFINITY
                </p>
                <div className="h-px flex-1 bg-white/20 max-w-16"></div>
              </div>

              {/* Ps - Stylish Badge */}
              <div className="mt-8 inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-5 py-2.5 shadow-lg">
                <span className="text-xl font-bold text-white tracking-wider">Ps</span>
                <span className="text-white/80 text-sm font-mono">✦</span>
                <span className="w-1.5 h-1.5 bg-white/60 rounded-full"></span>
                <span className="text-white/70 text-xs uppercase tracking-wider">Edition</span>
              </div>

              {/* Additional tagline */}
              <div className="mt-10 space-y-1">
                <p className="text-gray-300 text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  Next-gen database management
                </p>
                <p className="text-gray-300 text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  Powered by infinite scale
                </p>
              </div>
            </div>

            {/* Decorative Ps pattern */}
            <div className="relative z-10 mt-auto pt-12">
              <div className="flex items-center gap-2 text-gray-400/40 text-xs font-mono">
                <span>✦</span>
                <span>P S</span>
                <span>✦</span>
                <span>∞</span>
                <span>✦</span>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE - Signup Form Section */}
          <div className="md:w-1/2 p-6 md:p-10 bg-white">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Create Account</h2>
              <p className="text-gray-500 text-sm mt-1">
                DB Manager mein join karo
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm px-4 py-3 rounded-lg shadow-sm">
                <span className="font-medium">Error!</span> {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Full Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  placeholder="Vishal Sharma"
                  value={form.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all duration-200"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  placeholder="vishal@gmail.com"
                  value={form.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all duration-200"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  placeholder="Min 8 chars, 1 upper, 1 special"
                  value={form.password}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all duration-200"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Role
                </label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 bg-white transition-all duration-200"
                >
                  <option value="developer">Developer</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating account...
                  </span>
                ) : (
                  'Sign up'
                )}
              </button>
            </form>

            {/* Login Link */}
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                Pehle se account hai?{' '}
                <Link to="/login" className="text-gray-900 font-semibold hover:underline transition">
                  Login
                </Link>
              </p>
            </div>

            {/* Additional subtle note */}
            <div className="mt-6 pt-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                Secure signup • Infinity powered
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}