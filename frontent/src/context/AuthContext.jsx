import { createContext, useContext, useState, useEffect, useRef } from 'react';
import API from '../api/axios';
import { applyFontSize } from '../utils/fontSize';

const AuthContext = createContext();
const SESSION_TIMEOUT_MINUTES = Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES ?? 720);
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const timeoutRef = useRef(null);

  const clearSessionTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const resetSessionTimer = () => {
    if (!user) return;

    clearSessionTimer();
    timeoutRef.current = setTimeout(() => {
      localStorage.removeItem('token');
      setUser(null);
    }, SESSION_TIMEOUT_MS);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      API.get('/auth/profile')
        .then(res => {
          setUser(res.data.user);
        })
        .catch((err) => {
          if (err?.response?.status === 401) {
            localStorage.removeItem('token');
            setUser(null);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      clearSessionTimer();
      return;
    }

    resetSessionTimer();

    const handleActivity = () => resetSessionTimer();
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'pointerdown'];

    events.forEach((event) => window.addEventListener(event, handleActivity));

    return () => {
      clearSessionTimer();
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [user]);

  // Apply the user's "reduce animations" setting to the whole app
  const reduceMotion = Boolean(user?.preferences?.reduceMotion);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  // And the user's font size. Signed out, the page keeps this device's last size.
  const fontSize = user?.preferences?.fontSize;
  useEffect(() => {
    if (fontSize) applyFontSize(fontSize);
  }, [fontSize]);

  const login = (userData, token) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };

  // Merge fresh fields (e.g. after a profile or settings update) into the signed-in user
  const updateUser = (fields) => setUser((current) => (current ? { ...current, ...fields } : current));

  const logout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await API.post('/auth/logout');
      }
    } catch (err) {
      console.warn('Logout API call failed:', err?.response?.data?.message || err.message);
    } finally {
      clearSessionTimer();
      localStorage.removeItem('token');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);