import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import SlowQueryPanel from '../components/SlowQueryPanel';
import Navbar from '../components/Navbar';
import AuditLogsPanel from '../components/AuditLogsPanel';
import { useAuth } from '../context/AuthContext';

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useLocation } from 'react-router-dom';

export default function ConnectionDashboard() {
  const { id, database } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const textareaRef = useRef(null);
  const fullscreenTextareaRef = useRef(null);
  
  const [objects, setObjects] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isQueryMaximized, setIsQueryMaximized] = useState(false);

  // Database context states
  const [databases, setDatabases] = useState([]);
  const [activeDb, setActiveDb] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);

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
    const initializeConnection = async () => {
      try {
        setLoading(true);
        // 1. Fetch connection details to check default database config
        const connRes = await API.get('/connections');
        const conn = connRes.data.connections.find(c => c._id === id);
        const configuredDefault = conn ? conn.database : null;

        if (conn) {
          const ownerCheck = conn.user?._id === user?._id || user?.role === 'admin';
          setIsOwner(ownerCheck);
        }

        // 2. Fetch list of databases on this connection
        const dbRes = await API.get(`/connections/${id}/databases`);
        const dbList = dbRes.data.databases || [];
        setDatabases(dbList);

        // 3. Determine initial database to activate
        const initialDb = database || configuredDefault || dbList[0] || '';
        setActiveDb(initialDb);

        if (initialDb) {
          await selectDatabase(initialDb);
        }
      } catch (err) {
        console.error('Failed to initialize connection:', err);
        setError('Failed to load databases - connection check query failed');
      } finally {
        setLoading(false);
      }
    };
    initializeConnection();
  }, [id, user]);

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

  const selectDatabase = async (dbName) => {
    if (!dbName) return;
    setActiveDb(dbName);
    setSelectedTable(null);
    setTableData([]);
    setTableColumns([]);
    
    try {
      setDbLoading(true);
      const [objRes, statsRes] = await Promise.all([
        API.get(`/connections/${id}/objects?database=${encodeURIComponent(dbName)}`),
        API.get(`/connections/${id}/stats?database=${encodeURIComponent(dbName)}`),
      ]);
      setObjects(objRes.data);
      setStats(statsRes.data.stats);
    } catch (err) {
      console.error('Failed to select database:', err);
      setError('Data load failed - check database connection');
    } finally {
      setDbLoading(false);
    }
  };

  const fetchAll = () => {
    if (activeDb) {
      selectDatabase(activeDb);
    }
  };

  const fetchTableData = async (tableName) => {
    setTableLoading(true);
    setSelectedTable(tableName);
    setActiveTab('table');
    try {
      const res = await API.get(
        `/connections/${id}/table/${tableName}${activeDb ? `?database=${encodeURIComponent(activeDb)}` : ''}`
      );
      setTableData(res.data.rows);
      setTableColumns(res.data.columns);
    } catch (err) {
      setError('Failed to load table data');
    } finally {
      setTableLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await API.get(`/history?connectionId=${id}`);
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
        API.get(`/monitor/${id}${activeDb ? `?database=${encodeURIComponent(activeDb)}` : ''}`),
        API.get(`/monitor/${id}/history${activeDb ? `?database=${encodeURIComponent(activeDb)}` : ''}`),
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
        const tableRes = await API.get(`/monitor/${id}/tables${activeDb ? `?database=${encodeURIComponent(activeDb)}` : ''}`);
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
      alert('Please load data first');
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
        <strong>Database:</strong> ${activeDb || 'All'}<br/>
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

  const runQuery = async (forceRunAll = false) => {
    let queryToRun = query;
    let isSelection = false;

    // Check if fullscreen editor is open and has selection
    if (!forceRunAll && isQueryMaximized && fullscreenTextareaRef.current) {
      const start = fullscreenTextareaRef.current.selectionStart;
      const end = fullscreenTextareaRef.current.selectionEnd;
      const selectedText = query.substring(start, end).trim();
      if (selectedText) {
        queryToRun = selectedText;
        isSelection = true;
      }
    } 
    // Check if inline editor has selection
    else if (!forceRunAll && textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const selectedText = query.substring(start, end).trim();
      if (selectedText) {
        queryToRun = selectedText;
        isSelection = true;
      }
    }

    if (!queryToRun.trim()) return;
    setQueryLoading(true);
    setQueryError('');
    setQueryMsg('');
    setQueryResults([]);
    setQueryColumns([]);
    try {
      const queryPath = `/connections/${id}/query${activeDb ? `?database=${encodeURIComponent(activeDb)}` : ''}`;
      const res = await API.post(queryPath, { query: queryToRun });
      
      if (res.data.databaseChanged) {
        setQueryMsg(`Database changed to ${res.data.databaseChanged}`);
        selectDatabase(res.data.databaseChanged);
        return;
      }

      const data = res.data.results;
      const selectionSuffix = isSelection ? ' (Executed selection)' : '';
      if (Array.isArray(data) && data.length > 0) {
        setQueryColumns(Object.keys(data[0]));
        setQueryResults(data);
        setQueryMsg(`${data.length} rows — ${res.data.executionTime}ms${selectionSuffix}`);
      } else if (data?.affectedRows !== undefined) {
        setQueryMsg(`✅ ${data.affectedRows} rows affected${selectionSuffix}`);
      } else {
        setQueryMsg(`Query executed successfully!${selectionSuffix}`);
      }
    } catch (err) {
      setQueryError(err.response?.data?.error || 'Query failed!');
    } finally {
      setQueryLoading(false);
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

  const hasPermission = (permKey) => {
    if (user?.role === 'admin') return true;
    if (!user?.permissions) return false;
    return !!user.permissions[permKey];
  };

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'table', label: '📋 Table Data' }
  ];

  if (hasPermission('query')) {
    tabs.push({ id: 'query', label: '⚡ Query Editor' });
  }
  if (hasPermission('history')) {
    tabs.push({ id: 'history', label: '🕐 History' });
  }
  if (hasPermission('slowQuery')) {
    tabs.push({ id: 'slow-queries', label: '🐢 Slow Query' });
  }
  if (isOwner && hasPermission('auditLogs')) {
    tabs.push({ id: 'audit-logs', label: '📜 Audit Logs' });
  }

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
      <Navbar
        backTo="/connections"
        backText="Connections"
        extraLeft={
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {getTypeIcon(dbType)} {activeDb || stats?.database || 'Select Database'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              dbType === 'mysql' ? 'bg-blue-100 text-blue-700' :
              dbType === 'postgresql' ? 'bg-indigo-100 text-indigo-700' :
              'bg-green-100 text-green-700'
            }`}>
              {dbType}
            </span>
          </div>
        }
      />

      <div className="flex h-[calc(100vh-53px)] relative">

        {/* Sidebar (on the left showing databases) */}
        <div className={`${sidebarOpen ? 'w-44' : 'w-0 overflow-hidden'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 shrink-0`}>
          <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Databases ({databases.length})
            </p>
            <button
              onClick={async () => {
                try {
                  const dbRes = await API.get(`/connections/${id}/databases`);
                  setDatabases(dbRes.data.databases || []);
                } catch (e) {
                  console.error(e);
                }
              }}
              title="Refresh Databases"
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M21 4v5h-5" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {databases.length === 0 ? (
              <p className="text-[10px] text-gray-400 px-3 py-3">No databases</p>
            ) : (
              databases.map((db, i) => (
                <button
                  key={i}
                  onClick={() => selectDatabase(db)}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold border-b border-gray-50/50 transition flex items-center gap-1.5 ${
                    activeDb === db
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  title={db}
                >
                  <span className="shrink-0 text-sm">🗄️</span>
                  <span className="truncate">{db}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Sidebar Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-1/2 z-20 w-6 h-6 bg-white border border-gray-200 shadow-md rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-all duration-300 focus:outline-none"
          style={{
            left: sidebarOpen ? '164px' : '4px',
            transform: 'translateY(-50%)',
          }}
          title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {sidebarOpen ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>

        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tabs */}
          <div className="bg-white border-b border-gray-200 px-6 flex justify-between items-center overflow-x-auto gap-4">
            <div className="flex gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'history') fetchHistory();
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

            {/* Active Database Badge on the Right Side */}
            {activeDb && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs font-bold text-gray-700 shrink-0 select-none shadow-2xs">
                <span>Active DB:</span>
                <span className="font-mono text-gray-900 bg-white px-1.5 py-0.5 rounded border border-gray-150">
                  {activeDb}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">

            {error && (
              <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
                ❌ {error}
              </div>
            )}

            {dbLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin mb-3"></div>
                <p className="text-gray-500 text-xs font-semibold">Switching database schema...</p>
              </div>
            ) : (
              <>
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
                    <p className="text-gray-400 text-sm">Left sidebar se table select karein</p>
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
                        <p className="text-gray-400 text-sm">No data found</p>
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
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex gap-2 flex-wrap">
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
                    <button
                      onClick={() => setIsQueryMaximized(true)}
                      className="text-xs font-semibold text-[#0d9da4] hover:underline flex items-center gap-1.5"
                    >
                      🗖 Expand Fullscreen
                    </button>
                  </div>

                  {/* Query Toolbar */}
                  <div className="flex items-center gap-2 mb-3 border-t border-gray-100 pt-3">
                    <button
                      type="button"
                      onClick={() => runQuery(false)}
                      disabled={queryLoading || !query.trim()}
                      title="Execute Selection or Current Statement (Ctrl+Enter)"
                      className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <span>⚡</span> Run Selection
                    </button>
                    <button
                      type="button"
                      onClick={() => runQuery(true)}
                      disabled={queryLoading || !query.trim()}
                      title="Execute Entire Script"
                      className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <span>📜</span> Run All
                    </button>
                  </div>

                  <textarea
                    ref={textareaRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') runQuery(false); }}
                    rows={6}
                    placeholder="Write SQL query here — Press Ctrl+Enter to run"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:border-gray-500 resize-none bg-gray-50"
                  />
                  <div className="flex justify-between items-center mt-3">
                    <button
                      onClick={() => runQuery(false)}
                      disabled={queryLoading}
                      className="px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-60"
                    >
                      {queryLoading ? 'Running...' : '▶ Run Query'}
                    </button>
                  </div>
                </div>

                {/* Full-screen Editor Modal */}
                {isQueryMaximized && (
                  <div className="fixed inset-0 z-50 bg-gray-950/70 backdrop-blur-xs flex items-center justify-center p-6 text-left">
                    <div className="bg-white rounded-xl shadow-2xl border border-gray-250 w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
                      
                      {/* Header */}
                      <div className="px-5 py-4 border-b border-gray-250 flex items-center justify-between bg-gray-50">
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">⚡ Full-screen Query Editor</h3>
                          <p className="text-[10px] text-gray-400 mt-0.5">Ctrl+Enter to run query, Escape to minimize.</p>
                        </div>
                        
                        {/* Modal Toolbar */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button; hover:bg-gray-800"
                            onClick={() => runQuery(false)}
                            disabled={queryLoading || !query.trim()}
                            title="Execute Highlighted Selection (Ctrl+Enter)"
                            className="px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 hover:bg-gray-800"
                          >
                            <span>⚡</span> Run Selection
                          </button>
                          <button
                            type="button"
                            onClick={() => runQuery(true)}
                            disabled={queryLoading || !query.trim()}
                            title="Execute Entire Script"
                            className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                          >
                            <span>📜</span> Run All
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => setIsQueryMaximized(false)}
                            className="text-xs px-3 py-1.5 border border-gray-350 bg-white rounded-lg hover:bg-gray-100 font-bold transition shadow-xs"
                          >
                            🗕 Minimize (Esc)
                          </button>
                        </div>
                      </div>

                      {/* Editor Body */}
                      <div className="flex-1 p-5 bg-gray-50/50">
                        <textarea
                          ref={fullscreenTextareaRef}
                          value={query}
                          onChange={e => setQuery(e.target.value)}
                          onKeyDown={e => {
                            if (e.ctrlKey && e.key === 'Enter') {
                              runQuery(false);
                            } else if (e.key === 'Escape') {
                              setIsQueryMaximized(false);
                            }
                          }}
                          placeholder="Write SQL query here — Ctrl+Enter to run, Escape to minimize"
                          className="w-full h-full p-4 border border-gray-350 rounded-xl text-sm font-mono outline-none focus:border-gray-500 bg-white shadow-inner resize-none"
                          autoFocus
                        />
                      </div>

                      {/* Footer */}
                      <div className="px-5 py-4 border-t border-gray-250 flex items-center justify-between bg-white">
                        <button
                          onClick={() => setIsQueryMaximized(false)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 transition"
                        >
                          Close Editor
                        </button>
                        <button
                          onClick={() => {
                            runQuery();
                            setIsQueryMaximized(false);
                          }}
                          disabled={queryLoading}
                          className="px-6 py-2 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800 disabled:opacity-60 shadow-md transition"
                        >
                          {queryLoading ? 'Running...' : '▶ Run Query'}
                        </button>
                      </div>

                    </div>
                  </div>
                )}
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
                    <p className="text-gray-400 text-sm">No query history found</p>
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





            {/* SLOW QUERY */}
            {activeTab === 'slow-queries' && (
              <div>
                <SlowQueryPanel connectionId={id} />
              </div>
            )}

            {/* AUDIT LOGS */}
            {activeTab === 'audit-logs' && isOwner && (
              <div>
                <AuditLogsPanel connectionId={id} />
              </div>
            )}
              </>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}