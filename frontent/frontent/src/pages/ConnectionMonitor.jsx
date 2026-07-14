import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import Navbar from '../components/Navbar';
import AlertSettingsTab from '../components/AlertSettingsTab';
import AlertLogsList from '../components/AlertLogsList';
import { socket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';

export default function ConnectionMonitor() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id } = useParams();

  if (user?.role !== 'admin' && user?.permissions && !user.permissions.monitor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-left">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md text-center shadow-lg">
          <p className="text-4xl mb-4">🚫</p>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-500 mb-6">You do not have permission to access database Server Monitoring features.</p>
          <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition font-bold shadow-sm">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const [connectionName, setConnectionName] = useState('');
  const [dbType, setDbType] = useState('');
  const [loadingConn, setLoadingConn] = useState(true);

  // Monitoring States
  const [monitorData, setMonitorData] = useState(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorHistory, setMonitorHistory] = useState([]);
  const [tableDetails, setTableDetails] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [range, setRange] = useState('current');
  const [currentHourFilter, setCurrentHourFilter] = useState(5);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('metrics');
  const [activeToast, setActiveToast] = useState(null);

  // Fetch connection info first
  useEffect(() => {
    const fetchConnectionInfo = async () => {
      try {
        setLoadingConn(true);
        const res = await API.get('/connections');
        const conn = res.data.connections.find(c => c._id === id);
        if (conn) {
          setConnectionName(conn.name);
          setDbType(conn.type);
        } else {
          setError('Connection details not found.');
        }
      } catch (err) {
        console.error('Error fetching connection info:', err);
        setError('Failed to load connection details.');
      } finally {
        setLoadingConn(false);
      }
    };
    fetchConnectionInfo();
  }, [id]);

  // Fetch monitoring data
  const fetchMonitoring = async () => {
    setMonitorLoading(true);
    try {
      const rangeParams = `range=${range}` + (range === 'custom' ? `&startDate=${customStartDate}&endDate=${customEndDate}` : '');
      const [res, histRes] = await Promise.all([
        API.get(`/monitor/${id}`),
        API.get(`/monitor/${id}/history?${rangeParams}`),
      ]);
      const newData = res.data.data;
      setMonitorData(newData);

      // Store hourly data if available
      if (histRes.data.hourly && histRes.data.hourly.length > 0) {
        setMonitorHistory(histRes.data.hourly);
      } else {
        setMonitorHistory(prev => {
          const time = new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          });
          const newPoint = {
            hour: time,
            activeConnections: newData.activeConnections,
            queriesPerSecond: newData.queriesPerSecond || 0,
            slowQueries: newData.slowQueries || 0,
            sizeMB: newData.sizeMB || 0,
          };
          const updated = [...prev, newPoint];
          return updated.slice(-12);
        });
      }

      // Fetch table details separately (non-blocking)
      try {
        const tableRes = await API.get(`/monitor/${id}/tables`);
        if (tableRes.data.tables) {
          setTableDetails(tableRes.data.tables);
        }
      } catch (e) {
        console.log('Table details not available for whole connection');
      }
    } catch (err) {
      console.error('Monitor error:', err);
      setError('Failed to load monitoring metrics.');
    } finally {
      setMonitorLoading(false);
    }
  };

  // Trigger metrics fetch
  useEffect(() => {
    if (dbType) {
      fetchMonitoring();
    }
  }, [id, dbType, range, customStartDate, customEndDate]);

  // Auto-refresh interval
  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchMonitoring();
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, id]);

  // Real-time socket alerts listener
  useEffect(() => {
    socket.connect();
    
    const handleNewAlertGlobal = (alert) => {
      if (alert.connection === id) {
        setActiveToast(alert);
        // Clear toast after 6 seconds
        setTimeout(() => {
          setActiveToast(null);
        }, 6000);
      }
    };

    socket.on('new-alert', handleNewAlertGlobal);
    return () => {
      socket.off('new-alert', handleNewAlertGlobal);
    };
  }, [id]);

  const displayedHistory = range === 'current'
    ? monitorHistory.slice(-currentHourFilter)
    : monitorHistory;

  const downloadMonitoringPDF = async () => {
    if (!monitorData) {
      alert('Please load data first');
      return;
    }

    let historyTableHTML = '';
    if (displayedHistory && displayedHistory.length > 0) {
      historyTableHTML = `
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 8px; margin-top: 30px; font-size: 14px;">📊 Historical Breakdown (${range === 'current' ? `Live - Last ${currentHourFilter} Hours` : range})</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Time / Date</th>
              <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Connections</th>
              ${dbType === 'mysql' ? `
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Queries / Sec</th>
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Slow Queries</th>
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Size (MB)</th>
              ` : ''}
              ${dbType === 'postgresql' ? `
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Commits</th>
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Rollbacks</th>
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Blocks Hit</th>
              ` : ''}
              ${dbType === 'mongodb' ? `
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Collections</th>
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Documents</th>
                <th style="border: 1px solid #ddd; padding: 6px; text-align: right;">Size (MB)</th>
              ` : ''}
            </tr>
          </thead>
          <tbody>
            ${displayedHistory.map((hour, idx) => `
              <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f9f9f9'};">
                <td style="border: 1px solid #ddd; padding: 6px; font-weight: 500;">${hour.hour}</td>
                <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.activeConnections}</td>
                ${dbType === 'mysql' ? `
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.queriesPerSecond}</td>
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.slowQueries}</td>
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.sizeMB}</td>
                ` : ''}
                ${dbType === 'postgresql' ? `
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.commits}</td>
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.rollbacks}</td>
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.blocksHit}</td>
                ` : ''}
                ${dbType === 'mongodb' ? `
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.totalCollections}</td>
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.totalDocuments}</td>
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${hour.sizeMB}</td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const element = document.createElement('div');
    element.style.padding = '20px';
    element.style.fontFamily = 'Arial, sans-serif';
    element.style.fontSize = '12px';
    element.innerHTML = `
      <h1 style="text-align: center; margin-bottom: 30px;">📊 Database Monitoring Report</h1>
      
      <div style="margin-bottom: 20px;">
        <strong>Database Connection:</strong> ${connectionName || 'N/A'}<br/>
        <strong>Type:</strong> ${dbType?.toUpperCase() || 'N/A'}<br/>
        <strong>Database Scope:</strong> Whole Connection (All databases)<br/>
        <strong>Monitoring Range:</strong> ${range === 'current' ? `Live (Filters: ${currentHourFilter} Hour${currentHourFilter > 1 ? 's' : ''})` : range}<br/>
        <strong>Generated:</strong> ${new Date().toLocaleString('en-IN')}<br/>
      </div>

      ${dbType === 'mysql' ? `
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 10px;">MySQL Current Metrics</h2>
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
      ` : ''}

      ${dbType === 'postgresql' ? `
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 10px;">PostgreSQL Current Metrics</h2>
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
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 10px;">MongoDB Current Metrics</h2>
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

      ${historyTableHTML}

      <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #999; font-size: 10px; color: #666;">
        <p>Generated by Database Manager | ${new Date().toLocaleString('en-IN')}</p>
      </div>
    `;

    const options = {
      margin: 10,
      filename: `monitoring-${connectionName || 'database'}-${new Date().getTime()}.pdf`,
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

  const getTypeIcon = (type) => {
    if (type === 'mysql') return '🐬';
    if (type === 'postgresql') return '🐘';
    if (type === 'mongodb') return '🍃';
    return '🗄️';
  };

  if (loadingConn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading monitoring configurations...</p>
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
            {getTypeIcon(dbType)} {connectionName} (Connection Monitoring)
          </span>
        }
      />

      <div className="w-[90%] mx-auto py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Database Connection Monitoring</h2>
            <p className="text-sm text-gray-500 mt-1">
              Entire database server connection stats and live performance metrics.
            </p>
          </div>
          {activeTab === 'metrics' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Range:</span>
                <select
                  value={range}
                  onChange={(e) => {
                    setRange(e.target.value);
                    setAutoRefresh(false); // turn off auto refresh for historical data views
                  }}
                  className="px-3 py-2 bg-white border border-gray-350 text-gray-700 text-xs font-bold rounded-lg hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0d9da4] transition shadow-xs"
                >
                  <option value="current">current (live)</option>
                  <option value="1day">1day</option>
                  <option value="2day">2day</option>
                  <option value="3day">3day</option>
                  <option value="4day">4day</option>
                  <option value="5day">5day</option>
                  <option value="custom">custom date</option>
                </select>
              </div>
              {range === 'custom' && (
                <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-300">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2 py-1 bg-white border border-gray-250 rounded text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0d9da4]"
                  />
                  <span className="text-gray-450 text-xs font-bold">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 bg-white border border-gray-250 rounded text-xs font-semibold text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#0d9da4]"
                  />
                </div>
              )}
              <button
                onClick={fetchMonitoring}
                disabled={monitorLoading}
                className="px-4 py-2 border border-gray-300 bg-white text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-60 font-medium transition"
              >
                {monitorLoading ? 'Loading...' : '🔄 Refresh'}
              </button>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-4 py-2 text-sm rounded-lg transition font-medium ${
                  autoRefresh
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {autoRefresh ? '⏸ Auto ON' : '▶ Auto OFF'}
              </button>
              <button
                onClick={downloadMonitoringPDF}
                disabled={!monitorData}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed font-medium transition"
              >
                📥 Download PDF
              </button>
            </div>
          )}
        </div>

        {/* Tab Switcher Navigation */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('metrics')}
            className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'metrics'
                ? 'text-[#0d9da4]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
            style={activeTab === 'metrics' ? { borderColor: '#0d9da4' } : {}}
          >
            📊 Live Metrics
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'alerts'
                ? 'text-[#0d9da4]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
            style={activeTab === 'alerts' ? { borderColor: '#0d9da4' } : {}}
          >
            🚨 Active Alerts
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'settings'
                ? 'text-[#0d9da4]'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
            style={activeTab === 'settings' ? { borderColor: '#0d9da4' } : {}}
          >
            ⚙️ Alert Settings
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg border border-red-200">
            ❌ {error}
          </div>
        )}

        {activeTab === 'metrics' && (
          <>
            {!monitorData ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
            <p className="text-gray-400 text-sm mb-4">Click "Load" to start fetching monitoring data</p>
            <button
              onClick={fetchMonitoring}
              className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm rounded-lg font-semibold transition"
            >
              Load Monitoring Data
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Hour Filter buttons for Current Live mode */}
            {range === 'current' && monitorHistory && monitorHistory.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-250 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-gray-900">📊 Hourly Breakdown (Live (5 Hours))</h4>
                  <p className="text-[10px] text-gray-400 mt-0.5">Filter the breakdown timeline display range below.</p>
                </div>
                <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl border border-gray-200">
                  {[1, 2, 3, 4, 5].map(h => (
                    <button
                      key={h}
                      onClick={() => setCurrentHourFilter(h)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                        currentHourFilter === h
                          ? 'bg-white text-gray-900 shadow-xs border border-gray-200/50'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {h}hour
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* MySQL Grid */}
            {dbType === 'mysql' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Connections</p>
                    <div className="mb-2">
                      <p className="text-2xl font-bold text-gray-900">{monitorData.activeConnections}</p>
                      <p className="text-xs text-gray-400">max: {monitorData.maxConnections}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Usage</span>
                        <span className={`font-bold ${
                          (monitorData.activeConnections / monitorData.maxConnections) * 100 > 80 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {Math.round((monitorData.activeConnections / monitorData.maxConnections) * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            (monitorData.activeConnections / monitorData.maxConnections) * 100 > 80 ? 'bg-red-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min((monitorData.activeConnections / monitorData.maxConnections) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">QPS</p>
                    <p className="text-2xl font-bold text-gray-900">{monitorData.queriesPerSecond}</p>
                    <p className="text-xs text-gray-400 mt-1">Queries / Second</p>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Slow Queries</p>
                    <p className={`text-2xl font-bold ${monitorData.slowQueries > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                      {monitorData.slowQueries}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Total recorded</p>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Server Size</p>
                    <p className="text-2xl font-bold text-gray-900">{monitorData.sizeMB}</p>
                    <p className="text-xs text-gray-400 mt-1">MB (All databases)</p>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Total Tables</p>
                    <p className="text-2xl font-bold text-gray-900">{monitorData.totalTables}</p>
                    <p className="text-xs text-gray-400 mt-1">Across all databases</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Server Uptime</p>
                    <p className="text-lg font-bold text-gray-900">
                      {Math.floor(monitorData.uptime / 86400)}d {Math.floor((monitorData.uptime % 86400) / 3600)}h {Math.floor((monitorData.uptime % 3600) / 60)}m
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Network Traffic Sent</p>
                    <p className="text-lg font-bold text-gray-900">
                      {(monitorData.bytesSent / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Network Traffic Received</p>
                    <p className="text-lg font-bold text-gray-900">
                      {(monitorData.bytesReceived / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs flex justify-between items-center">
                  <div>
                    <h3 className="text-xs text-gray-500 font-bold uppercase">InnoDB Buffer Pool Cache Hit Rate</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Higher is better. Measures database reading efficiency from memory vs disk.</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-gray-900">{monitorData.cacheHitRate}%</span>
                  </div>
                </div>
              </>
            )}

            {/* PostgreSQL Grid */}
            {dbType === 'postgresql' && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-2">Active Connections</p>
                  <p className="text-2xl font-bold text-gray-900">{monitorData.activeConnections}</p>
                  <p className="text-xs text-gray-400">max: {monitorData.maxConnections}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-2">Database Size</p>
                  <p className="text-2xl font-bold text-gray-900">{monitorData.size}</p>
                  <p className="text-xs text-gray-400">Disk space used</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-2">Total Tables</p>
                  <p className="text-2xl font-bold text-gray-900">{monitorData.totalTables}</p>
                  <p className="text-xs text-gray-400">Public schema</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-2">Commits / Rollbacks</p>
                  <p className="text-xl font-bold text-gray-900">
                    {monitorData.commits.toLocaleString()} / {monitorData.rollbacks.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">Transaction counts</p>
                </div>
              </div>
            )}

            {/* MongoDB Grid */}
            {dbType === 'mongodb' && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-2">Connections</p>
                  <p className="text-2xl font-bold text-gray-900">{monitorData.activeConnections}</p>
                  <p className="text-xs text-gray-400">available: {monitorData.maxConnections}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-2">Collections</p>
                  <p className="text-2xl font-bold text-gray-900">{monitorData.totalCollections}</p>
                  <p className="text-xs text-gray-400">collections</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-2">Total Documents</p>
                  <p className="text-2xl font-bold text-gray-900">{monitorData.totalDocuments.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">records</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-2">Database Size</p>
                  <p className="text-2xl font-bold text-gray-900">{monitorData.sizeMB} MB</p>
                  <p className="text-xs text-gray-400">Total data size</p>
                </div>
              </div>
            )}

            {/* Hourly Trend charts */}
            {monitorHistory && monitorHistory.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* 1. Active Connections */}
                <div className="bg-white rounded-2xl border border-gray-250 p-5 shadow-xs">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                    📈 Active Connections Trend ({range === 'current' ? 'Live (5 Hours)' : (range === 'custom' ? 'Custom Range' : range)})
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={displayedHistory}>
                      <defs>
                        <linearGradient id="colorConnections" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontWeight: 'bold', fontSize: '10px', color: '#111827' }}
                        itemStyle={{ fontSize: '11px' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="activeConnections"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorConnections)"
                        name="Active Connections"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 2. Queries Per Second */}
                {dbType === 'mysql' && (
                  <div className="bg-white rounded-2xl border border-gray-250 p-5 shadow-xs">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                      ⚡ Queries Per Second Trend ({range === 'current' ? 'Live (5 Hours)' : (range === 'custom' ? 'Custom Range' : range)})
                    </h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={displayedHistory}>
                        <defs>
                          <linearGradient id="colorQPS" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          labelStyle={{ fontWeight: 'bold', fontSize: '10px', color: '#111827' }}
                          itemStyle={{ fontSize: '11px' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="queriesPerSecond"
                          stroke="#10b981"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#colorQPS)"
                          name="Queries / Sec"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 3. Slow Queries */}
                <div className="bg-white rounded-2xl border border-gray-250 p-5 shadow-xs">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                    ⚠️ Slow Queries Trend ({range === 'current' ? 'Live (5 Hours)' : (range === 'custom' ? 'Custom Range' : range)})
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={displayedHistory}>
                      <defs>
                        <linearGradient id="colorSlow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontWeight: 'bold', fontSize: '10px', color: '#111827' }}
                        itemStyle={{ fontSize: '11px' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="slowQueries"
                        stroke="#ef4444"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorSlow)"
                        name="Slow Queries"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 4. Database Size */}
                <div className="bg-white rounded-2xl border border-gray-250 p-5 shadow-xs">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                    💾 Server Size (MB) ({range === 'current' ? 'Live (5 Hours)' : (range === 'custom' ? 'Custom Range' : range)})
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={displayedHistory}>
                      <defs>
                        <linearGradient id="colorSize" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontWeight: 'bold', fontSize: '10px', color: '#111827' }}
                        itemStyle={{ fontSize: '11px' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="sizeMB"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorSize)"
                        name="Size (MB)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 5. Total Tables */}
                <div className="bg-white rounded-2xl border border-gray-250 p-5 shadow-xs">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                    📋 Total Tables Trend ({range === 'current' ? 'Live (5 Hours)' : (range === 'custom' ? 'Custom Range' : range)})
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={displayedHistory}>
                      <defs>
                        <linearGradient id="colorTables" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ec4899" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontWeight: 'bold', fontSize: '10px', color: '#111827' }}
                        itemStyle={{ fontSize: '11px' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalTables"
                        stroke="#ec4899"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorTables)"
                        name="Total Tables"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 6. Network Traffic */}
                <div className="bg-white rounded-2xl border border-gray-250 p-5 shadow-xs">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                    🌐 Network Traffic (MB) ({range === 'current' ? 'Live (5 Hours)' : (range === 'custom' ? 'Custom Range' : range)})
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={displayedHistory}>
                      <defs>
                        <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorRecv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontWeight: 'bold', fontSize: '10px', color: '#111827' }}
                        itemStyle={{ fontSize: '11px' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="bytesSent"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorSent)"
                        name="Bytes Sent (MB)"
                        // convert bytes to MB inside tooltips if they want, but mapping raw metrics is good
                      />
                      <Area
                        type="monotone"
                        dataKey="bytesReceived"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorRecv)"
                        name="Bytes Received (MB)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Hourly History Table */}
            {monitorHistory && monitorHistory.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-250 p-5 shadow-xs">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                  📊 Hourly Breakdown ({range === 'current' ? 'Live (5 Hours)' : range})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-gray-600 font-semibold">Hour</th>
                        <th className="px-4 py-3 text-right text-gray-600 font-semibold">Connections</th>
                        {dbType === 'mysql' && (
                          <>
                            <th className="px-4 py-3 text-right text-gray-600 font-semibold">QPS</th>
                            <th className="px-4 py-3 text-right text-gray-600 font-semibold">Slow Queries</th>
                            <th className="px-4 py-3 text-right text-gray-600 font-semibold">Size (MB)</th>
                          </>
                        )}
                        {dbType === 'postgresql' && (
                          <>
                            <th className="px-4 py-3 text-right text-gray-600 font-semibold">Commits</th>
                            <th className="px-4 py-3 text-right text-gray-600 font-semibold">Rollbacks</th>
                            <th className="px-4 py-3 text-right text-gray-600 font-semibold">Blocks Hit</th>
                          </>
                        )}
                        {dbType === 'mongodb' && (
                          <>
                            <th className="px-4 py-3 text-right text-gray-600 font-semibold">Collections</th>
                            <th className="px-4 py-3 text-right text-gray-600 font-semibold">Documents</th>
                            <th className="px-4 py-3 text-right text-gray-600 font-semibold">Size (MB)</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {displayedHistory.map((hour, i) => (
                        <tr key={i} className="hover:bg-gray-50 align-middle">
                          <td className="px-4 py-2.5 text-gray-700 font-medium">{hour.hour}</td>
                          <td className="px-4 py-2.5 text-right text-gray-700">{hour.activeConnections}</td>
                          {dbType === 'mysql' && (
                            <>
                              <td className="px-4 py-2.5 text-right text-gray-700">{hour.queriesPerSecond}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700">{hour.slowQueries}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700">{hour.sizeMB}</td>
                            </>
                          )}
                          {dbType === 'postgresql' && (
                            <>
                              <td className="px-4 py-2.5 text-right text-gray-700">{hour.commits}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700">{hour.rollbacks}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700">{hour.blocksHit}</td>
                            </>
                          )}
                          {dbType === 'mongodb' && (
                            <>
                              <td className="px-4 py-2.5 text-right text-gray-700">{hour.totalCollections}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700">{hour.totalDocuments}</td>
                              <td className="px-4 py-2.5 text-right text-gray-700">{hour.sizeMB}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
          </div>
        )}
          </>
        )}

        {activeTab === 'alerts' && (
          <AlertLogsList connectionId={id} />
        )}

        {activeTab === 'settings' && (
          <AlertSettingsTab connectionId={id} />
        )}
      </div>

      {/* Real-time Toast alert overlay */}
      {activeToast && (
        <div className="fixed bottom-6 right-6 max-w-sm bg-red-650 text-white rounded-xl border border-red-500 shadow-2xl p-4 z-50 flex items-start gap-3 text-left">
          <span className="text-xl">🚨</span>
          <div>
            <p className="text-xs font-bold">New Database Alert ({activeToast.severity.toUpperCase()})</p>
            <p className="text-[11px] text-red-100 mt-1">{activeToast.message}</p>
            <button
              onClick={() => setActiveToast(null)}
              className="text-[10px] underline mt-1.5 block hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
