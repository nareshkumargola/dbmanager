import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api/axios';

export default function Backup() {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    fetchInfo();
  }, []);

  const fetchInfo = async () => {
    try {
      const res = await API.get('/backup/info');
      setInfo(res.data.info);
    } catch (err) {
      setError('Info load nahi hui');
    } finally {
      setLoading(false);
    }
  };

  // Backup download karo
  const takeBackup = async () => {
    setBackupLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await API.get('/backup/download', {
        responseType: 'blob', // File download ke liye
      });

      // File download trigger karo
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `backup_${Date.now()}.sql`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSuccess('Backup download ho gaya!');
    } catch (err) {
      setError('Backup failed!');
    } finally {
      setBackupLoading(false);
    }
  };

  // File select karo
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.sql')) {
      setSelectedFile(file);
      setError('');
    } else {
      setError('Sirf .sql file select karo!');
      setSelectedFile(null);
    }
  };

  // Restore karo
  const restoreBackup = async () => {
    if (!selectedFile) {
      setError('Pehle .sql file select karo!');
      return;
    }

    if (!window.confirm('Database restore karoge? Existing data replace ho sakta hai!')) {
      return;
    }

    setRestoreLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('sqlFile', selectedFile);

      const res = await API.post('/backup/restore', formData);

      setSuccess(`Database restore ho gaya! ${res.data.statements} statements run kiye`);
      setSelectedFile(null);
      fetchInfo(); // Info refresh karo
    } catch (err) {
      setError(err.response?.data?.error || 'Restore failed!');
    } finally {
      setRestoreLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

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

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">
            Backup & Restore
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Database ka backup lo ya restore karo
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">
            ❌ {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-600 text-sm px-4 py-3 rounded-lg">
            ✅ {success}
          </div>
        )}

        {/* Database Info */}
        {info && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Database Info
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Database', value: info.database },
                { label: 'Total Tables', value: info.totalTables },
                { label: 'Size', value: `${info.sizeInMB} MB` },
                { label: 'Last Checked', value: new Date(info.backupTime).toLocaleString('en-IN') },
              ].map((item, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-500">{item.label}</span>
                  <span className="text-sm font-medium text-gray-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Backup Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Take Backup
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Poora database ek .sql file mein download karo
          </p>
          <button
            onClick={takeBackup}
            disabled={backupLoading}
            className="w-full py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition disabled:opacity-60"
          >
            {backupLoading ? 'Backup ban raha hai...' : '⬇ Download Backup'}
          </button>
        </div>

        {/* Restore Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Restore Backup
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            .sql file upload karo aur database restore karo
          </p>

          {/* File Input */}
          <div
            className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center mb-4 cursor-pointer hover:border-gray-400 transition"
            onClick={() => document.getElementById('sqlFile').click()}
          >
            {selectedFile ? (
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-400">
                  Click karo .sql file select karne ke liye
                </p>
                <p className="text-xs text-gray-300 mt-1">
                  Max 50MB
                </p>
              </div>
            )}
          </div>

          <input
            id="sqlFile"
            type="file"
            accept=".sql"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            onClick={restoreBackup}
            disabled={restoreLoading || !selectedFile}
            className="w-full py-2.5 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 transition disabled:opacity-60"
          >
            {restoreLoading ? 'Restore ho raha hai...' : '⬆ Restore Database'}
          </button>
        </div>

      </div>
    </div>
  );
}