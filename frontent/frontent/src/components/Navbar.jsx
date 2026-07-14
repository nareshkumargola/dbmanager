import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
        variant
      });
    }, [backTo, backText, extraLeft, variant, setNavbarConfig]);

    return null; // Render nothing inside the child component view itself
  }

  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
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

  return (
    <nav className={`sticky top-0 z-40 px-6 py-3.5 flex justify-between items-center shadow-sm ${
      variant === 'teal'
        ? 'bg-[#0d9da4] shadow-md border-transparent text-white'
        : 'bg-white border-b border-gray-200 bg-white/80 backdrop-blur-md text-gray-700'
    }`}>
      {/* Left Area: Logo and/or Back Button */}
      <div className="flex items-center gap-3.5">
        <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0">
          <img 
            src="/allatone_logo.jpg" 
            className={`h-9 w-auto object-contain rounded-lg p-0.5 ${variant === 'teal' ? 'bg-white' : ''}`} 
            alt="Allatone Logo" 
          />
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            variant === 'teal' ? 'bg-teal-700/45 text-teal-50' : 'bg-teal-50 text-[#0d9da4]'
          }`}>
            Database Monitoring System
          </span>
        </Link>

        {backTo && (
          <>
            <span className={variant === 'teal' ? 'text-white/30' : 'text-gray-300'}>|</span>
            <button
              onClick={() => navigate(backTo)}
              className={`text-sm flex items-center gap-1 font-medium transition ${
                variant === 'teal' ? 'text-white hover:text-teal-100' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ← {backText || 'Back'}
            </button>
          </>
        )}

        {extraLeft && (
          <>
            <span className={variant === 'teal' ? 'text-white/30' : 'text-gray-300'}>|</span>
            {extraLeft}
          </>
        )}
      </div>

      {/* Right Area: Profile & Theme Toggle */}
      <div className="flex items-center gap-3">
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={`flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full transition-colors duration-150 ${
                variant === 'teal' ? 'hover:bg-white/15' : 'hover:bg-gray-100'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold ${
                variant === 'teal' ? 'text-teal-700 bg-amber-100 ring-2 ring-white/40 shadow-sm' : 'bg-[#0d9da4] text-white shadow-sm'
              }`}>
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="hidden sm:block text-left">
                <p className={`text-[13px] font-semibold leading-none ${variant === 'teal' ? 'text-white' : 'text-gray-700'}`}>{user.name}</p>
                <p className={`text-[11px] leading-none mt-0.5 capitalize ${variant === 'teal' ? 'text-teal-50/80' : 'text-gray-400'}`}>{user.role}</p>
              </div>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''} ${
                  variant === 'teal' ? 'text-white/80' : 'text-gray-400'
                }`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl ring-1 ring-teal-150 py-1.5 z-50 animate-fadeIn overflow-hidden border border-gray-100">
                <button
                  onClick={() => { setDropdownOpen(false); navigate('/profile'); }}
                  className="w-full px-4 py-2.5 text-left text-[13px] text-stone-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-2.5 font-medium transition-colors"
                >
                  <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  My Profile
                </button>

                {/* Theme Mode Toggle Item */}
                <button
                  onClick={() => { toggleTheme(); setDropdownOpen(false); }}
                  className="w-full px-4 py-2.5 text-left text-[13px] text-stone-700 hover:bg-teal-50 hover:text-teal-700 flex items-center gap-2.5 font-medium transition-colors"
                >
                  {theme === 'light' ? (
                    <>
                      <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      Dark Mode
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                      </svg>
                      Light Mode
                    </>
                  )}
                </button>

                <div className="my-1 border-t border-stone-100"></div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2.5 text-left text-[13px] text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
