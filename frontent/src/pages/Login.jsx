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

  // Live Simulated Telemetry Data
  const [tpsCounter, setTpsCounter] = useState(2480);
  const [activeQueryIndex, setActiveQueryIndex] = useState(0);

  const liveQueries = [
    { type: 'INSERT', table: 'orders', latency: '0.6ms', status: 'COMMITTED', dir: 'up' },
    { type: 'SELECT', table: 'users_cache', latency: '0.3ms', status: 'FETCHED', dir: 'down' },
    { type: 'UPDATE', table: 'inventory_sync', latency: '1.1ms', status: 'SYNCED', dir: 'up' },
    { type: 'BINLOG', table: 'replication_wal', latency: '0.4ms', status: 'STREAMING', dir: 'down' },
    { type: 'EXPLAIN', table: 'transactions_idx', latency: '0.8ms', status: 'OPTIMAL', dir: 'up' },
  ];

  useEffect(() => {
    const tpsInterval = setInterval(() => {
      setTpsCounter(prev => Math.floor(2400 + Math.random() * 250));
      setActiveQueryIndex(prev => (prev + 1) % liveQueries.length);
    }, 2200);
    return () => clearInterval(tpsInterval);
  }, []);

  // 3D Mouseover Tilt state
  const [tilt, setTilt] = useState({ x: 0, y: 0, glareX: 50, glareY: 50, isHovered: false });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const inputRefs = useRef([]);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Window-level mouse parallax
  useEffect(() => {
    const handleWindowMouseMove = (e) => {
      const normX = (e.clientX / window.innerWidth - 0.5) * 2;
      const normY = (e.clientY / window.innerHeight - 0.5) * 2;
      setMousePos({ x: normX, y: normY });
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    return () => window.removeEventListener('mousemove', handleWindowMouseMove);
  }, []);

  // Card-specific 3D tilt calculations on mouseover
  const handleCardMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;

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

  // Mask Email for privacy
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
    <div 
      className="min-h-screen w-full relative overflow-hidden bg-[#090f17] text-left font-sans flex items-center justify-center select-none"
      style={{
        backgroundImage: "url('/login_3d_clean_bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* 3D Dynamic Ambient Cyber Grid Lines & Perspective Floor Glow */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(#00e5be_1px,transparent_1px)] [background-size:32px_32px]"
        style={{
          transform: `translate(${mousePos.x * 10}px, ${mousePos.y * 10}px)`,
        }}
      />

      {/* Vertical Data Streaming Light Beams (Upar-Niche Data Flow) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Stream 1 (Upward Stream) */}
        <div 
          className="absolute left-[18%] w-[2px] h-[350px] bg-gradient-to-t from-transparent via-[#00e5be] to-transparent opacity-75 blur-[0.5px] animate-pulse"
          style={{
            animation: 'streamUp 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            boxShadow: '0 0 15px #00e5be',
          }}
        />
        {/* Stream 2 (Downward Stream) */}
        <div 
          className="absolute left-[28%] w-[3px] h-[420px] bg-gradient-to-b from-transparent via-[#0d9da4] to-transparent opacity-85 blur-[0.5px]"
          style={{
            animation: 'streamDown 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            boxShadow: '0 0 20px #0d9da4',
          }}
        />
        {/* Stream 3 (Upward Stream near database) */}
        <div 
          className="absolute left-[38%] w-[2px] h-[300px] bg-gradient-to-t from-transparent via-[#38bdf8] to-transparent opacity-70 blur-[0.5px]"
          style={{
            animation: 'streamUp 4s cubic-bezier(0.4, 0, 0.2, 1) infinite 1s',
            boxShadow: '0 0 12px #38bdf8',
          }}
        />
        {/* Stream 4 (Downward Stream near cloud) */}
        <div 
          className="absolute left-[46%] w-[2.5px] h-[380px] bg-gradient-to-b from-transparent via-[#00e5be] to-transparent opacity-80 blur-[0.5px]"
          style={{
            animation: 'streamDown 3.5s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.5s',
            boxShadow: '0 0 18px #00e5be',
          }}
        />
      </div>

      {/* Dynamic Ambient Background Glows */}
      <div 
        className="absolute top-1/4 left-1/4 w-[550px] h-[550px] rounded-full bg-[#00e5be]/15 blur-[140px] pointer-events-none transition-transform duration-700 ease-out"
        style={{
          transform: `translate(${mousePos.x * 30}px, ${mousePos.y * 30}px)`,
        }}
      />
      <div 
        className="absolute bottom-1/4 right-1/4 w-[480px] h-[480px] rounded-full bg-[#0d9da4]/20 blur-[130px] pointer-events-none transition-transform duration-700 ease-out"
        style={{
          transform: `translate(${mousePos.x * -25}px, ${mousePos.y * -25}px)`,
        }}
      />

      {/* Main Responsive Layout Wrapper */}
      <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-12 lg:px-16 py-8 relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8 min-h-screen">
        
        {/* LEFT COLUMN: 3D Animated Database Telemetry & Live Streams */}
        <div 
          className="w-full lg:w-[54%] flex flex-col justify-between transition-transform duration-500 ease-out py-6"
          style={{
            transform: `translate3d(${mousePos.x * -12}px, ${mousePos.y * -8}px, 0)`,
          }}
        >
          {/* Header & Live Stream Status Pill */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#00e5be]/10 border border-[#00e5be]/30 backdrop-blur-md mb-4 shadow-[0_0_20px_rgba(0,229,190,0.25)]">
              <span className="w-2 h-2 rounded-full bg-[#00e5be] animate-ping" />
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#00e5be]">
                LIVE REPLICATION STREAM &bull; ACTIVE
              </span>
              <span className="text-gray-500 text-xs">|</span>
              <span className="text-white text-xs font-mono font-bold">{tpsCounter} TPS</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight flex items-baseline gap-1.5">
              <span>Allatone</span>
              <span className="text-[#00e5be] text-5xl leading-none animate-pulse">.</span>
            </h1>
            <p className="text-xs sm:text-sm font-extrabold uppercase tracking-[0.25em] text-teal-300/80 mt-1.5">
              ENTERPRISE DATABASE MONITORING &amp; MULTI-TAB STUDIO
            </p>
          </div>

          {/* 3D Animated Database Hub Centerpiece */}
          <div className="relative my-4 group">
            {/* Holographic Glowing Backdrop Aura */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#00e5be]/20 via-[#0d9da4]/20 to-transparent blur-3xl rounded-full -z-10 group-hover:scale-105 transition-all duration-700" />
            
            {/* Live Streaming Data Packets HUD Card (Upar / Niche Data Flow Animation) */}
            <div className="relative bg-[#0d1622]/85 border border-[#00e5be]/30 rounded-3xl p-5 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden">
              {/* Scanline Effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00e5be]/5 to-transparent h-12 w-full animate-scan pointer-events-none" />

              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800/80">
                <div className="flex items-center gap-2.5">
                  {/* Animated Rotating 3D Database Cylinder Icon */}
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00e5be] to-[#0d9da4] p-0.5 shadow-[0_0_20px_#00e5be]">
                    <div className="w-full h-full bg-[#090f17] rounded-[10px] flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#00e5be] animate-bounce" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 3.34 2 5v4c0 1.66 4.48 3 10 3s10-1.34 10-3V5c0-1.66-4.48-3-10-3zm0 2c4.42 0 8 .9 8 1.5S16.42 7 12 7 4 6.1 4 5.5 7.58 4 12 4zM2 11v4c0 1.66 4.48 3 10 3s10-1.34 10-3v-4c-2.05 1.05-5.67 1.7-10 1.7s-7.95-.65-10-1.7zm0 6v4c0 1.66 4.48 3 10 3s10-1.34 10-3v-4c-2.05 1.05-5.67 1.7-10 1.7s-7.95-.65-10-1.7z" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-white tracking-wide">
                      Real-Time Database I/O Pipeline
                    </h3>
                    <p className="text-[11px] text-gray-400 font-mono">
                      Bi-directional streaming &bull; Zero-Latency Sync
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#00e5be] bg-[#00e5be]/10 px-2 py-0.5 rounded-full border border-[#00e5be]/20">
                    LATENCY &lt; 0.9ms
                  </span>
                </div>
              </div>

              {/* Data Pipeline Streams Display */}
              <div className="space-y-2.5 font-mono text-xs">
                {liveQueries.map((q, idx) => {
                  const isActive = idx === activeQueryIndex;
                  return (
                    <div 
                      key={idx}
                      className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-between border ${
                        isActive 
                          ? 'bg-[#00e5be]/15 border-[#00e5be]/50 shadow-[0_0_15px_rgba(0,229,190,0.2)] scale-[1.01]' 
                          : 'bg-[#131f2f]/60 border-gray-800/80 text-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`text-sm ${q.dir === 'up' ? 'text-[#00e5be]' : 'text-[#38bdf8]'}`}>
                          {q.dir === 'up' ? '▲' : '▼'}
                        </span>
                        <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                          q.type === 'INSERT' ? 'bg-emerald-500/20 text-emerald-300' :
                          q.type === 'SELECT' ? 'bg-blue-500/20 text-blue-300' :
                          q.type === 'UPDATE' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-teal-500/20 text-teal-300'
                        }`}>
                          {q.type}
                        </span>
                        <span className="text-gray-200 font-medium truncate max-w-[180px] sm:max-w-[240px]">
                          {q.table}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] text-gray-400">{q.latency}</span>
                        <span className={`text-[10px] font-bold ${isActive ? 'text-[#00e5be]' : 'text-gray-500'}`}>
                          {q.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live Metric Progress Counters */}
              <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-gray-800/80 text-center">
                <div className="p-2 rounded-xl bg-[#090f17]/70">
                  <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wider">Sync Health</p>
                  <p className="text-sm font-extrabold text-[#00e5be] font-mono mt-0.5">99.99%</p>
                </div>
                <div className="p-2 rounded-xl bg-[#090f17]/70">
                  <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wider">Throughput</p>
                  <p className="text-sm font-extrabold text-white font-mono mt-0.5">3.8 GB/s</p>
                </div>
                <div className="p-2 rounded-xl bg-[#090f17]/70">
                  <p className="text-[10px] text-gray-400 font-sans uppercase tracking-wider">Failover SLA</p>
                  <p className="text-sm font-extrabold text-[#38bdf8] font-mono mt-0.5">&lt; 3.0s</p>
                </div>
              </div>
            </div>
          </div>

          {/* Database Engine Support Matrix */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-400 text-[11px] font-bold uppercase tracking-wider mr-1">
              Supported Engines:
            </span>
            {[
              { label: 'MySQL 8.4', icon: '🐬' },
              { label: 'PostgreSQL 16', icon: '🐘' },
              { label: 'MongoDB 7.0', icon: '🍃' },
              { label: 'Oracle 21c', icon: '🔴' }
            ].map((eng, idx) => (
              <span 
                key={idx}
                className="px-2.5 py-1 rounded-lg bg-[#111c2a]/80 border border-gray-700/60 text-gray-300 font-medium text-[11px] flex items-center gap-1.5 shadow-sm hover:border-[#00e5be]/50 transition-colors"
              >
                <span>{eng.icon}</span>
                <span>{eng.label}</span>
              </span>
            ))}
          </div>

          {/* Bottom Brand Punchline */}
          <div className="mt-6 flex items-start gap-3">
            <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-[#00e5be] to-[#0d9da4] shadow-[0_0_15px_#00e5be] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-white tracking-wide">
                Monitor &bull; Manage &bull; Keep It Running
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 font-normal">
                Real-time telemetry streams, slow-query audits, and automated snapshots for peak database reliability.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive 3D Login Card (BORDERLESS DESIGN) */}
        <div 
          className="w-full lg:w-[44%] flex items-center justify-center lg:justify-end my-6"
          style={{ perspective: '1200px' }}
        >
          <div
            ref={cardRef}
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
            className="w-full max-w-[430px] bg-white rounded-[32px] p-7 sm:p-9 relative overflow-hidden transition-all duration-200 ease-out select-text"
            style={{
              border: 'none',
              outline: 'none',
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale3d(${tilt.isHovered ? '1.02, 1.02, 1.02' : '1, 1, 1'})`,
              transformStyle: 'preserve-3d',
              boxShadow: tilt.isHovered 
                ? '0 30px 80px -15px rgba(0,0,0,0.55), 0 0 60px rgba(0, 229, 190, 0.4)' 
                : '0 20px 60px -15px rgba(0,0,0,0.45), 0 0 45px rgba(13, 157, 164, 0.3)',
            }}
          >
            {/* Dynamic 3D Glare Reflection on Mouseover */}
            <div 
              className="absolute inset-0 pointer-events-none transition-opacity duration-300 rounded-[32px]"
              style={{
                background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.05) 50%, transparent 80%)`,
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
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00e5be]/20 to-[#0d9da4]/30 flex items-center justify-center shadow-sm border-0">
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
                <p className="text-[12px] text-gray-500 leading-relaxed mb-6 font-normal">
                  A centralized administration portal to monitor live replication streams, execute secure queries, audit procedure logs, and manage system backups.
                </p>

                {error && (
                  <div className="bg-rose-50 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl mb-4 font-semibold border-0">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Email Address Field */}
                  <div className="bg-[#f1f5f9]/90 hover:bg-[#f1f5f9] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#00e5be]/40 rounded-2xl px-4 py-2.5 border-0 transition-all flex items-center gap-3">
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
                        className="w-full bg-transparent text-[13px] text-gray-900 placeholder-gray-400 outline-none border-0 font-medium truncate"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="bg-[#f1f5f9]/90 hover:bg-[#f1f5f9] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#00e5be]/40 rounded-2xl px-4 py-2.5 border-0 transition-all flex items-center gap-3">
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
                        className="w-full bg-transparent text-[13px] text-gray-900 placeholder-gray-400 outline-none border-0 font-medium"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:text-gray-600 transition p-1 cursor-pointer shrink-0 border-0 bg-transparent"
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
                    className="w-full py-3.5 px-6 rounded-full text-white font-bold text-sm shadow-[0_10px_25px_rgba(0,191,165,0.35)] hover:shadow-[0_15px_30px_rgba(0,191,165,0.5)] hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-[#00c9a7] to-[#00a896] disabled:opacity-60 cursor-pointer mt-3 border-0"
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
                <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-[#0d9da4] mb-4 shadow-sm border-0">
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
                  <div className="bg-teal-50 text-teal-800 text-xs px-3.5 py-2.5 rounded-xl mb-4 font-semibold flex items-center gap-2 border-0">
                    <span>✉️</span> {infoMsg}
                  </div>
                )}

                {error && (
                  <div className="bg-rose-50 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl mb-4 font-semibold border-0">
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
                        className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-extrabold font-mono rounded-xl outline-none transition-all shadow-sm border-0 ${
                          digit
                            ? 'bg-teal-50/80 text-[#0d9da4] ring-2 ring-[#00e5be]'
                            : 'bg-gray-100/90 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#00e5be]'
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
                      className={`font-bold transition-colors cursor-pointer border-0 bg-transparent ${
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
                    className="w-full py-3.5 px-6 rounded-full text-white font-bold text-sm shadow-[0_10px_25px_rgba(0,191,165,0.35)] hover:shadow-[0_15px_30px_rgba(0,191,165,0.5)] transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-[#00c9a7] to-[#00a896] disabled:opacity-50 cursor-pointer mb-5 border-0"
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
                      className="text-xs text-gray-500 hover:text-gray-800 font-semibold cursor-pointer transition hover:underline border-0 bg-transparent"
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

      {/* Embedded CSS Animations for Vertical Data Streams & Scanners */}
      <style>{`
        @keyframes streamUp {
          0% { transform: translateY(120vh); opacity: 0; }
          25% { opacity: 0.9; }
          75% { opacity: 0.9; }
          100% { transform: translateY(-120vh); opacity: 0; }
        }
        @keyframes streamDown {
          0% { transform: translateY(-120vh); opacity: 0; }
          25% { opacity: 0.9; }
          75% { opacity: 0.9; }
          100% { transform: translateY(120vh); opacity: 0; }
        }
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }
        .animate-scan {
          animation: scan 4s linear infinite;
        }
      `}</style>
    </div>
  );
}
