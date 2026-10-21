import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [userEmail, setUserEmail] = useState('');
  const [timer, setTimer] = useState(60);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // 3D Mouseover Tilt & Parallax state
  const [tilt, setTilt] = useState({ x: 0, y: 0, glareX: 50, glareY: 50, isHovered: false });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const inputRefs = useRef([]);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Window-level mouse parallax for ambient depth
  useEffect(() => {
    const handleWindowMouseMove = (e) => {
      const normX = (e.clientX / window.innerWidth - 0.5) * 2; // -1 to 1
      const normY = (e.clientY / window.innerHeight - 0.5) * 2; // -1 to 1
      setMousePos({ x: normX, y: normY });
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    return () => window.removeEventListener('mousemove', handleWindowMouseMove);
  }, []);

  // Card-specific 3D tilt calculations
  const handleCardMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Subtle 3D tilt angle (up to 9 degrees)
    const rotateX = ((y - centerY) / centerY) * -9;
    const rotateY = ((x - centerX) / centerX) * 9;

    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;

    setTilt({
      x: rotateX,
      y: rotateY,
      glareX,
      glareY,
      isHovered: true,
    });
  };

  const handleCardMouseLeave = () => {
    setTilt({
      x: 0,
      y: 0,
      glareX: 50,
      glareY: 50,
      isHovered: false,
    });
  };

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
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  // OTP Digit Input Handlers
  const handleDigitChange = (index, value) => {
    const cleanValue = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];

    if (cleanValue.length > 1) {
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
    <div className="min-h-screen w-full relative overflow-hidden bg-[#0c141f] text-left font-sans flex items-center justify-center select-none">
      {/* Dynamic Ambient Background Glows */}
      <div 
        className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-[#0d9da4]/15 blur-[120px] pointer-events-none transition-transform duration-700 ease-out"
        style={{
          transform: `translate(${mousePos.x * 25}px, ${mousePos.y * 25}px)`,
        }}
      />
      <div 
        className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] rounded-full bg-[#00e5be]/10 blur-[130px] pointer-events-none transition-transform duration-700 ease-out"
        style={{
          transform: `translate(${mousePos.x * -20}px, ${mousePos.y * -20}px)`,
        }}
      />

      {/* Main Container */}
      <div className="w-full max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 py-8 relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8">
        
        {/* LEFT COLUMN: 3D Database Illustration & Brand Messaging */}
        <div 
          className="w-full lg:w-[55%] flex flex-col justify-between transition-transform duration-500 ease-out"
          style={{
            transform: `translate3d(${mousePos.x * -10}px, ${mousePos.y * -6}px, 0)`,
          }}
        >
          {/* Top Brand Header */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight flex items-baseline gap-1">
              <span>Allatone</span>
              <span className="text-[#00e5be] text-4xl leading-none">.</span>
            </h1>
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.22em] text-[#00e5be]/80 mt-1">
              DATABASE MONITORING SYSTEM
            </p>
          </div>

          {/* 3D Scene Illustration Image with Subtle Glow and Parallax */}
          <div className="relative w-full max-w-[580px] mx-auto lg:mx-0 group">
            <div className="absolute inset-0 bg-[#00e5be]/10 blur-2xl rounded-3xl -z-10 group-hover:bg-[#00e5be]/20 transition-all duration-700" />
            <img 
              src="/login_3d_left.png" 
              alt="Allatone Database 3D Infrastructure" 
              className="w-full h-auto object-contain rounded-2xl drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)] transition-transform duration-700 hover:scale-[1.01]"
              style={{
                filter: 'drop-shadow(0 0 25px rgba(0, 229, 190, 0.2))',
              }}
            />
          </div>

          {/* Bottom Brand Punchline */}
          <div className="mt-8 sm:mt-10 flex items-start gap-3">
            <div className="w-1 h-10 rounded-full bg-[#00e5be] shadow-[0_0_12px_#00e5be] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                Monitor &bull; Manage &bull; Keep It Running
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 font-normal">
                Real-time insights for a healthier database.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 3D Interactive Mouseover Login / OTP Card */}
        <div 
          className="w-full lg:w-[45%] flex items-center justify-center lg:justify-end"
          style={{ perspective: '1200px' }}
        >
          <div
            ref={cardRef}
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
            className="w-full max-w-[440px] bg-white rounded-[32px] p-8 sm:p-9 relative overflow-hidden transition-all duration-200 ease-out select-text"
            style={{
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale3d(${tilt.isHovered ? '1.02, 1.02, 1.02' : '1, 1, 1'})`,
              transformStyle: 'preserve-3d',
              boxShadow: tilt.isHovered 
                ? '0 30px 80px -15px rgba(0,0,0,0.45), 0 0 60px rgba(0, 229, 190, 0.35), 0 0 0 1px rgba(255,255,255,0.8)' 
                : '0 20px 60px -15px rgba(0,0,0,0.35), 0 0 40px rgba(13, 157, 164, 0.25), 0 0 0 1px rgba(255,255,255,0.6)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Dynamic 3D Glare Reflection on Mouseover */}
            <div 
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{
                background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.05) 50%, transparent 80%)`,
                opacity: tilt.isHovered ? 0.75 : 0,
              }}
            />

            {/* Top Right Organic Turquoise Wave Accent */}
            <div className="absolute top-0 right-0 w-36 h-36 pointer-events-none overflow-hidden rounded-tr-[32px]">
              <svg 
                viewBox="0 0 120 120" 
                className="w-full h-full transform translate-x-3 -translate-y-3"
                fill="none"
              >
                <path 
                  d="M120 0H30C45 35 75 40 85 75C95 110 105 120 120 120V0Z" 
                  fill="url(#waveGrad)"
                  fillOpacity="0.85"
                />
                <path 
                  d="M120 0H60C72 25 90 35 98 60C106 85 112 100 120 100V0Z" 
                  fill="url(#waveGrad)"
                  fillOpacity="0.45"
                />
                <defs>
                  <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00e5be" />
                    <stop offset="100%" stopColor="#0d9da4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {!requiresOtp ? (
              /* STEP 1: LOGIN FORM VIEW */
              <div className="relative z-10" style={{ transform: 'translateZ(30px)' }}>
                {/* Brand Header */}
                <div className="flex items-center gap-3 mb-6">
                  {/* 3D Cyan Cylinder Database Icon */}
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00e5be]/20 to-[#0d9da4]/30 border border-[#00e5be]/40 flex items-center justify-center shadow-sm">
                    <svg className="w-6 h-6 text-[#0d9da4]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 3.34 2 5v4c0 1.66 4.48 3 10 3s10-1.34 10-3V5c0-1.66-4.48-3-10-3zm0 2c4.42 0 8 .9 8 1.5S16.42 7 12 7 4 6.1 4 5.5 7.58 4 12 4zM2 11v4c0 1.66 4.48 3 10 3s10-1.34 10-3v-4c-2.05 1.05-5.67 1.7-10 1.7s-7.95-.65-10-1.7zm0 6v4c0 1.66 4.48 3 10 3s10-1.34 10-3v-4c-2.05 1.05-5.67 1.7-10 1.7s-7.95-.65-10-1.7z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-baseline">
                      <span>Allatone</span>
                      <span className="text-[#00e5be] text-2xl leading-none">.</span>
                    </h2>
                    <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-gray-400 font-mono">
                      DATABASE MONITORING SYSTEM
                    </p>
                  </div>
                </div>

                {/* Sign In Header Text */}
                <h3 className="text-2xl font-bold text-gray-900 mb-1.5 tracking-tight">
                  Sign In
                </h3>
                <p className="text-[12.5px] text-gray-500 leading-relaxed mb-6 font-normal">
                  A centralized administration portal to monitor live replication streams, execute secure queries, audit procedure logs, and manage system backups.
                </p>

                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl mb-4 font-semibold">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Email Address Field */}
                  <div className="bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus-within:bg-white focus-within:border-[#00e5be] focus-within:ring-2 focus-within:ring-[#00e5be]/20 rounded-2xl px-4 py-2.5 border border-gray-200/80 transition-all flex items-center gap-3">
                    <div className="text-gray-400 shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="block text-[9.5px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                        EMAIL ADDRESS
                      </label>
                      <input
                        type="email"
                        name="email"
                        placeholder="Enter your email address"
                        value={form.email}
                        onChange={handleChange}
                        required
                        className="w-full bg-transparent text-[13px] text-gray-900 placeholder-gray-400 outline-none font-medium truncate"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="bg-[#f1f5f9]/80 hover:bg-[#f1f5f9] focus-within:bg-white focus-within:border-[#00e5be] focus-within:ring-2 focus-within:ring-[#00e5be]/20 rounded-2xl px-4 py-2.5 border border-gray-200/80 transition-all flex items-center gap-3">
                    <div className="text-gray-400 shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="block text-[9.5px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                        PASSWORD
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        placeholder="Enter your password"
                        value={form.password}
                        onChange={handleChange}
                        required
                        className="w-full bg-transparent text-[13px] text-gray-900 placeholder-gray-400 outline-none font-medium"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:text-gray-600 transition p-1 cursor-pointer shrink-0"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Forgot Password Link */}
                  <div className="text-right pt-0.5">
                    <Link 
                      to="/forgot-password" 
                      className="text-xs font-semibold text-[#00a896] hover:text-[#00c9a7] hover:underline transition"
                    >
                      Forgot password?
                    </Link>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-6 rounded-full text-white font-bold text-sm shadow-[0_10px_25px_rgba(0,191,165,0.35)] hover:shadow-[0_15px_30px_rgba(0,191,165,0.5)] hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-[#00c9a7] to-[#00a896] disabled:opacity-60 cursor-pointer mt-3"
                  >
                    {loading ? (
                      <span>Signing in…</span>
                    ) : (
                      <>
                        <span className="text-lg leading-none font-bold">&rarr;</span>
                        <span>Sign In</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Footer Badge */}
                <div className="mt-7 pt-4 border-t border-gray-100 flex items-center justify-center gap-2 text-[11px] text-gray-400 font-medium">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>Secure Access</span>
                  <span className="text-gray-300">&bull;</span>
                  <span>Allatone DMS</span>
                </div>
              </div>
            ) : (
              /* STEP 2: OTP VERIFICATION VIEW */
              <div className="relative z-10" style={{ transform: 'translateZ(30px)' }}>
                {/* Shield Badge Icon */}
                <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#0d9da4] mb-4 shadow-sm">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>

                <h3 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">
                  Enter your OTP
                </h3>
                <p className="text-xs text-gray-500 mb-5 font-medium leading-relaxed">
                  A 6-digit code was sent to <span className="font-bold text-gray-800 font-mono">{maskEmail(userEmail)}</span>
                </p>

                {infoMsg && (
                  <div className="bg-teal-50 border border-teal-200 text-teal-800 text-xs px-3.5 py-2.5 rounded-xl mb-4 font-semibold flex items-center gap-2">
                    <span>✉️</span> {infoMsg}
                  </div>
                )}

                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl mb-4 font-semibold">
                    {error}
                  </div>
                )}

                <form onSubmit={handleOtpSubmit}>
                  {/* 6 Digit Input Boxes */}
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2 mb-5">
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
                        className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-extrabold font-mono rounded-xl border outline-none transition-all shadow-sm ${
                          digit
                            ? 'border-[#00e5be] bg-teal-50/50 text-[#0d9da4] ring-2 ring-teal-100'
                            : 'border-gray-200 bg-gray-50/80 text-gray-900 focus:border-[#00e5be] focus:bg-white focus:ring-2 focus:ring-teal-100'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Timer & Resend OTP */}
                  <div className="flex items-center justify-between text-xs mb-5 px-1">
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
                            className="text-[#00e5be] transition-all duration-1000"
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
                          : 'text-[#00a896] hover:text-[#00e5be] hover:underline'
                      }`}
                    >
                      {resending ? 'Sending…' : 'Resend OTP'}
                    </button>
                  </div>

                  {/* Verify Button */}
                  <button
                    type="submit"
                    disabled={loading || otpDigits.join('').length !== 6}
                    className="w-full py-3.5 px-6 rounded-full text-white font-bold text-sm shadow-[0_10px_25px_rgba(0,191,165,0.35)] hover:shadow-[0_15px_30px_rgba(0,191,165,0.5)] transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-[#00c9a7] to-[#00a896] disabled:opacity-50 cursor-pointer mb-5"
                  >
                    {loading ? (
                      <span>Verifying OTP…</span>
                    ) : (
                      <>
                        <span className="text-lg leading-none font-bold">&rarr;</span>
                        <span>Verify OTP</span>
                      </>
                    )}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setRequiresOtp(false);
                        setError('');
                        setInfoMsg('');
                      }}
                      className="text-xs text-gray-500 hover:text-gray-800 font-semibold cursor-pointer transition hover:underline"
                    >
                      &larr; Back to Login
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
