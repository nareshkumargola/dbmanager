import { useEffect } from 'react';
import { useNavbar } from '../context/NavbarContext';

/**
 * Pages render <Navbar backTo="..." backText="..." extraLeft={...} /> to configure the shared
 * AppNavbar that Layout shows at the top of every page. It renders nothing itself, and clears
 * its settings on unmount so the back link doesn't leak onto the next page.
 */
export default function Navbar({ backTo, backText, extraLeft, variant = 'teal' }) {
  const { setNavbarConfig } = useNavbar();

  useEffect(() => {
    setNavbarConfig({ backTo, backText, extraLeft, variant });
  }, [backTo, backText, extraLeft, variant, setNavbarConfig]);

  useEffect(() => () => setNavbarConfig({}), [setNavbarConfig]);

  return null;
}
