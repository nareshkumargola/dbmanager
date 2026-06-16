import SlowQueryPanel from '../components/SlowQueryPanel';
import { useNavigate } from 'react-router-dom';

export default function SlowQuery() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-semibold text-gray-900">DB Manager</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Dashboard
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <SlowQueryPanel />
      </div>
    </div>
  );
}