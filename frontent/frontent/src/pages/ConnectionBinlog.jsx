import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import Navbar from '../components/Navbar';
import BinlogMonitorPanel from '../components/BinlogMonitorPanel';
import { useAuth } from '../context/AuthContext';

export default function ConnectionBinlog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id } = useParams();

  if (user?.role !== 'admin' && user?.permissions && !user.permissions.binlog) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-left">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md text-center shadow-lg">
          <p className="text-4xl mb-4">🚫</p>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-500 mb-6">You do not have permission to access Binlog/WAL Monitor features.</p>
          <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition font-bold shadow-sm">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const [connectionName, setConnectionName] = useState('');
  const [connectionType, setConnectionType] = useState('');
  const [defaultDatabase, setDefaultDatabase] = useState('');
  const [databases, setDatabases] = useState([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchConnectionAndDatabases = async () => {
      try {
        setLoading(true);
        // 1. Fetch connection details
        const connRes = await API.get('/connections');
        const conn = connRes.data.connections.find(c => c._id === id);
        if (!conn) {
          throw new Error('Connection not found in your list! Please go back to the Connections page and select it again.');
        }
        setConnectionName(conn.name);
        setConnectionType(conn.type);
        setDefaultDatabase(conn.database || '');

        // 2. Fetch list of databases
        const dbRes = await API.get(`/connections/${id}/databases`);
        if (dbRes.data.databases) {
          setDatabases(dbRes.data.databases);
        }
      } catch (err) {
        console.error('Error loading binlog page configs:', err);
        setError(err.response?.data?.message || err.message || 'Failed to load connection and database configurations.');
      } finally {
        setLoading(false);
      }
    };
    fetchConnectionAndDatabases();
  }, [id]);

  // Auto-select connection's default database or first database schema
  useEffect(() => {
    if (databases.length > 0 && !selectedDb) {
      const found = databases.find(d => d.toLowerCase() === defaultDatabase?.toLowerCase());
      setSelectedDb(found || databases[0]);
    }
  }, [databases, defaultDatabase, selectedDb]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading monitor configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col text-left">
      <Navbar
        backTo="/connections"
        backText="Connections"
        extraLeft={
          <span className="text-sm font-medium text-gray-900">
            📡 {connectionName} ({connectionType === 'mongodb' ? 'Oplog' : (connectionType === 'postgresql' ? 'WAL' : 'Binlog')} Monitor)
          </span>
        }
      />

      <div className="flex-1 flex h-[calc(100vh-53px)] relative overflow-hidden">
        {/* Databases Sidebar */}
        <div className="w-64 bg-white border-r border-gray-250 p-4 flex flex-col gap-2 shrink-0 overflow-y-auto">
          <div className="px-2 mb-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Schemas / Databases</h3>
            <p className="text-[10px] text-gray-400 mt-1 leading-normal">
              Select a database to filter {connectionType === 'mongodb' ? 'oplogs' : (connectionType === 'postgresql' ? 'Write-Ahead logs (WAL)' : 'binary logs')}.
            </p>
          </div>
          
          {error && (
            <div className="px-2 py-1.5 bg-red-50 text-red-600 rounded text-xs leading-normal">
              ⚠️ {error}
            </div>
          )}

          {databases.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-6">
              No schemas found.
            </div>
          ) : (
            <div className="space-y-1">
              {databases.map(db => (
                <button
                  key={db}
                  onClick={() => setSelectedDb(db)}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
                    selectedDb === db
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
                  }`}
                >
                  <span className="text-base">🗄️</span>
                  <span className="truncate">{db}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Binlog Monitoring Log Grid on the Right */}
        <div className="flex-1 p-6 overflow-y-auto bg-gray-50/30">
          {selectedDb ? (
            <div className="max-w-6xl mx-auto space-y-4">
              <div className="bg-white px-5 py-3.5 border border-gray-200 rounded-xl shadow-xs flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Active Filter: <span className="font-mono bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs border border-gray-200">{selectedDb}</span></h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">Showing queries and writes made specifically on database schema "{selectedDb}".</p>
                </div>
              </div>
              <BinlogMonitorPanel connectionId={id} database={selectedDb} connectionType={connectionType} />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center">
              <div>
                <span className="text-4xl block mb-2">📡</span>
                <p className="text-sm text-gray-500 font-medium">
                  Select a database schema on the left to start monitoring {connectionType === 'mongodb' ? 'oplog' : (connectionType === 'postgresql' ? 'WAL' : 'binlogs')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
