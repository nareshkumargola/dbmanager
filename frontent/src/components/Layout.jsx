import { Outlet, useLocation } from 'react-router-dom';
import AppNavbar from './AppNavbar';
import { useNavbar } from '../context/NavbarContext';

export default function Layout() {
  const { navbarConfig } = useNavbar();
  const location = useLocation();
  // These pages render AppNavbar themselves (they wire in the sidebar toggle)
  const isCustomLayout = ['/dashboard', '/audit-logs', '/system-users'].includes(location.pathname);

  if (isCustomLayout) {
    return (
      <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
      <AppNavbar
        backTo={navbarConfig.backTo}
        backText={navbarConfig.backText}
        extraLeft={navbarConfig.extraLeft}
      />
      {/* This wrapper never scrolls, but its overflow would stop the profile page's sticky side panel */}
      <div className={`flex-1 flex flex-col min-h-0 ${location.pathname === '/profile' ? '' : 'overflow-y-auto'}`}>
        <Outlet />
      </div>
    </div>
  );
}
