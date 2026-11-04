import SlowQueryPanel from '../components/SlowQueryPanel';
import Navbar from '../components/Navbar';

export default function SlowQuery() {
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