import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';

export default function DatabaseSelector() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [connectionType, setConnectionType] = useState('');

  useEffect(() => {
    fetchDatabases();
  }, [id]);

  const fetchDatabases = async () => {
    try {
      setLoading(true);

      // Connection info lo
      const connRes = await API.get('/connections');
      const conn = connRes.data.connections.find(c => c._id === id);
      if (conn) {
        setConnectionName(conn.name);
        setConnectionType(conn.type);
      }

      // Databases list lo
      const res = await API.get(`/connections/${id}/databases`);
      setDatabases(res.data.databases);
    } catch (err) {
      setError('Databases load nahi hue');
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type) => {
    if (type === 'mysql') return '🐬';
    if (type === 'postgresql') return '🐘';
    if (type === 'mongodb') return '🍃';
    return '🗄️';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading databases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/connections')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Connections
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-900">
            {getTypeIcon(connectionType)} {connectionName}
          </span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">
            Select Database
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Kaunsa database manage karna hai?
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
            ❌ {error}
          </div>
        )}

        {/* Databases List */}
        {databases.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-3xl mb-3">🗄️</p>
            <p className="text-gray-700 font-medium mb-1">
              Koi database nahi mila
            </p>
            <p className="text-gray-400 text-sm">
              Server pe koi database nahi hai ya access nahi hai
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {databases.map((db, i) => (
              <div
                key={i}
                onClick={() => navigate(`/connections/${id}/db/${db}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:border-gray-400 hover:shadow-sm transition group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xl">
                      🗄️
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {db}
                      </p>
                      <p className="text-xs text-gray-400">
                        Click karo manage karne ke liye
                      </p>
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400 group-hover:text-gray-600 group-hover:translate-x-1 transition-all"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}