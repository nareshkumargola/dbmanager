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
  const [connectionName, setConnectionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const startResizingSidebar = (mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizingSidebar(true);

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.min(Math.max(160, moveEvent.clientX), 550);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizingSidebar(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };
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

  const userId = user?.id || user?._id || 'guest';
  const storageKeyTabs = `dms_query_tabs_${userId}_${id}`;
  const storageKeyActive = `dms_active_query_tab_${userId}_${id}`;

  // Query Editor Multi-Tab State with Hybrid Storage (User LocalStorage + MongoDB Cloud Sync)
  const [queryTabs, setQueryTabs] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKeyTabs);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(t => ({
            id: t.id || `tab-${Date.now()}`,
            name: t.name || 'Query 1',
            query: t.query || '',
            results: t.results || [],
            columns: t.columns || [],
            error: '',
            msg: '',
            loading: false
          }));
        }
      }
    } catch (e) {
      console.error('Failed to parse saved query tabs:', e);
    }
    return [
      { id: 'tab-1', name: 'Query 1', query: '', results: [], columns: [], error: '', msg: '', loading: false }
    ];
  });

  const [activeQueryTabId, setActiveQueryTabId] = useState(() => {
    try {
      const savedId = localStorage.getItem(storageKeyActive);
      if (savedId) return savedId;
    } catch (e) {}
    return 'tab-1';
  });

  // 1. Restore tabs from MongoDB Cloud database on initial load per User & Connection
  useEffect(() => {
    const fetchCloudTabSession = async () => {
      if (!id || !user) return;
      try {
        const res = await API.get(`/user-tabs/${id}`);
        if (res.data?.success && res.data.session) {
          const cloudSession = res.data.session;
          if (Array.isArray(cloudSession.tabs) && cloudSession.tabs.length > 0) {
            setQueryTabs(cloudSession.tabs.map(t => ({
              id: t.id || `tab-${Date.now()}`,
              name: t.name || 'Query 1',
              query: t.query || '',
              results: [],
              columns: [],
              error: '',
              msg: '',
              loading: false
            })));
            if (cloudSession.activeTabId) {
              setActiveQueryTabId(cloudSession.activeTabId);
            }
          }
        }
      } catch (err) {
        console.error('Cloud tab session fetch error:', err);
      }
    };
    fetchCloudTabSession();
  }, [id, user]);

  // 2. Fast LocalStorage Save & Debounced Cloud DB Backup
  useEffect(() => {
    if (id && queryTabs.length > 0) {
      try {
        const tabsToSave = queryTabs.map(t => ({
          id: t.id,
          name: t.name,
          query: t.query,
          results: t.results,
          columns: t.columns
        }));
        // Instant local device cache
        localStorage.setItem(storageKeyTabs, JSON.stringify(tabsToSave));
        localStorage.setItem(storageKeyActive, activeQueryTabId);

        // Debounced Cloud MongoDB Backup (saves 1.5s after user stops typing)
        const timer = setTimeout(() => {
          API.post(`/user-tabs/${id}`, {
            activeTabId: activeQueryTabId,
            tabs: tabsToSave
          }).catch(err => console.error('Cloud tab session save failed:', err));
        }, 1500);

        return () => clearTimeout(timer);
      } catch (e) {
        console.error('Failed to persist query tabs:', e);
      }
    }
  }, [queryTabs, activeQueryTabId, id, storageKeyTabs, storageKeyActive]);

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
      loading: false,
      targetDb: activeDb || stats?.database || 'default'
    };
    setQueryTabs([...queryTabs, newTab]);
    setActiveQueryTabId(newId);
  };

  const handleRenameTab = (tabId, currentName) => {
    const newName = prompt('Enter new custom name for this Query Tab:', currentName);
    if (newName && newName.trim()) {
      setQueryTabs(prev => prev.map(t => t.id === tabId ? { ...t, name: newName.trim() } : t));
    }
  };

  // Saved Queries (User-wise Scripts) State
  const [savedQueries, setSavedQueries] = useState([]);
  const [showSaveScriptModal, setShowSaveScriptModal] = useState(false);
  const [showSavedQueriesModal, setShowSavedQueriesModal] = useState(false);
  const [scriptTitle, setScriptTitle] = useState('');
  const [scriptDesc, setScriptDesc] = useState('');
  const [savingScript, setSavingScript] = useState(false);
  const [savedScriptsDbFilter, setSavedScriptsDbFilter] = useState('all');

  // Output Dataset Table Pagination & Column Sorting States
  const [resultPage, setResultPage] = useState(1);
  const [resultRowsPerPage, setResultRowsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState(null); // 'asc' | 'desc' | null

  const handleHeaderSort = (colName) => {
    if (sortColumn === colName) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(colName);
      setSortDirection('asc');
    }
    setResultPage(1);
  };

  const sortedResults = [...queryResults].sort((a, b) => {
    if (!sortColumn || !sortDirection) return 0;
    const valA = a[sortColumn];
    const valB = b[sortColumn];

    if (valA === null || valA === undefined) return 1;
    if (valB === null || valB === undefined) return -1;

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    }

    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();

    if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
    if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const totalResultRows = sortedResults.length;
  const totalResultPages = Math.max(1, Math.ceil(totalResultRows / resultRowsPerPage));
  const startResultIndex = (resultPage - 1) * resultRowsPerPage;
  const paginatedQueryResults = sortedResults.slice(startResultIndex, startResultIndex + resultRowsPerPage);

  const fetchSavedQueries = async () => {
    try {
      const res = await API.get('/saved-queries');
      setSavedQueries(res.data.queries || []);
    } catch (e) {
      console.error('Failed to load saved queries:', e);
    }
  };

  useEffect(() => {
    fetchSavedQueries();
  }, []);

  const handleSaveScript = async () => {
    if (!scriptTitle.trim()) {
      alert('Please enter a title for the script.');
      return;
    }
    const currentQuery = query || activeQueryTab?.query || '';
    if (!currentQuery.trim()) {
      alert('Query Editor is empty! Write some SQL/NoSQL first.');
      return;
    }

    try {
      setSavingScript(true);
      await API.post('/saved-queries', {
        title: scriptTitle.trim(),
        description: scriptDesc.trim(),
        query: currentQuery,
        connectionId: id,
        database: activeDb || stats?.database || '',
      });
      setQueryMsg(`Script "${scriptTitle.trim()}" saved successfully to your personal library!`);
      setShowSaveScriptModal(false);
      setScriptTitle('');
      setScriptDesc('');
      fetchSavedQueries();
    } catch (err) {
      console.error('Save script error:', err);
      alert(err.response?.data?.message || 'Failed to save script: ' + err.message);
    } finally {
      setSavingScript(false);
    }
  };

  const handleLoadSavedQuery = (savedItem) => {
    setQuery(savedItem.query);
    setQueryMsg(`Loaded saved script "${savedItem.title}" into active Query Editor!`);
    setShowSavedQueriesModal(false);
  };

  const handleDeleteSavedQuery = async (queryId) => {
    if (!window.confirm('Are you sure you want to delete this saved script?')) return;
    try {
      await API.delete(`/saved-queries/${queryId}`);
      setQueryMsg('Saved script deleted successfully.');
      fetchSavedQueries();
    } catch (err) {
      alert('Failed to delete saved query');
    }
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

  // Database Object Categories (MySQL Workbench Style)
  const [dbObjectType, setDbObjectType] = useState('tables'); // 'tables', 'views', 'procedures', 'functions', 'triggers', 'indexes', 'constraints'
  const [objectSearch, setObjectSearch] = useState('');
  const [indexTableFilter, setIndexTableFilter] = useState('');
  const [expandedDbs, setExpandedDbs] = useState({});
  const [definitionModal, setDefinitionModal] = useState({ open: false, title: '', type: '', code: '' });

  useEffect(() => {
    const initializeConnection = async () => {
      try {
        setLoading(true);
        // 1. Fetch connection details to check default database config
        const connRes = await API.get('/connections');
        const conn = connRes.data.connections.find(c => c._id === id);
        const configuredDefault = conn ? conn.database : null;

        if (conn) {
          setConnectionName(conn.name);
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
      if (location.state.query) {
        const queryText = location.state.query;
        setQueryTabs(prevTabs => {
          const currentActive = prevTabs.find(t => t.id === activeQueryTabId) || prevTabs[0];
          if (currentActive && (!currentActive.query || !currentActive.query.trim())) {
            return prevTabs.map(t => t.id === currentActive.id ? { ...t, query: queryText } : t);
          }
          const newTabId = `tab-${Date.now()}`;
          const newTabNumber = prevTabs.length + 1;
          const newTab = {
            id: newTabId,
            name: `Query ${newTabNumber}`,
            query: queryText,
            results: [],
            columns: [],
            error: '',
            msg: '',
            loading: false
          };
          setActiveQueryTabId(newTabId);
          return [...prevTabs, newTab];
        });
        window.history.replaceState({}, document.title);
      }
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
    setIndexTableFilter('');
    
    try {
      setDbLoading(true);
      setError('');
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
      
      <div style="margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 8px; font-size: 13px;">
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px; color: #0f172a; display: flex; items-center; gap: 8px;">
          ${getTypeIcon(dbType)} ${objects?.name || 'Database Connection'}
        </div>
        <strong>Engine / Type:</strong> ${getTypeIcon(dbType)} ${dbType?.toUpperCase() || 'N/A'}<br/>
        <strong>Host IP / Port:</strong> 📍 ${objects?.host || 'localhost'}:${objects?.port || (dbType === 'postgresql' ? 5432 : 3306)}<br/>
        <strong>Database / Schema:</strong> ${activeDb || stats?.database || 'All'}<br/>
        <strong>Report Generated:</strong> 📅 ${new Date().toLocaleString('en-IN')}<br/>
      </div>

      ${dbType === 'mysql' ? `
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 10px;">🐬 MySQL Metrics</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Server IP / Host</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">📍 ${objects?.host || 'localhost'}:${objects?.port || 3306}</td>
          </tr>
          <tr style="background: #f9f9f9;">
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
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 10px;">🐘 PostgreSQL Metrics</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background: #eef2ff;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Database Logo &amp; Engine</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; color: #4338ca;">🐘 PostgreSQL Database Engine</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Server Host / IP Address</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px; font-family: monospace; font-weight: bold; color: #1e293b;">📍 ${objects?.host || 'localhost'}:${objects?.port || 5432}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Active Connections</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.activeConnections} / ${monitorData.maxConnections}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Database Size</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.size}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total Tables</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.totalTables}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Commits</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.commits ? monitorData.commits.toLocaleString() : '0'}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Rollbacks</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.rollbacks ? monitorData.rollbacks.toLocaleString() : '0'}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Blocks Read</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.blocksRead ? monitorData.blocksRead.toLocaleString() : '0'}</td>
          </tr>
          <tr style="background: #f9f9f9;">
            <td style="border: 1px solid #ddd; padding: 8px;"><strong>Blocks Hit</strong></td>
            <td style="border: 1px solid #ddd; padding: 8px;">${monitorData.blocksHit ? monitorData.blocksHit.toLocaleString() : '0'}</td>
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
      const [objRes, statsRes, tablesDetailsRes] = await Promise.all([
        API.get(`/connections/${id}/objects?database=${encodeURIComponent(activeDb)}`),
        API.get(`/connections/${id}/stats?database=${encodeURIComponent(activeDb)}`),
        API.get(`/monitor/${id}/tables?database=${encodeURIComponent(activeDb)}`).catch(() => ({ data: { tables: [] } }))
      ]);
      setObjects(objRes.data);
      setStats(statsRes.data.stats);
      if (tablesDetailsRes.data?.tables) {
        setTableDetails(tablesDetailsRes.data.tables);
      }
      if (selectedTable) {
        API.get(`/connections/${id}/table/${selectedTable}?database=${encodeURIComponent(activeDb)}`)
          .then(res => {
            if (res.data?.rows) setTableData(res.data.rows);
            if (res.data?.columns) setTableColumns(res.data.columns);
          })
          .catch(() => {});
      }
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
    const cleanQ = queryToRun.trim();
    const isMongoCmd = /^db\.[a-zA-Z0-9_-]+|\{.*"find":/i.test(cleanQ);
    const isStrictSQLCmd = /^\s*(SELECT|INSERT\s+INTO|UPDATE\s+[`"']?\w+[`"']?\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i.test(cleanQ);

    if (dbType === 'mongodb' && isStrictSQLCmd) {
      setQueryError("❌ Engine Mismatch Error: MongoDB connection active! Standard SQL queries (SELECT/INSERT INTO/UPDATE/DELETE) cannot be run on MongoDB. Please write MongoDB MQL syntax (e.g., db.users.find({})).");
      return;
    }

    if (dbType !== 'mongodb' && isMongoCmd) {
      const engineName = dbType === 'mysql' ? 'MySQL' : dbType === 'postgresql' ? 'PostgreSQL' : dbType === 'oracle' ? 'Oracle' : 'SQL';
      setQueryError(`❌ Engine Mismatch Error: ${engineName} connection active! MongoDB MQL commands (db.collection...) cannot be executed on ${engineName}. Please write valid ${engineName} SQL queries.`);
      return;
    }

    setQueryLoading(true);
    setQueryError('');
    setQueryMsg('');
    setQueryResults([]);
    setQueryColumns([]);
    setResultPage(1);
    setSortColumn(null);
    setSortDirection(null);
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
      if (Array.isArray(data)) {
        setQueryResults(data);
        if (data.length > 0) {
          setQueryColumns(Object.keys(data[0]));
          setQueryMsg(`${data.length} rows returned — ${res.data.executionTime}ms${selectionSuffix}`);
        } else {
          setQueryColumns([]);
          setQueryMsg(`0 rows returned (No data in table) — ${res.data.executionTime}ms${selectionSuffix}`);
        }
      } else if (data?.affectedRows !== undefined) {
        setQueryMsg(`${data.affectedRows} rows affected — ${res.data.executionTime}ms${selectionSuffix}`);
      } else {
        setQueryMsg(`Query executed successfully! — ${res.data.executionTime}ms${selectionSuffix}`);
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
    if (type === 'mysql') return result.tables?.map(t => typeof t === 'string' ? t : (t.name || t.table_name || Object.values(t)[0])) || [];
    if (type === 'postgresql') return result.tables?.map(t => typeof t === 'string' ? t : (t.name || t.table_name)) || [];
    if (type === 'mongodb') return result.collections?.map(c => typeof c === 'string' ? c : (c.name || c.collection_name)) || [];
    if (type === 'oracle') return result.tables?.map(t => typeof t === 'string' ? t : (t.name || t.table_name || t.TABLE_NAME)) || [];
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
        return `${(val * 1024).toFixed(1)} KB`;
      case 'GB':
        return `${(val / 1024).toFixed(4)} GB`;
      case 'MB':
        return `${val.toFixed(2)} MB`;
      case 'Auto':
      default:
        if (val === 0) return '0 KB';
        if (val < 0.1) return `${(val * 1024).toFixed(1)} KB`;
        if (val >= 1024) return `${(val / 1024).toFixed(2)} GB`;
        return `${val.toFixed(2)} MB`;
    }
  };

  const getTablesWithMetadata = () => {
    const rawList = objects?.result?.tables || objects?.result?.collections || [];
    return tables.map(tableName => {
      const detail = tableDetails.find(d => d.table === tableName);
      const rawObj = rawList.find(t => (typeof t === 'object' && (t.name === tableName || t.table_name === tableName || Object.values(t)[0] === tableName)));
      return {
        name: tableName,
        rows: detail ? detail.rows : (rawObj?.rows || rawObj?.count || 0),
        sizeMB: detail ? detail.sizeMB : (rawObj?.sizeMB || 0.01)
      };
    });
  };

  const [tablesListSortCol, setTablesListSortCol] = useState(null);
  const [tablesListSortDir, setTablesListSortDir] = useState(null); // 'asc' | 'desc' | null

  const handleTablesListSort = (colKey) => {
    if (tablesListSortCol === colKey) {
      if (tablesListSortDir === 'asc') {
        setTablesListSortDir('desc');
      } else if (tablesListSortDir === 'desc') {
        setTablesListSortCol(null);
        setTablesListSortDir(null);
      } else {
        setTablesListSortDir('asc');
      }
    } else {
      setTablesListSortCol(colKey);
      setTablesListSortDir('asc');
    }
    setTablesListPage(1);
  };

  const processedTablesList = getTablesWithMetadata()
    .filter(t => t.name.toLowerCase().includes(tableSearch.toLowerCase()))
    .sort((a, b) => {
      if (!tablesListSortCol || !tablesListSortDir) return 0;
      const valA = a[tablesListSortCol];
      const valB = b[tablesListSortCol];

      if (typeof valA === 'number' && typeof valB === 'number') {
        return tablesListSortDir === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      if (strA < strB) return tablesListSortDir === 'asc' ? -1 : 1;
      if (strA > strB) return tablesListSortDir === 'asc' ? 1 : -1;
      return 0;
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
          <div className="flex items-center gap-2.5">
            {/* Server / Connection Name */}
            <span className="text-sm font-bold text-white flex items-center gap-1.5 drop-shadow-xs">
              <span className="text-base">{getTypeIcon(dbType)}</span>
              <span>{connectionName || objects?.name || 'Server'}</span>
            </span>

            {/* DB Engine Badge */}
            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
              dbType === 'mysql' ? 'bg-blue-900/50 text-blue-100 ring-1 ring-blue-300/40' :
              dbType === 'postgresql' ? 'bg-indigo-900/50 text-indigo-100 ring-1 ring-indigo-300/40' :
              'bg-emerald-900/50 text-emerald-100 ring-1 ring-emerald-300/40'
            }`}>
              {dbType}
            </span>

            {/* Separator */}
            <span className="text-white/40 font-light text-sm">/</span>

            {/* HIGH VISIBILITY LIGHT HIGHLIGHTED ACTIVE DATABASE BADGE */}
            {activeDb ? (
              <div className="flex items-center gap-2 bg-white/95 text-[#0c7f85] border border-white/60 px-3 py-1 rounded-lg shadow-xs font-bold text-xs tracking-wide">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-gray-500 font-medium text-[11px] uppercase tracking-wider">DB:</span>
                <span className="text-[#096065] font-extrabold text-sm">{activeDb}</span>
              </div>
            ) : (
              <span className="text-xs italic text-white/70">Select Database</span>
            )}
          </div>
        }
      />

      <div className="flex h-[calc(100vh-53px)] relative">

        {/* Sidebar (on the left showing databases) */}
        <div
          style={{ width: sidebarOpen ? `${sidebarWidth}px` : '0px' }}
          className={`${!sidebarOpen ? 'overflow-hidden border-none' : ''} bg-white border-r border-gray-200 flex flex-col shrink-0 relative ${
            isResizingSidebar ? 'select-none transition-none' : 'transition-[width] duration-200'
          }`}
        >
          <div className="px-3.5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Databases ({databases.length})
            </p>
            <span className="text-[10px] text-gray-400 font-mono font-medium">{sidebarWidth}px</span>
          </div>

          <div className="overflow-y-auto flex-1 py-1">
            {databases.length === 0 ? (
              <p className="text-[10px] text-gray-400 px-3 py-3">No databases</p>
            ) : (
              databases.map((db, i) => {
                const isSelected = activeDb === db;
                const isExpanded = expandedDbs[db] !== undefined ? expandedDbs[db] : isSelected;
                const tablesCount = isSelected && objects?.result?.tables ? objects.result.tables.length : 0;
                const viewsCount = isSelected && objects?.result?.views ? objects.result.views.length : 0;
                const proceduresCount = isSelected && objects?.result?.procedures ? objects.result.procedures.length : 0;
                const functionsCount = isSelected && objects?.result?.functions ? objects.result.functions.length : 0;
                const triggersCount = isSelected && objects?.result?.triggers ? objects.result.triggers.length : 0;

                const indexesCount = isSelected && objects?.result?.indexes ? objects.result.indexes.length : 0;
                const constraintsCount = isSelected && objects?.result?.constraints ? objects.result.constraints.length : 0;

                return (
                  <div key={i} className="border-b border-gray-100/80">
                    <div
                      className={`w-full text-left px-3 py-2 text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-[#0d9da4] text-white font-bold'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        selectDatabase(db);
                        setExpandedDbs(prev => ({ ...prev, [db]: !isExpanded }));
                      }}
                      title={db}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDbs(prev => ({ ...prev, [db]: !isExpanded }));
                          }}
                          className="text-[9px] text-white/80 hover:text-white p-0.5"
                        >
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <span className="shrink-0 text-sm">🗄️</span>
                        <span className="truncate" title={db}>{db}</span>
                      </div>
                    </div>

                    {/* Sub-tree Folders (Workbench Style) */}
                    {isExpanded && isSelected && (
                      <div className="pl-6 py-1 bg-gray-50/80 space-y-0.5 border-t border-gray-100">
                        {/* Tables */}
                        <button
                          onClick={() => {
                            setDbObjectType('tables');
                            setSelectedTable(null);
                            setActiveTab('table');
                          }}
                          className={`w-full text-left px-2 py-1 text-[11px] font-medium flex items-center justify-between rounded transition ${
                            dbObjectType === 'tables' && activeTab === 'table' && !selectedTable
                              ? 'bg-teal-100 text-teal-900 font-bold'
                              : 'text-gray-600 hover:bg-gray-150'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>📋</span> Tables
                          </span>
                          <span className="text-[9px] font-mono bg-gray-200 text-gray-700 px-1.5 py-0.2 rounded font-bold">
                            {tablesCount}
                          </span>
                        </button>

                        {/* Views */}
                        <button
                          onClick={() => {
                            setDbObjectType('views');
                            setSelectedTable(null);
                            setActiveTab('table');
                          }}
                          className={`w-full text-left px-2 py-1 text-[11px] font-medium flex items-center justify-between rounded transition ${
                            dbObjectType === 'views' && activeTab === 'table'
                              ? 'bg-teal-100 text-teal-900 font-bold'
                              : 'text-gray-600 hover:bg-gray-150'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>👁️</span> Views
                          </span>
                          <span className="text-[9px] font-mono bg-gray-200 text-gray-700 px-1.5 py-0.2 rounded font-bold">
                            {viewsCount}
                          </span>
                        </button>

                        {/* Stored Procedures */}
                        {dbType !== 'mongodb' && (
                          <button
                            onClick={() => {
                              setDbObjectType('procedures');
                              setSelectedTable(null);
                              setActiveTab('table');
                            }}
                            className={`w-full text-left px-2 py-1 text-[11px] font-medium flex items-center justify-between rounded transition ${
                              dbObjectType === 'procedures' && activeTab === 'table'
                                ? 'bg-teal-100 text-teal-900 font-bold'
                                : 'text-gray-600 hover:bg-gray-150'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span>⚙️</span> Procedures
                            </span>
                            <span className="text-[9px] font-mono bg-gray-200 text-gray-700 px-1.5 py-0.2 rounded font-bold">
                              {proceduresCount}
                            </span>
                          </button>
                        )}

                        {/* Functions */}
                        {dbType !== 'mongodb' && (
                          <button
                            onClick={() => {
                              setDbObjectType('functions');
                              setSelectedTable(null);
                              setActiveTab('table');
                            }}
                            className={`w-full text-left px-2 py-1 text-[11px] font-medium flex items-center justify-between rounded transition ${
                              dbObjectType === 'functions' && activeTab === 'table'
                                ? 'bg-teal-100 text-teal-900 font-bold'
                                : 'text-gray-600 hover:bg-gray-150'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span>🧮</span> Functions
                            </span>
                            <span className="text-[9px] font-mono bg-gray-200 text-gray-700 px-1.5 py-0.2 rounded font-bold">
                              {functionsCount}
                            </span>
                          </button>
                        )}

                        {/* Triggers */}
                        {dbType !== 'mongodb' && (
                          <button
                            onClick={() => {
                              setDbObjectType('triggers');
                              setSelectedTable(null);
                              setActiveTab('table');
                            }}
                            className={`w-full text-left px-2 py-1 text-[11px] font-medium flex items-center justify-between rounded transition ${
                              dbObjectType === 'triggers' && activeTab === 'table'
                                ? 'bg-teal-100 text-teal-900 font-bold'
                                : 'text-gray-600 hover:bg-gray-150'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span>⚡</span> Triggers
                            </span>
                            <span className="text-[9px] font-mono bg-gray-200 text-gray-700 px-1.5 py-0.2 rounded font-bold">
                              {triggersCount}
                            </span>
                          </button>
                        )}

                        {/* Indexes */}
                        <button
                          onClick={() => {
                            setDbObjectType('indexes');
                            setSelectedTable(null);
                            setActiveTab('table');
                          }}
                          className={`w-full text-left px-2 py-1 text-[11px] font-medium flex items-center justify-between rounded transition ${
                            dbObjectType === 'indexes' && activeTab === 'table'
                              ? 'bg-teal-100 text-teal-900 font-bold'
                              : 'text-gray-600 hover:bg-gray-150'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>🔍</span> Indexes
                          </span>
                          <span className="text-[9px] font-mono bg-gray-200 text-gray-700 px-1.5 py-0.2 rounded font-bold">
                            {indexesCount}
                          </span>
                        </button>

                        {/* Constraints */}
                        <button
                          onClick={() => {
                            setDbObjectType('constraints');
                            setSelectedTable(null);
                            setActiveTab('table');
                          }}
                          className={`w-full text-left px-2 py-1 text-[11px] font-medium flex items-center justify-between rounded transition ${
                            dbObjectType === 'constraints' && activeTab === 'table'
                              ? 'bg-teal-100 text-teal-900 font-bold'
                              : 'text-gray-600 hover:bg-gray-150'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>🔒</span> Constraints
                          </span>
                          <span className="text-[9px] font-mono bg-gray-200 text-gray-700 px-1.5 py-0.2 rounded font-bold">
                            {constraintsCount}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Mouse Drag Resize Handle Bar */}
          {sidebarOpen && (
            <div
              onMouseDown={startResizingSidebar}
              className={`absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize z-30 group flex items-center justify-center hover:bg-teal-500/20 ${
                isResizingSidebar ? 'bg-teal-500/30' : ''
              }`}
              title="Drag right/left with cursor to resize sidebar width"
            >
              <div className={`w-1 h-8 bg-gray-300 rounded group-hover:bg-[#0d9da4] transition-colors ${
                isResizingSidebar ? 'bg-[#0d9da4] h-12' : ''
              }`} />
            </div>
          )}
        </div>

        {/* Sidebar Toggle Collapse/Open Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-1/2 z-20 w-6 h-6 bg-white border border-gray-200 shadow-md rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-all duration-200 focus:outline-none cursor-pointer"
          style={{
            left: !sidebarOpen ? '4px' : `${sidebarWidth - 12}px`,
            transform: 'translateY(-50%)',
          }}
          title={sidebarOpen ? "Collapse Sidebar" : "Open Sidebar"}
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

            {/* Active Database Badge on the Right Side (Overview, Table Data, Query Editor & Slow Query tabs) */}
            {activeDb && ['overview', 'table', 'query', 'slow-queries'].includes(activeTab) && (
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
                    {/* Database Object Category Filter Pills Bar */}
                    <div className="flex flex-col gap-3 mb-6 pb-4 border-b border-gray-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                            <span>🗄️</span> Database Objects — <span className="font-mono text-[#0d9da4]">{activeDb || 'Selected Schema'}</span>
                          </h3>
                        </div>

                        {/* Search Box for Non-Table Objects */}
                        {dbObjectType !== 'tables' && (
                          <div className="relative">
                            <input
                              type="text"
                              placeholder={`Search ${dbObjectType}...`}
                              value={objectSearch}
                              onChange={e => setObjectSearch(e.target.value)}
                              className="pl-8 pr-8 py-1.5 border border-gray-250 rounded-lg text-xs outline-none bg-gray-50 focus:bg-white focus:border-teal-500 transition w-full sm:w-64 font-medium text-gray-800"
                            />
                            <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            {objectSearch && (
                              <button
                                type="button"
                                onClick={() => setObjectSearch('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto pt-1">
                        <button
                          type="button"
                          onClick={() => { setDbObjectType('tables'); setObjectSearch(''); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            dbObjectType === 'tables'
                              ? 'bg-[#0d9da4] text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <span>📋</span> Tables ({(objects?.result?.tables || objects?.result?.collections || []).length})
                        </button>

                        <button
                          type="button"
                          onClick={() => { setDbObjectType('views'); setObjectSearch(''); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            dbObjectType === 'views'
                              ? 'bg-[#0d9da4] text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <span>👁️</span> Views ({(objects?.result?.views || []).length})
                        </button>

                        {dbType !== 'mongodb' && (
                          <button
                            type="button"
                            onClick={() => { setDbObjectType('procedures'); setObjectSearch(''); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                              dbObjectType === 'procedures'
                                ? 'bg-[#0d9da4] text-white shadow-2xs'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <span>⚙️</span> Procedures ({(objects?.result?.procedures || []).length})
                          </button>
                        )}

                        {dbType !== 'mongodb' && (
                          <button
                            type="button"
                            onClick={() => { setDbObjectType('functions'); setObjectSearch(''); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                              dbObjectType === 'functions'
                                ? 'bg-[#0d9da4] text-white shadow-2xs'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <span>🧮</span> Functions ({(objects?.result?.functions || []).length})
                          </button>
                        )}

                        {dbType !== 'mongodb' && (
                          <button
                            type="button"
                            onClick={() => { setDbObjectType('triggers'); setObjectSearch(''); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                              dbObjectType === 'triggers'
                                ? 'bg-[#0d9da4] text-white shadow-2xs'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <span>⚡</span> Triggers ({(objects?.result?.triggers || []).length})
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => { setDbObjectType('indexes'); setObjectSearch(''); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            dbObjectType === 'indexes'
                              ? 'bg-[#0d9da4] text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <span>🔍</span> Indexes ({(objects?.result?.indexes || []).length})
                        </button>

                        <button
                          type="button"
                          onClick={() => { setDbObjectType('constraints'); setObjectSearch(''); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            dbObjectType === 'constraints'
                              ? 'bg-[#0d9da4] text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <span>🔒</span> Constraints ({(objects?.result?.constraints || []).length})
                        </button>
                      </div>
                    </div>

                    {/* 1. TABLES VIEW */}
                    {dbObjectType === 'tables' && (
                      <>
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
                            <option value="Auto">Auto</option>
                            <option value="MB">MB</option>
                            <option value="KB">KB</option>
                            <option value="Bytes">Bytes</option>
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

                        {/* TOP PAGINATION BUTTONS */}
                        {processedTablesList.length > 0 && (() => {
                          const totalTablesCount = processedTablesList.length;
                          const totalTablesListPages = Math.ceil(totalTablesCount / tablesListRowsPerPage) || 1;
                          return (
                            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                              <button
                                type="button"
                                onClick={() => setTablesListPage(prev => Math.max(prev - 1, 1))}
                                disabled={tablesListPage === 1}
                                className="px-2.5 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white shadow-3xs"
                              >
                                ← Previous
                              </button>

                              <span className="text-xs font-bold text-gray-700 font-mono px-1">
                                Page {tablesListPage} of {totalTablesListPages}
                              </span>

                              <button
                                type="button"
                                onClick={() => setTablesListPage(prev => Math.min(prev + 1, totalTablesListPages))}
                                disabled={tablesListPage >= totalTablesListPages}
                                className="px-2.5 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white shadow-3xs"
                              >
                                Next →
                              </button>
                            </div>
                          );
                        })()}
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
                            <thead className="bg-gray-50/80 border-b border-gray-200 select-none">
                              <tr>
                                <th
                                  onClick={() => handleTablesListSort('name')}
                                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                  title="Click to sort by Table Name"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>{dbType === 'mongodb' ? 'Collection Name' : 'Table Name'}</span>
                                    <span className="text-[11px]">
                                      {tablesListSortCol === 'name'
                                        ? tablesListSortDir === 'asc' ? '🔼' : '🔽'
                                        : '↕️'}
                                    </span>
                                  </div>
                                </th>
                                <th
                                  onClick={() => handleTablesListSort('rows')}
                                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                  title="Click to sort by Row Count"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>Est. Rows</span>
                                    <span className="text-[11px]">
                                      {tablesListSortCol === 'rows'
                                        ? tablesListSortDir === 'asc' ? '🔼' : '🔽'
                                        : '↕️'}
                                    </span>
                                  </div>
                                </th>
                                <th
                                  onClick={() => handleTablesListSort('sizeMB')}
                                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                  title="Click to sort by Size"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>Size</span>
                                    <span className="text-[11px]">
                                      {tablesListSortCol === 'sizeMB'
                                        ? tablesListSortDir === 'asc' ? '🔼' : '🔽'
                                        : '↕️'}
                                    </span>
                                  </div>
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
                  </>
                )}

                {/* 2. VIEWS */}
                {dbObjectType === 'views' && (() => {
                  const rawViews = objects?.result?.views || [];
                  const filteredViews = objectSearch.trim()
                    ? rawViews.filter(v => (v.name || '').toLowerCase().includes(objectSearch.toLowerCase()) || (v.viewOn || '').toLowerCase().includes(objectSearch.toLowerCase()))
                    : rawViews;

                  return (
                    <div>
                      {filteredViews.length === 0 ? (
                        <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                          <p className="text-2xl mb-2">👁️</p>
                          <p className="font-semibold text-gray-700">
                            {objectSearch.trim() ? `No Views matching "${objectSearch}"` : `No Views found in database schema ${activeDb}.`}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredViews.map((v, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col justify-between hover:border-teal-400 transition">
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-bold text-gray-900 font-mono flex items-center gap-1.5 truncate" title={v.name}>
                                    <span>👁️</span> {v.name}
                                  </h4>
                                  <span className="text-[10px] bg-teal-50 text-teal-700 font-bold px-2 py-0.5 rounded font-mono shrink-0">
                                    VIEW
                                  </span>
                                </div>
                                {v.viewOn && (
                                  <p className="text-xs text-gray-500 font-mono mb-2">Base Collection: {v.viewOn}</p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-3">
                                <button
                                  type="button"
                                  onClick={() => setDefinitionModal({ open: true, title: `View DDL: ${v.name}`, type: 'view', code: v.definition || v.pipeline || `CREATE VIEW \`${v.name}\` AS ...` })}
                                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  📜 View DDL
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const runViewSql = dbType === 'mongodb' ? `db.${v.name}.find()` : `SELECT * FROM \`${v.name}\` LIMIT 100;`;
                                    setQuery(runViewSql);
                                    setActiveTab('query');
                                  }}
                                  className="px-3 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  ⚡ Query View
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 3. STORED PROCEDURES */}
                {dbObjectType === 'procedures' && (() => {
                  const rawProcs = objects?.result?.procedures || [];
                  const filteredProcs = objectSearch.trim()
                    ? rawProcs.filter(p => (p.name || '').toLowerCase().includes(objectSearch.toLowerCase()))
                    : rawProcs;

                  return (
                    <div>
                      {filteredProcs.length === 0 ? (
                        <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                          <p className="text-2xl mb-2">⚙️</p>
                          <p className="font-semibold text-gray-700">
                            {objectSearch.trim() ? `No Procedures matching "${objectSearch}"` : `No Stored Procedures found in database schema ${activeDb}.`}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredProcs.map((p, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col justify-between hover:border-teal-400 transition">
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-bold text-gray-900 font-mono flex items-center gap-1.5 truncate" title={p.name}>
                                    <span>⚙️</span> {p.name}
                                  </h4>
                                  <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded font-mono shrink-0">
                                    PROCEDURE
                                  </span>
                                </div>
                                {p.returnType && <p className="text-xs text-gray-500 font-mono mb-2">Return Type: {p.returnType}</p>}
                              </div>

                              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-3">
                                <button
                                  type="button"
                                  onClick={() => setDefinitionModal({ open: true, title: `Stored Procedure: ${p.name}`, type: 'procedure', code: p.definition || `CREATE PROCEDURE \`${p.name}\` ...` })}
                                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  📜 View DDL
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const execCall = `CALL \`${p.name}\`();`;
                                    setQuery(execCall);
                                    setActiveTab('query');
                                  }}
                                  className="px-3 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  ⚡ Open in Editor
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 4. FUNCTIONS */}
                {dbObjectType === 'functions' && (() => {
                  const rawFuncs = objects?.result?.functions || [];
                  const filteredFuncs = objectSearch.trim()
                    ? rawFuncs.filter(f => (f.name || '').toLowerCase().includes(objectSearch.toLowerCase()))
                    : rawFuncs;

                  return (
                    <div>
                      {filteredFuncs.length === 0 ? (
                        <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                          <p className="text-2xl mb-2">🧮</p>
                          <p className="font-semibold text-gray-700">
                            {objectSearch.trim() ? `No Functions matching "${objectSearch}"` : `No Functions found in database schema ${activeDb}.`}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredFuncs.map((f, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col justify-between hover:border-teal-400 transition">
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-bold text-gray-900 font-mono flex items-center gap-1.5 truncate" title={f.name}>
                                    <span>🧮</span> {f.name}
                                  </h4>
                                  <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded font-mono shrink-0">
                                    FUNCTION
                                  </span>
                                </div>
                                {f.returnType && <p className="text-xs text-gray-500 font-mono mb-2">Returns: {f.returnType}</p>}
                              </div>

                              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-3">
                                <button
                                  type="button"
                                  onClick={() => setDefinitionModal({ open: true, title: `Function: ${f.name}`, type: 'function', code: f.definition || `CREATE FUNCTION \`${f.name}\` ...` })}
                                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  📜 View DDL
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const execCall = `SELECT \`${f.name}\`();`;
                                    setQuery(execCall);
                                    setActiveTab('query');
                                  }}
                                  className="px-3 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  ⚡ Open in Editor
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 5. TRIGGERS */}
                {dbObjectType === 'triggers' && (() => {
                  const rawTrigs = objects?.result?.triggers || [];
                  const filteredTrigs = objectSearch.trim()
                    ? rawTrigs.filter(t => (t.name || '').toLowerCase().includes(objectSearch.toLowerCase()) || (t.tableName || '').toLowerCase().includes(objectSearch.toLowerCase()) || (t.event || '').toLowerCase().includes(objectSearch.toLowerCase()))
                    : rawTrigs;

                  return (
                    <div>
                      {filteredTrigs.length === 0 ? (
                        <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                          <p className="text-2xl mb-2">⚡</p>
                          <p className="font-semibold text-gray-700">
                            {objectSearch.trim() ? `No Triggers matching "${objectSearch}"` : `No Triggers found in database schema ${activeDb}.`}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredTrigs.map((t, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col justify-between hover:border-teal-400 transition">
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-bold text-gray-900 font-mono flex items-center gap-1.5 truncate" title={t.name}>
                                    <span>⚡</span> {t.name}
                                  </h4>
                                  <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded font-mono shrink-0">
                                    TRIGGER
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 font-mono mb-1">Target Table: {t.tableName || 'N/A'}</p>
                                <p className="text-xs text-gray-500 font-mono mb-2">Event: {t.event || 'N/A'}</p>
                              </div>

                              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-3">
                                <button
                                  type="button"
                                  onClick={() => setDefinitionModal({ open: true, title: `Trigger: ${t.name}`, type: 'trigger', code: t.statement || `CREATE TRIGGER \`${t.name}\` ...` })}
                                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  📜 View DDL
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuery(t.statement || `-- Trigger: ${t.name}`);
                                    setActiveTab('query');
                                  }}
                                  className="px-3 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  ⚡ Open in Editor
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 6. INDEXES */}
                {dbObjectType === 'indexes' && (() => {
                  const rawIdxs = objects?.result?.indexes || [];

                  // Get unique list of current database tables from schema objects or index target tables
                  const availableTables = Array.from(new Set([
                    ...(objects?.result?.tables || objects?.result?.collections || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean),
                    ...rawIdxs.map(i => i.tableName).filter(Boolean)
                  ])).sort();

                  const filteredIdxs = rawIdxs.filter(i => {
                    const matchesSearch = !objectSearch.trim() || (
                      (i.name || '').toLowerCase().includes(objectSearch.toLowerCase()) ||
                      (i.tableName || '').toLowerCase().includes(objectSearch.toLowerCase()) ||
                      (i.columnName || '').toLowerCase().includes(objectSearch.toLowerCase())
                    );
                    const matchesTable = !indexTableFilter || (i.tableName || '').toLowerCase() === indexTableFilter.toLowerCase();
                    return matchesSearch && matchesTable;
                  });

                  return (
                    <div>
                      {/* Table Dropdown Filter Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 bg-white p-3.5 rounded-xl border border-gray-200 shadow-3xs">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                            <span>📋</span> Select Table:
                          </label>
                          <select
                            value={indexTableFilter}
                            onChange={e => setIndexTableFilter(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-gray-50/80 font-semibold text-gray-800 outline-none focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition cursor-pointer"
                          >
                            <option value="">All Tables ({availableTables.length})</option>
                            {availableTables.map((tName, idx) => (
                              <option key={idx} value={tName}>
                                {tName}
                              </option>
                            ))}
                          </select>

                          {indexTableFilter && (
                            <button
                              type="button"
                              onClick={() => setIndexTableFilter('')}
                              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                              title="Clear table filter"
                            >
                              Clear Filter ✕
                            </button>
                          )}
                        </div>

                        <div className="text-xs text-gray-500 font-medium">
                          Showing <span className="font-bold text-gray-900">{filteredIdxs.length}</span> of <span className="font-bold text-gray-900">{rawIdxs.length}</span> indexes
                        </div>
                      </div>

                      {filteredIdxs.length === 0 ? (
                        <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                          <p className="text-2xl mb-2">🔍</p>
                          <p className="font-semibold text-gray-700">
                            {indexTableFilter
                              ? `No Indexes found for table "${indexTableFilter}"`
                              : objectSearch.trim()
                                ? `No Indexes matching "${objectSearch}"`
                                : `No Indexes found in database schema ${activeDb}.`}
                          </p>
                          {indexTableFilter && (
                            <button
                              type="button"
                              onClick={() => setIndexTableFilter('')}
                              className="mt-3 px-3 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition cursor-pointer"
                            >
                              Show All Tables
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-6">
                          {(() => {
                            const groupedByTable = filteredIdxs.reduce((acc, idxItem) => {
                              const tName = idxItem.tableName || 'General / Schema';
                              if (!acc[tName]) acc[tName] = [];
                              acc[tName].push(idxItem);
                              return acc;
                            }, {});

                            const tableEntries = Object.entries(groupedByTable).sort(([a], [b]) => a.localeCompare(b));

                            return tableEntries.map(([tableNameGroup, tableIdxs], tableGroupIdx) => (
                              <div key={tableGroupIdx} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-3xs hover:border-teal-300 transition-all">
                                {/* Box Header for Table */}
                                <div className="bg-gray-50/90 border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">{dbType === 'mongodb' ? '📁' : '📋'}</span>
                                    <h4 className="text-sm font-extrabold text-gray-900 font-mono">
                                      {tableNameGroup}
                                    </h4>
                                    <span className="text-[11px] bg-teal-50 text-teal-700 font-bold px-2 py-0.5 rounded-full border border-teal-200">
                                      {tableIdxs.length} {tableIdxs.length === 1 ? 'Index' : 'Indexes'}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => fetchTableData(tableNameGroup)}
                                    className="text-xs font-bold text-[#0d9da4] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
                                  >
                                    View Table Data →
                                  </button>
                                </div>

                                {/* Table Indexes List inside 1 Box */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 font-semibold uppercase">
                                      <tr>
                                        <th className="px-4 py-2.5">Index Name</th>
                                        <th className="px-4 py-2.5">Type</th>
                                        <th className="px-4 py-2.5">Columns / Pattern</th>
                                        <th className="px-4 py-2.5">Index Spec</th>
                                        <th className="px-4 py-2.5 text-right">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 font-mono">
                                      {tableIdxs.map((idxItem, idx) => (
                                        <tr key={idx} className="hover:bg-teal-50/30 transition-colors">
                                          <td className="px-4 py-3 font-bold text-gray-900 flex items-center gap-1.5">
                                            <span className="text-gray-400">🔍</span> {idxItem.name}
                                          </td>
                                          <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                              idxItem.unique ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                                            }`}>
                                              {idxItem.unique ? 'UNIQUE' : 'INDEX'}
                                            </span>
                                          </td>
                                          <td className="px-4 py-3 text-gray-700">
                                            {idxItem.columnName || idxItem.key || 'N/A'}
                                          </td>
                                          <td className="px-4 py-3 text-gray-500 text-[11px]">
                                            {idxItem.indexType || (idxItem.unique ? 'UNIQUE KEY' : 'BTREE')}
                                          </td>
                                          <td className="px-4 py-3 text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-2 font-sans">
                                              <button
                                                type="button"
                                                onClick={() => setDefinitionModal({ open: true, title: `Index: ${idxItem.name} (${tableNameGroup})`, type: 'index', code: idxItem.definition || `-- Index: ${idxItem.name}\n-- Table: ${tableNameGroup}\n-- Column: ${idxItem.columnName || 'N/A'}\n-- Unique: ${idxItem.unique ? 'YES' : 'NO'}` })}
                                                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1"
                                              >
                                                📜 Info
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const explainSql = dbType === 'mongodb' ? `db.${tableNameGroup}.getIndexes()` : `EXPLAIN SELECT * FROM \`${tableNameGroup}\`;`;
                                                  setQuery(explainSql);
                                                  setActiveTab('query');
                                                }}
                                                className="px-2.5 py-1 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1"
                                              >
                                                ⚡ Explain
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 7. CONSTRAINTS */}
                {dbObjectType === 'constraints' && (() => {
                  const rawConsts = objects?.result?.constraints || [];
                  const filteredConsts = objectSearch.trim()
                    ? rawConsts.filter(c => (c.name || '').toLowerCase().includes(objectSearch.toLowerCase()) || (c.tableName || '').toLowerCase().includes(objectSearch.toLowerCase()) || (c.constraintType || '').toLowerCase().includes(objectSearch.toLowerCase()))
                    : rawConsts;

                  return (
                    <div>
                      {filteredConsts.length === 0 ? (
                        <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                          <p className="text-2xl mb-2">🔒</p>
                          <p className="font-semibold text-gray-700">
                            {objectSearch.trim() ? `No Constraints matching "${objectSearch}"` : `No Constraints found in database schema ${activeDb}.`}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredConsts.map((cItem, idx) => (
                            <div key={idx} className="bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col justify-between hover:border-teal-400 transition">
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-bold text-gray-900 font-mono flex items-center gap-1.5 truncate" title={cItem.name}>
                                    <span>🔒</span> {cItem.name}
                                  </h4>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono shrink-0 ${
                                    cItem.constraintType?.includes('PRIMARY') ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                    cItem.constraintType?.includes('FOREIGN') ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                                    'bg-rose-50 text-rose-800 border border-rose-200'
                                  }`}>
                                    {cItem.constraintType || 'CONSTRAINT'}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-600 font-mono mb-1">Target Table: {cItem.tableName || 'N/A'}</p>
                              </div>

                              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-3">
                                <button
                                  type="button"
                                  onClick={() => setDefinitionModal({ open: true, title: `Constraint: ${cItem.name}`, type: 'constraint', code: cItem.rule || `-- Constraint: ${cItem.name}\n-- Table: ${cItem.tableName}\n-- Type: ${cItem.constraintType}` })}
                                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                >
                                  📜 View Rule Details
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
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

                      <div className="flex items-center gap-3 flex-wrap">
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

                        {/* Top Pagination Buttons */}
                        {tableData.length > 0 && (() => {
                          const totalRows = tableData.length;
                          const totalPages = Math.ceil(totalRows / tableRowsPerPage) || 1;
                          return (
                            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3 select-none">
                              <button
                                type="button"
                                onClick={() => setTablePage(prev => Math.max(prev - 1, 1))}
                                disabled={tablePage === 1}
                                className="px-2.5 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white shadow-3xs"
                              >
                                ← Previous
                              </button>

                              <span className="text-xs font-bold text-gray-700 font-mono px-1">
                                Page {tablePage} of {totalPages}
                              </span>

                              <button
                                type="button"
                                onClick={() => setTablePage(prev => Math.min(prev + 1, totalPages))}
                                disabled={tablePage >= totalPages}
                                className="px-2.5 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white shadow-3xs"
                              >
                                Next →
                              </button>
                            </div>
                          );
                        })()}
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
                  <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-1">
                    {queryTabs.map((tab) => {
                      const isActive = tab.id === activeQueryTabId;
                      return (
                        <div
                          key={tab.id}
                          onClick={() => setActiveQueryTabId(tab.id)}
                          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-t-xl border-t border-x cursor-pointer transition-all duration-150 shadow-3xs shrink-0 select-none ${
                            isActive
                              ? 'bg-white text-gray-900 border-gray-250 border-b-white z-10'
                              : 'bg-gray-100/80 text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700'
                          }`}
                        >
                          {isActive ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200/80 animate-pulse shrink-0" title="Active Query Tab"></span>
                          ) : (
                            <span>📝</span>
                          )}
                          <span
                            className="hover:text-teal-700 transition whitespace-nowrap font-semibold"
                            title="Double-click to rename this tab"
                            onDoubleClick={() => handleRenameTab(tab.id, tab.name)}
                          >
                            {tab.name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRenameTab(tab.id, tab.name); }}
                            className="text-[10px] text-gray-400 hover:text-gray-700 opacity-60 hover:opacity-100 cursor-pointer"
                            title="Rename Tab"
                          >
                            ✏️
                          </button>

                          {queryTabs.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => removeQueryTab(tab.id, e)}
                              className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-gray-200 hover:text-gray-950 text-gray-400 transition-colors text-[9px] ml-0.5 cursor-pointer"
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
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 cursor-pointer shadow-3xs transition-all duration-150 text-sm font-bold ml-1 shrink-0"
                    >
                      ＋
                    </button>
                  </div>

                  {/* Right Side: Execution Controls */}
                  <div className="flex items-center gap-1.5 pb-1 select-none">
                    {/* Interactive Role Mode Button & Privileges Modal Trigger */}
                    {(() => {
                      const effectiveMode = user?.accessMode || (user?.role === 'readwrite' ? 'readwrite' : user?.role === 'read' ? 'read' : 'read');
                      return (
                        <button
                          type="button"
                          onClick={() => setShowModeInfoModal(true)}
                          title="Click to view Query Editor permissions & capabilities"
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shrink-0 transition cursor-pointer border shadow-3xs ${
                            user?.role === 'admin'
                              ? 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
                              : effectiveMode === 'readwrite'
                              ? 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {user?.role === 'admin'
                            ? '👑 Admin Mode'
                            : effectiveMode === 'readwrite'
                            ? '⚡ Developer (Read-Write)'
                            : '🔒 Developer (Read-Only)'}{' '}
                          <span className="text-[9px] bg-white/60 dark:bg-black/20 px-1 py-0.2 rounded font-mono ml-0.5">ℹ️</span>
                        </button>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={formatSQLQuery}
                      title="Beautify / Format SQL (Clean layout)"
                      className="px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-3xs cursor-pointer"
                    >
                      <span>🧹</span> Beautify
                    </button>

                    {/* Save Script Button */}
                    <button
                      type="button"
                      onClick={() => setShowSaveScriptModal(true)}
                      disabled={!query.trim()}
                      title="Save script to your user library"
                      className="px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-3xs disabled:opacity-50 cursor-pointer"
                    >
                      <span>💾</span> Save Script
                    </button>

                    {/* Saved Scripts Dropdown Button */}
                    <button
                      type="button"
                      onClick={() => setShowSavedQueriesModal(true)}
                      title="Open Saved Scripts Library"
                      className="px-2.5 py-1.5 border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-3xs cursor-pointer"
                    >
                      <span>📁</span> Saved Scripts ({savedQueries.length})
                    </button>

                    {dbType !== 'mongodb' && (
                      <button
                        type="button"
                        onClick={runExplain}
                        disabled={queryLoading || !query.trim()}
                        title="Explain Query Execution Plan"
                        className="px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-[#0d9da4] text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-3xs disabled:opacity-50 cursor-pointer"
                      >
                        <span>🔍</span> Explain Plan
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowHistoryDrawer(prev => !prev)}
                      title="Toggle Collapsible Query History Panel"
                      className={`px-2.5 py-1.5 border text-[11px] font-bold rounded-lg transition flex items-center gap-1 shadow-3xs cursor-pointer ${
                        showHistoryDrawer
                          ? 'bg-[#0d9da4] border-[#0d9da4] text-white hover:bg-[#0b8a90]'
                          : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span>📜</span> History
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
                      placeholder={
                        dbType === 'mongodb'
                          ? 'Write MongoDB MQL query (e.g. db.users.find({})) — Press Ctrl+Enter to run'
                          : dbType === 'postgresql'
                          ? 'Write PostgreSQL query (e.g. SELECT * FROM users;) — Press Ctrl+Enter to run'
                          : dbType === 'oracle'
                          ? 'Write Oracle query (e.g. SELECT * FROM users WHERE ROWNUM <= 100;) — Press Ctrl+Enter to run'
                          : 'Write MySQL query (e.g. SELECT * FROM users;) — Press Ctrl+Enter to run, Ctrl+/ to comment/uncomment'
                      }
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

                    {/* Bottom Left Execution Bar */}
                    <div className="mt-3 pt-3 border-t border-gray-150 flex items-center justify-between flex-wrap gap-3 select-none">
                      {/* Left Side: Run Selection & Run Query Buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => runQuery(false)}
                          disabled={queryLoading || !query.trim()}
                          title="Execute Selection or Current Statement (Ctrl+Enter)"
                          className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                        >
                          <span>⚡</span> Run Selection
                        </button>

                        <button
                          type="button"
                          onClick={() => runQuery(false)}
                          disabled={queryLoading || !query.trim()}
                          title="Execute Full Query"
                          style={{ backgroundColor: '#0d9da4' }}
                          className="px-4 py-2 hover:opacity-90 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                        >
                          <span>▶</span> Run Query
                        </button>
                      </div>

                      {/* Right Side: Shortcut Hints & Expand Fullscreen */}
                      <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                        <span className="hidden sm:inline font-mono text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700">
                          Shortcuts: <kbd className="font-bold">Ctrl+Enter</kbd> (Run) | <kbd className="font-bold">Ctrl+/</kbd> (Comment)
                        </span>

                        <button
                          type="button"
                          onClick={() => setIsQueryMaximized(true)}
                          className="text-xs font-bold text-[#0d9da4] hover:underline flex items-center gap-1 border border-gray-200 bg-white px-3 py-1.5 rounded-xl shadow-3xs transition hover:bg-gray-50 cursor-pointer"
                        >
                          <span>🗖</span> Expand Fullscreen
                        </button>
                      </div>
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
                  <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-200">❌ {queryError}</div>
                )}
                {queryMsg && !queryError && (
                  <div className={`mb-4 text-sm px-4 py-3 rounded-xl border flex items-center gap-2 font-medium ${
                    queryMsg.includes('0 rows') || queryMsg.includes('No data')
                      ? 'bg-amber-50 text-amber-900 border-amber-200'
                      : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  }`}>
                    <span>{queryMsg.includes('0 rows') || queryMsg.includes('No data') ? '⚠️' : '✅'}</span>
                    <span>{queryMsg}</span>
                  </div>
                )}
                {queryResults.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4 shadow-3xs">
                    {/* Results Header with Top Pagination & Export controls */}
                    <div className="px-5 py-3.5 border-b border-gray-150 bg-gray-50/90 flex items-center justify-between flex-wrap gap-3 select-none">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-800">📋 Output Dataset</span>
                        <span className="text-[10px] bg-[#0d9da4]/10 text-[#0d9da4] px-2 py-0.5 rounded-full font-bold">
                          {totalResultRows} records
                        </span>
                        {sortColumn && (
                          <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                            <span>Sorted: {sortColumn} ({sortDirection === 'asc' ? '🔼 Asc' : '🔽 Desc'})</span>
                            <button
                              type="button"
                              onClick={() => { setSortColumn(null); setSortDirection(null); }}
                              className="hover:text-rose-600 ml-1 font-bold cursor-pointer"
                              title="Clear sort"
                            >
                              ✕
                            </button>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 flex-wrap">
                        {/* TOP PAGINATION CONTROLS */}
                        {totalResultRows > 0 && (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                              <span>Rows:</span>
                              <select
                                value={resultRowsPerPage}
                                onChange={(e) => {
                                  setResultRowsPerPage(Number(e.target.value));
                                  setResultPage(1);
                                }}
                                className="text-xs font-bold px-2 py-1 bg-white border border-gray-300 rounded-lg text-gray-800 outline-none focus:border-teal-500 cursor-pointer shadow-3xs"
                              >
                                <option value={10}>10 per page</option>
                                <option value={20}>20 per page</option>
                                <option value={30}>30 per page</option>
                                <option value={50}>50 per page</option>
                                <option value={100}>100 per page</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setResultPage(prev => Math.max(prev - 1, 1))}
                                disabled={resultPage === 1}
                                className="px-2.5 py-1 border border-gray-300 bg-white text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-3xs"
                              >
                                ← Prev
                              </button>

                              <span className="text-xs font-bold text-gray-700 font-mono px-1">
                                {resultPage} / {totalResultPages}
                              </span>

                              <button
                                type="button"
                                onClick={() => setResultPage(prev => Math.min(prev + 1, totalResultPages))}
                                disabled={resultPage >= totalResultPages}
                                className="px-2.5 py-1 border border-gray-300 bg-white text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-3xs"
                              >
                                Next →
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Export Actions */}
                        <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                          <span className="text-[10px] text-gray-400 font-medium mr-1">Export:</span>
                          <button
                            type="button"
                            onClick={() => exportResults('csv')}
                            title="Download results as CSV spreadsheet"
                            className="px-2.5 py-1 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-[10px] font-bold rounded-lg transition shadow-3xs flex items-center gap-1 cursor-pointer"
                          >
                            📥 CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => exportResults('json')}
                            title="Download results as JSON file"
                            className="px-2.5 py-1 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-[10px] font-bold rounded-lg transition shadow-3xs flex items-center gap-1 cursor-pointer"
                          >
                            📥 JSON
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50/80 border-b border-gray-200 select-none">
                          <tr>
                            {queryColumns.map((col, i) => {
                              const isSorted = sortColumn === col;
                              return (
                                <th
                                  key={i}
                                  onClick={() => handleHeaderSort(col)}
                                  className="px-4 py-3 text-xs font-bold text-gray-600 uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                  title={`Click to sort by ${col}`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>{col}</span>
                                    <span className="text-[11px]">
                                      {isSorted
                                        ? sortDirection === 'asc' ? '🔼' : '🔽'
                                        : '↕️'}
                                    </span>
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-mono text-xs">
                          {paginatedQueryResults.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                              {queryColumns.map((col, j) => (
                                <td key={j} className="px-4 py-3 text-gray-700 whitespace-nowrap">
                                  {row[col] === null ? (
                                    <span className="text-gray-300 italic font-sans text-[11px]">null</span>
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
                <AuditLogsPanel connectionId={id} databases={databases} />
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
              {(() => {
                const effectiveMode = user?.accessMode || (user?.role === 'readwrite' ? 'readwrite' : user?.role === 'read' ? 'read' : 'read');
                const isReadOnly = user?.role !== 'admin' && effectiveMode === 'read';
                return (
                  <>
                    <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900/40">
                      <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-300 mb-2 flex items-center gap-1.5">
                        <span className="text-sm">✅</span> Allowed Operations (What You CAN Do)
                      </h4>
                      <ul className="space-y-1.5 text-xs text-emerald-800 dark:text-emerald-400 font-medium list-disc list-inside">
                        <li>Run <strong>SELECT</strong> data queries across all tables & views.</li>
                        <li>Run <strong>SHOW TABLES</strong>, <strong>SHOW DATABASES</strong>, & schema inspection.</li>
                        <li>Use <strong>EXPLAIN</strong> / <strong>EXPLAIN ANALYZE</strong> to check query execution plans.</li>
                        <li>Execute MongoDB <strong>find()</strong>, <strong>aggregate()</strong>, <strong>countDocuments()</strong>, & <strong>distinct()</strong>.</li>
                        {!isReadOnly && (
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
                    {isReadOnly ? (
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
                    ) : user?.role !== 'admin' ? (
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
                  </>
                );
              })()}

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

      {/* Save Script Modal */}
      {showSaveScriptModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1.5 flex items-center gap-2">
              <span>💾</span> Save Query Script
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Save this script to your personal user library to reuse anytime across connections.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">
                  Script Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={scriptTitle}
                  onChange={(e) => setScriptTitle(e.target.value)}
                  placeholder="e.g. Monthly Active Users Query"
                  className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:border-teal-500 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={scriptDesc}
                  onChange={(e) => setScriptDesc(e.target.value)}
                  placeholder="Brief notes about what this script does..."
                  className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:border-teal-500 dark:bg-gray-700 dark:text-white font-mono"
                />
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-750 rounded-lg border border-gray-200 dark:border-gray-650 text-xs font-mono text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 block mb-1">Target DB: {activeDb || stats?.database || 'Default'}</span>
                <pre className="whitespace-pre-wrap text-[11px]">{activeQueryTab?.query?.substring(0, 300)}...</pre>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowSaveScriptModal(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveScript}
                disabled={savingScript || !scriptTitle.trim()}
                style={{ backgroundColor: '#0d9da4' }}
                className="px-5 py-2 text-xs font-bold text-white rounded-lg hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
              >
                {savingScript ? 'Saving...' : '💾 Save Script'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Scripts Library Modal */}
      {showSavedQueriesModal && (() => {
        const savedDatabasesList = Array.from(new Set([
          ...savedQueries.map(q => q.database).filter(Boolean),
          ...databases
        ]));

        const filteredSavedQueries = savedQueries.filter(item => {
          if (savedScriptsDbFilter === 'all') return true;
          return (item.database || '').toLowerCase() === savedScriptsDbFilter.toLowerCase();
        });

        return (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-gray-200 dark:border-gray-700 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <span>📁</span> Your Saved Scripts Library
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Scripts saved by your user account ({savedQueries.length} total scripts saved)
                  </p>
                </div>
                <button
                  onClick={() => setShowSavedQueriesModal(false)}
                  className="text-gray-400 hover:text-gray-700 text-lg font-bold px-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Database Filter Dropdown */}
              <div className="flex items-center gap-2 mb-4 bg-gray-50 dark:bg-gray-750 p-3 rounded-xl border border-gray-200 dark:border-gray-700 justify-between flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300 shrink-0">🗄️ Filter by Database:</span>
                  <select
                    value={savedScriptsDbFilter}
                    onChange={(e) => setSavedScriptsDbFilter(e.target.value)}
                    className="text-xs font-bold font-mono px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-white outline-none focus:border-teal-500 cursor-pointer shadow-3xs"
                  >
                    <option value="all">🌟 All Databases ({savedQueries.length} scripts)</option>
                    {savedDatabasesList.map(db => {
                      const count = savedQueries.filter(q => (q.database || '').toLowerCase() === db.toLowerCase()).length;
                      return (
                        <option key={db} value={db}>
                          🗄️ {db} ({count} scripts)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {activeDb && (
                  <button
                    type="button"
                    onClick={() => setSavedScriptsDbFilter(activeDb)}
                    className="text-[11px] font-bold text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>🎯 Active DB:</span> <span className="font-mono bg-teal-100 dark:bg-teal-900/40 px-1.5 py-0.5 rounded">{activeDb}</span>
                  </button>
                )}
              </div>

              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {filteredSavedQueries.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">
                    <span className="text-3xl">📁</span>
                    <p className="text-sm font-semibold mt-2">No saved scripts found!</p>
                    <p className="text-xs mt-1">
                      {savedScriptsDbFilter === 'all'
                        ? 'Write a query in the Query Editor and click "💾 Save Script" to build your library.'
                        : `No scripts saved under database "${savedScriptsDbFilter}". Select "All Databases" or save a new script for this DB.`}
                    </p>
                  </div>
                ) : (
                  filteredSavedQueries.map((item) => (
                    <div
                      key={item._id}
                      className="p-4 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-teal-400 transition flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <span>📝</span> {item.title}
                          {item.database && (
                            <span className="text-[10px] bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300 font-mono px-2 py-0.5 rounded font-bold">
                              🗄️ {item.database}
                            </span>
                          )}
                        </h4>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleLoadSavedQuery(item)}
                            className="px-3 py-1 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition cursor-pointer"
                          >
                            ⚡ Load into Tab
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedQuery(item._id)}
                            className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition cursor-pointer"
                            title="Delete Script"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {item.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 italic">{item.description}</p>
                      )}

                      <pre className="p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg font-mono text-xs text-teal-900 dark:text-teal-300 max-h-24 overflow-y-auto whitespace-pre-wrap">
                        {item.query}
                      </pre>

                      <p className="text-[10px] text-gray-400 text-right font-mono">
                        Saved: {new Date(item.updatedAt || item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4 text-right">
                <button
                  onClick={() => setShowSavedQueriesModal(false)}
                  className="px-5 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-200 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Definition Viewer Modal */}
      {definitionModal.open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 max-w-3xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-150 dark:border-gray-700 mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <span>📜</span> {definitionModal.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 capitalize">
                  {definitionModal.type} Definition Code
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDefinitionModal({ open: false, title: '', type: '', code: '' })}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mb-4">
              <pre className="p-4 bg-gray-900 text-teal-300 font-mono text-xs rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed border border-gray-800 shadow-inner">
                {definitionModal.code || '-- No DDL definition code available.'}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-150 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(definitionModal.code);
                  alert('Code copied to clipboard!');
                }}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-800 dark:text-gray-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>📋</span> Copy DDL Code
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setQuery(definitionModal.code);
                    setActiveTab('query');
                    setDefinitionModal({ open: false, title: '', type: '', code: '' });
                  }}
                  className="px-4 py-2 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <span>⚡</span> Open in Query Editor
                </button>
                <button
                  type="button"
                  onClick={() => setDefinitionModal({ open: false, title: '', type: '', code: '' })}
                  className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition cursor-pointer"
                >
                  Close
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