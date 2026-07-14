import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import API from '../api/axios';
import Navbar from '../components/Navbar';
import MySQLUsersPanel from '../components/MySQLUsersPanel';
import MongoDBUsersPanel from '../components/MongoDBUsersPanel';
import PostgreSQLUsersPanel from '../components/PostgreSQLUsersPanel';

export default function ConnectionUsers() {
  const { id } = useParams();
  const [connectionName, setConnectionName] = useState('');
  const [connectionType, setConnectionType] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConnectionInfo = async () => {
      try {
        setLoading(true);
        const res = await API.get('/connections');
        const conn = res.data.connections.find(c => c._id === id);
        if (conn) {
          setConnectionName(conn.name);
          setConnectionType(conn.type);
        }
      } catch (err) {
        console.error('Error fetching connection info:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConnectionInfo();
  }, [id]);

  const getDbIcon = (type) => {
    if (type === 'mongodb') return '🍃';
    if (type === 'mysql') return '🐬';
    if (type === 'postgresql') return '🐘';
    return '🗄️';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-left">
      <Navbar
        backTo="/connections"
        backText="Connections"
        extraLeft={
          <span className="text-sm font-medium text-gray-900">
            {getDbIcon(connectionType)} {connectionName} (Users Manager)
          </span>
        }
      />
      <div className="max-w-6xl mx-auto px-6 py-8">
        {connectionType === 'mongodb' ? (
          <MongoDBUsersPanel connectionId={id} />
        ) : connectionType === 'mysql' ? (
          <MySQLUsersPanel connectionId={id} />
        ) : connectionType === 'postgresql' ? (
          <PostgreSQLUsersPanel connectionId={id} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
            ❌ User Management is only supported for MySQL, MongoDB and PostgreSQL connection types.
          </div>
        )}
      </div>
    </div>
  );
}
