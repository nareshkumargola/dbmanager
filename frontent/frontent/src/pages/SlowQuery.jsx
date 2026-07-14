import SlowQueryPanel from '../components/SlowQueryPanel';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function SlowQuery() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <SlowQueryPanel />
      </div>
    </div>
  );
}