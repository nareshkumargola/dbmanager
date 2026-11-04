import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import useTheme from '../hooks/useTheme';
import useConnectionAlerts from '../hooks/useConnectionAlerts';
import './AppNavbar.css';

const NO_CONNECTIONS = [];

/**
 * The application-wide top navbar (menu, brand, alerts, theme, profile).
 *
 * Optional props let a page plug in its own data:
 * - onToggleSidebar / sidebarOpen: show the sidebar menu button
 * - backTo / backText / extraLeft: show a back link (and extra content) after the brand
 * - connections: the page's already-loaded connections (otherwise the navbar fetches them)
 * - alerts: { activeNotifications, loading, error } if the page already loads alerts
 */
export default function AppNavbar({
  onToggleSidebar,
  sidebarOpen,
  backTo,
  backText,
  extraLeft,
  connections: connectionsProp,
  alerts: alertsProp,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // Connections for alerts: from the page if provided, otherwise loaded here
  const [ownConnections, setOwnConnections] = useState(NO_CONNECTIONS);
  useEffect(() => {
    if (connectionsProp || !user) return undefined;
    let cancelled = false;
    API.get('/connections')
      .then((res) => {
        if (!cancelled) setOwnConnections(res.data.connections || NO_CONNECTIONS);
      })
      .catch((err) => console.error('Navbar: failed to load connections:', err));
    return () => {
      cancelled = true;
    };
  }, [connectionsProp, user]);
  const connections = connectionsProp || ownConnections;

  const ownAlerts = useConnectionAlerts(alertsProp ? NO_CONNECTIONS : connections);
  const { activeNotifications, loading: notificationsLoading, error: notificationsError } = alertsProp || ownAlerts;

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const notificationsRef = useRef(null);
  const userDropdownRef = useRef(null);

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setUserDropdownOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = user?.name && user.name.toLowerCase() !== 'vss' ? user.name : 'Vishal Shakyavanshi';
  const displayRole = user?.role || 'Admin';
  const userInitials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { label: 'My Profile', to: '/profile', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></> },
    { label: 'Settings', to: '/profile?tab=settings', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></> },
    { label: 'System Status', to: '/status', icon: <path d="M3 12h4l3-8 4 16 3-8h4" /> },
    { label: 'Help & Docs', to: '/help-docs', icon: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17h.01" /></> },
    { label: 'Legal & Policies', to: '/legal-policies', icon: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M9 12h6" /></> },
  ];

  return (
    <header className="an-navbar sticky top-0 z-40 px-4 sm:px-6 flex items-center gap-3 transition-colors duration-300">
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-expanded={sidebarOpen}
          className="an-icon-btn shrink-0"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Brand: logo with the product name underneath */}
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="an-brand shrink-0 cursor-pointer"
        aria-label="Allatone Database Monitoring System, go to dashboard"
      >
        <img src="/allatone_logo.jpg" alt="Allatone" className="an-logo" draggable="false" />
        <span className="an-tagline hidden sm:block">Database Monitoring System</span>
      </button>


      {/* Page context: back link and anything the page adds */}
      {(backTo || extraLeft) && (
        <div className="min-w-0 flex items-center gap-2.5 overflow-hidden">
          {backTo && (
            <button type="button" onClick={() => navigate(backTo)} className="an-back-btn shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
              <span className="hidden sm:inline">{backText || 'Back'}</span>
            </button>
          )}
          {extraLeft && <div className="an-extra min-w-0 truncate">{extraLeft}</div>}
        </div>
      )}

      {/* Right side: status, alerts, theme, profile */}
      <div className="ml-auto flex items-center gap-2.5 shrink-0">
        <div className="an-online-pill hidden xl:flex">
          <span className="an-live-dot text-emerald-500"></span>
          <div className="leading-tight">
            <p className="an-online-title text-[11.5px] font-bold leading-none">System Online</p>
            <p className="an-online-sub text-[9.5px] mt-0.5 leading-none">All services running</p>
          </div>
        </div>

        {/* Notification bell with live database alerts */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            aria-label={`Notifications${activeNotifications.length ? `, ${activeNotifications.length} active` : ''}`}
            aria-expanded={notificationsOpen}
            className="an-icon-btn an-bell"
          >
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {activeNotifications.length > 0 && (
              <span className="an-badge-pulse absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9.5px] font-bold flex items-center justify-center leading-none an-badge border-2">
                {activeNotifications.length > 99 ? '99+' : activeNotifications.length}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="an-dropdown absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[75vh] overflow-y-auto z-50 text-left">
              <div className="an-dropdown-head sticky top-0 border-b border-slate-100 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-slate-900">Notifications</h2>
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                    {activeNotifications.length} active
                  </span>
                </div>
              </div>

              <div className="p-3 space-y-3">
                {notificationsError && (
                  <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] text-red-700">
                    {notificationsError}
                  </p>
                )}

                {notificationsLoading ? (
                  <p className="py-5 text-center text-xs text-slate-500">Loading database alerts...</p>
                ) : activeNotifications.length === 0 ? (
                  !notificationsError && (
                    <div className="py-6 text-center">
                      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </div>
                      <p className="text-xs font-semibold text-slate-700">All clear</p>
                      <p className="text-[10.5px] text-slate-400">No active notifications</p>
                    </div>
                  )
                ) : (
                  <div className="space-y-2">
                    {activeNotifications.slice(0, 5).map((notification) => (
                      <button
                        key={notification._id}
                        type="button"
                        onClick={() => {
                          setNotificationsOpen(false);
                          navigate(`/connections/${notification.connection}/monitor?tab=alerts`);
                        }}
                        className={`w-full rounded-xl border-l-[3px] border px-3 py-2 text-left transition hover:translate-x-0.5 ${
                          notification.severity === 'critical'
                            ? 'border-red-100 border-l-red-500 bg-red-50/50 hover:bg-red-50'
                            : 'border-amber-100 border-l-amber-500 bg-amber-50/50 hover:bg-amber-50'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] font-bold text-slate-800">
                            {notification.connectionName} · {(notification.type || 'alert').replace(/_/g, ' ')}
                          </span>
                          <span className={`shrink-0 text-[9px] font-bold uppercase ${
                            notification.severity === 'critical' ? 'text-red-600' : 'text-amber-600'
                          }`}>
                            {notification.severity}
                          </span>
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-slate-600">
                          {notification.message}
                        </span>
                        <span className="mt-1 block text-[9px] text-slate-400">
                          {new Date(notification.createdAt).toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Light / dark switch */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          aria-pressed={theme === 'dark'}
          className={`an-theme-switch shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${theme === 'dark' ? 'is-dark' : ''}`}
          title="Toggle Light / Dark mode"
        >
          <span className="an-theme-knob">
            {theme === 'dark' ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" fill="currentColor" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            )}
          </span>
        </button>

        {/* Profile */}
        <div className="relative" ref={userDropdownRef}>
          <button
            type="button"
            onClick={() => setUserDropdownOpen((open) => !open)}
            aria-expanded={userDropdownOpen}
            className="an-profile-btn"
          >
            <span className="an-avatar">{userInitials}</span>
            <span className="hidden sm:block text-left leading-tight">
              <span className="an-user-name block text-xs font-bold leading-none">{displayName}</span>
              <span className="an-user-role block text-[10px] capitalize mt-1 leading-none">{displayRole}</span>
            </span>
            <svg className={`an-chevron hidden sm:block w-3.5 h-3.5 ${userDropdownOpen ? 'is-open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {userDropdownOpen && (
            <div className="an-dropdown absolute right-0 mt-2 w-60 p-2 z-50 text-slate-700">
              <div className="an-dropdown-user flex items-center gap-3 rounded-xl px-3 py-2.5 mb-1.5">
                <span className="an-avatar shrink-0">{userInitials}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-900 truncate">{displayName}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{user?.email || 'admin@allatone.io'}</span>
                </span>
              </div>
              {menuItems.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    navigate(item.to);
                  }}
                  className="an-menu-item"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {item.icon}
                  </svg>
                  {item.label}
                </button>
              ))}
              <div className="my-1.5 border-t border-slate-100"></div>
              <button type="button" onClick={handleLogout} className="an-menu-item is-danger">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
