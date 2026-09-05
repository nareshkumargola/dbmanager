import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const res = await API.post('/auth/login', form);
      if (res.data.requiresOtp) {
        setRequiresOtp(true);
        setUserEmail(res.data.email || form.email);
        setInfoMsg(res.data.message || 'First-time login detected! Please enter the OTP sent to your email.');
      } else {
        login(res.data.user, res.data.token);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (!otp || otp.trim().length !== 6) {
      setError('Please enter a valid 6-digit OTP code.');
      return;
    }

    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const res = await API.post('/auth/verify-otp', { email: userEmail, otp: otp.trim() });
      login(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setInfoMsg('');
    setResending(true);
    try {
      const res = await API.post('/auth/resend-otp', { email: userEmail });
      setInfoMsg(res.data.message || 'New OTP sent to your email address!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center bg-white px-8 sm:px-16 md:px-24 lg:px-32 py-12 text-left">
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <img src="/allatone_logo.jpg" className="h-12 w-auto object-contain rounded" alt="Allatone Logo" />
          <div className="h-7 w-px bg-gray-200"></div>
          <span className="text-xs font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-3 py-1 rounded-full">
            Database Monitoring System
          </span>
        </div>

        {!requiresOtp ? (
          /* Step 1: Normal Email & Password Form */
          <>
            <h2 className="text-3xl font-extrabold mb-2" style={{ color: '#0b7f86' }}>
              Sign In
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-8 max-w-2xl">
              A centralized administration portal to monitor live replication streams, execute secure queries, audit procedure logs, and manage system backups.
            </p>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-4 py-3 rounded-xl mb-6 font-semibold w-full">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 w-full">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none border border-gray-200 transition-all focus:border-[#0d9da4] focus:ring-1 focus:ring-[#0d9da4] bg-gray-50/50 focus:bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Password</label>
                  <Link to="/forgot-password" className="text-xs font-semibold hover:underline" style={{ color: '#0b7f86' }}>
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
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none border border-gray-200 transition-all focus:border-[#0d9da4] focus:ring-1 focus:ring-[#0d9da4] bg-gray-50/50 focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-full text-white text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-60 cursor-pointer mt-4"
                style={{ backgroundColor: '#0d9da4' }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </>
        ) : (
          /* Step 2: First-Time Login OTP Verification View */
          <>
            <div className="flex items-center gap-2 mb-2 text-[#0b7f86]">
              <span className="text-2xl">🔒</span>
              <h2 className="text-3xl font-extrabold" style={{ color: '#0b7f86' }}>
                First-Time Login OTP Verification
              </h2>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed mb-6 max-w-2xl">
              Since this is your first time logging into your account, a 6-digit OTP code has been sent to <strong className="text-gray-900 font-mono">{userEmail}</strong> for security verification.
            </p>

            {infoMsg && (
              <div className="bg-teal-50 border border-teal-200 text-teal-800 text-xs px-4 py-3 rounded-xl mb-6 font-semibold w-full flex items-center gap-2">
                <span>✉️</span> {infoMsg}
              </div>
            )}

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-4 py-3 rounded-xl mb-6 font-semibold w-full">
                {error}
              </div>
            )}

            <form onSubmit={handleOtpSubmit} className="space-y-5 w-full">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Enter 6-Digit OTP Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                  className="w-full px-4 py-3.5 rounded-xl text-center text-xl font-bold tracking-[8px] font-mono outline-none border border-gray-300 focus:border-[#0d9da4] focus:ring-2 focus:ring-teal-100 bg-gray-50/50 focus:bg-white text-gray-900"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-3.5 rounded-full text-white text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer mt-2"
                style={{ backgroundColor: '#0d9da4' }}
              >
                {loading ? 'Verifying OTP…' : 'Verify & Complete Login'}
              </button>

              <div className="flex items-center justify-between text-xs pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setRequiresOtp(false); setError(''); setInfoMsg(''); }}
                  className="text-gray-500 hover:text-gray-800 font-semibold cursor-pointer flex items-center gap-1"
                >
                  ← Back to Login
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resending}
                  className="text-[#0b7f86] font-bold hover:underline cursor-pointer disabled:opacity-50"
                >
                  {resending ? 'Sending OTP…' : 'Resend OTP'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}