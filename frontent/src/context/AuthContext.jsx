import { createContext, useContext, useState, useEffect, useRef } from 'react';
import API from '../api/axios';

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

  const login = (userData, token) => {
    localStorage.setItem('token', token);
    setUser(userData);
  };

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
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);