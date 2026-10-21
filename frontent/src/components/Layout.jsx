import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import { useNavbar } from '../context/NavbarContext';

export default function Layout() {
  const { navbarConfig } = useNavbar();
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';

  return (
    <div className={`min-h-screen flex flex-col ${isDashboard ? 'bg-[#0b1c24]' : 'bg-gray-50 dark:bg-gray-900'}`}>
      <Navbar
        backTo={navbarConfig.backTo}
        backText={navbarConfig.backText}
        extraLeft={navbarConfig.extraLeft}
        variant={navbarConfig.variant}
        isGlobal={true}
      />
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
