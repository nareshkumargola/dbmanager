import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [userEmail, setUserEmail] = useState('');
  const [timer, setTimer] = useState(60);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const inputRefs = useRef([]);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Mask Email for privacy (e.g. vi*****@gmail.com)
  const maskEmail = (email) => {
    if (!email) return '';
    const [name, domain] = email.split('@');
    if (!domain) return email;
    if (name.length <= 2) return `${name}***@${domain}`;
    return `${name.slice(0, 2)}${'*'.repeat(Math.max(name.length - 2, 4))}@${domain}`;
  };

  // Timer countdown for OTP expiry
  useEffect(() => {
    let interval = null;
    if (requiresOtp && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [requiresOtp, timer]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Handle normal email/password login submit
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
        setTimer(60);
        setOtpDigits(['', '', '', '', '', '']);
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

  // OTP Digit Input Handlers
  const handleDigitChange = (index, value) => {
    const cleanValue = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];

    if (cleanValue.length > 1) {
      // If multi-character input (e.g. paste)
      const digits = cleanValue.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        newDigits[i] = digits[i] || '';
      }
      setOtpDigits(newDigits);
      const targetIdx = Math.min(digits.length, 5);
      if (inputRefs.current[targetIdx]) inputRefs.current[targetIdx].focus();
      return;
    }

    newDigits[index] = cleanValue;
    setOtpDigits(newDigits);

    // Auto-focus next box if digit entered
    if (cleanValue && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0 && inputRefs.current[index - 1]) {
        const newDigits = [...otpDigits];
        newDigits[index - 1] = '';
        setOtpDigits(newDigits);
        inputRefs.current[index - 1].focus();
      }
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newDigits = [...otpDigits];
    const digits = pastedData.split('');
    for (let i = 0; i < 6; i++) {
      newDigits[i] = digits[i] || '';
    }
    setOtpDigits(newDigits);
    const lastIdx = Math.min(digits.length - 1, 5);
    if (inputRefs.current[lastIdx]) inputRefs.current[lastIdx].focus();
  };

  // Submit OTP Verification
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) {
      setError('Please enter all 6 digits of the OTP code.');
      return;
    }

    setError('');
    setInfoMsg('');
    setLoading(true);
    try {
      const res = await API.post('/auth/verify-otp', { email: userEmail, otp: fullOtp });
      login(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    setError('');
    setInfoMsg('');
    setResending(true);
    try {
      const res = await API.post('/auth/resend-otp', { email: userEmail });
      setInfoMsg(res.data.message || 'New OTP sent to your email address!');
      setTimer(60);
      setOtpDigits(['', '', '', '', '', '']);
      if (inputRefs.current[0]) inputRefs.current[0].focus();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50/80 p-4 sm:p-6 text-left font-sans">
      {!requiresOtp ? (
        /* STEP 1: Standard Full-Width Login Layout */
        <div className="w-full max-w-4xl mx-auto bg-white p-8 sm:p-12 rounded-3xl border border-gray-200/80 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <img src="/allatone_logo.jpg" className="h-12 w-auto object-contain rounded" alt="Allatone Logo" />
            <div className="h-7 w-px bg-gray-200"></div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-3 py-1 rounded-full">
              Database Monitoring System
            </span>
          </div>

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
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border border-gray-200 transition-all focus:border-[#0d9da4] focus:ring-1 focus:ring-[#0d9da4] bg-gray-50/50 focus:bg-white text-gray-900"
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
                className="w-full px-4 py-3 rounded-xl text-sm outline-none border border-gray-200 transition-all focus:border-[#0d9da4] focus:ring-1 focus:ring-[#0d9da4] bg-gray-50/50 focus:bg-white text-gray-900"
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
        </div>
      ) : (
        /* STEP 2: Beautiful Premium OTP Verification Card (Matching Screenshot UI with Application Colors) */
        <div className="w-full max-w-md bg-white rounded-3xl border border-gray-150 p-6 sm:p-8 shadow-xl text-left transition-all animate-fadeIn">
          {/* Card Top Brand Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <img src="/allatone_logo.jpg" className="h-8 w-auto object-contain rounded-md" alt="Allatone Logo" />
              <span className="text-xs font-extrabold text-gray-900 font-mono tracking-tight">Allatone DMS</span>
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 font-mono">
              OTP VERIFICATION
            </span>
          </div>

          {/* Shield Badge Icon */}
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#0d9da4] mb-5 shadow-2xs">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>

          {/* Title & Subtitle */}
          <h2 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">
            Enter your OTP
          </h2>
          <p className="text-xs text-gray-500 mb-6 font-medium leading-relaxed">
            A 6-digit code was sent to <span className="font-bold text-gray-800 font-mono">{maskEmail(userEmail)}</span>
          </p>

          {infoMsg && (
            <div className="bg-teal-50 border border-teal-200 text-teal-800 text-xs px-3.5 py-2.5 rounded-xl mb-5 font-semibold flex items-center gap-2">
              <span>✉️</span> {infoMsg}
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl mb-5 font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleOtpSubmit}>
            {/* 6 Individual Digit Boxes */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 mb-6">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                  onPaste={handleOtpPaste}
                  autoFocus={idx === 0}
                  className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-extrabold font-mono rounded-xl border outline-none transition-all shadow-3xs ${
                    digit
                      ? 'border-[#0d9da4] bg-teal-50/40 text-[#0b7f86] ring-2 ring-teal-100'
                      : 'border-gray-200 bg-gray-50/60 text-gray-900 focus:border-[#0d9da4] focus:bg-white focus:ring-2 focus:ring-teal-100'
                  }`}
                />
              ))}
            </div>

            {/* Timer & Resend OTP Row */}
            <div className="flex items-center justify-between text-xs mb-6 px-1">
              <div className="flex items-center gap-2 text-gray-500 font-medium">
                <div className="relative w-6 h-6 flex items-center justify-center">
                  <svg className="w-6 h-6 transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-gray-200"
                      strokeWidth="3"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-[#0d9da4] transition-all duration-1000"
                      strokeDasharray={`${(timer / 60) * 100}, 100`}
                      strokeWidth="3"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute text-[10px] font-bold text-gray-700">{timer}s</span>
                </div>
                <span>Code expires in</span>
              </div>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={timer > 0 || resending}
                className={`font-bold transition-colors cursor-pointer ${
                  timer > 0 || resending
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-[#0b7f86] hover:text-[#0d9da4] hover:underline'
                }`}
              >
                {resending ? 'Sending…' : 'Resend OTP'}
              </button>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={loading || otpDigits.join('').length !== 6}
              className="w-full py-3.5 px-4 rounded-xl text-white text-sm font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mb-6"
              style={{ backgroundColor: '#0d9da4' }}
            >
              {loading ? (
                <span>Verifying OTP…</span>
              ) : (
                <>
                  <span>Verify OTP</span>
                  <span className="text-base">→</span>
                </>
              )}
            </button>

            {/* Divider SECURE LOGIN */}
            <div className="relative flex py-1 items-center justify-center mb-5">
              <div className="flex-grow border-t border-gray-150"></div>
              <span className="shrink-0 px-3 text-[10px] font-extrabold uppercase tracking-widest text-gray-400 font-mono bg-white">
                SECURE LOGIN
              </span>
              <div className="flex-grow border-t border-gray-150"></div>
            </div>

            {/* Bottom Info Box */}
            <div className="bg-teal-50/60 border border-teal-100/80 rounded-2xl p-4 text-[11.5px] text-teal-900 flex items-start gap-2.5 leading-relaxed">
              <span className="text-base shrink-0 text-[#0d9da4]">ⓘ</span>
              <span>
                Didn't receive a code? Check your spam folder or request a new one after the timer ends.
              </span>
            </div>

            {/* Back to Login Link */}
            <div className="text-center mt-5">
              <button
                type="button"
                onClick={() => {
                  setRequiresOtp(false);
                  setError('');
                  setInfoMsg('');
                }}
                className="text-xs text-gray-500 hover:text-gray-800 font-semibold cursor-pointer transition hover:underline"
              >
                ← Back to Login
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}