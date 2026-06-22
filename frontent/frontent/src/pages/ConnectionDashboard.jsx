import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import SlowQueryPanel from '../components/SlowQueryPanel';
import BinlogMonitorPanel from '../components/BinlogMonitorPanel';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useLocation } from 'react-router-dom';

export default function ConnectionDashboard() {
  const { id, database } = useParams();
  const navigate = useNavigate();
  const [objects, setObjects] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Table data
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [tableColumns, setTableColumns] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);

  // Query Editor
  const [query, setQuery] = useState('');
  const [queryResults, setQueryResults] = useState([]);
  const [queryColumns, setQueryColumns] = useState([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [queryMsg, setQueryMsg] = useState('');

  // Query History
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Backup
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [backupMsg, setBackupMsg] = useState('');
  const [backupError, setBackupError] = useState('');

  // Monitoring
  const [monitorData, setMonitorData] = useState(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorHistory, setMonitorHistory] = useState([]);
  const [tableDetails, setTableDetails] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [id]);

  // Handle external requests to open a specific tab (e.g., slow query -> query editor)
  const location = useLocation();
  useEffect(() => {
    if (location?.state?.openTab) {
      setActiveTab(location.state.openTab);
      if (location.state.query) setQuery(location.state.query);
    }
  }, [location]);

  // Auto refresh
  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchMonitoring();
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, id]);

 const fetchAll = async () => {
  try {
    setLoading(true);
    const [objRes, statsRes] = await Promise.all([
      API.get(`/connections/${id}/objects${database ? `?database=${database}` : ''}`),
      API.get(`/connections/${id}/stats${database ? `?database=${database}` : ''}`),
    ]);
    setObjects(objRes.data);
    setStats(statsRes.data.stats);
  } catch (err) {
    setError('Data load nahi hua — connection check karo');
  } finally {
    setLoading(false);
  }
};

const fetchTableData = async (tableName) => {
  setTableLoading(true);
  setSelectedTable(tableName);
  setActiveTab('table');
  try {
    const res = await API.get(
      `/connections/${id}/table/${tableName}${database ? `?database=${database}` : ''}`
    );
    setTableData(res.data.rows);
    setTableColumns(res.data.columns);
  } catch (err) {
    setError('Table data load nahi hua');
  } finally {
    setTableLoading(false);
  }
};

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await API.get('/history');
      setHistory(res.data.history);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchMonitoring = async () => {
    setMonitorLoading(true);
    try {
      const [res, histRes] = await Promise.all([
        API.get(`/monitor/${id}${database ? `?database=${database}` : ''}`),
        API.get(`/monitor/${id}/history${database ? `?database=${database}` : ''}`),
      ]);
      const newData = res.data.data;
      setMonitorData(newData);

      // Store hourly data if available
      if (histRes.data.hourly) {
        setMonitorHistory(histRes.data.hourly);
      }

      setMonitorHistory(prev => {
        const time = new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const newPoint = {
          time,
          connections: newData.activeConnections,
          qps: newData.queriesPerSecond || 0,
        };
        const updated = [...prev, newPoint];
        return updated.slice(-10);
      });

      // Fetch table details separately (non-blocking)
      try {
        const tableRes = await API.get(`/monitor/${id}/tables${database ? `?database=${database}` : ''}`);
        if (tableRes.data.tables) {
          setTableDetails(tableRes.data.tables);
        }
      } catch (e) {
        console.log('Table details not available');
      }
    } catch (err) {
      console.error('Monitor error:', err);
    } finally {
      setMonitorLoading(false);
    }
  };

  const downloadMonitoringPDF = async () => {
    if (!monitorData) {
      alert('Pehle data load karo');
      return;
    }

    const element = document.createElement('div');
    element.style.padding = '20px';
    element.style.fontFamily = 'Arial, sans-serif';
    element.style.fontSize = '12px';
    element.innerHTML = `
      <h1 style="text-align: center; margin-bottom: 30px;">📊 Database Monitoring Report</h1>
      
      <div style="margin-bottom: 20px;">
        <strong>Database Connection:</strong> ${objects?.name || 'N/A'}<br/>
        <strong>Type:</strong> ${dbType?.toUpperCase() || 'N/A'}<br/>
        <strong>Database:</strong> ${database || 'All'}<br/>
        <strong>Generated:</strong> ${new Date().toLocaleString('en-IN')}<br/>
      </div>

      ${dbType === 'mysql' ? `
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 10px;">MySQL Metrics</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Active Connections</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.activeConnections} / ${monitorData.maxConnections}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Connection Usage %</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${Math.round((monitorData.activeConnections / monitorData.maxConnections) * 100)}%</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Queries Per Second</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.queriesPerSecond}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Slow Queries</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.slowQueries}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Database Size</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.sizeMB} MB</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total Tables</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.totalTables}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Uptime</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${Math.floor(monitorData.uptime / 3600)}h ${Math.floor((monitorData.uptime % 3600) / 60)}m</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Bytes Sent</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${(monitorData.bytesSent / 1024 / 1024).toFixed(2)} MB</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Bytes Received</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${(monitorData.bytesReceived / 1024 / 1024).toFixed(2)} MB</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Cache Hit Rate</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.cacheHitRate}%</td>
          </tr>
        </table>

        ${tableDetails && tableDetails.length > 0 ? `
          <h3 style="border-bottom: 1px solid #999; padding-bottom: 8px;">Top 10 Tables by Size</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px;">
            <thead>
              <tr style="background: #f0f0f0;">
                <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Table</th>
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Rows</th>
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Size (MB)</th>
              </tr>
            </thead>
            <tbody>
              ${tableDetails.map((table, i) => `
                <tr style="${i % 2 === 0 ? 'background: #f9f9f9;' : ''}">
                  <td style="border: 1px solid #ddd; padding: 6px;">${table.table}</td>
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${table.rows.toLocaleString()}</td>
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${table.sizeMB}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
      ` : ''}

      ${dbType === 'postgresql' ? `
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 10px;">PostgreSQL Metrics</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Active Connections</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.activeConnections} / ${monitorData.maxConnections}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Database Size</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.size}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total Tables</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.totalTables}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Commits</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.commits.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Rollbacks</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.rollbacks.toLocaleString()}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Blocks Read</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.blocksRead.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Blocks Hit</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.blocksHit.toLocaleString()}</td>
          </tr>
        </table>
      ` : ''}

      ${dbType === 'mongodb' ? `
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 10px;">MongoDB Metrics</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Active Connections</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.activeConnections} / ${monitorData.maxConnections}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total Collections</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.totalCollections}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total Documents</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.totalDocuments.toLocaleString()}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Database Size</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.sizeMB} MB</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Uptime</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${Math.round(monitorData.uptime / 60)} minutes</td>
          </tr>
        </table>
      ` : ''}

      <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #999; font-size: 10px; color: #666;">
        <p>Generated by Database Manager | ${new Date().toLocaleString('en-IN')}</p>
      </div>
    `;

    const options = {
      margin: 10,
      filename: `monitoring-${objects?.name || 'database'}-${new Date().getTime()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    try {
      const mod = await import('html2pdf.js');
      const html2pdf = mod.default || mod;
      html2pdf().set(options).from(element).save();
    } catch (e) {
      console.error('PDF generation failed', e);
      alert('PDF generation failed: ' + (e.message || e));
    }
  };

  const runQuery = async () => {
    if (!query.trim()) return;
    setQueryLoading(true);
    setQueryError('');
    setQueryMsg('');
    setQueryResults([]);
    setQueryColumns([]);
    try {
      const queryPath = `/connections/${id}/query${database ? `?database=${encodeURIComponent(database)}` : ''}`;
      const res = await API.post(queryPath, { query });
      const data = res.data.results;
      if (Array.isArray(data) && data.length > 0) {
        setQueryColumns(Object.keys(data[0]));
        setQueryResults(data);
        setQueryMsg(`${data.length} rows — ${res.data.executionTime}ms`);
      } else if (data?.affectedRows !== undefined) {
        setQueryMsg(`✅ ${data.affectedRows} rows affected`);
      } else {
        setQueryMsg('Query successful!');
      }
    } catch (err) {
      setQueryError(err.response?.data?.error || 'Query failed!');
    } finally {
      setQueryLoading(false);
    }
  };

  const getBackupQuery = () => {
    const params = new URLSearchParams();
    if (id) params.append('connectionId', id);
    if (database) params.append('database', database);
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  const takeBackup = async () => {
    setBackupLoading(true);
    setBackupError('');
    setBackupMsg('');
    try {
      const res = await API.get(`/backup/download${getBackupQuery()}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `backup_${Date.now()}.sql`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setBackupMsg('✅ Backup download ho gaya!');
    } catch (err) {
      setBackupError('❌ Backup failed!');
    } finally {
      setBackupLoading(false);
    }
  };

  const restoreBackup = async () => {
    if (!selectedFile) {
      setBackupError('Pehle .sql file select karo!');
      return;
    }
    if (!window.confirm('Database restore karoge?')) return;
    setRestoreLoading(true);
    setBackupError('');
    setBackupMsg('');
    try {
      const formData = new FormData();
      formData.append('sqlFile', selectedFile);
      const res = await API.post(`/backup/restore${getBackupQuery()}`, formData);
      setBackupMsg(`✅ Restore ho gaya! ${res.data.statements} statements run kiye`);
      setSelectedFile(null);
    } catch (err) {
      setBackupError(err.response?.data?.error || '❌ Restore failed!');
    } finally {
      setRestoreLoading(false);
    }
  };

  const deleteHistory = async (histId) => {
    try {
      await API.delete(`/history/${histId}`);
      setHistory(history.filter(h => h._id !== histId));
    } catch (err) {
      console.error(err);
    }
  };

  const getTablesArray = () => {
    if (!objects) return [];
    const { type, result } = objects;
    if (type === 'mysql') return result.tables?.map(t => Object.values(t)[0]) || [];
    if (type === 'postgresql') return result.tables?.map(t => t.table_name) || [];
    if (type === 'mongodb') return result.collections?.map(c => c.name) || [];
    return [];
  };

  const getTypeIcon = (type) => {
    if (type === 'mysql') return '🐬';
    if (type === 'postgresql') return '🐘';
    if (type === 'mongodb') return '🍃';
    return '🗄️';
  };

  const dbType = objects?.type;
  const tables = getTablesArray();

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'table', label: '📋 Table Data' },
    { id: 'query', label: '⚡ Query Editor' },
    { id: 'history', label: '🕐 History' },
    { id: 'monitoring', label: '📈 Monitoring' },
    { id: 'slow-queries', label: '🐢 Slow Query' },
    ...(dbType === 'mysql' ? [
      { id: 'backup', label: '💾 Backup' },
      { id: 'binlog', label: '📡 Binlog Monitor' }
    ] : []),
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Connecting to database...</p>
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
            {getTypeIcon(dbType)} {stats?.database}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            dbType === 'mysql' ? 'bg-blue-100 text-blue-700' :
            dbType === 'postgresql' ? 'bg-indigo-100 text-indigo-700' :
            'bg-green-100 text-green-700'
          }`}>
            {dbType}
          </span>
        </div>
      </nav>

      <div className="flex h-[calc(100vh-53px)]">

        {/* Sidebar */}
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {dbType === 'mongodb' ? 'Collections' : 'Tables'} ({tables.length})
            </p>
            <button
              onClick={fetchAll}
              title="Refresh Schema"
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M21 4v5h-5" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {tables.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 py-3">Koi table nahi mili</p>
            ) : (
              tables.map((table, i) => (
                <button
                  key={i}
                  onClick={() => fetchTableData(table)}
                  className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-50 transition ${
                    selectedTable === table
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {dbType === 'mongodb' ? '📁' : '📋'} {table}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tabs */}
          <div className="bg-white border-b border-gray-200 px-6 flex gap-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'history') fetchHistory();
                  if (tab.id === 'monitoring') fetchMonitoring();
                }}
                className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">

            {error && (
              <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
                ❌ {error}
              </div>
            )}

            {/* OVERVIEW */}
            {activeTab === 'overview' && stats && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Database Overview</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {dbType === 'mysql' && [
                    { label: 'Database', value: stats.database },
                    { label: 'Size', value: `${stats.sizeMB} MB` },
                    { label: 'Tables', value: stats.totalTables },
                    { label: 'Connections', value: stats.activeConnections },
                  ].map((item, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                      <p className="text-xl font-bold text-gray-900">{item.value}</p>
                    </div>
                  ))}
                  {dbType === 'postgresql' && [
                    { label: 'Database', value: stats.database },
                    { label: 'Size', value: stats.size },
                    { label: 'Tables', value: stats.totalTables },
                  ].map((item, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                      <p className="text-xl font-bold text-gray-900">{item.value}</p>
                    </div>
                  ))}
                  {dbType === 'mongodb' && [
                    { label: 'Database', value: stats.database },
                    { label: 'Collections', value: stats.collections },
                    { label: 'Documents', value: stats.documents },
                    { label: 'Size', value: `${stats.sizeMB} MB` },
                  ].map((item, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                      <p className="text-xl font-bold text-gray-900">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    {dbType === 'mongodb' ? 'Collections' : 'Tables'}
                  </h3>
                  <div className="space-y-2">
                    {tables.map((table, i) => (
                      <div
                        key={i}
                        onClick={() => fetchTableData(table)}
                        className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition"
                      >
                        <span className="text-sm text-gray-700">
                          {dbType === 'mongodb' ? '📁' : '📋'} {table}
                        </span>
                        <span className="text-xs text-gray-400">View →</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TABLE DATA */}
            {activeTab === 'table' && (
              <div>
                {!selectedTable ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <p className="text-gray-400 text-sm">Left sidebar se table select karo</p>
                  </div>
                ) : tableLoading ? (
                  <div className="text-center py-12">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto"></div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">{selectedTable}</h3>
                      <span className="text-xs text-gray-400">{tableData.length} rows</span>
                    </div>
                    {tableData.length === 0 ? (
                      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                        <p className="text-gray-400 text-sm">Koi data nahi hai</p>
                      </div>
                    ) : dbType === 'mongodb' ? (
                      <div className="space-y-3">
                        {tableData.map((doc, i) => (
                          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                            <pre className="text-xs text-gray-700 overflow-x-auto">
                              {JSON.stringify(doc, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                {tableColumns.map((col, i) => (
                                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                                    {col.Field || col.name || col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {tableData.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  {tableColumns.map((col, j) => (
                                    <td key={j} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                      {row[col.Field || col.name] === null ? (
                                        <span className="text-gray-300 italic">null</span>
                                      ) : String(row[col.Field || col.name])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* QUERY EDITOR */}
            {activeTab === 'query' && (
              <div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                  <div className="flex gap-2 flex-wrap mb-3">
                    {['SHOW TABLES', 'SELECT * FROM users', 'SHOW DATABASES'].map((hint, i) => (
                      <button
                        key={i}
                        onClick={() => setQuery(hint)}
                        className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') runQuery(); }}
                    rows={6}
                    placeholder="SQL query yahan likho — Ctrl+Enter se run karo"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:border-gray-500 resize-none bg-gray-50"
                  />
                  <div className="flex justify-between items-center mt-3">
                    <p className="text-xs text-gray-400">⚠️ DROP, TRUNCATE allowed nahi</p>
                    <button
                      onClick={runQuery}
                      disabled={queryLoading}
                      className="px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-60"
                    >
                      {queryLoading ? 'Running...' : '▶ Run Query'}
                    </button>
                  </div>
                </div>
                {queryError && (
                  <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">❌ {queryError}</div>
                )}
                {queryMsg && !queryError && (
                  <div className="mb-4 bg-green-50 text-green-600 text-sm px-4 py-3 rounded-lg">✅ {queryMsg}</div>
                )}
                {queryResults.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            {queryColumns.map((col, i) => (
                              <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {queryResults.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              {queryColumns.map((col, j) => (
                                <td key={j} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                  {row[col] === null ? (
                                    <span className="text-gray-300 italic">null</span>
                                  ) : String(row[col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* HISTORY */}
            {activeTab === 'history' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Query History</h2>
                {historyLoading ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto"></div>
                  </div>
                ) : history.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <p className="text-gray-400 text-sm">Koi history nahi hai</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map(item => (
                      <div key={item._id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              item.status === 'success'
                                ? 'bg-green-100 text-green-600'
                                : 'bg-red-100 text-red-500'
                            }`}>
                              {item.status === 'success' ? '✓' : '✗'} {item.status}
                            </span>
                            <span className="text-xs text-gray-400">{item.executionTime}ms</span>
                            <span className="text-xs text-gray-400">{item.rowsAffected} rows</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">
                              {new Date(item.createdAt).toLocaleString('en-IN')}
                            </span>
                            <button
                              onClick={() => deleteHistory(item._id)}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <pre className="text-xs font-mono bg-gray-50 px-3 py-2 rounded-lg overflow-x-auto">
                          {item.query}
                        </pre>
                        <button
                          onClick={() => { setQuery(item.query); setActiveTab('query'); }}
                          className="mt-2 text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700"
                        >
                          Use this query
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MONITORING */}
            {activeTab === 'monitoring' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Database Monitoring</h2>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={fetchMonitoring}
                      disabled={monitorLoading}
                      className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-60"
                    >
                      {monitorLoading ? '...' : '🔄 Refresh'}
                    </button>
                    <button
                      onClick={() => setAutoRefresh(!autoRefresh)}
                      className={`px-4 py-2 text-sm rounded-lg transition ${
                        autoRefresh
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {autoRefresh ? '⏸ Auto ON' : '▶ Auto OFF'}
                    </button>
                    <button
                      onClick={downloadMonitoringPDF}
                      disabled={!monitorData}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      📥 Download PDF
                    </button>
                  </div>
                </div>

                {!monitorData ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <p className="text-gray-400 text-sm mb-4">Click karo data load karne ke liye</p>
                    <button
                      onClick={fetchMonitoring}
                      className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg"
                    >
                      Load Monitoring Data
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">

                    {/* MySQL - COMPREHENSIVE METRICS */}
                    {dbType === 'mysql' && (
                      <>
                        {/* Row 1: 5 Key Metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                          {/* Active / Max Connections with Progress Bar */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Connections</p>
                            <div className="mb-2">
                              <p className="text-2xl font-bold text-gray-900">
                                {monitorData.activeConnections}
                              </p>
                              <p className="text-xs text-gray-400">
                                max: {monitorData.maxConnections}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>Usage</span>
                                <span className={`font-bold ${
                                  (monitorData.activeConnections / monitorData.maxConnections) * 100 > 80 
                                    ? 'text-red-600' 
                                    : (monitorData.activeConnections / monitorData.maxConnections) * 100 > 50 
                                    ? 'text-yellow-600' 
                                    : 'text-green-600'
                                }`}>
                                  {Math.round((monitorData.activeConnections / monitorData.maxConnections) * 100)}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition ${
                                    (monitorData.activeConnections / monitorData.maxConnections) * 100 > 80 
                                      ? 'bg-red-500' 
                                      : (monitorData.activeConnections / monitorData.maxConnections) * 100 > 50 
                                      ? 'bg-yellow-500' 
                                      : 'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min((monitorData.activeConnections / monitorData.maxConnections) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* QPS */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Queries/Sec</p>
                            <p className="text-2xl font-bold text-gray-900 mb-1">{monitorData.queriesPerSecond}</p>
                            <p className="text-xs text-gray-400">kitna busy hai</p>
                          </div>

                          {/* Slow Queries */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Slow Queries</p>
                            <p className="text-2xl font-bold text-gray-900 mb-1">{monitorData.slowQueries}</p>
                            <p className="text-xs text-gray-400">optimize karo ⚠️</p>
                          </div>

                          {/* Database Size */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">DB Size</p>
                            <p className="text-2xl font-bold text-gray-900 mb-1">{monitorData.sizeMB}</p>
                            <p className="text-xs text-gray-400">MB</p>
                          </div>

                          {/* Total Tables */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Total Tables</p>
                            <p className="text-2xl font-bold text-gray-900 mb-1">{monitorData.totalTables}</p>
                            <p className="text-xs text-gray-400">tables</p>
                          </div>
                        </div>

                        {/* Row 2: Uptime, Bytes, Cache Hit Rate */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {/* Uptime */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Uptime</p>
                            <p className="text-xl font-bold text-gray-900 mb-1">
                              {Math.floor(monitorData.uptime / 3600)}h {Math.floor((monitorData.uptime % 3600) / 60)}m
                            </p>
                            <p className="text-xs text-gray-400">server chal raha hai</p>
                          </div>

                          {/* Bytes Sent */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Bytes Sent</p>
                            <p className="text-xl font-bold text-gray-900 mb-1">
                              {(monitorData.bytesSent / 1024 / 1024).toFixed(2)} MB
                            </p>
                            <p className="text-xs text-gray-400">network outgoing</p>
                          </div>

                          {/* Bytes Received */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Bytes Received</p>
                            <p className="text-xl font-bold text-gray-900 mb-1">
                              {(monitorData.bytesReceived / 1024 / 1024).toFixed(2)} MB
                            </p>
                            <p className="text-xs text-gray-400">network incoming</p>
                          </div>
                        </div>

                        {/* Cache Hit Rate */}
                        {monitorData.innodbHits > 0 && (
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-gray-500 font-medium uppercase">InnoDB Cache Hit Rate</p>
                              <span className={`text-sm font-bold ${
                                monitorData.cacheHitRate > 95 ? 'text-green-600' :
                                monitorData.cacheHitRate > 80 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {monitorData.cacheHitRate}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                              <div
                                className={`h-2.5 rounded-full ${
                                  monitorData.cacheHitRate > 95 ? 'bg-green-500' :
                                  monitorData.cacheHitRate > 80 ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(monitorData.cacheHitRate, 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-400 mt-2">buffer pool efficiency</p>
                          </div>
                        )}

                        {/* Table-wise Size - Top 10 */}
                        {tableDetails && tableDetails.length > 0 && (
                          <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">📊 Table-wise Size (Top 10)</h3>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-gray-600 font-medium">Table</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Rows</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Size (MB)</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Data (KB)</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Index (KB)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {tableDetails.map((table, i) => (
                                    <tr key={i} className="hover:bg-gray-50">
                                      <td className="px-3 py-2 text-gray-700 font-medium">{table.table}</td>
                                      <td className="px-3 py-2 text-right text-gray-600">{table.rows.toLocaleString()}</td>
                                      <td className="px-3 py-2 text-right text-gray-600">{table.sizeMB}</td>
                                      <td className="px-3 py-2 text-right text-gray-400 text-xs">
                                        {(table.dataSize / 1024).toFixed(1)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-gray-400 text-xs">
                                        {(table.indexSize / 1024).toFixed(1)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* PostgreSQL - COMPREHENSIVE METRICS */}
                    {dbType === 'postgresql' && (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Active Connections */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Connections</p>
                            <div className="mb-2">
                              <p className="text-2xl font-bold text-gray-900">{monitorData.activeConnections}</p>
                              <p className="text-xs text-gray-400">max: {monitorData.maxConnections}</p>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>Usage</span>
                                <span className="font-bold text-green-600">
                                  {Math.round((monitorData.activeConnections / monitorData.maxConnections) * 100)}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="bg-green-500 h-2 rounded-full"
                                  style={{ width: `${Math.min((monitorData.activeConnections / monitorData.maxConnections) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* DB Size */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Database Size</p>
                            <p className="text-xl font-bold text-gray-900">{monitorData.size}</p>
                          </div>

                          {/* Total Tables */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Total Tables</p>
                            <p className="text-2xl font-bold text-gray-900">{monitorData.totalTables}</p>
                          </div>

                          {/* Commits */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Commits</p>
                            <p className="text-xl font-bold text-gray-900">{monitorData.commits.toLocaleString()}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* Rollbacks */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Rollbacks</p>
                            <p className="text-xl font-bold text-gray-900">{monitorData.rollbacks.toLocaleString()}</p>
                          </div>

                          {/* Blocks Read */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Blocks Read</p>
                            <p className="text-xl font-bold text-gray-900">{monitorData.blocksRead.toLocaleString()}</p>
                          </div>

                          {/* Blocks Hit */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Blocks Hit</p>
                            <p className="text-xl font-bold text-gray-900">{monitorData.blocksHit.toLocaleString()}</p>
                          </div>
                        </div>
                      </>
                    )}

                    {/* MongoDB - COMPREHENSIVE METRICS */}
                    {dbType === 'mongodb' && (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Active Connections */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Connections</p>
                            <div className="mb-2">
                              <p className="text-2xl font-bold text-gray-900">{monitorData.activeConnections}</p>
                              <p className="text-xs text-gray-400">max: {monitorData.maxConnections}</p>
                            </div>
                          </div>

                          {/* Total Collections */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Collections</p>
                            <p className="text-2xl font-bold text-gray-900">{monitorData.totalCollections}</p>
                            <p className="text-xs text-gray-400">total</p>
                          </div>

                          {/* Total Documents */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">Documents</p>
                            <p className="text-2xl font-bold text-gray-900">{monitorData.totalDocuments.toLocaleString()}</p>
                          </div>

                          {/* DB Size */}
                          <div className="bg-white rounded-xl border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-2">DB Size</p>
                            <p className="text-xl font-bold text-gray-900">{monitorData.sizeMB}</p>
                            <p className="text-xs text-gray-400">MB</p>
                          </div>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 p-4">
                          <p className="text-xs text-gray-500 font-medium uppercase mb-2">Uptime</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {Math.round(monitorData.uptime / 60)} min
                          </p>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                          <h3 className="text-sm font-semibold text-gray-900 mb-4">Operation Counters</h3>
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={[monitorData.opCounters]}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Bar dataKey="insert" fill="#3b82f6" name="Insert" />
                              <Bar dataKey="query" fill="#10b981" name="Query" />
                              <Bar dataKey="update" fill="#f59e0b" name="Update" />
                              <Bar dataKey="delete" fill="#ef4444" name="Delete" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    )}

                    {/* Hourly Breakdown — Last 5 Hours */}
                    {monitorHistory && monitorHistory.length > 0 && (
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 mb-4">
                          📊 5-Hour Hourly Breakdown
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-3 py-2 text-left text-gray-600 font-medium">Hour</th>
                                <th className="px-3 py-2 text-right text-gray-600 font-medium">Connections</th>
                                {dbType === 'mysql' && (
                                  <>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">QPS</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Slow Queries</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Size (MB)</th>
                                  </>
                                )}
                                {dbType === 'postgresql' && (
                                  <>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Commits</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Rollbacks</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Blocks Hit</th>
                                  </>
                                )}
                                {dbType === 'mongodb' && (
                                  <>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Collections</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Documents</th>
                                    <th className="px-3 py-2 text-right text-gray-600 font-medium">Size (MB)</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {monitorHistory.map((hour, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-700 font-medium">{hour.hour}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{hour.activeConnections}</td>
                                  {dbType === 'mysql' && (
                                    <>
                                      <td className="px-3 py-2 text-right text-gray-700">{hour.queriesPerSecond}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">{hour.slowQueries}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">{hour.sizeMB}</td>
                                    </>
                                  )}
                                  {dbType === 'postgresql' && (
                                    <>
                                      <td className="px-3 py-2 text-right text-gray-700">{hour.commits}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">{hour.rollbacks}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">{hour.blocksHit}</td>
                                    </>
                                  )}
                                  {dbType === 'mongodb' && (
                                    <>
                                      <td className="px-3 py-2 text-right text-gray-700">{hour.totalCollections}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">{hour.totalDocuments}</td>
                                      <td className="px-3 py-2 text-right text-gray-700">{hour.sizeMB}</td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Hourly Trend Charts */}
                    {monitorHistory && monitorHistory.length > 1 && (
                      <>
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                          <h3 className="text-sm font-semibold text-gray-900 mb-4">
                            📈 Active Connections Trend (5 Hours)
                          </h3>
                          <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={monitorHistory}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Line
                                type="monotone"
                                dataKey="activeConnections"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ r: 4 }}
                                name="Connections"
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {dbType === 'mysql' && (
                          <>
                            <div className="bg-white rounded-xl border border-gray-200 p-5">
                              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                                ⚡ Queries Per Second Trend
                              </h3>
                              <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={monitorHistory}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                                  <YAxis />
                                  <Tooltip />
                                  <Legend />
                                  <Line
                                    type="monotone"
                                    dataKey="queriesPerSecond"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                    name="QPS"
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>

                            <div className="bg-white rounded-xl border border-gray-200 p-5">
                              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                                🐢 Slow Queries & Database Size
                              </h3>
                              <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={monitorHistory}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                                  <YAxis yAxisId="left" />
                                  <YAxis yAxisId="right" orientation="right" />
                                  <Tooltip />
                                  <Legend />
                                  <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="slowQueries"
                                    stroke="#f59e0b"
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                    name="Slow Queries"
                                  />
                                  <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="sizeMB"
                                    stroke="#ef4444"
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                    name="Size (MB)"
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </>
                        )}

                        {dbType === 'postgresql' && (
                          <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">
                              📊 Commits vs Rollbacks Trend
                            </h3>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={monitorHistory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line
                                  type="monotone"
                                  dataKey="commits"
                                  stroke="#10b981"
                                  strokeWidth={2}
                                  dot={{ r: 4 }}
                                  name="Commits"
                                />
                                <Line
                                  type="monotone"
                                  dataKey="rollbacks"
                                  stroke="#ef4444"
                                  strokeWidth={2}
                                  dot={{ r: 4 }}
                                  name="Rollbacks"
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {dbType === 'mongodb' && (
                          <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <h3 className="text-sm font-semibold text-gray-900 mb-4">
                              📁 Collections & Documents Trend
                            </h3>
                            <ResponsiveContainer width="100%" height={250}>
                              <LineChart data={monitorHistory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                                <YAxis yAxisId="left" />
                                <YAxis yAxisId="right" orientation="right" />
                                <Tooltip />
                                <Legend />
                                <Line
                                  yAxisId="left"
                                  type="monotone"
                                  dataKey="totalCollections"
                                  stroke="#3b82f6"
                                  strokeWidth={2}
                                  dot={{ r: 4 }}
                                  name="Collections"
                                />
                                <Line
                                  yAxisId="right"
                                  type="monotone"
                                  dataKey="totalDocuments"
                                  stroke="#10b981"
                                  strokeWidth={2}
                                  dot={{ r: 4 }}
                                  name="Documents"
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </>
                    )}

                    {/* Real-time Chart */}
                    {monitorHistory.length > 1 && (
                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <h3 className="text-sm font-semibold text-gray-900 mb-4">
                          Real-time Connections
                        </h3>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={monitorHistory}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="connections"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              dot={false}
                              name="Connections"
                            />
                            {dbType === 'mysql' && (
                              <Line
                                type="monotone"
                                dataKey="qps"
                                stroke="#10b981"
                                strokeWidth={2}
                                dot={false}
                                name="Queries/sec"
                              />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 text-right">
                      {autoRefresh ? '🟢 Auto refresh ON — every 5 sec' : '⚫ Auto refresh OFF'}
                    </p>

                  </div>
                )}
              </div>
            )}

            {/* BACKUP */}
            {activeTab === 'backup' && (
              <div className="max-w-lg">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Backup & Restore</h2>

                {backupError && (
                  <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{backupError}</div>
                )}
                {backupMsg && (
                  <div className="mb-4 bg-green-50 text-green-600 text-sm px-4 py-3 rounded-lg">{backupMsg}</div>
                )}

                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Take Backup</h3>
                  <p className="text-sm text-gray-500 mb-4">Poora database ek .sql file mein download karo</p>
                  <button
                    onClick={takeBackup}
                    disabled={backupLoading}
                    className="w-full py-2.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-60"
                  >
                    {backupLoading ? 'Backup ban raha hai...' : '⬇ Download Backup'}
                  </button>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Restore Backup</h3>
                  <p className="text-sm text-gray-500 mb-4">.sql file upload karo aur database restore karo</p>
                  <div
                    className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center mb-4 cursor-pointer hover:border-gray-400 transition"
                    onClick={() => document.getElementById('sqlFileConn').click()}
                  >
                    {selectedFile ? (
                      <div>
                        <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                        <p className="text-xs text-gray-400 mt-1">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Click karo .sql file select karne ke liye</p>
                    )}
                  </div>
                  <input
                    id="sqlFileConn"
                    type="file"
                    accept=".sql"
                    onChange={e => {
                      const file = e.target.files[0];
                      if (file?.name.endsWith('.sql')) setSelectedFile(file);
                      else setBackupError('Sirf .sql file select karo!');
                    }}
                    className="hidden"
                  />
                  <button
                    onClick={restoreBackup}
                    disabled={restoreLoading || !selectedFile}
                    className="w-full py-2.5 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 disabled:opacity-60"
                  >
                    {restoreLoading ? 'Restore ho raha hai...' : '⬆ Restore Database'}
                  </button>
                </div>
              </div>
            )}

            {/* SLOW QUERY */}
            {activeTab === 'slow-queries' && (
              <div>
                <SlowQueryPanel />
              </div>
            )}

            {/* BINLOG MONITOR */}
            {dbType === 'mysql' && (
              <div className={activeTab === 'binlog' ? 'block' : 'hidden'}>
                <BinlogMonitorPanel connectionId={id} />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}