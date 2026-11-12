import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Toast from '../components/Toast';
import MfaSettings from '../components/MfaSettings';
import useTheme from '../hooks/useTheme';
import { FONT_SIZES, applyFontSize } from '../utils/fontSize';
import './Profile.css';

const SESSION_TIMEOUT_MINUTES = Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES ?? 720);

const PERMISSION_LABELS = {
  query: 'Run Queries',
  history: 'Query History',
  slowQuery: 'Slow Queries',
  monitor: 'Monitoring',
  binlog: 'Binlog / Log Monitor',
  auditLogs: 'Audit Logs',
  backup: 'Backup & Restore',
  connections: 'Manage Connections',
  userManagement: 'User Management',
};

const SECTIONS = [
  { id: 'overview', label: 'Overview', color: '#2563eb', description: 'Your access and recent activity.', icon: <path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z" /> },
  { id: 'edit', label: 'Edit Profile', color: '#7c3aed', description: 'Your personal details.', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></> },
  { id: 'security', label: 'Security', color: '#e11d48', description: 'Your password and session.', icon: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></> },
  { id: 'settings', label: 'Settings', color: '#d97706', description: 'How the app looks and opens for you.', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></> },
];
const SECTION_IDS = SECTIONS.map((section) => section.id);

const Icon = ({ children, className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const timeAgo = (value) => {
  if (!value) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} day${days === 1 ? '' : 's'} ago` : formatDate(value);
};

// Password strength: one point each for length, mixed case, number, symbol
const getPasswordChecks = (password) => [
  { label: 'At least 8 characters', ok: password.length >= 8 },
  { label: 'Upper & lower case letters', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
  { label: 'At least one number', ok: /\d/.test(password) },
  { label: 'At least one symbol', ok: /[^A-Za-z0-9]/.test(password) },
];
const formFromProfile = (profile) => ({
  name: profile?.name || '',
  jobTitle: profile?.jobTitle || '',
  phone: profile?.phone || '',
  bio: profile?.bio || '',
});

const STRENGTH_COLORS = ['#e2e8f0', '#e11d48', '#f59e0b', '#0ea5e9', '#0d9488'];
const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

export default function Profile() {
  const { user, logout, loading, updateUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  // All sections live on one page; ?tab= (used by the navbar's Settings link) scrolls to one
  const requestedSection = SECTION_IDS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const [activeSection, setActiveSection] = useState(requestedSection);
  // After a jump, keep that section highlighted until the person scrolls themselves.
  // A short last section can't reach the top of the screen, so position alone would mislabel it.
  const pinnedSection = useRef(null);

  const scrollToSection = useCallback((id) => {
    pinnedSection.current = id;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.classList.contains('reduce-motion');
    const behavior = reduceMotion ? 'auto' : 'smooth';
    if (id === SECTION_IDS[0]) {
      window.scrollTo({ top: 0, behavior });
      return;
    }
    document.getElementById(`pf-section-${id}`)?.scrollIntoView({ behavior, block: 'start' });
  }, []);

  const goToSection = (id) => {
    setActiveSection(id);
    scrollToSection(id);
    setSearchParams(id === 'overview' ? {} : { tab: id }, { replace: true });
  };

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(formFromProfile(null));
  const [connectionCount, setConnectionCount] = useState(null);
  const [history, setHistory] = useState(null);
  const [toast, setToast] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);

  const isAdmin = user?.role === 'admin';
  const canSeeHistory = isAdmin || Boolean(user?.permissions?.history);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading, navigate]);

  // Load the full profile (job title, last sign-in, preferences...) plus overview stats
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    API.get('/auth/profile')
      .then((res) => {
        if (cancelled) return;
        setProfile(res.data.user);
        setForm(formFromProfile(res.data.user));
      })
      .catch((err) => console.error('Failed to load profile:', err));
    API.get('/connections')
      .then((res) => { if (!cancelled) setConnectionCount((res.data.connections || []).length); })
      .catch(() => { if (!cancelled) setConnectionCount(0); });
    if (canSeeHistory) {
      API.get('/history')
        .then((res) => { if (!cancelled) setHistory(res.data.history || []); })
        .catch(() => { if (!cancelled) setHistory([]); });
    }
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?._id, canSeeHistory]); // eslint-disable-line react-hooks/exhaustive-deps


  const me = profile || user || {};
  const displayName = me.name || 'User';
  const initials = displayName.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
  const profileFields = [
    { label: 'name', filled: me.name },
    { label: 'job title', filled: me.jobTitle },
    { label: 'phone', filled: me.phone },
    { label: 'bio', filled: me.bio },
  ];
  const missingFields = profileFields.filter((field) => !field.filled).map((field) => field.label);
  const completion = Math.round(((profileFields.length - missingFields.length) / profileFields.length) * 100);
  const permissionEntries = Object.entries(PERMISSION_LABELS).map(([key, label]) => ({
    key,
    label,
    on: isAdmin || Boolean(me.permissions?.[key]),
  }));
  const enabledPermissions = permissionEntries.filter((perm) => perm.on).length;
  const successRate = history && history.length
    ? Math.round((history.filter((item) => item.status === 'success').length / history.length) * 100)
    : null;

  // ---------- Edit profile ----------
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);

  const profileDirty = profile && (
    form.name !== (profile.name || '') ||
    form.jobTitle !== (profile.jobTitle || '') ||
    form.phone !== (profile.phone || '') ||
    form.bio !== (profile.bio || '')
  );

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const res = await API.put('/auth/profile', form);
      setProfile(res.data.user);
      setForm(formFromProfile(res.data.user));
      updateUser({ name: res.data.user.name });
      setProfileMessage({ type: 'success', text: 'Your profile has been updated.' });
    } catch (err) {
      setProfileMessage({ type: 'error', text: err.response?.data?.message || 'Could not update your profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  // ---------- Security ----------
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, next: false, confirm: false });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  const passwordChecks = useMemo(() => getPasswordChecks(passwords.next), [passwords.next]);
  const strength = passwords.next ? passwordChecks.filter((check) => check.ok).length : 0;
  const passwordsMatch = passwords.next && passwords.next === passwords.confirm;
  const canSubmitPassword = passwords.current && passwordChecks[0].ok && passwordsMatch && !savingPassword;

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordMessage(null);
    try {
      const res = await API.put('/auth/change-password', {
        currentPassword: passwords.current,
        newPassword: passwords.next,
      });
      // The old token stopped working with this change
      localStorage.setItem('token', res.data.token);
      setPasswords({ current: '', next: '', confirm: '' });
      setPasswordMessage({ type: 'success', text: 'Password changed. Any other devices have been signed out.' });
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err.response?.data?.message || 'Could not change your password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  // ---------- Settings ----------
  const preferences = {
    defaultLanding: '/dashboard',
    sidebarOpenByDefault: false,
    reduceMotion: false,
    fontSize: 'default',
    ...(user?.preferences || {}),
    ...(profile?.preferences || {}),
  };
  const [savingPreference, setSavingPreference] = useState(null);

  // Returns true when the setting was saved
  const savePreference = async (key, value) => {
    setSavingPreference(key);
    try {
      const res = await API.put('/auth/preferences', { [key]: value });
      setProfile((current) => (current ? { ...current, preferences: res.data.user.preferences } : res.data.user));
      updateUser({ preferences: res.data.user.preferences });
      setToast({ message: 'Settings saved', type: 'success' });
      return true;
    } catch (err) {
      setToast({ message: err.response?.data?.message || 'Could not save settings', type: 'error' });
      return false;
    } finally {
      setSavingPreference(null);
    }
  };

  // The new size shows at once, and goes back if it can't be saved
  const chooseFontSize = async (size) => {
    if (size === preferences.fontSize || savingPreference === 'fontSize') return;
    const previous = preferences.fontSize;
    applyFontSize(size);
    if (!(await savePreference('fontSize', size))) applyFontSize(previous);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const copyAccountId = async () => {
    try {
      await navigator.clipboard.writeText(String(me._id || me.id || ''));
      setToast({ message: 'Account ID copied', type: 'success' });
    } catch {
      setToast({ message: 'Could not copy the Account ID', type: 'error' });
    }
  };

  // Follow a ?tab= link, including one clicked in the navbar while already on this page
  useEffect(() => {
    if (loading) return undefined;
    const frame = requestAnimationFrame(() => {
      setActiveSection(requestedSection);
      scrollToSection(requestedSection);
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, requestedSection, scrollToSection]);

  // Highlight the section being read
  useEffect(() => {
    if (loading) return undefined;
    const update = () => {
      if (pinnedSection.current) return;
      let current = SECTION_IDS[0];
      SECTION_IDS.forEach((id) => {
        const element = document.getElementById(`pf-section-${id}`);
        if (element && element.getBoundingClientRect().top <= 140) current = id;
      });
      setActiveSection(current);
    };
    const release = () => {
      pinnedSection.current = null;
    };
    const userScrollEvents = ['wheel', 'touchmove', 'keydown'];
    window.addEventListener('scroll', update, { passive: true });
    userScrollEvents.forEach((name) => window.addEventListener(name, release, { passive: true }));
    return () => {
      window.removeEventListener('scroll', update);
      userScrollEvents.forEach((name) => window.removeEventListener(name, release));
    };
  }, [loading]);

  if (loading) {
    return (
      <div className="pf-page min-h-screen flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    );
  }

  const renderPasswordField = (key, label, autoComplete) => (
    <div>
      <label className="pf-label" htmlFor={`pf-${key}`}>{label}</label>
      <div className="pf-input-wrap">
        <input
          id={`pf-${key}`}
          type={showPasswords[key] ? 'text' : 'password'}
          className="pf-input"
          value={passwords[key]}
          onChange={(e) => setPasswords({ ...passwords, [key]: e.target.value })}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="pf-eye"
          onClick={() => setShowPasswords({ ...showPasswords, [key]: !showPasswords[key] })}
          aria-label={showPasswords[key] ? `Hide ${label}` : `Show ${label}`}
        >
          {showPasswords[key] ? (
            <Icon><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.2 6.6C4 8 2.6 10.1 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1" /></Icon>
          ) : (
            <Icon><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>
          )}
        </button>
      </div>
    </div>
  );

  const sectionHeading = (id) => {
    const section = SECTIONS.find((item) => item.id === id);
    return (
      <div className="pf-section-head">
        <span className="pf-section-icon" style={{ '--tone': section.color }}><Icon className="w-5 h-5">{section.icon}</Icon></span>
        <div>
          <h2>{section.label}</h2>
          <p>{section.description}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="pf-page min-h-screen">
      <Navbar backTo="/dashboard" backText="Dashboard" />
      {toast && <Toast toast={toast} onClose={closeToast} placement="top-right" />}

      <div className="pf-layout">
        <aside className="pf-side">
          {/* Identity */}
          <div className="pf-card pf-identity">
            <div className="pf-identity-banner" aria-hidden="true" />
            <div className="pf-identity-body">
              <div className="pf-avatar">{initials}</div>
              <h1 title={displayName}>{displayName}</h1>
              <p className="pf-identity-sub" title={me.email}>{me.jobTitle || me.email}</p>
              {me.jobTitle && <p className="pf-identity-mail" title={me.email}>{me.email}</p>}
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <span className="pf-badge">{me.role || 'user'}</span>
                <span className="pf-badge">{me.accessMode === 'readwrite' ? 'Read & Write' : 'Read Only'}</span>
              </div>
              {me.bio && <p className="pf-identity-bio">{me.bio}</p>}

              <div className="pf-completion">
                <div className="flex items-center justify-between gap-2">
                  <span>Profile completion</span>
                  <b>{completion}%</b>
                </div>
                <div className="pf-completion-track" role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
                  <span style={{ width: `${completion}%` }} />
                </div>
                {missingFields.length > 0 && (
                  <button type="button" className="pf-completion-link" onClick={() => goToSection('edit')}>
                    Add {missingFields.join(', ')}
                  </button>
                )}
              </div>

              <dl className="pf-identity-meta">
                <div><dt>Member since</dt><dd>{formatDate(me.createdAt)}</dd></div>
                <div><dt>Last sign-in</dt><dd>{me.lastLoginAt ? timeAgo(me.lastLoginAt) : '—'}</dd></div>
                <div>
                  <dt>Account ID</dt>
                  <dd>
                    <button type="button" onClick={copyAccountId} className="pf-id-btn" title="Copy Account ID">
                      <span className="font-mono">{String(me._id || me.id || '').slice(-8)}</span>
                      <Icon className="w-3.5 h-3.5"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></Icon>
                    </button>
                  </dd>
                </div>
              </dl>

              <button type="button" className="pf-btn-outline pf-btn-danger w-full mt-4" onClick={handleLogout}>
                <Icon><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></Icon>
                Sign Out
              </button>
            </div>
          </div>

          {/* Jump to a section */}
          <nav className="pf-card pf-section-nav" aria-label="Profile sections">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => goToSection(section.id)}
                aria-current={activeSection === section.id ? 'true' : undefined}
                className={activeSection === section.id ? 'is-active' : ''}
                style={{ '--tone': section.color }}
              >
                <span className="pf-section-nav-icon"><Icon>{section.icon}</Icon></span>
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="pf-sections">
          <section id="pf-section-overview" className="pf-section">
            {sectionHeading('overview')}
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="pf-card pf-stat">
                <span className="pf-stat-icon" style={{ '--tone': '#2563eb' }}>
                  <Icon className="w-5 h-5"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /></Icon>
                </span>
                <div>
                  <div className="pf-stat-value">{connectionCount ?? '—'}</div>
                  <div className="pf-stat-label">Connections you can access</div>
                </div>
              </div>
              <div className="pf-card pf-stat">
                <span className="pf-stat-icon" style={{ '--tone': '#7c3aed' }}>
                  <Icon className="w-5 h-5"><path d="M7 9l3 3-3 3M13 15h4" /><rect x="3" y="4" width="18" height="16" rx="2" /></Icon>
                </span>
                <div>
                  <div className="pf-stat-value">{canSeeHistory ? (history ? history.length : '—') : '—'}</div>
                  <div className="pf-stat-label">
                    Recent queries{successRate !== null ? ` · ${successRate}% successful` : ''}
                  </div>
                </div>
              </div>
              <div className="pf-card pf-stat">
                <span className="pf-stat-icon" style={{ '--tone': '#059669' }}>
                  <Icon className="w-5 h-5"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M8.8 12.2l2.2 2.2 4.3-4.6" /></Icon>
                </span>
                <div>
                  <div className="pf-stat-value">{enabledPermissions}<span className="text-[15px] text-slate-400 font-semibold"> / {permissionEntries.length}</span></div>
                  <div className="pf-stat-label">Permissions enabled</div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-5">
              <div className="pf-card p-5 lg:col-span-2">
                <h3 className="pf-card-title">Your permissions</h3>
                <p className="pf-card-sub">
                  {isAdmin ? 'Admins have every permission.' : 'Ask an admin if you need more access.'}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {permissionEntries.map((perm) => (
                    <div key={perm.key} className={`pf-perm ${perm.on ? 'is-on' : 'is-off'}`}>
                      <span className="pf-perm-dot">
                        {perm.on ? (
                          <Icon className="w-3.5 h-3.5"><path d="M20 6L9 17l-5-5" /></Icon>
                        ) : (
                          <Icon className="w-3.5 h-3.5"><path d="M18 6L6 18M6 6l12 12" /></Icon>
                        )}
                      </span>
                      {perm.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pf-card p-5 lg:col-span-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="pf-card-title">Recent activity</h3>
                    <p className="pf-card-sub">Your latest queries</p>
                  </div>
                  {canSeeHistory && (
                    <button type="button" className="pf-btn-outline !h-9" onClick={() => navigate('/history')}>
                      View all
                    </button>
                  )}
                </div>
                <div className="pf-activity-list mt-2">
                  {!canSeeHistory ? (
                    <p className="py-8 text-center text-[13px] text-slate-400">Query history isn't enabled for your account.</p>
                  ) : history === null ? (
                    <p className="py-8 text-center text-[13px] text-slate-400">Loading activity...</p>
                  ) : history.length === 0 ? (
                    <p className="py-8 text-center text-[13px] text-slate-400">No queries yet. Your recent queries will show up here.</p>
                  ) : (
                    history.slice(0, 6).map((item) => (
                      <div key={item._id} className="pf-activity">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.status === 'success' ? 'bg-teal-600' : 'bg-rose-500'}`}
                          title={item.status === 'success' ? 'Succeeded' : 'Failed'}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="pf-activity-query" title={item.query}>{item.query}</p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {item.database ? `${item.database} · ` : ''}
                            {item.executionTime ? `${item.executionTime} ms · ` : ''}
                            {timeAgo(item.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
          </section>

          <section id="pf-section-edit" className="pf-section">
            {sectionHeading('edit')}
          <form onSubmit={handleSaveProfile} className="pf-card p-5 sm:p-6">
            <h3 className="pf-card-title">Personal information</h3>
            <p className="pf-card-sub">This is shown to other people in your workspace.</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="pf-label" htmlFor="pf-name">Full name</label>
                <input id="pf-name" className="pf-input" value={form.name} maxLength={60}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="pf-label" htmlFor="pf-title">Job title</label>
                <input id="pf-title" className="pf-input" value={form.jobTitle} maxLength={80} placeholder="e.g. Database Administrator"
                  onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
              </div>
              <div>
                <label className="pf-label" htmlFor="pf-email">Email</label>
                <input id="pf-email" className="pf-input" value={me.email || ''} disabled />
                <p className="pf-hint">Contact an admin to change your email.</p>
              </div>
              <div>
                <label className="pf-label" htmlFor="pf-phone">Phone</label>
                <input id="pf-phone" className="pf-input" value={form.phone} maxLength={30} placeholder="+91 98765 43210"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="pf-label" htmlFor="pf-bio">About you</label>
                <textarea id="pf-bio" className="pf-input" value={form.bio} maxLength={300} rows={3}
                  placeholder="A short note about your role or team"
                  onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                <p className="pf-hint text-right">{form.bio.length}/300</p>
              </div>
            </div>

            {profileMessage && (
              <div className={`pf-alert mt-4 ${profileMessage.type === 'error' ? 'is-error' : 'is-success'}`}>{profileMessage.text}</div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="pf-btn-outline" disabled={!profileDirty || savingProfile}
                onClick={() => setForm(formFromProfile(profile))}>
                Reset
              </button>
              <button type="submit" className="pf-btn" disabled={!profileDirty || savingProfile}>
                {savingProfile ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
          </section>

          <section id="pf-section-security" className="pf-section">
            {sectionHeading('security')}
            <div className="mb-5"><MfaSettings /></div>
          <div className="grid gap-5 lg:grid-cols-5">
            <form onSubmit={handleChangePassword} className="pf-card p-5 sm:p-6 lg:col-span-3">
              <h3 className="pf-card-title">Change password</h3>
              <p className="pf-card-sub">Enter your current password, then choose a new one.</p>

              <div className="mt-5 space-y-4">
                {renderPasswordField('current', 'Current password', 'current-password')}
                <div>
                  {renderPasswordField('next', 'New password', 'new-password')}
                  {passwords.next && (
                    <>
                      <div className="pf-strength">
                        {[1, 2, 3, 4].map((level) => (
                          <span key={level} style={{ background: strength >= level ? STRENGTH_COLORS[strength] : undefined }} />
                        ))}
                      </div>
                      <p className="mt-1 text-[11.5px] font-semibold" style={{ color: STRENGTH_COLORS[strength] }}>
                        {STRENGTH_LABELS[strength]}
                      </p>
                    </>
                  )}
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {passwordChecks.map((check) => (
                      <span key={check.label} className={`pf-rule ${check.ok ? 'is-ok' : ''}`}>
                        <Icon className="w-3.5 h-3.5">{check.ok ? <path d="M20 6L9 17l-5-5" /> : <circle cx="12" cy="12" r="4" />}</Icon>
                        {check.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  {renderPasswordField('confirm', 'Confirm new password', 'new-password')}
                  {passwords.confirm && !passwordsMatch && (
                    <p className="mt-1 text-[11.5px] text-rose-600">Passwords don't match.</p>
                  )}
                </div>
              </div>

              {passwordMessage && (
                <div className={`pf-alert mt-4 ${passwordMessage.type === 'error' ? 'is-error' : 'is-success'}`}>{passwordMessage.text}</div>
              )}

              <div className="mt-5 flex justify-end">
                <button type="submit" className="pf-btn" disabled={!canSubmitPassword}>
                  {savingPassword ? 'Updating...' : 'Update password'}
                </button>
              </div>
            </form>

            <div className="space-y-5 lg:col-span-2">
              <div className="pf-card p-5">
                <h3 className="pf-card-title">Session</h3>
                <p className="pf-card-sub">How your sign-in is kept safe.</p>
                <div className="mt-4 space-y-3 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Last sign-in</span>
                    <b className="font-semibold">{me.lastLoginAt ? new Date(me.lastLoginAt).toLocaleString() : '—'}</b>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Auto sign-out after</span>
                    <b className="font-semibold">{SESSION_TIMEOUT_MINUTES} min of inactivity</b>
                  </div>
                </div>
                <button type="button" className="pf-btn-outline pf-btn-danger w-full mt-5" onClick={handleLogout}>
                  <Icon><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></Icon>
                  Sign out of this device
                </button>
              </div>
              <div className="pf-card p-5">
                <h3 className="pf-card-title">Forgot your password?</h3>
                <p className="pf-card-sub">Sign out and use "Forgot password" on the sign-in page to get a reset link by email.</p>
              </div>
            </div>
          </div>
          </section>

          <section id="pf-section-settings" className="pf-section">
            {sectionHeading('settings')}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="pf-card p-5 sm:p-6">
              <h3 className="pf-card-title">Appearance</h3>
              <p className="pf-card-sub">Theme is saved on this device. Font size and animations go with your account.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  { id: 'light', label: 'Light', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> },
                  { id: 'dark', label: 'Dark', icon: <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /> },
                  { id: 'system', label: 'System', icon: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></> },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setThemeMode(option.id)}
                    className={`pf-option ${themeMode === option.id ? 'is-active' : ''}`}
                    aria-pressed={themeMode === option.id}
                  >
                    <span className="pf-option-icon"><Icon>{option.icon}</Icon></span>
                    {option.label}
                  </button>
                ))}
              </div>

              <p className="mt-5 text-[13px] font-semibold" id="pf-font-size-label">Font size</p>
              <p className="text-[12px] text-slate-500">Makes text bigger or smaller on every page.</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-labelledby="pf-font-size-label">
                {FONT_SIZES.map((size) => {
                  const active = preferences.fontSize === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={savingPreference === 'fontSize'}
                      onClick={() => chooseFontSize(size.id)}
                      className={`pf-option pf-font-option ${active ? 'is-active' : ''}`}
                    >
                      {/* Fixed px so each sample shows its own size, whatever size is in use now */}
                      <span className="pf-font-sample" style={{ fontSize: `${(20 * size.percent) / 100}px` }} aria-hidden="true">Aa</span>
                      <span>{size.label}</span>
                      <span className="pf-font-percent">{size.percent}%</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 pf-setting-row">
                <div>
                  <p className="text-[13px] font-semibold">Reduce animations</p>
                  <p className="text-[12px] text-slate-500">Turn off floating, pulsing and sliding effects.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.reduceMotion}
                  aria-label="Reduce animations"
                  disabled={savingPreference === 'reduceMotion'}
                  onClick={() => savePreference('reduceMotion', !preferences.reduceMotion)}
                  className={`pf-switch ${preferences.reduceMotion ? 'is-on' : ''}`}
                />
              </div>
            </div>

            <div className="pf-card p-5 sm:p-6">
              <h3 className="pf-card-title">Workspace</h3>
              <p className="pf-card-sub">Saved to your account and used on every device.</p>

              <p className="mt-4 text-[13px] font-semibold">Open after sign-in</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  { id: '/dashboard', label: 'Dashboard', icon: <path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z" /> },
                  { id: '/connections', label: 'Connections', icon: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /></> },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={savingPreference === 'defaultLanding'}
                    onClick={() => option.id !== preferences.defaultLanding && savePreference('defaultLanding', option.id)}
                    className={`pf-option ${preferences.defaultLanding === option.id ? 'is-active' : ''}`}
                    aria-pressed={preferences.defaultLanding === option.id}
                  >
                    <span className="pf-option-icon"><Icon>{option.icon}</Icon></span>
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 pf-setting-row">
                <div>
                  <p className="text-[13px] font-semibold">Open dashboard sidebar on start</p>
                  <p className="text-[12px] text-slate-500">Otherwise it stays hidden until you click ☰.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.sidebarOpenByDefault}
                  aria-label="Open dashboard sidebar on start"
                  disabled={savingPreference === 'sidebarOpenByDefault'}
                  onClick={() => savePreference('sidebarOpenByDefault', !preferences.sidebarOpenByDefault)}
                  className={`pf-switch ${preferences.sidebarOpenByDefault ? 'is-on' : ''}`}
                />
              </div>
            </div>
          </div>
          </section>
        </main>
      </div>
    </div>
  );
}
