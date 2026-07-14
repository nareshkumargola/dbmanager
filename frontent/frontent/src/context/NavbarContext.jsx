import { createContext, useContext, useState, useCallback } from 'react';

const NavbarContext = createContext();

export function NavbarProvider({ children }) {
  const [navbarConfig, setNavbarConfigState] = useState({
    backTo: null,
    backText: null,
    extraLeft: null,
    variant: 'teal'
  });

  const setNavbarConfig = useCallback((config) => {
    setNavbarConfigState(prev => {
      // Prevent infinite rendering loops by only updating if values actually change
      if (
        prev.backTo === config.backTo &&
        prev.backText === config.backText &&
        prev.variant === config.variant &&
        prev.extraLeft === config.extraLeft
      ) {
        return prev;
      }
      return {
        backTo: config.backTo ?? null,
        backText: config.backText ?? null,
        extraLeft: config.extraLeft ?? null,
        variant: config.variant ?? 'teal'
      };
    });
  }, []);

  return (
    <NavbarContext.Provider value={{ navbarConfig, setNavbarConfig }}>
      {children}
    </NavbarContext.Provider>
  );
}

export function useNavbar() {
  const context = useContext(NavbarContext);
  if (!context) {
    throw new Error('useNavbar must be used within a NavbarProvider');
  }
  return context;
}
