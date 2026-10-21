import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNavbar } from '../context/NavbarContext';

export default function Navbar({ backTo, backText, extraLeft, variant = 'teal', isGlobal = false }) {
  const { setNavbarConfig } = useNavbar();

  // If rendered on a child page, behave as a layout configurator
  if (!isGlobal) {
    useEffect(() => {
      setNavbarConfig({
        backTo,
        backText,
        extraLeft,
        variant,
      });
    }, [backTo, backText, extraLeft, variant, setNavbarConfig]);

    return null;
  }

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Determine active nav item
  const currentPath = location.pathname;
  const searchParams = new URLSearchParams(location.search);
  const tabParam = searchParams.get('tab');

  const isUnifiedHealth = currentPath === '/dashboard' && !tabParam;
  const isAccessControl = currentPath === '/permissions';
  const isDataHub = currentPath === '/query' || currentPath.startsWith('/connections');
  const isAudit = tabParam === 'audit-logs' || currentPath === '/status';
  const isTeam = tabParam === 'users';
  const isSettings = currentPath === '/profile';

  return (
    <header
      style={{
        background: 'linear-gradient(90deg, #07313b 0%, #0a3d4a 20%, #0e525f 50%, #125f6e 80%, #0c4452 100%)',
      }}
      className="sticky top-0 z-50 w-full select-none shadow-lg border-b border-[#1b5f6e]/40 transition-colors"
    >
      <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-4">
        
        {/* Left Area: Logo & Back Button */}
        <div className="flex items-center gap-3 shrink-0">
          {backTo && (
            <button
              onClick={() => navigate(backTo)}
              className="text-xs flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-xl bg-[#11434f]/80 hover:bg-[#165664] text-[#48cae4] border border-[#236f7e] transition shadow-sm cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>{backText || 'Back'}</span>
            </button>
          )}

          {extraLeft && (
            <div className="flex items-center gap-2">
              {extraLeft}
            </div>
          )}

          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            {/* Custom A Logo identical to screenshot */}
            <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 32 32" className="w-8 h-8 drop-shadow-[0_0_8px_rgba(72,202,228,0.4)]" fill="none">
                {/* Main stylized A ribbon */}
                <path
                  d="M14 4C14 4 10 13 6 22C4.5 25.5 3 27 2 28C6 28 9 27.5 12 25.5C12 25.5 12.5 21 14 18C15 16 17 16 19 18C20.5 21 21 25.5 21 25.5C23 27.5 26 28 30 28C29 27 27.5 25.5 26 22C22 13 18 4 18 4H14Z"
                  fill="url(#aGradient)"
                />
                {/* Ribbon cross swoop */}
                <path
                  d="M4 22C7 21 11 20 15 20C17 20 20 20.5 23 21.5C21.5 23 18 24 15 24C10 24 6 23 4 22Z"
                  fill="#1b828f"
                  opacity="0.95"
                />
                {/* Top-right floating dots / sparks */}
                <circle cx="21" cy="5" r="1.3" fill="#60d5e2" className="animate-pulse" />
                <circle cx="25" cy="9" r="1.5" fill="#a5f3fc" />
                <defs>
                  <linearGradient id="aGradient" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#48cae4" />
                    <stop offset="0.6" stopColor="#2699a7" />
                    <stop offset="1" stopColor="#166f7a" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            
            {/* Allatone brand text */}
            <span className="text-[22px] font-bold tracking-tight text-white drop-shadow-[0_0_12px_rgba(72,202,228,0.45)] leading-none">
              Allatone
            </span>
          </Link>
        </div>

        {/* Center Area: Navigation Items (Icon ON TOP, text label BELOW) */}
        <nav className="hidden lg:flex items-center gap-5 xl:gap-8">
          
          {/* 1. Unified Health (Active State with frosted card container) */}
          <Link
            to="/dashboard"
            className={`flex flex-col items-center justify-center gap-1.5 px-4 py-2 rounded-2xl transition-all cursor-pointer ${
              isUnifiedHealth
                ? 'bg-[#1b525c]/75 border border-[#3b7e89]/50 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-md'
                : 'hover:bg-[#154650]/40 text-[#94bdc4] hover:text-white'
            }`}
          >
            {/* Topology Hub Node with 6 spokes & multi-color balls */}
            <svg className="w-7 h-7 drop-shadow-sm" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="4.5" stroke="#94bdc4" strokeWidth="2.2" fill="#1b525c" />
              <circle cx="18" cy="18" r="2" fill="#e2f5f8" />
              {/* Spokes */}
              <line x1="18" y1="13.5" x2="18" y2="7.5" stroke="#94bdc4" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="21.5" y1="15.5" x2="26" y2="12" stroke="#94bdc4" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="21.5" y1="20.5" x2="26.5" y2="23.5" stroke="#94bdc4" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="18" y1="22.5" x2="18" y2="28.5" stroke="#94bdc4" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="14.5" y1="20.5" x2="9.5" y2="23.5" stroke="#94bdc4" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="14.5" y1="15.5" x2="10" y2="12" stroke="#94bdc4" strokeWidth="1.8" strokeLinecap="round" />
              {/* Colored balls matching screenshot */}
              <circle cx="18" cy="6" r="2.8" fill="#e5a93c" />
              <circle cx="27.5" cy="10.5" r="2.8" fill="#e5a93c" />
              <circle cx="28" cy="24.5" r="2.8" fill="#38bdf8" />
              <circle cx="18" cy="30" r="2.8" fill="#38bdf8" />
              <circle cx="8" cy="24.5" r="2.8" fill="#38bdf8" />
              <circle cx="8.5" cy="10.5" r="2.8" fill="#e5a93c" />
            </svg>
            <span className={`text-xs font-semibold tracking-wide ${isUnifiedHealth ? 'text-white font-bold' : 'text-[#94bdc4]'}`}>
              Unified Health
            </span>
          </Link>

          {/* 2. Access Control */}
          <Link
            to="/permissions"
            className={`flex flex-col items-center justify-center gap-1.5 px-3 py-1.5 rounded-2xl transition-all cursor-pointer ${
              isAccessControl
                ? 'bg-[#1b525c]/75 border border-[#3b7e89]/50 shadow-[0_4px_16px_rgba(0,0,0,0.2)] text-white'
                : 'text-[#94bdc4] hover:text-white hover:bg-[#154650]/40'
            }`}
          >
            {/* Metallic Golden Padlock with keyhole */}
            <svg className="w-7 h-7 drop-shadow-sm" viewBox="0 0 28 28" fill="none">
              <path
                d="M8.5 12V8C8.5 5 10.5 3 14 3C17.5 3 19.5 5 19.5 8V12"
                stroke="#d4a364"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <rect x="6" y="11" width="16" height="13" rx="3.5" fill="#c59858" stroke="#dfb67b" strokeWidth="1" />
              <circle cx="14" cy="16.5" r="1.8" fill="#0c3540" />
              <path d="M13.2 17.5L12.8 20.5H15.2L14.8 17.5Z" fill="#0c3540" />
            </svg>
            <span className="text-xs font-semibold tracking-wide">
              Access Control
            </span>
          </Link>

          {/* 3. Data Hub */}
          <Link
            to="/query"
            className={`flex flex-col items-center justify-center gap-1.5 px-3 py-1.5 rounded-2xl transition-all cursor-pointer ${
              isDataHub
                ? 'bg-[#1b525c]/75 border border-[#3b7e89]/50 shadow-[0_4px_16px_rgba(0,0,0,0.2)] text-white'
                : 'text-[#94bdc4] hover:text-white hover:bg-[#154650]/40'
            }`}
          >
            {/* Dual Interlocking Metallic Gears */}
            <svg className="w-7 h-7 drop-shadow-sm" viewBox="0 0 32 32" fill="none">
              <g fill="#4da6b8">
                <circle cx="14" cy="18" r="7" stroke="#60b7c7" strokeWidth="1.5" fill="none" />
                <circle cx="14" cy="18" r="3" fill="#0c3540" />
                <rect x="12.5" y="9" width="3" height="3" rx="0.5" />
                <rect x="12.5" y="24" width="3" height="3" rx="0.5" />
                <rect x="5" y="16.5" width="3" height="3" rx="0.5" />
                <rect x="20" y="16.5" width="3" height="3" rx="0.5" />
                <rect x="7.5" y="11.5" width="3" height="3" rx="0.5" transform="rotate(45 9 13)" />
                <rect x="16.5" y="20.5" width="3" height="3" rx="0.5" transform="rotate(45 18 22)" />
                <rect x="16.5" y="11.5" width="3" height="3" rx="0.5" transform="rotate(-45 18 13)" />
                <rect x="7.5" y="20.5" width="3" height="3" rx="0.5" transform="rotate(-45 9 22)" />
              </g>
              <g fill="#70c4d4">
                <circle cx="23" cy="9" r="4.5" stroke="#8de0ee" strokeWidth="1" fill="none" />
                <circle cx="23" cy="9" r="2" fill="#0c3540" />
                <rect x="22" y="3.5" width="2" height="2" rx="0.5" />
                <rect x="22" y="12.5" width="2" height="2" rx="0.5" />
                <rect x="17.5" y="8" width="2" height="2" rx="0.5" />
                <rect x="26.5" y="8" width="2" height="2" rx="0.5" />
              </g>
            </svg>
            <span className="text-xs font-semibold tracking-wide">
              Data Hub
            </span>
          </Link>

          {/* 4. Audit */}
          <Link
            to="/dashboard?tab=audit-logs"
            className={`flex flex-col items-center justify-center gap-1.5 px-3 py-1.5 rounded-2xl transition-all cursor-pointer ${
              isAudit
                ? 'bg-[#1b525c]/75 border border-[#3b7e89]/50 shadow-[0_4px_16px_rgba(0,0,0,0.2)] text-white'
                : 'text-[#94bdc4] hover:text-white hover:bg-[#154650]/40'
            }`}
          >
            {/* Checklist Document with folded corner */}
            <svg className="w-7 h-7 drop-shadow-sm" viewBox="0 0 28 28" fill="none">
              <path
                d="M8 4H17L21 8V23C21 24.1 20.1 25 19 25H8C6.9 25 6 24.1 6 23V6C6 4.9 6.9 4 8 4Z"
                stroke="#9dc4cc"
                strokeWidth="2"
                fill="#16434d"
                strokeLinejoin="round"
              />
              <path d="M17 4V8H21" stroke="#9dc4cc" strokeWidth="2" strokeLinejoin="round" fill="none" />
              <circle cx="10" cy="12" r="1" fill="#9dc4cc" />
              <line x1="13" y1="12" x2="18" y2="12" stroke="#9dc4cc" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="16" r="1" fill="#9dc4cc" />
              <line x1="13" y1="16" x2="18" y2="16" stroke="#9dc4cc" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="20" r="1" fill="#9dc4cc" />
              <line x1="13" y1="20" x2="16" y2="20" stroke="#9dc4cc" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-xs font-semibold tracking-wide">
              Audit
            </span>
          </Link>

          {/* 5. Team */}
          <Link
            to="/permissions"
            className={`flex flex-col items-center justify-center gap-1.5 px-3 py-1.5 rounded-2xl transition-all cursor-pointer ${
              isTeam
                ? 'bg-[#1b525c]/75 border border-[#3b7e89]/50 shadow-[0_4px_16px_rgba(0,0,0,0.2)] text-white'
                : 'text-[#94bdc4] hover:text-white hover:bg-[#154650]/40'
            }`}
          >
            {/* Team Silhouette */}
            <svg className="w-7 h-7 drop-shadow-sm" viewBox="0 0 28 28" fill="none">
              <circle cx="11" cy="9" r="3.5" stroke="#9dc4cc" strokeWidth="2" />
              <path d="M5 22C5 18 7.5 16 11 16C14.5 16 17 18 17 22" stroke="#9dc4cc" strokeWidth="2" strokeLinecap="round" />
              <circle cx="19" cy="10" r="2.8" stroke="#7ea9b2" strokeWidth="1.8" />
              <path d="M18 17C20 17.5 22.5 19 22.5 22" stroke="#7ea9b2" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="text-xs font-semibold tracking-wide">
              Team
            </span>
          </Link>

          {/* 6. Settings */}
          <Link
            to="/profile"
            className={`flex flex-col items-center justify-center gap-1.5 px-3 py-1.5 rounded-2xl transition-all cursor-pointer ${
              isSettings
                ? 'bg-[#1b525c]/75 border border-[#3b7e89]/50 shadow-[0_4px_16px_rgba(0,0,0,0.2)] text-white'
                : 'text-[#94bdc4] hover:text-white hover:bg-[#154650]/40'
            }`}
          >
            {/* Skeleton Key & Cog Ring */}
            <svg className="w-7 h-7 drop-shadow-sm" viewBox="0 0 32 32" fill="none">
              <circle cx="11" cy="11" r="5" stroke="#d4a364" strokeWidth="2.5" />
              <circle cx="11" cy="11" r="2" fill="#0c3540" />
              <line x1="15" y1="15" x2="25" y2="25" stroke="#d4a364" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="23" y1="23" x2="25" y2="21" stroke="#d4a364" strokeWidth="2" strokeLinecap="round" />
              <line x1="21" y1="25" x2="23" y2="23" stroke="#d4a364" strokeWidth="2" strokeLinecap="round" />
              <circle cx="23" cy="11" r="3.5" stroke="#c59858" strokeWidth="2" strokeDasharray="2.5 1.5" />
            </svg>
            <span className="text-xs font-semibold tracking-wide">
              Settings
            </span>
          </Link>

        </nav>

        {/* Right Area: Insights & Health Widget + User Card */}
        <div className="flex items-center gap-3.5 shrink-0">
          
          {/* Widget 1: Insights & Health */}
          <div className="hidden md:flex flex-col justify-between bg-[#154b57]/70 border border-[#2b6d7a]/50 rounded-2xl px-4 py-2 shadow-md">
            <div className="flex items-center justify-between gap-4 mb-1">
              <span className="text-[12px] font-semibold text-[#d1e7ec]">Insights &amp; Health</span>
              <span
                className="w-4 h-4 rounded-full border border-[#488795] text-[10px] text-[#9dc4cc] flex items-center justify-center font-bold cursor-help"
                title="System health aggregate based on ping latency, ops/sec, and connection states"
              >
                ?
              </span>
            </div>

            <div className="flex items-center gap-3.5">
              {/* Circular gauge 94 / 100 in bright neon green */}
              <div className="relative w-10 h-10 flex items-center justify-center">
                <svg className="w-10 h-10 -rotate-90 transform" viewBox="0 0 36 36">
                  <path
                    className="text-[#133c46]"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#22c55e]"
                    strokeDasharray="94, 100"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <span className="text-xs font-black text-white">94</span>
                  <span className="text-[7px] text-[#82abb5] font-mono mt-0.5">100</span>
                </div>
              </div>

              {/* Glowing World Map Silhouette */}
              <div className="w-20 h-8 relative opacity-90">
                <svg className="w-full h-full text-[#246a78]" viewBox="0 0 120 50" fill="currentColor">
                  {/* Continental shapes */}
                  <path d="M14 12c2-2 5-1 7 1s4 5 2 7-6 4-8 2-2-7-1-10zm25 8c3-3 8-1 9 2s-1 6-4 7-6-1-7-3 0-5 2-6zm45-6c4-3 10 0 12 4s-1 8-5 9-8-2-9-5 0-6 2-8zm-55 24c2-2 6-1 7 2s-1 5-4 5-5-2-5-4 0-2 2-3zm65-4c3-2 8 0 9 4s-2 7-5 7-7-2-7-5 1-4 3-6z" />
                  {/* Glowing green active region North America */}
                  <path
                    d="M15 13c2-1 4-1 6 1s3 4 1 6-5 3-7 1-1-6 0-8z"
                    fill="#22c55e"
                    className="drop-shadow-[0_0_6px_#22c55e]"
                  />
                  <circle cx="28" cy="18" r="2.2" fill="#22c55e" />
                  <circle cx="85" cy="16" r="1.8" fill="#48cae4" />
                  <circle cx="95" cy="30" r="1.8" fill="#48cae4" />
                </svg>
              </div>
            </div>
          </div>

          {/* Widget 2: User Profile & System Status */}
          <div className="relative" ref={dropdownRef}>
            <div
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="bg-[#154b57]/70 hover:bg-[#1a5a67]/80 border border-[#2b6d7a]/50 rounded-2xl px-3.5 py-2 transition-all cursor-pointer flex flex-col justify-between shadow-md"
            >
              {/* Top Row: User Avatar + Name + Role + Down Chevron */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#1b434e] border border-[#3b7e89] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-[#9dc4cc]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </div>

                <div className="flex-1 min-w-[70px] leading-tight">
                  <p className="text-xs font-bold text-white tracking-wide">
                    {user?.name || 'VSS'}
                  </p>
                  <p className="text-[11px] text-[#9dc4cc] capitalize">
                    {user?.role || 'Admin'}
                  </p>
                </div>

                <svg
                  className={`w-3.5 h-3.5 text-[#9dc4cc] transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Bottom Row: System Status + Core Services: Running */}
              <div className="mt-1 pt-1 border-t border-[#235d69]/50 leading-tight">
                <p className="text-[10px] text-[#8cb4bd] font-medium">System Status</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse"></span>
                  <span className="text-[10px] font-semibold text-[#22c55e]">
                    Core Services: Running
                  </span>
                </div>
              </div>
            </div>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-[#0c2f38] rounded-2xl shadow-2xl ring-1 ring-[#266876] py-2 z-50 border border-[#266876] text-slate-200 animate-fadeIn">
                <div className="px-4 py-2 border-b border-[#1b525f] mb-1">
                  <p className="text-xs font-bold text-white truncate">{user?.name || 'Administrator'}</p>
                  <p className="text-[11px] text-[#48cae4] font-mono truncate">{user?.email || 'admin@allatone.io'}</p>
                </div>

                <button
                  onClick={() => { setDropdownOpen(false); navigate('/profile'); }}
                  className="w-full px-4 py-2 text-left text-xs hover:bg-[#154652] hover:text-[#48cae4] flex items-center gap-2.5 font-medium transition-colors"
                >
                  <svg className="w-4 h-4 text-[#48cae4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  My Profile &amp; Settings
                </button>

                <button
                  onClick={() => { toggleTheme(); setDropdownOpen(false); }}
                  className="w-full px-4 py-2 text-left text-xs hover:bg-[#154652] hover:text-[#48cae4] flex items-center gap-2.5 font-medium transition-colors"
                >
                  {theme === 'light' ? (
                    <>
                      <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      Dark Theme Active
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                      </svg>
                      Light Theme Mode
                    </>
                  )}
                </button>

                <button
                  onClick={() => { setDropdownOpen(false); navigate('/status'); }}
                  className="w-full px-4 py-2 text-left text-xs hover:bg-[#154652] hover:text-[#48cae4] flex items-center gap-2.5 font-medium transition-colors"
                >
                  <span className="text-sm">📊</span>
                  System Health &amp; Nodes
                </button>

                <button
                  onClick={() => { setDropdownOpen(false); navigate('/help-docs'); }}
                  className="w-full px-4 py-2 text-left text-xs hover:bg-[#154652] hover:text-[#48cae4] flex items-center gap-2.5 font-medium transition-colors"
                >
                  <span className="text-sm">📖</span>
                  Documentation &amp; Guides
                </button>

                <div className="my-1.5 border-t border-[#1b525f]"></div>

                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-xs text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2.5 font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </header>
  );
}
