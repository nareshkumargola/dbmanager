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
  const highlightRef = useRef(null);
  const fullscreenHighlightRef = useRef(null);
  const lineCounterRef = useRef(null);
  const fullscreenLineCounterRef = useRef(null);
  
  const [objects, setObjects] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isQueryMaximized, setIsQueryMaximized] = useState(false);
  const [showModeInfoModal, setShowModeInfoModal] = useState(false);

  // Database context states
  const [databases, setDatabases] = useState([]);
  const [activeDb, setActiveDb] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);

  // Table data
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [tableColumns, setTableColumns] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [tableRowsPerPage, setTableRowsPerPage] = useState(20);

  // Query Editor Multi-Tab State
  const [queryTabs, setQueryTabs] = useState([
    {
      id: 'tab-1',
      name: 'Query 1',
      query: '',
      results: [],
      columns: [],
      error: '',
      msg: '',
      loading: false
    }
  ]);
  const [activeQueryTabId, setActiveQueryTabId] = useState('tab-1');

  const activeQueryTab = queryTabs.find(t => t.id === activeQueryTabId) || queryTabs[0];
  const query = activeQueryTab.query;
  const queryResults = activeQueryTab.results;
  const queryColumns = activeQueryTab.columns;
  const queryLoading = activeQueryTab.loading;
  const queryError = activeQueryTab.error;
  const queryMsg = activeQueryTab.msg;

  const setQuery = (val) => {
    setQueryTabs(prev => prev.map(t => t.id === activeQueryTabId ? { ...t, query: typeof val === 'function' ? val(t.query) : val } : t));
  };
  const setQueryResults = (val) => {
    setQueryTabs(prev => prev.map(t => t.id === activeQueryTabId ? { ...t, results: typeof val === 'function' ? val(t.results) : val } : t));
  };
  const setQueryColumns = (val) => {
    setQueryTabs(prev => prev.map(t => t.id === activeQueryTabId ? { ...t, columns: typeof val === 'function' ? val(t.columns) : val } : t));
  };
  const setQueryLoading = (val) => {
    setQueryTabs(prev => prev.map(t => t.id === activeQueryTabId ? { ...t, loading: typeof val === 'function' ? val(t.loading) : val } : t));
  };
  const setQueryError = (val) => {
    setQueryTabs(prev => prev.map(t => t.id === activeQueryTabId ? { ...t, error: typeof val === 'function' ? val(t.error) : val } : t));
  };
  const setQueryMsg = (val) => {
    setQueryTabs(prev => prev.map(t => t.id === activeQueryTabId ? { ...t, msg: typeof val === 'function' ? val(t.msg) : val } : t));
  };

  const addQueryTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTabNumber = queryTabs.length + 1;
    const newTab = {
      id: newId,
      name: `Query ${newTabNumber}`,
      query: '',
      results: [],
      columns: [],
      error: '',
      msg: '',
      loading: false
    };
    setQueryTabs([...queryTabs, newTab]);
    setActiveQueryTabId(newId);
  };

  const removeQueryTab = (tabId, e) => {
    if (e) e.stopPropagation();
    if (queryTabs.length === 1) return;
    
    const newTabs = queryTabs.filter(t => t.id !== tabId);
    setQueryTabs(newTabs);
    
    if (activeQueryTabId === tabId) {
      const remainingTab = newTabs[newTabs.length - 1];
      setActiveQueryTabId(remainingTab.id);
    }
  };

  // Query History & Productivity States
  const [queryHistory, setQueryHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(`dms_query_history_${id}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  // Autocomplete Suggestions State
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsActiveIndex, setSuggestionsActiveIndex] = useState(0);
  const [suggestionsPosition, setSuggestionsPosition] = useState({ top: 0, left: 0 });
  const [showSuggestions, setShowSuggestions] = useState(false);

  const sqlKeywords = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON', 'AND', 'OR',
    'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
    'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'INDEX', 'EXPLAIN', 'HAVING', 'AS', 'IN', 'LIKE', 'IS NULL'
  ];

  const addToHistory = (q) => {
    if (!q || !q.trim()) return;
    const cleanQ = q.trim();
    setQueryHistory(prev => {
      const filtered = prev.filter(item => item.query !== cleanQ);
      const updated = [{ query: cleanQ, timestamp: new Date().toISOString() }, ...filtered].slice(0, 20);
      localStorage.setItem(`dms_query_history_${id}`, JSON.stringify(updated));
      return updated;
    });
  };

  const formatSQLQuery = () => {
    if (!query || !query.trim()) return;
    const keywordsToFormat = [
      'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON', 'AND', 'OR',
      'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'HAVING', 'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE',
      'SET', 'VALUES', 'INTO', 'UPDATE', 'DELETE FROM'
    ];
    let formatted = query.trim();
    keywordsToFormat.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      formatted = formatted.replace(regex, keyword);
    });
    formatted = formatted
      .replace(/\bSELECT\b/g, '\nSELECT')
      .replace(/\bFROM\b/g, '\nFROM')
      .replace(/\bWHERE\b/g, '\nWHERE')
      .replace(/\bJOIN\b/g, '\n  JOIN')
      .replace(/\bAND\b/g, '\n  AND')
      .replace(/\bOR\b/g, '\n  OR')
      .replace(/\bGROUP BY\b/g, '\nGROUP BY')
      .replace(/\bORDER BY\b/g, '\nORDER BY')
      .replace(/\bVALUES\b/g, '\nVALUES')
      .replace(/\bSET\b/g, '\nSET')
      .replace(/\bUPDATE\b/g, '\nUPDATE')
      .replace(/\bDELETE FROM\b/g, '\nDELETE FROM');
    formatted = formatted.replace(/\n\s*\n/g, '\n').trim();
    setQuery(formatted);
  };

  const runExplain = () => {
    if (!query || !query.trim()) return;
    let explainPrefix = 'EXPLAIN ';
    if (dbType === 'oracle') {
      explainPrefix = 'EXPLAIN PLAN FOR ';
    }
    const explainQuery = explainPrefix + query.trim();
    const originalQuery = query;
    setQuery(explainQuery);
    setTimeout(() => {
      runQuery(true);
      setQuery(originalQuery);
    }, 100);
  };

  const exportResults = (formatType) => {
    if (!queryResults || queryResults.length === 0) {
      alert('No results available to export!');
      return;
    }
    let content = '';
    let filename = `query_results_${Date.now()}`;
    let mimeType = '';
    if (formatType === 'json') {
      content = JSON.stringify(queryResults, null, 2);
      filename += '.json';
      mimeType = 'application/json';
    } else if (formatType === 'csv') {
      const headers = Object.keys(queryResults[0]);
      const csvRows = [
        headers.join(','),
        ...queryResults.map(row => 
          headers.map(header => {
            const val = row[header] === null ? '' : String(row[header]);
            const escaped = val.replace(/"/g, '""');
            return escaped.includes(',') || escaped.includes('\n') || escaped.includes('"') ? `"${escaped}"` : escaped;
          }).join(',')
        )
      ];
      content = csvRows.join('\n');
      filename += '.csv';
      mimeType = 'text/csv';
    }
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCommentToggle = (textarea) => {
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    let selectionStartLineIndex = text.lastIndexOf('\n', start - 1) + 1;
    let selectionEndLineIndex = text.indexOf('\n', end);
    if (selectionEndLineIndex === -1) selectionEndLineIndex = text.length;
    const before = text.substring(0, selectionStartLineIndex);
    const target = text.substring(selectionStartLineIndex, selectionEndLineIndex);
    const after = text.substring(selectionEndLineIndex);
    const lines = target.split('\n');
    const allCommented = lines.every(line => !line.trim() || line.trim().startsWith('--') || line.trim().startsWith('//'));
    const updatedLines = lines.map(line => {
      if (allCommented) {
        return line.replace(/^(\s*)--\s?/, '$1').replace(/^(\s*)\/\/\s?/, '$1');
      } else {
        if (!line.trim()) return line;
        return `-- ${line}`;
      }
    });
    const updatedTarget = updatedLines.join('\n');
    setQuery(before + updatedTarget + after);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStartLineIndex, selectionStartLineIndex + updatedTarget.length);
    }, 0);
  };

  const getCursorXY = (textarea) => {
    const { selectionStart, value } = textarea;
    const textBeforeCursor = value.substring(0, selectionStart);
    const lines = textBeforeCursor.split('\n');
    const currentLineNumber = lines.length;
    const currentColumn = lines[lines.length - 1].length;
    const top = (currentLineNumber * 20) + 15 - textarea.scrollTop;
    const left = (currentColumn * 7.2) + 40 - textarea.scrollLeft;
    return { top, left };
  };

  const handleEditorChange = (e, textareaRefToUse) => {
    const val = e.target.value;
    setQuery(val);
    const textarea = textareaRefToUse.current;
    if (!textarea) return;
    const selectionEnd = textarea.selectionEnd;
    const textBeforeCursor = val.substring(0, selectionEnd);
    const lastWordMatch = textBeforeCursor.match(/([a-zA-Z_0-9]+)$/);
    if (lastWordMatch) {
      const typedWord = lastWordMatch[1];
      if (typedWord.length >= 2) {
        const tables = tableDetails ? tableDetails.map(t => t.tableName || t.name || '') : [];
        const allCandidates = [...sqlKeywords, ...tables].filter(Boolean);
        const matched = allCandidates.filter(c => 
          c.toLowerCase().startsWith(typedWord.toLowerCase()) && 
          c.toLowerCase() !== typedWord.toLowerCase()
        );
        if (matched.length > 0) {
          setSuggestions(matched.slice(0, 10));
          setSuggestionsActiveIndex(0);
          const coords = getCursorXY(textarea);
          setSuggestionsPosition(coords);
          setShowSuggestions(true);
          return;
        }
      }
    }
    setShowSuggestions(false);
  };

  const insertSuggestion = (textareaRefToUse) => {
    const textarea = textareaRefToUse.current;
    if (!textarea || suggestions.length === 0) return;
    const val = textarea.value;
    const selectionEnd = textarea.selectionEnd;
    const textBeforeCursor = val.substring(0, selectionEnd);
    const lastWordMatch = textBeforeCursor.match(/([a-zA-Z_0-9]+)$/);
    if (lastWordMatch) {
      const typedWord = lastWordMatch[1];
      const selectedSuggestion = suggestions[suggestionsActiveIndex];
      const before = val.substring(0, selectionEnd - typedWord.length);
      const after = val.substring(selectionEnd);
      setQuery(before + selectedSuggestion + ' ' + after);
      setShowSuggestions(false);
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = before.length + selectedSuggestion.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  };

  const handleEditorKeyDown = (e, textareaRefToUse) => {
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      handleCommentToggle(textareaRefToUse.current);
      return;
    }
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionsActiveIndex(prev => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionsActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertSuggestion(textareaRefToUse);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
      }
    }
  };

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
  
  // Table search, sort, unit filters, and pagination
  const [tableSearch, setTableSearch] = useState('');
  const [tableSort, setTableSort] = useState('asc'); // 'asc' or 'desc'
  const [tableSizeUnit, setTableSizeUnit] = useState('MB'); // 'Bytes', 'KB', 'MB', 'GB'
  const [tablesListPage, setTablesListPage] = useState(1);
  const [tablesListRowsPerPage, setTablesListRowsPerPage] = useState(10);

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
      const [objRes, statsRes, tablesDetailsRes] = await Promise.all([
        API.get(`/connections/${id}/objects?database=${encodeURIComponent(dbName)}`),
        API.get(`/connections/${id}/stats?database=${encodeURIComponent(dbName)}`),
        API.get(`/monitor/${id}/tables?database=${encodeURIComponent(dbName)}`).catch(() => ({ data: { tables: [] } }))
      ]);
      setObjects(objRes.data);
      setStats(statsRes.data.stats);
      if (tablesDetailsRes.data?.tables) {
        setTableDetails(tablesDetailsRes.data.tables);
      }
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
    setTablePage(1);
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

  const refreshDatabaseObjects = async () => {
    if (!activeDb) return;
    try {
      const [objRes, statsRes] = await Promise.all([
        API.get(`/connections/${id}/objects?database=${encodeURIComponent(activeDb)}`),
        API.get(`/connections/${id}/stats?database=${encodeURIComponent(activeDb)}`),
      ]);
      setObjects(objRes.data);
      setStats(statsRes.data.stats);
    } catch (err) {
      console.error('Failed to refresh database objects:', err);
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

      // Automatically refresh tables list in sidebar without requiring manual reload!
      refreshDatabaseObjects();
      addToHistory(queryToRun);
    } catch (err) {
      setQueryError(err.response?.data?.error || 'Query failed!');
    } finally {
      setQueryLoading(false);
    }
  };

  const handleScroll = (e) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.target.scrollTop;
      highlightRef.current.scrollLeft = e.target.scrollLeft;
    }
    if (lineCounterRef.current) {
      lineCounterRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const handleFullscreenScroll = (e) => {
    if (fullscreenHighlightRef.current) {
      fullscreenHighlightRef.current.scrollTop = e.target.scrollTop;
      fullscreenHighlightRef.current.scrollLeft = e.target.scrollLeft;
    }
    if (fullscreenLineCounterRef.current) {
      fullscreenLineCounterRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const highlightSQL = (text) => {
    if (!text) return '';
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const keywords = [
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT',
      'INNER', 'OUTER', 'ON', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'HAVING',
      'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'AS', 'CREATE', 'TABLE', 'DATABASE',
      'DROP', 'ALTER', 'ADD', 'SET', 'VALUES', 'INTO', 'SHOW', 'DATABASES', 'TABLES',
      'USE', 'GRANT', 'REVOKE', 'INDEX', 'TRIGGER', 'PROCEDURE', 'FUNCTION', 'BEGIN',
      'COMMIT', 'ROLLBACK', 'TRANSACTION'
    ];

    keywords.sort((a, b) => b.length - a.length);
    const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
    const combinedRegex = /(?:(\/\*[\s\S]*?\*\/|--.*|#.*))|('(?:\\'|[^'])*'|"(?:\\"|[^"])*")|(\b\d+\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

    return escaped.replace(combinedRegex, (match, comment, string, number, word) => {
      if (comment) {
        return `<span class="sql-comment">${comment}</span>`;
      }
      if (string) {
        return `<span class="sql-string">${string}</span>`;
      }
      if (number) {
        return `<span class="sql-number">${number}</span>`;
      }
      if (word) {
        const upperWord = word.toUpperCase();
        if (keywords.includes(upperWord)) {
          return `<span class="sql-keyword">${word}</span>`;
        }
      }
      return match;
    });
  };



  const deleteHistory = async (histId) => {
    try {
      await API.delete(`/history/${histId}`);
      setHistory(history.filter(h => h._id !== histId));
    } catch (err) {
      console.error(err);
    }
  };

  const exportHistoryToCSV = () => {
    if (!history || history.length === 0) {
      alert('No query history available to export!');
      return;
    }
    const headers = ['ID', 'User', 'Status', 'Execution Time (ms)', 'Rows Affected', 'Full SQL Query', 'Error Details', 'Timestamp'];
    const rows = history.map(item => {
      const cleanQuery = (item.query || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
      const cleanError = (item.error || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
      const userName = (user?.name || 'User').replace(/"/g, '""');
      const timeFormatted = new Date(item.createdAt).toLocaleString('en-IN');

      return [
        item._id,
        `"${userName}"`,
        item.status || 'success',
        item.executionTime || 0,
        item.rowsAffected || 0,
        `"${cleanQuery}"`,
        `"${cleanError}"`,
        `"${timeFormatted}"`
      ];
    });

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `query_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getTablesArray = () => {
    if (!objects) return [];
    const { type, result } = objects;
    if (type === 'mysql') return result.tables?.map(t => Object.values(t)[0]) || [];
    if (type === 'postgresql') return result.tables?.map(t => t.table_name) || [];
    if (type === 'mongodb') return result.collections?.map(c => c.name) || [];
    if (type === 'oracle') return result.tables?.map(t => t.table_name || t.TABLE_NAME) || [];
    return [];
  };

  const getTypeIcon = (type) => {
    if (type === 'mysql') return '🐬';
    if (type === 'postgresql') return '🐘';
    if (type === 'mongodb') return '🍃';
    if (type === 'oracle') return '🔴';
    return '🗄️';
  };

  const dbType = objects?.type;
  const tables = getTablesArray();

  const formatTableSize = (sizeMB, unit) => {
    const val = parseFloat(sizeMB || 0);
    switch (unit) {
      case 'Bytes':
        return `${Math.round(val * 1024 * 1024).toLocaleString()} Bytes`;
      case 'KB':
        return `${(val * 1024).toFixed(2)} KB`;
      case 'GB':
        return `${(val / 1024).toFixed(4)} GB`;
      case 'MB':
      default:
        return `${val.toFixed(2)} MB`;
    }
  };

  const getTablesWithMetadata = () => {
    return tables.map(tableName => {
      const detail = tableDetails.find(d => d.table === tableName);
      return {
        name: tableName,
        rows: detail ? detail.rows : 0,
        sizeMB: detail ? detail.sizeMB : 0.01
      };
    });
  };

  const processedTablesList = getTablesWithMetadata()
    .filter(t => t.name.toLowerCase().includes(tableSearch.toLowerCase()))
    .sort((a, b) => {
      if (tableSort === 'asc') {
        return a.name.localeCompare(b.name);
      } else {
        return b.name.localeCompare(a.name);
      }
    });

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
    tabs.push({ id: 'history', label: '🕐 Query History' });
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
                  {dbType === 'oracle' && [
                    { label: 'Service Name / SID', value: stats.database },
                    { label: 'Tables', value: stats.totalTables },
                    { label: 'Active Sessions', value: stats.activeConnections },
                    { label: 'Schema Size', value: `${stats.sizeMB} MB` },
                  ].map((item, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                      <p className="text-xl font-bold text-gray-900">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Top 5 Tables */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                  <div className="flex items-center justify-between border-b border-gray-150 pb-3 mb-4">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <span>📊</span> Top 5 Tables (by Size / Rows)
                    </h3>
                    {((tableDetails && tableDetails.length > 0) || (tables && tables.length > 0)) && (
                      <span className="text-xs font-bold text-gray-500 font-mono">
                        Table Name — Row Count
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-2.5">
                    {tableDetails && tableDetails.length > 0 ? (
                      tableDetails.slice(0, 5).map((t, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100/80 rounded-xl transition border border-gray-200 shadow-3xs">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 font-mono text-xs">{idx + 1}.</span>
                            <span className="text-xs font-extrabold text-gray-700 font-mono">{t.table}</span>
                            <span className="text-gray-300 text-xs">—</span>
                            <span className="text-xs font-bold text-gray-500 font-mono">
                              {t.rows !== undefined ? t.rows.toLocaleString() : '0'} rows
                            </span>
                            <span className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-bold font-mono ml-1">
                              {t.sizeMB !== undefined ? `${t.sizeMB} MB` : t.size || 'N/A'}
                            </span>
                          </div>
                          
                          <button
                            onClick={() => fetchTableData(t.table)}
                            className="px-3 py-1 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition border-none shadow-3xs cursor-pointer"
                          >
                            View
                          </button>
                        </div>
                      ))
                    ) : tables && tables.length > 0 ? (
                      tables.slice(0, 5).map((table, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100/80 rounded-xl transition border border-gray-200 shadow-3xs">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 font-mono text-xs">{idx + 1}.</span>
                            <span className="text-xs font-extrabold text-gray-700 font-mono">{table}</span>
                            <span className="text-gray-300 text-xs">—</span>
                            <span className="text-xs font-bold text-gray-500 font-mono">
                              0 rows
                            </span>
                            <span className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-bold font-mono ml-1">
                              0.01 MB
                            </span>
                          </div>
                          
                          <button
                            onClick={() => fetchTableData(table)}
                            className="px-3 py-1 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition border-none shadow-3xs cursor-pointer"
                          >
                            View
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400">No tables data available.</p>
                    )}
                  </div>
                </div>

                {/* Recent Activity Section */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <span>⚡</span> Recent Activity
                    </h3>
                    {hasPermission('history') && (
                      <button 
                         onClick={() => {
                           setActiveTab('history');
                           fetchHistory();
                         }}
                         className="text-xs font-bold text-[#0d9da4] hover:underline border-none bg-transparent cursor-pointer"
                      >
                        Query History →
                      </button>
                    )}
                  </div>
                  
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-150 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-blue-750 font-bold uppercase tracking-wider font-sans">Execution Logs</p>
                      <p className="text-xs font-bold text-blue-900 mt-1 font-mono">
                        run a query by timestamp
                      </p>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold font-mono">
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Slow Queries Section */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <span>🐢</span> Slow Query Insights
                    </h3>
                    <button 
                      onClick={() => setActiveTab('slow-queries')}
                      className="text-xs font-bold text-[#0d9da4] hover:underline flex items-center gap-1 border-none bg-transparent cursor-pointer"
                    >
                      View More →
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-150">
                    <div>
                      <p className="text-xs text-red-750 font-bold uppercase tracking-wider">Monitor Status</p>
                      <p className="text-sm font-extrabold text-red-900 mt-1">5 running</p>
                    </div>
                    <span className="text-xl animate-pulse">⏰</span>
                  </div>
                </div>
              </div>
            )}

            {/* TABLE DATA */}
            {activeTab === 'table' && (
              <div>
                {!selectedTable ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
                      <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                        📋 Select a Table to View Data
                      </h3>
                      
                      {/* Search, Sort, Unit Controls & Pagination Selector */}
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Search Input */}
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Search tables..."
                            value={tableSearch}
                            onChange={e => {
                              setTableSearch(e.target.value);
                              setTablesListPage(1);
                            }}
                            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none bg-gray-50/50 focus:bg-white focus:border-teal-500 transition w-44"
                          />
                          <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>

                        {/* Unit Filter Selector */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">Unit:</span>
                          <select
                            value={tableSizeUnit}
                            onChange={e => setTableSizeUnit(e.target.value)}
                            className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white outline-none focus:border-teal-500 cursor-pointer font-semibold text-gray-755"
                          >
                            <option value="Bytes">Bytes</option>
                            <option value="KB">KB</option>
                            <option value="MB">MB</option>
                            <option value="GB">GB</option>
                          </select>
                        </div>

                        {/* Tables Per Page Selector */}
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                          <span>Tables per page:</span>
                          <select
                            value={tablesListRowsPerPage}
                            onChange={(e) => {
                              setTablesListRowsPerPage(Number(e.target.value));
                              setTablesListPage(1);
                            }}
                            className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white font-bold outline-none cursor-pointer focus:border-teal-500"
                          >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {tables.length === 0 ? (
                      <p className="text-xs text-gray-400">No tables found in this database schema.</p>
                    ) : processedTablesList.length === 0 ? (
                      <p className="text-xs text-gray-400">No tables match your search filter.</p>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-3xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                                  {dbType === 'mongodb' ? 'Collection Name' : 'Table Name'}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                                  Est. Rows
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                                  Size
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                                  Action
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {processedTablesList.slice((tablesListPage - 1) * tablesListRowsPerPage, tablesListPage * tablesListRowsPerPage).map((t, i) => (
                                <tr 
                                  key={i} 
                                  onClick={() => fetchTableData(t.name)}
                                  className="hover:bg-teal-50/30 cursor-pointer transition-colors group"
                                >
                                  <td className="px-4 py-3 text-xs font-bold text-gray-800 font-mono">
                                    <span className="mr-1.5">{dbType === 'mongodb' ? '📁' : '📋'}</span>
                                    {t.name}
                                  </td>
                                  <td className="px-4 py-3 text-xs font-mono text-gray-600">
                                    {t.rows.toLocaleString()} rows
                                  </td>
                                  <td className="px-4 py-3 text-xs font-mono">
                                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-bold">
                                      {formatTableSize(t.sizeMB, tableSizeUnit)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs font-bold text-[#0d9da4] group-hover:underline">
                                    View →
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Tables List Pagination Footer */}
                        {processedTablesList.length > 0 && (() => {
                          const totalTablesCount = processedTablesList.length;
                          const totalTablesListPages = Math.ceil(totalTablesCount / tablesListRowsPerPage) || 1;
                          const startIdx = (tablesListPage - 1) * tablesListRowsPerPage + 1;
                          const endIdx = Math.min(tablesListPage * tablesListRowsPerPage, totalTablesCount);

                          return (
                            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/80 flex items-center justify-between flex-wrap gap-3 select-none">
                              <span className="text-xs text-gray-500 font-medium">
                                Showing <span className="font-bold text-gray-800">{startIdx}</span> to <span className="font-bold text-gray-800">{endIdx}</span> of <span className="font-bold text-gray-800">{totalTablesCount}</span> tables
                              </span>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setTablesListPage(prev => Math.max(prev - 1, 1))}
                                  disabled={tablesListPage === 1}
                                  className="px-3 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white"
                                >
                                  ← Previous
                                </button>

                                <span className="text-xs font-bold text-gray-700 px-2 font-mono">
                                  Page {tablesListPage} of {totalTablesListPages}
                                </span>

                                <button
                                  onClick={() => setTablesListPage(prev => Math.min(prev + 1, totalTablesListPages))}
                                  disabled={tablesListPage >= totalTablesListPages}
                                  className="px-3 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white"
                                >
                                  Next →
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ) : tableLoading ? (
                  <div className="text-center py-12">
                    <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto"></div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedTable(null)}
                          className="px-2.5 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer bg-white"
                        >
                          ← Back to Tables
                        </button>
                        <h3 className="text-sm font-extrabold text-gray-900 font-mono">{selectedTable}</h3>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg font-bold font-mono">
                          Total: {tableData.length} records
                        </span>
                        
                        {/* Page Size Selector */}
                        <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                          <span>Rows per page:</span>
                          <select
                            value={tableRowsPerPage}
                            onChange={(e) => {
                              setTableRowsPerPage(Number(e.target.value));
                              setTablePage(1);
                            }}
                            className="px-2 py-1 border border-gray-250 rounded-lg text-xs bg-white font-bold outline-none cursor-pointer focus:border-teal-500"
                          >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={30}>30</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {tableData.length === 0 ? (
                      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                        <p className="text-gray-400 text-sm">No data found</p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                {(tableColumns && tableColumns.length > 0
                                  ? tableColumns.map(c => typeof c === 'object' ? (c.Field || c.name || c.column_name || '') : String(c))
                                  : Object.keys(tableData[0] || {})
                                ).map((colName, i) => (
                                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                                    {colName}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {tableData.slice((tablePage - 1) * tableRowsPerPage, tablePage * tableRowsPerPage).map((row, i) => {
                                const cols = tableColumns && tableColumns.length > 0
                                  ? tableColumns.map(c => typeof c === 'object' ? (c.Field || c.name || c.column_name) : c)
                                  : Object.keys(row);
                                return (
                                  <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                                    {cols.map((colName, j) => {
                                      const val = row[colName];
                                      return (
                                        <td key={j} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                          {val === null || val === undefined ? (
                                            <span className="text-gray-300 italic">null</span>
                                          ) : typeof val === 'object' ? (
                                            JSON.stringify(val)
                                          ) : (
                                            String(val)
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination Footer */}
                        {tableData.length > 0 && (() => {
                          const totalRows = tableData.length;
                          const totalPages = Math.ceil(totalRows / tableRowsPerPage) || 1;
                          const startIdx = (tablePage - 1) * tableRowsPerPage + 1;
                          const endIdx = Math.min(tablePage * tableRowsPerPage, totalRows);

                          return (
                            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/80 flex items-center justify-between flex-wrap gap-3">
                              <span className="text-xs text-gray-500 font-medium">
                                Showing <span className="font-bold text-gray-800">{startIdx}</span> to <span className="font-bold text-gray-800">{endIdx}</span> of <span className="font-bold text-gray-800">{totalRows}</span> records
                              </span>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setTablePage(prev => Math.max(prev - 1, 1))}
                                  disabled={tablePage === 1}
                                  className="px-3 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white"
                                >
                                  ← Previous
                                </button>

                                <span className="text-xs font-bold text-gray-700 px-2 font-mono">
                                  Page {tablePage} of {totalPages}
                                </span>

                                <button
                                  onClick={() => setTablePage(prev => Math.min(prev + 1, totalPages))}
                                  disabled={tablePage >= totalPages}
                                  className="px-3 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white"
                                >
                                  Next →
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* QUERY EDITOR */}
            {activeTab === 'query' && (
              <div>
                {/* Query Tabs Header Bar */}
                <div className="flex items-center justify-between gap-4 select-none scrollbar-none" style={{ marginBottom: '-1px' }}>
                  {/* Left Side: Tabs List & Add Button */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {queryTabs.map((tab) => {
                      const isActive = tab.id === activeQueryTabId;
                      return (
                        <div
                          key={tab.id}
                          onClick={() => setActiveQueryTabId(tab.id)}
                          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl border-t border-x cursor-pointer transition-all duration-150 shadow-3xs ${
                            isActive
                              ? 'bg-white text-gray-900 border-gray-200 border-b-white z-10'
                              : 'bg-gray-100/70 text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'
                          }`}
                        >
                          <span>📝</span>
                          <span className="truncate max-w-[120px]">{tab.name}</span>
                          {queryTabs.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => removeQueryTab(tab.id, e)}
                              className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-gray-250 hover:text-gray-950 text-gray-400 transition-colors text-[9px]"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                    
                    {/* Add New Tab Button */}
                    <button
                      type="button"
                      onClick={addQueryTab}
                      title="Open New Query Tab"
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 cursor-pointer shadow-3xs transition-all duration-150 text-sm font-bold ml-1.5"
                    >
                      ＋
                  </button>
                  </div>

                  {/* Right Side: Execution Controls */}
                  <div className="flex items-center gap-1.5 pb-1 select-none">
                    {/* Interactive Role Mode Button & Privileges Modal Trigger */}
                    <button
                      type="button"
                      onClick={() => setShowModeInfoModal(true)}
                      title="Click to view Query Editor permissions & capabilities"
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 transition cursor-pointer border shadow-3xs ${
                        user?.role === 'admin'
                          ? 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
                          : user?.role === 'readwrite'
                          ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                          : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      {user?.role === 'admin'
                        ? '👑 Admin Mode'
                        : user?.role === 'readwrite'
                        ? '⚡ Read-Write Mode'
                        : '🔒 Read-Only Mode'}{' '}
                      <span className="text-[9px] bg-white/60 dark:bg-black/20 px-1 py-0.2 rounded font-mono ml-0.5">ℹ️</span>
                    </button>
                    <button
                      type="button"
                      onClick={formatSQLQuery}
                      title="Beautify / Format SQL (Clean layout)"
                      className="px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-3xs"
                    >
                      <span>🧹</span> Beautify
                    </button>
                    {dbType !== 'mongodb' && (
                      <button
                        type="button"
                        onClick={runExplain}
                        disabled={queryLoading || !query.trim()}
                        title="Explain Query Execution Plan"
                        className="px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-[#0d9da4] text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-3xs disabled:opacity-50"
                      >
                        <span>🔍</span> Explain Plan
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowHistoryDrawer(prev => !prev)}
                      title="Toggle Collapsible Query History Panel"
                      className={`px-2.5 py-1.5 border text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-3xs ${
                        showHistoryDrawer
                          ? 'bg-[#0d9da4] border-[#0d9da4] text-white hover:bg-[#0b8a90]'
                          : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span>📜</span> History
                    </button>

                    <span className="text-gray-300 select-none mx-0.5">|</span>

                    <button
                      type="button"
                      onClick={() => runQuery(false)}
                      disabled={queryLoading || !query.trim()}
                      title="Execute Selection or Current Statement (Ctrl+Enter)"
                      className="px-2.5 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-[11px] font-bold rounded-lg transition flex items-center gap-1.5 shadow-3xs disabled:opacity-50"
                    >
                      <span>⚡</span> Run Selection
                    </button>
                    <button
                      type="button"
                      onClick={() => runQuery(false)}
                      disabled={queryLoading || !query.trim()}
                      title="Execute Query"
                      className="px-2.5 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-[11px] font-bold rounded-lg transition flex items-center gap-1.5 shadow-3xs disabled:opacity-50"
                    >
                      <span>▶</span> Run Query
                    </button>
                    <span className="text-gray-300 select-none">|</span>
                    <button
                      onClick={() => setIsQueryMaximized(true)}
                      className="text-[11px] font-bold text-[#0d9da4] hover:underline flex items-center gap-1.5 border border-gray-200 bg-white px-2.5 py-1.5 rounded-lg shadow-3xs transition hover:bg-gray-50"
                    >
                      <span>🗖</span> Expand Fullscreen
                    </button>
                  </div>
                </div>

                <div className="flex gap-4 items-start relative mb-4">
                  {/* Left Side: Main Editor Box */}
                  <div className="flex-1 min-w-0">
                    <div className="bg-white rounded-b-xl rounded-tr-xl border border-gray-250 p-5 z-0 relative">
                  

                  {/* Scoped styles for overlay syntax highlighter */}
                  <style>{`
                    .sql-editor-container {
                      position: relative;
                      width: 100%;
                      border: 1px solid #d1d5db;
                      border-radius: 12px;
                      background-color: #f9fafb;
                      overflow: hidden;
                      box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.05);
                    }
                    .sql-editor-gutter {
                      position: absolute;
                      top: 0;
                      left: 0;
                      width: 44px;
                      height: 100%;
                      padding: 16px 0;
                      background-color: #f3f4f6;
                      border-right: 1px solid #e5e7eb;
                      color: #9ca3af;
                      text-align: right;
                      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                      font-size: 14px;
                      line-height: 1.5;
                      overflow: hidden;
                      user-select: none;
                      box-sizing: border-box;
                      z-index: 3;
                    }
                    .sql-editor-line-number {
                      padding-right: 10px;
                      height: 21px; /* 14px * 1.5 = 21px */
                    }
                    .sql-editor-textarea,
                    .sql-editor-highlight {
                      position: absolute !important;
                      top: 0;
                      left: 44px !important;
                      width: calc(100% - 44px) !important;
                      height: 100%;
                      margin: 0;
                      padding: 16px;
                      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                      font-size: 14px;
                      line-height: 1.5;
                      white-space: pre !important;
                      word-wrap: normal !important;
                      box-sizing: border-box;
                      border: none;
                      outline: none;
                      text-align: left;
                      overflow: auto !important;
                    }
                    .sql-editor-textarea {
                      color: transparent !important;
                      -webkit-text-fill-color: transparent !important;
                      background: transparent !important;
                      caret-color: #0d9da4 !important;
                      z-index: 2;
                      resize: none;
                    }
                    .sql-editor-highlight {
                      z-index: 1;
                      color: #1f2937;
                      background: transparent !important;
                      pointer-events: none;
                      -ms-overflow-style: none;
                      scrollbar-width: none;
                    }
                    .sql-editor-highlight::-webkit-scrollbar {
                      display: none;
                    }
                    .sql-keyword {
                      color: #0d9da4 !important;
                      font-weight: bold !important;
                    }
                    .sql-string {
                      color: #d97706 !important;
                    }
                    .sql-number {
                      color: #4f46e5 !important;
                    }
                    .sql-comment {
                      color: #16a34a !important;
                      font-style: italic !important;
                    }
                  `}</style>

                  {/* Textarea Overlay Container */}
                  <div className="sql-editor-container h-[280px]">
                    {/* Gutter Line Numbers */}
                    <div ref={lineCounterRef} className="sql-editor-gutter">
                      {Array.from({ length: query.split('\n').length || 1 }, (_, i) => (
                        <div key={i} className="sql-editor-line-number">{i + 1}</div>
                      ))}
                    </div>

                    <textarea
                      ref={textareaRef}
                      value={query}
                      onChange={e => handleEditorChange(e, textareaRef)}
                      onKeyDown={e => handleEditorKeyDown(e, textareaRef)}
                      onScroll={handleScroll}
                      placeholder="Write SQL query here — Press Ctrl+Enter to run, Ctrl+/ to comment/uncomment"
                      className="sql-editor-textarea"
                    />
                    <pre
                      ref={highlightRef}
                      className="sql-editor-highlight"
                      dangerouslySetInnerHTML={{
                        __html: highlightSQL(query) + '\n'
                      }}
                    />

                    {/* Floating Autocomplete Suggestions */}
                    {showSuggestions && suggestions.length > 0 && (
                      <div 
                        className="absolute z-50 bg-white border border-gray-250 rounded-lg shadow-lg max-h-48 overflow-y-auto w-52 font-mono text-[11px] py-1 select-none"
                        style={{ top: `${suggestionsPosition.top}px`, left: `${suggestionsPosition.left}px` }}
                      >
                        {suggestions.map((cand, idx) => (
                          <div
                            key={cand}
                            onClick={() => {
                              setSuggestionsActiveIndex(idx);
                              setTimeout(() => insertSuggestion(textareaRef), 0);
                            }}
                            className={`px-3 py-1.5 cursor-pointer flex items-center justify-between ${
                              idx === suggestionsActiveIndex 
                                ? 'bg-[#0d9da4] text-white' 
                                : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            <span>{cand}</span>
                            <span className="text-[9px] opacity-75">
                              {sqlKeywords.includes(cand) ? 'keyword' : 'table'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Right Side: Collapsible History Drawer */}
                  {showHistoryDrawer && (
                    <div className="w-80 bg-white border border-gray-250 rounded-xl p-4 shadow-sm flex flex-col h-[345px]">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-150 mb-3 select-none">
                        <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 font-mono">
                          <span>📜</span> Query History ({queryHistory.length})
                        </h4>
                        <button 
                          onClick={() => setShowHistoryDrawer(false)}
                          className="text-gray-400 hover:text-gray-900 text-xs font-bold"
                        >
                          ✕
                        </button>
                      </div>
                      
                      {queryHistory.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center select-none p-4">
                          <span className="text-2xl mb-1">📭</span>
                          <p className="text-[10px] text-gray-450">No queries run in this session yet.</p>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                          {queryHistory.map((item, idx) => (
                            <div 
                              key={idx}
                              onClick={() => {
                                setQuery(item.query);
                                setQueryMsg(`Restored from history: "${item.query.substring(0, 30)}..."`);
                              }}
                              title="Click to restore query"
                              className="p-2.5 rounded-lg bg-gray-50/50 border border-gray-150 hover:bg-teal-50/20 hover:border-[#0d9da4] cursor-pointer group transition duration-150 flex flex-col gap-1.5"
                            >
                              <code className="text-[10px] text-gray-750 font-mono line-clamp-2 block break-all whitespace-pre-wrap">
                                {item.query}
                              </code>
                              <span className="text-[9px] text-gray-400 select-none block">
                                {new Date(item.timestamp).toLocaleTimeString('en-IN')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
                        <div className="flex items-center gap-2 select-none">
                          <button
                            type="button"
                            onClick={formatSQLQuery}
                            title="Beautify / Format SQL (Clean layout)"
                            className="px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-3xs"
                          >
                            <span>🧹</span> Beautify
                          </button>
                          {dbType !== 'mongodb' && (
                            <button
                              type="button"
                              onClick={runExplain}
                              disabled={queryLoading || !query.trim()}
                              title="Explain Query Execution Plan"
                              className="px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-[#0d9da4] text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-3xs disabled:opacity-50"
                            >
                              <span>🔍</span> Explain Plan
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowHistoryDrawer(prev => !prev)}
                            title="Toggle Collapsible Query History Panel"
                            className={`px-2.5 py-1.5 border text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-3xs ${
                              showHistoryDrawer
                                ? 'bg-[#0d9da4] border-[#0d9da4] text-white hover:bg-[#0b8a90]'
                                : 'bg-white border-gray-250 hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <span>📜</span> History
                          </button>
                          <span className="text-gray-350 select-none">|</span>
                          <button
                            type="button"
                            onClick={() => runQuery(false)}
                            disabled={queryLoading || !query.trim()}
                            title="Execute Highlighted Selection (Ctrl+Enter)"
                            className="px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 hover:bg-gray-800"
                          >
                            <span>⚡</span> Run Selection
                          </button>
                          <button
                            type="button"
                            onClick={() => runQuery(false)}
                            disabled={queryLoading || !query.trim()}
                            title="Execute Query"
                            className="px-3 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                          >
                            <span>▶</span> Run Query
                          </button>
                          <span className="text-gray-300 select-none">|</span>
                          <button
                            onClick={() => setIsQueryMaximized(false)}
                            className="text-xs px-3 py-1.5 border border-gray-350 bg-white rounded-lg hover:bg-gray-100 font-bold transition shadow-xs"
                          >
                            🗕 Minimize (Esc)
                          </button>
                        </div>
                      </div>

                      {/* Editor Body */}
                      <div className="flex-1 p-5 bg-gray-50/50 flex flex-col min-h-0">
                        <div className="flex-1 flex gap-4 items-stretch min-h-0">
                          {/* Left Side: Fullscreen Editor Panel */}
                          <div className="flex-1 flex flex-col min-w-0">
                        {/* Query Tabs Bar (Fullscreen) */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 select-none scrollbar-none" style={{ marginBottom: '-1px' }}>
                          {queryTabs.map((tab) => {
                            const isActive = tab.id === activeQueryTabId;
                            return (
                              <div
                                key={tab.id}
                                onClick={() => setActiveQueryTabId(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl border-t border-x cursor-pointer transition-all duration-150 shadow-3xs ${
                                  isActive
                                    ? 'bg-white text-gray-900 border-gray-250 border-b-white z-10'
                                    : 'bg-gray-100/70 text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'
                                }`}
                              >
                                <span>📝</span>
                                <span className="truncate max-w-[120px]">{tab.name}</span>
                                {queryTabs.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => removeQueryTab(tab.id, e)}
                                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-gray-250 hover:text-gray-950 text-gray-400 transition-colors text-[9px]"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          
                          {/* Add New Tab Button */}
                          <button
                            type="button"
                            onClick={addQueryTab}
                            title="Open New Query Tab"
                            className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 cursor-pointer shadow-3xs transition-all duration-150 text-sm font-bold ml-1.5"
                          >
                            ＋
                          </button>
                        </div>

                        {/* Textarea Overlay Container (Fullscreen) */}
                        <div className="sql-editor-container flex-1 rounded-b-xl rounded-tr-xl border border-gray-250 relative overflow-hidden">
                          {/* Gutter Line Numbers */}
                          <div ref={fullscreenLineCounterRef} className="sql-editor-gutter">
                            {Array.from({ length: query.split('\n').length || 1 }, (_, i) => (
                              <div key={i} className="sql-editor-line-number">{i + 1}</div>
                            ))}
                          </div>

                          <textarea
                            ref={fullscreenTextareaRef}
                            value={query}
                            onChange={e => handleEditorChange(e, fullscreenTextareaRef)}
                            onKeyDown={e => {
                              handleEditorKeyDown(e, fullscreenTextareaRef);
                              if (!showSuggestions && e.key === 'Escape') {
                                setIsQueryMaximized(false);
                              }
                            }}
                            onScroll={handleFullscreenScroll}
                            placeholder="Write SQL query here — Ctrl+Enter to run, Ctrl+/ to comment/uncomment, Escape to minimize"
                            className="sql-editor-textarea"
                            autoFocus
                          />
                          <pre
                            ref={fullscreenHighlightRef}
                            className="sql-editor-highlight"
                            dangerouslySetInnerHTML={{
                              __html: highlightSQL(query) + '\n'
                            }}
                          />

                          {/* Floating Autocomplete Suggestions (Fullscreen) */}
                          {showSuggestions && suggestions.length > 0 && (
                            <div 
                              className="absolute z-50 bg-white border border-gray-250 rounded-lg shadow-lg max-h-48 overflow-y-auto w-52 font-mono text-[11px] py-1 select-none"
                              style={{ top: `${suggestionsPosition.top}px`, left: `${suggestionsPosition.left}px` }}
                            >
                              {suggestions.map((cand, idx) => (
                                <div
                                  key={cand}
                                  onClick={() => {
                                    setSuggestionsActiveIndex(idx);
                                    setTimeout(() => insertSuggestion(fullscreenTextareaRef), 0);
                                  }}
                                  className={`px-3 py-1.5 cursor-pointer flex items-center justify-between ${
                                    idx === suggestionsActiveIndex 
                                      ? 'bg-[#0d9da4] text-white' 
                                      : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                >
                                  <span>{cand}</span>
                                  <span className="text-[9px] opacity-75">
                                    {sqlKeywords.includes(cand) ? 'keyword' : 'table'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          </div>
                        </div>

                        {/* Right Side: Fullscreen History Drawer */}
                        {showHistoryDrawer && (
                          <div className="w-80 bg-white border border-gray-250 rounded-xl p-4 shadow-sm flex flex-col h-full">
                            <div className="flex items-center justify-between pb-3 border-b border-gray-150 mb-3 select-none">
                              <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 font-mono">
                                <span>📜</span> Query History ({queryHistory.length})
                              </h4>
                              <button 
                                onClick={() => setShowHistoryDrawer(false)}
                                className="text-gray-400 hover:text-gray-900 text-xs font-bold"
                              >
                                ✕
                              </button>
                            </div>
                            
                            {queryHistory.length === 0 ? (
                              <div className="flex-1 flex flex-col items-center justify-center text-center select-none p-4">
                                <span className="text-2xl mb-1">📭</span>
                                <p className="text-[10px] text-gray-450">No queries run in this session yet.</p>
                              </div>
                            ) : (
                              <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                                {queryHistory.map((item, idx) => (
                                  <div 
                                    key={idx}
                                    onClick={() => {
                                      setQuery(item.query);
                                      setQueryMsg(`Restored from history: "${item.query.substring(0, 30)}..."`);
                                    }}
                                    title="Click to restore query"
                                    className="p-2.5 rounded-lg bg-gray-50/50 border border-gray-150 hover:bg-teal-50/20 hover:border-[#0d9da4] cursor-pointer group transition duration-150 flex flex-col gap-1.5"
                                  >
                                    <code className="text-[10px] text-gray-750 font-mono line-clamp-2 block break-all whitespace-pre-wrap">
                                      {item.query}
                                    </code>
                                    <span className="text-[9px] text-gray-400 select-none block">
                                      {new Date(item.timestamp).toLocaleTimeString('en-IN')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
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
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                    {/* Results Header with Export controls */}
                    <div className="px-5 py-3.5 border-b border-gray-150 bg-gray-50/70 flex items-center justify-between select-none">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-800">📋 Output Dataset</span>
                        <span className="text-[10px] bg-[#0d9da4]/10 text-[#0d9da4] px-2 py-0.5 rounded-full font-bold">
                          {queryResults.length} records
                        </span>
                      </div>
                      
                      {/* Export Actions */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 font-medium mr-1">Export as:</span>
                        <button
                          type="button"
                          onClick={() => exportResults('csv')}
                          title="Download results as CSV spreadsheet"
                          className="px-2.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-[10px] font-bold rounded-lg transition shadow-3xs flex items-center gap-1"
                        >
                          📥 CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => exportResults('json')}
                          title="Download results as JSON file"
                          className="px-2.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-[10px] font-bold rounded-lg transition shadow-3xs flex items-center gap-1"
                        >
                          📥 JSON
                        </button>
                      </div>
                    </div>

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
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">Query History</h2>
                  {history.length > 0 && (
                    <button
                      onClick={exportHistoryToCSV}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <span>📊</span> Export Excel (CSV)
                    </button>
                  )}
                </div>
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

      {/* Query Editor Mode Info Modal */}
      {showModeInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs text-left">
          <div className="bg-white dark:bg-gray-850 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden animate-fadeIn">
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              user?.role === 'admin'
                ? 'bg-purple-900 text-white border-purple-800'
                : user?.role === 'readwrite'
                ? 'bg-[#0d9da4] text-white border-teal-700'
                : 'bg-amber-600 text-white border-amber-700'
            }`}>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">
                  {user?.role === 'admin' ? '👑' : user?.role === 'readwrite' ? '⚡' : '🔒'}
                </span>
                <div>
                  <h3 className="text-sm font-bold">
                    {user?.role === 'admin'
                      ? 'Admin Mode Privileges'
                      : user?.role === 'readwrite'
                      ? 'ReadWrite Mode Privileges'
                      : 'Read-Only Mode Restraints'}
                  </h3>
                  <p className="text-[11px] opacity-90 font-medium">
                    Account Role: <span className="uppercase font-bold">{user?.role === 'read' ? 'Read User' : user?.role === 'readwrite' ? 'ReadWrite User' : user?.role}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModeInfoModal(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition text-base font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
                Here is a summary of what operations you can perform and what restrictions apply to your account inside the Query Editor across <strong>MySQL, PostgreSQL, Oracle, and MongoDB</strong> databases.
              </p>

              {/* CAN DO SECTION */}
              <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900/40">
                <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-300 mb-2 flex items-center gap-1.5">
                  <span className="text-sm">✅</span> Allowed Operations (What You CAN Do)
                </h4>
                <ul className="space-y-1.5 text-xs text-emerald-800 dark:text-emerald-400 font-medium list-disc list-inside">
                  <li>Run <strong>SELECT</strong> data queries across all tables & views.</li>
                  <li>Run <strong>SHOW TABLES</strong>, <strong>SHOW DATABASES</strong>, & schema inspection.</li>
                  <li>Use <strong>EXPLAIN</strong> / <strong>EXPLAIN ANALYZE</strong> to check query execution plans.</li>
                  <li>Execute MongoDB <strong>find()</strong>, <strong>aggregate()</strong>, <strong>countDocuments()</strong>, & <strong>distinct()</strong>.</li>
                  {user?.role !== 'read' && (
                    <>
                      <li>Execute <strong>INSERT</strong> statements to create new table rows / MongoDB documents.</li>
                      <li>Execute <strong>UPDATE</strong> statements to modify existing data.</li>
                      <li>Execute <strong>DELETE</strong> statements to purge data records.</li>
                      <li>Execute <strong>CREATE TABLE</strong> & <strong>ALTER TABLE</strong> DDL scripts.</li>
                    </>
                  )}
                  {user?.role === 'admin' && (
                    <li>Full administrative database operations (DROP, TRUNCATE, Stored Procedures, User Grants).</li>
                  )}
                </ul>
              </div>

              {/* CANNOT DO SECTION */}
              {user?.role === 'read' ? (
                <div className="p-4 bg-rose-50/80 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/40">
                  <h4 className="text-xs font-bold text-rose-900 dark:text-rose-300 mb-2 flex items-center gap-1.5">
                    <span className="text-sm">❌</span> Prohibited Operations (What You CANNOT Do)
                  </h4>
                  <ul className="space-y-1.5 text-xs text-rose-800 dark:text-rose-400 font-medium list-disc list-inside">
                    <li><strong>INSERT / UPDATE / DELETE:</strong> You cannot insert, update, or delete data records.</li>
                    <li><strong>DROP / TRUNCATE / ALTER:</strong> You cannot modify database schemas or drop tables.</li>
                    <li><strong>MongoDB Mutations:</strong> Methods like <code>insertOne()</code>, <code>updateOne()</code>, <code>deleteOne()</code>, and <code>drop()</code> are blocked.</li>
                    <li><strong>Stored Procedures & Grants:</strong> You cannot execute <code>CALL</code>, <code>EXEC</code>, <code>GRANT</code>, or <code>REVOKE</code>.</li>
                  </ul>
                </div>
              ) : user?.role === 'readwrite' ? (
                <div className="p-4 bg-amber-50/80 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/40">
                  <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                    <span className="text-sm">⚠️</span> Restricted System Operations
                  </h4>
                  <ul className="space-y-1.5 text-xs text-amber-800 dark:text-amber-400 font-medium list-disc list-inside">
                    <li>System User & Role Management is restricted to Admin accounts.</li>
                    <li>System Audit Trail Logs can only be deleted or managed by Admins.</li>
                  </ul>
                </div>
              ) : (
                <div className="p-4 bg-purple-50/80 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-900/40">
                  <h4 className="text-xs font-bold text-purple-900 dark:text-purple-300 mb-1 flex items-center gap-1.5">
                    <span className="text-sm">👑</span> Full System Privilege
                  </h4>
                  <p className="text-xs text-purple-800 dark:text-purple-400 font-medium">
                    As an Admin user, you have unrestricted execution rights across all connected database engines.
                  </p>
                </div>
              )}

              <div className="pt-2 text-center border-t border-gray-150 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModeInfoModal(false)}
                  style={{ backgroundColor: '#0d9da4' }}
                  className="px-6 py-2 text-white text-xs font-bold rounded-lg hover:opacity-90 transition cursor-pointer"
                >
                  Got It
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}