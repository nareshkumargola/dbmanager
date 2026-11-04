import { useEffect, useState } from 'react';

const THEME_EVENT = 'app-theme-change';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');
const readMode = () => localStorage.getItem('theme') || 'light';

/**
 * Theme mode ('light' | 'dark' | 'system') stored in localStorage and applied as the `dark`
 * class on <html>. Every component using this hook stays in sync (navbar switch, Settings page).
 */
export default function useTheme() {
  const [mode, setModeState] = useState(readMode);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);
  const theme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Follow the OS setting while in 'system' mode, and sync with other hook instances
  useEffect(() => {
    const query = darkQuery();
    const handleSystemChange = (event) => setSystemDark(event.matches);
    const handleModeChange = () => setModeState(readMode());
    query.addEventListener('change', handleSystemChange);
    window.addEventListener(THEME_EVENT, handleModeChange);
    return () => {
      query.removeEventListener('change', handleSystemChange);
      window.removeEventListener(THEME_EVENT, handleModeChange);
    };
  }, []);

  const setMode = (nextMode) => {
    localStorage.setItem('theme', nextMode);
    setModeState(nextMode);
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  const toggleTheme = () => setMode(theme === 'dark' ? 'light' : 'dark');

  return { theme, mode, setMode, toggleTheme };
}
