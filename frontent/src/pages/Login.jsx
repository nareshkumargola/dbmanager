import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import AnimatedHero from '../components/AnimatedHero';
import useTheme from '../hooks/useTheme';
import BackupCodes from '../components/BackupCodes';
import './Login.css';

const FEATURES = [
  {
    title: 'Live Monitoring',
    desc: 'Real-time database health & performance',
    color: '#2563eb',
    soft: 'rgba(37, 99, 235, 0.14)',
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4M6.5 12l3-3 2.5 2 4-4.5 1.5 1.5" />
      </svg>
    ),
  },
  {
    title: 'Secure Queries',
    desc: 'Encrypted & safe execution',
    color: '#10b981',
    soft: 'rgba(16, 185, 129, 0.16)',
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
        <path d="M8.8 12.2l2.2 2.2 4.3-4.6" />
      </svg>
    ),
  },
  {
    title: 'Audit Logs',
    desc: 'Track all activities & changes',
    color: '#7c3aed',
    soft: 'rgba(124, 58, 237, 0.14)',
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="3" width="14" height="18" rx="2.5" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    title: 'Backups',
    desc: 'Automated & scheduled',
    color: '#f59e0b',
    soft: 'rgba(245, 158, 11, 0.18)',
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 18a4.5 4.5 0 01-.6-8.96A6 6 0 0117.8 8.2 4 4 0 0117 18" />
        <path d="M12 20v-8M9 14.5l3-3 3 3" />
      </svg>
    ),
  },
];

const LOGO_SRC = '/assets/allatone_logo_transparent.png';
const MARK_SRC = '/assets/allatone_mark.svg';

// Leaf positions along the wreath's arc, in degrees from its middle
const LAUREL_ANGLES = [-58, -39, -19, 0, 19, 39, 58];

function Laurel({ flipped = false }) {
  return (
    <svg className={`login-laurel${flipped ? ' is-flipped' : ''}`} viewBox="0 0 24 60" fill="currentColor" aria-hidden="true">
      {LAUREL_ANGLES.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x = 30 - 24 * Math.cos(rad);
        const y = 30 + 24 * Math.sin(rad);
        return (
          <g key={angle} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${-angle})`}>
            <ellipse cx="-3" cy="-3" rx="1.5" ry="4" transform="rotate(-38 -3 -3)" />
            <ellipse cx="3" cy="-3" rx="1.5" ry="4" transform="rotate(38 3 -3)" />
          </g>
        );
      })}
    </svg>
  );
}

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  // Set after a correct password when the account has MFA on
  const [mfaToken, setMfaToken] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [useBackupCode, setUseBackupCode] = useState(false);
  // First sign-in: the QR code to scan, then the finished login held back until codes are saved
  const [mfaSetup, setMfaSetup] = useState(null);
  const [finishedSetup, setFinishedSetup] = useState(null);
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputRefs = useRef([]);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { theme, setMode } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  // Esc and the browser's own controls can also leave full screen, so follow the event
  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = () => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen?.();
    request?.catch(() => {});
  };

  const finishLogin = (userData, token) => {
    const name = userData?.name?.trim() || userData?.email?.split('@')[0] || 'there';
    sessionStorage.setItem('welcomeUserName', name);
    login(userData, token);
    navigate(userData?.preferences?.defaultLanding || '/dashboard');
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Handle normal email/password login submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await API.post('/auth/login', form);
      if (res.data.requiresMfaSetup) {
        const setup = await API.post('/auth/mfa/login-setup', { mfaToken: res.data.mfaToken });
        setMfaSetup(setup.data);
        setMfaToken(res.data.mfaToken);
        setOtpDigits(['', '', '', '', '', '']);
      } else if (res.data.requiresMfa) {
        setMfaToken(res.data.mfaToken);
        setOtpDigits(['', '', '', '', '', '']);
        setBackupCode('');
        setUseBackupCode(false);
      } else {
        finishLogin(res.data.user, res.data.token);
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

  const backToPassword = () => {
    setMfaToken('');
    setForm((current) => ({ ...current, password: '' }));
    setOtpDigits(['', '', '', '', '', '']);
    setBackupCode('');
    setUseBackupCode(false);
    setMfaSetup(null);
    setError('');
  };

  // Second sign-in step: authenticator or backup code
  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    const code = useBackupCode ? backupCode.trim() : otpDigits.join('');
    setError('');
    setLoading(true);
    try {
      const res = await API.post('/auth/mfa/verify', { mfaToken, code });
      finishLogin(res.data.user, res.data.token);
    } catch (err) {
      const message = err.response?.data?.message || 'Could not verify the code. Please try again.';
      if (err.response?.data?.sessionExpired) backToPassword();
      setError(message);
      setOtpDigits(['', '', '', '', '', '']);
      setBackupCode('');
      if (inputRefs.current[0]) inputRefs.current[0].focus();
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await API.post('/auth/mfa/login-enable', { mfaToken, code: otpDigits.join('') });
      setFinishedSetup(res.data);
    } catch (err) {
      const message = err.response?.data?.message || 'Could not verify the code. Please try again.';
      if (err.response?.data?.sessionExpired) backToPassword();
      setError(message);
      setOtpDigits(['', '', '', '', '', '']);
      if (inputRefs.current[0]) inputRefs.current[0].focus();
    } finally {
      setLoading(false);
    }
  };

  const digitBoxes = (
    <div className="flex items-center justify-between gap-1.5 sm:gap-2">
      {otpDigits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => (inputRefs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          aria-label={`Digit ${idx + 1}`}
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={idx === 0 ? 6 : 1}
          value={digit}
          onChange={(e) => handleDigitChange(idx, e.target.value)}
          onKeyDown={(e) => handleDigitKeyDown(idx, e)}
          onPaste={handleOtpPaste}
          autoFocus={idx === 0}
          className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-extrabold font-mono rounded-xl border outline-none transition-all ${
            digit
              ? 'border-[#0d9da4] bg-teal-50/40 text-[#0b7f86] ring-2 ring-teal-100'
              : 'border-gray-200 bg-gray-50/60 text-gray-900 focus:border-[#0d9da4] focus:bg-white focus:ring-2 focus:ring-teal-100'
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className="login-page relative min-h-screen w-full overflow-hidden text-left">
      <div className="login-bg" aria-hidden="true" />
      <div className="login-bg-veil" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-screen lg:h-[100dvh] lg:min-h-0 max-w-[1520px] flex-col px-5 py-5 sm:px-10 lg:px-14 lg:py-[clamp(16px,3vh,32px)]">
        {/* Header */}
        <header className="flex shrink-0 items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={MARK_SRC} alt="" className="login-mark" draggable="false" />
            <div>
              <img src={LOGO_SRC} alt="Allatone" className="login-logo" draggable="false" />
              <div className="login-tagline mt-1.5 text-[10px] sm:text-[11px] uppercase">Database Monitoring System</div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-4 text-[15px]">
            {['Monitor', 'Secure', 'Manage', 'Always'].map((item, i) => (
              <span key={item} className="flex items-center gap-4">
                {i > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                <span className="login-nav-item">{item}</span>
              </span>
            ))}
          </nav>
            <div className="login-mode" role="group" aria-label="Color theme">
              <button type="button" className={theme === 'light' ? 'is-active' : ''} aria-pressed={theme === 'light'} aria-label="Light mode" title="Light mode" onClick={() => setMode('light')}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              </button>
              <button type="button" className={theme === 'dark' ? 'is-active' : ''} aria-pressed={theme === 'dark'} aria-label="Dark mode" title="Dark mode" onClick={() => setMode('dark')}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] items-center gap-8 py-5 lg:py-[clamp(8px,1.8vh,20px)] lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)] xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.1fr)_minmax(400px,450px)]">
          {/* Left: headline + features */}
          <section className="hidden lg:block">
            <h1 className="text-[length:clamp(34px,5.4vh,52px)] font-bold leading-[1.08] tracking-tight">
              Your Database
              <br />
              <span className="login-headline-our">Our </span>
              <span className="login-headline-priority">Priority</span>
            </h1>
            <p className="login-intro mt-[clamp(10px,2.2vh,24px)] max-w-[400px] text-[15px] leading-relaxed login-muted">
              A centralized administration portal to monitor live replication streams, execute secure queries, audit procedure logs, and manage system backups.
            </p>

            <ul className="mt-[clamp(12px,2.8vh,32px)] space-y-[clamp(2px,0.9vh,12px)] max-w-[400px]">
              {FEATURES.map((f) => (
                <li key={f.title} className="login-feature" style={{ '--c': f.color, '--soft': f.soft }}>
                  <span className="login-feature-icon">{f.icon}</span>
                  <span>
                    <span className="login-feature-title block text-[16px]">{f.title}</span>
                    <span className="login-feature-desc block text-[13px] mt-0.5">{f.desc}</span>
                  </span>
                  <svg className="login-feature-arrow" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </li>
              ))}
            </ul>

            <div className="login-cert">
              <Laurel />
              <div className="text-center">
                <div className="login-cert-title">CMMI</div>
                <div className="login-cert-sub">Level 3 Certified</div>
              </div>
              <Laurel flipped />
            </div>
          </section>

          {/* Center: animated illustration */}
          <section className="hidden xl:block">
            <AnimatedHero className="login-hero-size" />
          </section>

          {/* Right: sign-in card */}
          <section className="w-full max-w-[450px] mx-auto lg:mx-0 lg:justify-self-end">
      {!mfaToken ? (
        /* STEP 1: Sign In card */
        <div className="login-card w-full">
          <div className="flex items-center gap-3">
            <img src={MARK_SRC} alt="" className="login-mark" draggable="false" />
            <img src={LOGO_SRC} alt="Allatone" className="login-logo" draggable="false" />
          </div>
          <span className="login-badge mt-3 inline-block rounded-full px-4 py-1.5 text-[11px] sm:text-[12px] uppercase">
            Database Monitoring System
          </span>

          <h2 className="mt-[clamp(14px,3vh,32px)] text-[length:clamp(28px,3.8vh,36px)] font-bold tracking-tight login-ink">Sign In</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed login-muted">
            Access your database monitoring dashboard and keep your systems secure.
          </p>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-4 py-3 rounded-xl mt-6 font-semibold w-full">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-[clamp(14px,2.6vh,28px)] w-full">
            <label className="login-input-wrap">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3.5 6l8.5 7 8.5-7" />
              </svg>
              <input
                type="email"
                name="email"
                placeholder="Email Address"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </label>

            <label className="login-input-wrap mt-[clamp(10px,1.8vh,20px)]">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 018 0v3M12 14v2.5" />
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Password"
                value={form.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="login-eye hover:text-[#0ea5e9] transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.2 6.6C4 8 2.6 10.1 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1" />
                  </svg>
                ) : (
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </label>

            <div className="mt-3 flex justify-end">
              <Link to="/forgot-password" className="text-[14px] font-medium login-link hover:text-[#0ea5e9] hover:underline">
                Forgot password?
              </Link>
            </div>

            <button type="submit" disabled={loading} className="login-btn mt-[clamp(14px,2.6vh,28px)] flex w-full items-center justify-center gap-3 cursor-pointer disabled:opacity-60">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M3 12h12M11 8l4 4-4 4" />
              </svg>
              <span>{loading ? 'Signing in…' : 'Sign In'}</span>
            </button>
          </form>

          <div className="login-card-extra">
          <div className="my-[clamp(12px,2.4vh,28px)] flex items-center gap-4">
            <div className="h-px flex-1 login-rule" />
            <span className="text-[13px] font-medium login-muted">OR</span>
            <div className="h-px flex-1 login-rule" />
          </div>

          <div className="login-secure-row flex items-center gap-4 pl-1">
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" stroke="#12c9a8" strokeWidth="1.6" fill="rgba(18,201,168,0.08)" />
              <path d="M8.8 12.2l2.2 2.2 4.3-4.6" stroke="#0ea5e9" strokeWidth="1.8" />
            </svg>
            <div>
              <div className="text-[15px] font-semibold text-[#10b98f]">Secure Access</div>
              <div className="text-[13px] login-muted">Your data is protected and encrypted</div>
            </div>
          </div>
          </div>
        </div>
      ) : finishedSetup ? (
        /* First sign-in: backup codes, shown once before the app opens */
        <div className="login-card login-card-scroll w-full text-left">
          <h2 className="text-2xl font-bold login-ink mb-1 tracking-tight">MFA is on</h2>
          <p className="text-[14px] login-muted mb-4">One last step before you continue.</p>
          <BackupCodes
            codes={finishedSetup.backupCodes}
            doneLabel="Continue"
            onDone={() => finishLogin(finishedSetup.user, finishedSetup.token)}
          />
        </div>
      ) : mfaSetup ? (
        /* First sign-in: set up the authenticator app */
        <div className="login-card login-card-scroll w-full text-left">
          <h2 className="text-2xl font-bold login-ink mb-1 tracking-tight">Secure your account</h2>
          <p className="text-[14px] login-muted mb-4 leading-relaxed">
            Two-step sign-in is required to continue. You will need an app such as Google Authenticator or Microsoft Authenticator.
          </p>

          {error && (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl mb-4 font-semibold">
              {error}
            </div>
          )}

          <p className="text-[13px] font-semibold login-ink mb-2">1. Scan this QR code in the app</p>
          <img src={mfaSetup.qrCode} alt="QR code to scan with your authenticator app" className="login-setup-qr" width="150" height="150" />
          <p className="mt-2 text-[12px] login-muted">Can't scan it? Enter this key by hand:</p>
          <code className="login-setup-key">{mfaSetup.secret}</code>

          <p className="mt-4 text-[13px] font-semibold login-ink mb-2">2. Enter the 6-digit code the app shows</p>
          <form onSubmit={handleSetupSubmit}>
            {digitBoxes}
            <button
              type="submit"
              disabled={loading || otpDigits.join('').length !== 6}
              className="login-btn mt-4 flex w-full items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Verifying…' : 'Turn on and continue'}
            </button>
          </form>
          <div className="mt-4 text-[14px] text-right">
            <button type="button" onClick={backToPassword} className="font-medium login-muted hover:underline cursor-pointer">
              Back to sign in
            </button>
          </div>
        </div>
      ) : (
        /* STEP 2: Authenticator code */
        <div className="login-card w-full text-left">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
            <img src={MARK_SRC} alt="" className="login-mark is-small" draggable="false" />
            <img src={LOGO_SRC} className="h-5 w-auto object-contain" alt="Allatone" draggable="false" />
          </div>

          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#0d9da4] mb-5">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold login-ink mb-1 tracking-tight">Two-step verification</h2>
          <p className="text-[14px] login-muted mb-6 leading-relaxed">
            {useBackupCode ? 'Enter one of your saved backup codes. Each code works once.' : 'Enter the 6-digit code from your authenticator app.'}
          </p>

          {error && (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-600 text-xs px-3.5 py-2.5 rounded-xl mb-5 font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleMfaSubmit}>
            {useBackupCode ? (
              <label className="login-input-wrap mb-6">
                <input
                  type="text"
                  aria-label="Backup code"
                  placeholder="XXXXX-XXXXX"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  required
                />
              </label>
            ) : (
              <div className="mb-6">{digitBoxes}</div>
            )}

            <button
              type="submit"
              disabled={loading || (useBackupCode ? !backupCode.trim() : otpDigits.join('').length !== 6)}
              className="login-btn flex w-full items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Verifying…' : 'Verify and sign in'}
            </button>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[14px]">
              <button
                type="button"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setError('');
                }}
                className="font-medium login-link hover:underline cursor-pointer"
              >
                {useBackupCode ? 'Use authenticator app' : 'Use a backup code'}
              </button>
              <button type="button" onClick={backToPassword} className="font-medium login-muted hover:underline cursor-pointer">
                Back to sign in
              </button>
            </div>
          </form>
        </div>
      )}
          </section>
        </main>

        {/* Footer */}
        <footer className="grid shrink-0 items-center justify-items-center gap-3 text-[13px] login-muted lg:grid-cols-[1fr_auto_1fr] lg:justify-items-stretch">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 lg:justify-start">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#1d6fe0">
            <path d="M12 2l8 3.2v6c0 5-3.4 9-8 10.3C7.4 20.2 4 16.2 4 11.2v-6L12 2z" />
            <path d="M8.6 12l2.4 2.4 4.4-4.6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-semibold login-ink">Allatone DMS</span>
          <span className="h-4 w-px login-rule" />
          <span>Built for a smarter and safer tomorrow</span>
        </div>
          <div className="login-browser-note">
            <span>Best viewed in <strong>Google Chrome</strong></span>
            <span className="login-browser-sep" aria-hidden="true" />
            <button type="button" onClick={toggleFullscreen}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={isFullscreen ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} />
              </svg>
              {isFullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}