import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { useNavbar } from '../context/NavbarContext';

export default function Layout() {
  const { navbarConfig } = useNavbar();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar
        backTo={navbarConfig.backTo}
        backText={navbarConfig.backText}
        extraLeft={navbarConfig.extraLeft}
        variant={navbarConfig.variant}
        isGlobal={true}
      />
      <div className="flex-1 flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}
