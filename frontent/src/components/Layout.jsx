import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import { useNavbar } from '../context/NavbarContext';

export default function Layout() {
  const { navbarConfig } = useNavbar();
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';

  if (isDashboard) {
    return (
      <div className="min-h-screen bg-[#f4f7fb] flex flex-col">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
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
