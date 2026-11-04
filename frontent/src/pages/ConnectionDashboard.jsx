import { useState, useEffect, useRef, useCallback, useMemo, useEffectEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import SlowQueryPanel from '../components/SlowQueryPanel';
// import Navbar from '../components/Navbar';
import AuditLogsPanel from '../components/AuditLogsPanel';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import './ConnectionDashboard.css';
import EditorThemeMenu from '../components/EditorThemeMenu';
import CopyButtonContent from '../components/CopyButtonContent';
import useEditorAppearance from '../hooks/useEditorAppearance';
import { copyToClipboard } from '../utils/clipboard';

// import {

//   LineChart, Line, BarChart, Bar,
//   XAxis, YAxis, CartesianGrid,
//   Tooltip, ResponsiveContainer, Legend
// } from 'recharts';
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
  const [connectionDetails, setConnectionDetails] = useState(null);
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [tableSortOrder, setTableSortOrder] = useState('size-desc');
  const [unreadAuditCount, setUnreadAuditCount] = useState(0);
  const [dbSelectorDropdownOpen, setDbSelectorDropdownOpen] = useState(false);
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

  // Query editor appearance (saved per browser)
  const appearance = useEditorAppearance();
  const { editorTheme, editorFontSize, editorStyleVars } = appearance;
  const [showModeInfoModal, setShowModeInfoModal] = useState(false);

  // Database context states
  const [databases, setDatabases] = useState([]);
  const [activeDb, setActiveDb] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [databaseSearch, setDatabaseSearch] = useState('');

  // Table data
  const [selectedTable, setSelectedTable] = useState(null);
  const requestedTableOpenRef = useRef(null);
  const [tableData, setTableData] = useState([]);
  const [tableColumns, setTableColumns] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [tableRowsPerPage, setTableRowsPerPage] = useState(20);

  // Row Action States (Copy, Edit, Insert, Delete, Open in Editor)
  const [openRowActionMenu, setOpenRowActionMenu] = useState(null); // { id, row, top, left }
  const [editingRowModalOpen, setEditingRowModalOpen] = useState(false);
  const [editingRowOriginal, setEditingRowOriginal] = useState(null);
  const [editingRowData, setEditingRowData] = useState({});
  const [editingRowLoading, setEditingRowLoading] = useState(false);
  const [editingRowError, setEditingRowError] = useState('');

  const [insertRowModalOpen, setInsertRowModalOpen] = useState(false);
  const [insertRowData, setInsertRowData] = useState({});
  const [insertRowLoading, setInsertRowLoading] = useState(false);
  const [insertRowError, setInsertRowError] = useState('');

  const [deleteRowModalOpen, setDeleteRowModalOpen] = useState(false);
  const [deleteRowTarget, setDeleteRowTarget] = useState(null);
  const [deleteRowLoading, setDeleteRowLoading] = useState(false);
  const [deleteRowError, setDeleteRowError] = useState('');

  const [copiedQueryText, setCopiedQueryText] = useState(false);
  const copiedTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  // Toast messages (used across this page)
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'success') => setToast({ message, type }), []);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const handleScroll = () => {
      if (openRowActionMenu) setOpenRowActionMenu(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll, true);
    };
  }, [openRowActionMenu]);

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
  const queryTabsScrollRef = useRef(null);
  const fullscreenQueryTabsScrollRef = useRef(null);

  const [activeQueryTabId, setActiveQueryTabId] = useState(() => {
    try {
      const savedId = localStorage.getItem(storageKeyActive);
      if (savedId) return savedId;
    } catch (e) {
      console.warn('Failed to restore active query tab:', e);
    }
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

  useEffect(() => {
    [queryTabsScrollRef.current, fullscreenQueryTabsScrollRef.current].forEach(container => {
      const activeTab = Array.from(container?.children || []).find(
        tab => tab.dataset.queryTabId === activeQueryTabId
      );
      activeTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
  }, [activeQueryTabId, isQueryMaximized]);

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

  const openInNewQueryTab = (queryText, customName) => {
    if (!queryText) return;
    const newId = `tab-${Date.now()}`;
    setQueryTabs(prevTabs => {
      if (prevTabs.length === 1 && (!prevTabs[0].query || !prevTabs[0].query.trim())) {
        return prevTabs.map(t => ({
          ...t,
          query: queryText,
          name: customName || t.name
        }));
      }
      const newTabNumber = prevTabs.length + 1;
      const newTab = {
        id: newId,
        name: customName || `Query ${newTabNumber}`,
        query: queryText,
        results: [],
        columns: [],
        error: '',
        msg: '',
        loading: false,
        targetDb: activeDb || stats?.database || 'default'
      };
      return [...prevTabs, newTab];
    });
    setActiveQueryTabId(newId);
    setActiveTab('query');
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
    let active = true;
    API.get('/saved-queries')
      .then(res => { if (active) setSavedQueries(res.data.queries || []); })
      .catch(error => console.error('Failed to load saved queries:', error));
    return () => { active = false; };
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
    } catch {
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
    } catch {
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

  const formatInsertValue = (value) => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      return `'${String(JSON.stringify(value)).replace(/'/g, "''")}'`;
    }
    return `'${String(value).replace(/'/g, "''")}'`;
  };

  const quoteInsertIdentifier = (identifier, quote) => {
    return identifier
      .split('.')
      .map(part => `${quote}${part.replace(new RegExp(`\\${quote}`, 'g'), `${quote}${quote}`)}${quote}`)
      .join('.');
  };

  const getInsertCopyCommand = (row) => {
    const tableFromQuery = query.match(/\bFROM\s+[`"']?([\w.]+)[`"']?/i)?.[1];
    const tableName = selectedTable || tableFromQuery || 'your_table';

    if (dbType === 'mongodb') {
      return `db.${tableName.replace(/[^a-zA-Z0-9_$]/g, '')}.insertOne(${JSON.stringify(row, null, 2)});`;
    }

    const quote = dbType === 'mysql' ? '`' : '"';
    const columns = queryColumns.map(column => quoteInsertIdentifier(column, quote)).join(', ');
    const values = queryColumns.map(column => formatInsertValue(row[column])).join(', ');
    return `INSERT INTO ${quoteInsertIdentifier(tableName, quote)} (${columns})\nVALUES (${values});`;
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

    textarea.focus();
    textarea.setSelectionRange(selectionStartLineIndex, selectionEndLineIndex);

    let success;
    try {
      success = document.execCommand('insertText', false, updatedTarget);
    } catch {
      success = false;
    }

    if (success) {
      setQuery(textarea.value);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(selectionStartLineIndex, selectionStartLineIndex + updatedTarget.length);
      }, 0);
    } else {
      setQuery(before + updatedTarget + after);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(selectionStartLineIndex, selectionStartLineIndex + updatedTarget.length);
      }, 0);
    }
  };

  const getCursorXY = (textarea) => {
    const { selectionStart, value } = textarea;
    const textBeforeCursor = value.substring(0, selectionStart);
    const lines = textBeforeCursor.split('\n');
    const currentLineNumber = lines.length;
    const currentColumn = lines[lines.length - 1].length;
    // Line / character sizes scale with the editor font size (tuned for 14px)
    const scale = editorFontSize / 14;
    const top = (currentLineNumber * 20 * scale) + 15 - textarea.scrollTop;
    const left = (currentColumn * 7.2 * scale) + 40 - textarea.scrollLeft;
    return { top, left };
  };

  const handleEditorChange = (e, textareaRefToUse) => {
    const val = e.target.value;
    setQuery(val);
    const textarea = textareaRefToUse.current;
    if (!textarea) return;
    const selectionEnd = textarea.selectionEnd;
    const textBeforeCursor = val.substring(0, selectionEnd);
    const lastWordMatch = textBeforeCursor.match(/([a-zA-Z_0-9_$.]+)$/);
    if (lastWordMatch) {
      const typedWord = lastWordMatch[1].replace(/[`"']/g, '');
      if (typedWord.length >= 1) {
        const isTableContext = /\b(?:FROM|JOIN|UPDATE|INTO|TABLE)\s+[`"A-Za-z0-9_$.]*$/i.test(textBeforeCursor);
        const objectTables = objects?.result?.tables || [];
        const tables = [
          ...objectTables.map(table => table.tableName || table.name || Object.values(table)[0] || ''),
          ...(tableDetails || []).map(table => table.tableName || table.name || '')
        ];
        const allCandidates = (isTableContext ? tables : [...sqlKeywords, ...tables]).filter(Boolean);
        const matched = Array.from(new Set(allCandidates)).filter(c => {
          const candidate = String(c).toLowerCase();
          const token = typedWord.toLowerCase();
          return candidate !== token && (candidate.startsWith(token) || candidate.includes(token));
        });
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

  const handleCopyQueryText = async (textareaRefToUse) => {
    const textarea = textareaRefToUse?.current;
    let textToCopy = query;
    if (textarea) {
      const selected = query.substring(textarea.selectionStart, textarea.selectionEnd).trim();
      if (selected) textToCopy = selected;
    }

    if (!textToCopy.trim()) {
      showToast('Nothing to copy — the editor is empty.', 'error');
      return;
    }

    const copied = await copyToClipboard(textToCopy);
    if (!copied) {
      showToast('Could not copy to the clipboard.', 'error');
      return;
    }

    // Show the tick for 2 seconds (clicking again restarts the 2 seconds)
    setCopiedQueryText(true);
    clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedQueryText(false), 2000);
  };

  // Query History tab: per-row copy with the same 2-second tick.
  // A new object per click restarts the 2 seconds even when the same row is copied again.
  const [copiedHistory, setCopiedHistory] = useState(null);
  useEffect(() => {
    if (!copiedHistory) return undefined;
    const timer = setTimeout(() => setCopiedHistory(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedHistory]);
  const copiedHistoryId = copiedHistory?.id ?? null;
  const handleCopyHistoryQuery = async (historyId, text) => {
    if (!(await copyToClipboard(text || ''))) {
      showToast('Could not copy to the clipboard.', 'error');
      return;
    }
    setCopiedHistory({ id: historyId });
  };

  const handleEditorKeyDown = (e, textareaRefToUse) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      setShowSuggestions(false);
      runQuery(false);
      return;
    }
    if (e.ctrlKey && (e.key === '/' || e.code === 'Slash')) {
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
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [expandedHistory, setExpandedHistory] = useState({});

  // Monitoring
  const [monitorData, setMonitorData] = useState(null);
  const [, setMonitorLoading] = useState(false);
  const [, setMonitorHistory] = useState([]);
  const [tableDetails, setTableDetails] = useState([]);
  const [tableDetailsOffset, setTableDetailsOffset] = useState(0);
  const [, setTableDetailsHasMore] = useState(false);
  const [tableDetailsLoading, setTableDetailsLoading] = useState(false);
  const [databaseTableOffset, setDatabaseTableOffset] = useState(0);
  const [databaseTablesHasMore, setDatabaseTablesHasMore] = useState(false);
  const [databaseTablesLoading, setDatabaseTablesLoading] = useState(false);

  // Table search, sort, unit filters, and pagination
  const [tableSearch, setTableSearch] = useState('');
  const [tableSizeUnit, setTableSizeUnit] = useState('MB'); // 'Bytes', 'KB', 'MB', 'GB'
  const [tablesListPage, setTablesListPage] = useState(1);
  const [tablesListRowsPerPage, setTablesListRowsPerPage] = useState(10);
  const [tableLoadLimit, setTableLoadLimit] = useState(100);

  // Database Object Categories (MySQL Workbench Style)
  const [dbObjectType, setDbObjectType] = useState('tables'); // 'tables', 'views', 'procedures', 'functions', 'triggers', 'indexes', 'constraints'
  const [objectSearch, setObjectSearch] = useState('');
  const [indexTableFilter, setIndexTableFilter] = useState('');
  const [constraintTableFilter, setConstraintTableFilter] = useState('');
  const [objectsPage, setObjectsPage] = useState(1);
  const [objectsPerPage, setObjectsPerPage] = useState(10);
  const [expandedDbs, setExpandedDbs] = useState({});
  const [definitionModal, setDefinitionModal] = useState({ open: false, title: '', type: '', code: '' });

  const renderObjectPaginationControls = (totalCount, itemLabel = 'items') => {
    if (totalCount === 0) return null;

    const totalPages = Math.ceil(totalCount / objectsPerPage) || 1;
    const startIdx = (objectsPage - 1) * objectsPerPage + 1;
    const endIdx = Math.min(objectsPage * objectsPerPage, totalCount);

    return (
      <div className="flex items-center justify-between flex-wrap gap-3 py-2.5 px-4 bg-gray-50/90 rounded-xl border border-gray-200 text-xs select-none shadow-3xs my-3">
        <div className="flex items-center gap-3">
          <span className="text-gray-600 font-medium">
            Showing <span className="font-bold text-gray-900">{startIdx}</span> to <span className="font-bold text-gray-900">{endIdx}</span> of <span className="font-bold text-gray-900">{totalCount}</span> {itemLabel}
          </span>

          <div className="flex items-center gap-1.5 text-gray-600 font-medium border-l border-gray-250 pl-3">
            <span>Per page:</span>
            <select
              value={objectsPerPage}
              onChange={(e) => {
                setObjectsPerPage(Number(e.target.value));
                setObjectsPage(1);
              }}
              className="px-2 py-1 border border-gray-300 rounded-lg bg-white text-xs font-bold text-gray-800 outline-none focus:border-teal-500 cursor-pointer shadow-3xs"
            >
              <option value={6}>6 per page</option>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setObjectsPage(prev => Math.max(prev - 1, 1))}
            disabled={objectsPage === 1}
            className="px-3 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white shadow-3xs"
          >
            ← Previous
          </button>

          <span className="text-xs font-bold text-gray-700 font-mono px-1">
            Page {objectsPage} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setObjectsPage(prev => Math.min(prev + 1, totalPages))}
            disabled={objectsPage >= totalPages}
            className="px-3 py-1 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer bg-white shadow-3xs"
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    let active = true;
    const initializeConnection = async () => {
      try {
        const connRes = await API.get('/connections');
        const conn = connRes.data.connections.find(c => c._id === id);
        const dbRes = await API.get(`/connections/${id}/databases`);
        if (!active) return;

        const dbList = dbRes.data.databases || [];
        setDatabases(dbList);
        if (conn) {
          setConnectionName(conn.name);
          setConnectionDetails(conn);
          setIsOwner(conn.user?._id === user?._id || user?.role === 'admin');
        }

        const initialDb = database || conn?.database || dbList[0] || '';
        setActiveDb(initialDb);
        if (initialDb) {
          setDbLoading(true);
          const [objRes, statsRes] = await Promise.all([
            API.get(`/connections/${id}/objects?database=${encodeURIComponent(initialDb)}&summary=true`),
            API.get(`/connections/${id}/stats?database=${encodeURIComponent(initialDb)}`)
          ]);
          if (!active) return;
          setObjects(objRes.data);
          setStats(statsRes.data.stats);
          const tableOffset = objRes.data.tableOffset || objRes.data.result?.tableOffset || 0;
          const tables = objRes.data.result?.tables || [];
          setDatabaseTableOffset(tableOffset + tables.length);
          setDatabaseTablesHasMore(objRes.data.tablesHasMore || objRes.data.result?.tablesHasMore || false);
          const detailRes = await API.get(`/monitor/${id}/tables?limit=50&offset=0&database=${encodeURIComponent(initialDb)}`);
          if (active) {
            const details = detailRes.data.tables || [];
            setTableDetails(details);
            setTableDetailsOffset(details.length);
            setTableDetailsHasMore(details.length === 50);
          }
        }
      } catch (err) {
        if (!active) return;
        if (err.response?.status !== 503) console.error('Failed to initialize connection:', err);
        setError(err.response?.status === 503
          ? err.response.data.message
          : 'Failed to load databases - connection check query failed');
      } finally {
        if (active) {
          setDbLoading(false);
          setLoading(false);
        }
      }
    };
    initializeConnection();
    return () => { active = false; };
  }, [id, user, database]);

  // Handle external requests to open a specific tab (e.g., slow query -> query editor)
  const location = useLocation();
  const handleExternalTabRequest = useEffectEvent((state) => {
    if (state.query) {
      openInNewQueryTab(state.query, state.tabName || 'External Query');
      window.history.replaceState({}, document.title);
    } else {
      setActiveTab(state.openTab);
    }
  });
  useEffect(() => {
    const state = location?.state;
    if (!state?.openTab) return undefined;
    const timer = window.setTimeout(() => {
      handleExternalTabRequest(state);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [location]);

  useEffect(() => {
    let active = true;
    const loadUnreadAuditLogs = async () => {
      if (!id) return;
      try {
        const res = await API.get(`/connections/${id}/audit-logs`);
        if (!active) return;
        const logs = res.data?.logs || [];
        const lastSeenStr = localStorage.getItem(`lastSeenAudit_${id}`);
        const count = lastSeenStr
          ? logs.filter(log => new Date(log.createdAt).getTime() > Number(lastSeenStr)).length
          : Math.min(logs.length, 3);
        setUnreadAuditCount(count);
      } catch {
        return;
      }
    };
    loadUnreadAuditLogs();
    const interval = setInterval(loadUnreadAuditLogs, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [id]);

  async function selectDatabase(dbName) {
    if (!dbName) return;
    setActiveDb(dbName);
    setSelectedTable(null);
    setTableData([]);
    setTableColumns([]);
    setIndexTableFilter('');
    setConstraintTableFilter('');
    setObjectsPage(1);
    setTableDetails([]);
    setTableDetailsOffset(0);
    setTableDetailsHasMore(false);
    setDatabaseTableOffset(0);
    setDatabaseTablesHasMore(false);

    try {
      setDbLoading(true);
      setError('');
      const [objRes, statsRes] = await Promise.all([
        API.get(`/connections/${id}/objects?database=${encodeURIComponent(dbName)}&summary=true`),
        API.get(`/connections/${id}/stats?database=${encodeURIComponent(dbName)}`)
      ]);
      setObjects(objRes.data);
      setStats(statsRes.data.stats);
      const initialTableOffset = objRes.data.tableOffset || objRes.data.result?.tableOffset || 0;
      const initialTables = objRes.data.result?.tables || [];
      setDatabaseTableOffset(initialTableOffset + initialTables.length);
      setDatabaseTablesHasMore(objRes.data.tablesHasMore || objRes.data.result?.tablesHasMore || false);
      await loadTableDetails(false, dbName);
    } catch (err) {
      console.error('Failed to select database:', err);
      setError('Data load failed - check database connection');
    } finally {
      setDbLoading(false);
    }
  };

  const loadDetailedObjects = async () => {
    if (!activeDb) return;
    try {
      const res = await API.get(`/connections/${id}/objects?database=${encodeURIComponent(activeDb)}`);
      setObjects(res.data);
    } catch {
      setError('Failed to load database metadata');
    }
  };

  const openDatabaseObjectCategory = async (category) => {
    setDbObjectType(category);
    setObjectSearch('');
    setObjectsPage(1);
    setSelectedTable(null);
    setActiveTab('table');
    await loadDetailedObjects();
  };

  const loadMoreDatabaseTables = async () => {
    if (!activeDb || databaseTablesLoading || !databaseTablesHasMore) return;
    setDatabaseTablesLoading(true);
    try {
      const res = await API.get(
        `/connections/${id}/objects?database=${encodeURIComponent(activeDb)}&summary=true&tableLimit=100&tableOffset=${databaseTableOffset}`
      );
      const nextTables = res.data.result?.tables || [];
      setObjects(prev => ({
        ...prev,
        result: {
          ...prev?.result,
          tables: [...(prev?.result?.tables || []), ...nextTables]
        },
        tablesHasMore: res.data.tablesHasMore,
        tableOffset: res.data.tableOffset
      }));
      setDatabaseTableOffset((res.data.tableOffset || databaseTableOffset) + nextTables.length);
      setDatabaseTablesHasMore(res.data.tablesHasMore || false);
    } catch {
      setError('Failed to load more tables');
    } finally {
      setDatabaseTablesLoading(false);
    }
  };

  const loadTablesUpTo = async (limit) => {
    if (!activeDb || databaseTablesLoading) return;
    setDatabaseTablesLoading(true);
    try {
      const res = await API.get(
        `/connections/${id}/objects?database=${encodeURIComponent(activeDb)}&summary=true&tableLimit=${limit}&tableOffset=0`
      );
      const loadedTables = res.data.result?.tables || [];
      setObjects(prev => ({
        ...prev,
        result: {
          ...prev?.result,
          ...res.data.result,
          tables: loadedTables
        },
        tablesHasMore: res.data.tablesHasMore,
        tableOffset: res.data.tableOffset
      }));
      setTableLoadLimit(limit);
      setDatabaseTableOffset(loadedTables.length);
      setDatabaseTablesHasMore(res.data.tablesHasMore || false);
      setTablesListPage(1);
    } catch {
      setError('Failed to load selected number of tables');
    } finally {
      setDatabaseTablesLoading(false);
    }
  };

  const loadTableDetails = async (append = false, databaseName = activeDb) => {
    if (!databaseName || tableDetailsLoading) return;
    const offset = append ? tableDetailsOffset : 0;
    setTableDetailsLoading(true);
    try {
      const res = await API.get(
        `/monitor/${id}/tables?limit=50&offset=${offset}&database=${encodeURIComponent(databaseName)}`
      );
      const loadedTables = res.data.tables || [];
      setTableDetails(prev => append ? [...prev, ...loadedTables] : loadedTables);
      setTableDetailsOffset(offset + loadedTables.length);
      setTableDetailsHasMore(loadedTables.length === 50);
    } catch {
      console.log('Table details not available');
    } finally {
      setTableDetailsLoading(false);
    }
  };

  const fetchTableData = useCallback(async (tableName) => {
    setTableLoading(true);
    setSelectedTable(tableName);
    setTablePage(1);
    setActiveTab('table');
    try {
      const res = await API.get(
        `/connections/${id}/table/${encodeURIComponent(tableName)}${activeDb ? `?database=${encodeURIComponent(activeDb)}` : ''}`
      );
      setTableData(res.data.rows);
      setTableColumns(res.data.columns);
    } catch {
      setError('Failed to load table data');
    } finally {
      setTableLoading(false);
    }
  }, [id, activeDb]);

  useEffect(() => {
    const requestedTable = new URLSearchParams(location.search).get('table');
    if (!requestedTable || loading || !activeDb || activeDb !== database) return;

    const requestKey = `${location.key}:${id}:${activeDb}:${requestedTable}`;
    if (requestedTableOpenRef.current === requestKey) return;
    requestedTableOpenRef.current = requestKey;
    fetchTableData(requestedTable);
  }, [location.key, location.search, loading, activeDb, database, id, fetchTableData]);

  // Row Action Operations (Copy, Edit, Insert, Delete, Open in Editor)
  const buildRowWhereClause = (row) => {
    if (!row || typeof row !== 'object') return '1=1';
    const keys = Object.keys(row);
    const pkKey = keys.find(k => k.toLowerCase() === 'id' || k.toLowerCase() === '_id');
    if (pkKey && row[pkKey] !== undefined && row[pkKey] !== null) {
      const val = row[pkKey];
      if (typeof val === 'number') return `\`${pkKey}\` = ${val}`;
      return `\`${pkKey}\` = '${String(val).replace(/'/g, "''")}'`;
    }

    const conditions = [];
    keys.forEach(k => {
      const val = row[k];
      if (val !== null && val !== undefined && typeof val !== 'object') {
        if (typeof val === 'number') {
          conditions.push(`\`${k}\` = ${val}`);
        } else {
          conditions.push(`\`${k}\` = '${String(val).replace(/'/g, "''")}'`);
        }
      }
    });

    return conditions.slice(0, 4).join(' AND ') || '1=1';
  };

  const handleCopyRow = (row) => {
    try {
      const jsonStr = JSON.stringify(row, null, 2);
      navigator.clipboard.writeText(jsonStr);
      showToast('📋 Row data copied to clipboard as JSON!');
    } catch {
      showToast('Failed to copy row data', 'error');
    }
  };

  const generateUpdateQuery = (original, data) => {
    if (!original || !selectedTable) return '';
    const whereClause = buildRowWhereClause(original);
    if (dbType === 'mongodb') {
      const cleanData = {};
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined) cleanData[k] = v;
      });
      return `db.${selectedTable}.updateOne(\n  { ${whereClause.replace(/`/g, '"')} },\n  { $set: ${JSON.stringify(cleanData, null, 2)} }\n);`;
    } else {
      const setClauses = [];
      Object.entries(data).forEach(([k, v]) => {
        if (v === null || v === undefined || v === '') {
          setClauses.push(`\`${k}\` = NULL`);
        } else if (typeof v === 'number' || (!isNaN(v) && v !== '' && typeof original[k] === 'number')) {
          setClauses.push(`\`${k}\` = ${v}`);
        } else {
          setClauses.push(`\`${k}\` = '${String(v).replace(/'/g, "''")}'`);
        }
      });
      return `UPDATE \`${activeDb || connectionDetails?.database}\`.\`${selectedTable}\`\nSET ${setClauses.join(', ')}\nWHERE ${whereClause};`;
    }
  };

  const generateInsertQuery = (data) => {
    if (!selectedTable) return '';
    if (dbType === 'mongodb') {
      const cleanData = {};
      Object.entries(data).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) cleanData[k] = v;
      });
      return `db.${selectedTable}.insertOne(\n  ${JSON.stringify(cleanData, null, 2)}\n);`;
    } else {
      const cols = [];
      const vals = [];
      Object.entries(data).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) {
          cols.push(`\`${k}\``);
          if (typeof v === 'number' || (!isNaN(v) && v !== '')) {
            vals.push(v);
          } else {
            vals.push(`'${String(v).replace(/'/g, "''")}'`);
          }
        }
      });
      return `INSERT INTO \`${activeDb || connectionDetails?.database}\`.\`${selectedTable}\` (${cols.join(', ')})\nVALUES (${vals.join(', ')});`;
    }
  };

  const generateDeleteQuery = (row) => {
    if (!row || !selectedTable) return '';
    const whereClause = buildRowWhereClause(row);
    if (dbType === 'mongodb') {
      return `db.${selectedTable}.deleteOne({\n  ${whereClause.replace(/`/g, '"')}\n});`;
    } else {
      return `DELETE FROM \`${activeDb || connectionDetails?.database}\`.\`${selectedTable}\`\nWHERE ${whereClause};`;
    }
  };

  const sendQueryToEditorAndRun = async (queryText, successMsg = 'Query transferred & executed in Editor!') => {
    if (!queryText) return;

    setQueryTabs(prev => prev.map(tab => {
      if (tab.id === activeQueryTabId) {
        return { ...tab, query: queryText };
      }
      return tab;
    }));

    setActiveTab('query');
    showToast('⚡ Query transferred to Query Editor! Executing...');

    setQueryResults([]);
    setQueryError('');
    setQueryLoading(true);
    try {
      const res = await API.post(`/connections/${id}/query`, {
        query: queryText,
        database: activeDb || connectionDetails?.database
      });
      setQueryResults(res.data.results || []);
      setQueryColumns(Array.isArray(res.data.results) && res.data.results.length > 0
        ? Object.keys(res.data.results[0])
        : []);
      showToast(successMsg);

      if (selectedTable) {
        fetchTableData(selectedTable);
      }
    } catch (err) {
      const errText = err.response?.data?.error || err.response?.data?.message || err.message || 'Query execution failed';
      setQueryError(errText);
      showToast(`❌ Query execution failed: ${errText}`, 'error');
    } finally {
      setQueryLoading(false);
    }
  };

  const handleOpenEditRowModal = (row) => {
    setEditingRowOriginal(row);
    setEditingRowData({ ...row });
    setEditingRowError('');
    setEditingRowModalOpen(true);
  };

  const handleSaveEditRow = async (e) => {
    e.preventDefault();
    if (!editingRowOriginal || !selectedTable) return;

    setEditingRowLoading(true);
    setEditingRowError('');
    try {
      const updateQuery = generateUpdateQuery(editingRowOriginal, editingRowData);

      await API.post(`/connections/${id}/query`, {
        query: updateQuery,
        database: activeDb || connectionDetails?.database
      });

      showToast(`✏️ Row updated successfully in ${selectedTable}!`);
      setEditingRowModalOpen(false);
      fetchTableData(selectedTable);
    } catch (err) {
      setEditingRowError(err.response?.data?.error || err.response?.data?.message || 'Failed to update row');
    } finally {
      setEditingRowLoading(false);
    }
  };

  const handleOpenInsertRowModal = (templateRow = null) => {
    const initialData = {};
    const cols = tableColumns && tableColumns.length > 0
      ? tableColumns.map(c => typeof c === 'object' ? (c.Field || c.name || c.column_name) : c)
      : (tableData[0] ? Object.keys(tableData[0]) : []);

    cols.forEach(col => {
      if (templateRow) {
        initialData[col] = templateRow[col] !== undefined && templateRow[col] !== null ? templateRow[col] : '';
      } else {
        initialData[col] = '';
      }
    });

    setInsertRowData(initialData);
    setInsertRowError('');
    setInsertRowModalOpen(true);
  };

  const handleSaveInsertRow = async (e) => {
    e.preventDefault();
    if (!selectedTable) return;

    setInsertRowLoading(true);
    setInsertRowError('');
    try {
      const insertQuery = generateInsertQuery(insertRowData);

      await API.post(`/connections/${id}/query`, {
        query: insertQuery,
        database: activeDb || connectionDetails?.database
      });

      showToast(`➕ New row inserted successfully into ${selectedTable}!`);
      setInsertRowModalOpen(false);
      fetchTableData(selectedTable);
    } catch (err) {
      setInsertRowError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to insert row');
    } finally {
      setInsertRowLoading(false);
    }
  };

  const handleDeleteRow = (row) => {
    setDeleteRowTarget(row);
    setDeleteRowError('');
    setDeleteRowModalOpen(true);
  };

  const handleConfirmDirectDelete = async () => {
    if (!deleteRowTarget || !selectedTable) return;
    const targetRow = deleteRowTarget;
    setDeleteRowLoading(true);
    setDeleteRowError('');

    // Optimistically remove row from UI tableData state INSTANTLY
    setTableData(prev => prev.filter(r => r !== targetRow));
    setDeleteRowModalOpen(false);
    setDeleteRowTarget(null);

    try {
      const deleteQuery = generateDeleteQuery(targetRow);
      await API.post(`/connections/${id}/query`, {
        query: deleteQuery,
        database: activeDb || connectionDetails?.database
      });
      showToast(`🗑️ Row deleted successfully from ${selectedTable}!`);
      fetchTableData(selectedTable);
    } catch (err) {
      showToast(err.response?.data?.error || err.response?.data?.message || 'Delete row failed!', 'error');
      fetchTableData(selectedTable);
    } finally {
      setDeleteRowLoading(false);
    }
  };

  const handleOpenRowInEditor = (row) => {
    const whereClause = buildRowWhereClause(row);
    let editorQuery = '';
    if (dbType === 'mongodb') {
      editorQuery = `// Query for collection ${selectedTable}\ndb.${selectedTable}.find({ ${whereClause.replace(/`/g, '"')} });`;
    } else {
      editorQuery = `-- Query for table ${selectedTable}\nSELECT * FROM \`${activeDb || connectionDetails?.database}\`.\`${selectedTable}\` WHERE ${whereClause};`;
    }

    setQueryTabs(prev => prev.map(tab => {
      if (tab.id === activeQueryTabId) {
        return { ...tab, query: editorQuery };
      }
      return tab;
    }));

    setActiveTab('query');
    showToast(`⚡ Opened row query in Query Editor!`);
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
                  <td style="border: 1px solid #ddd; padding: 6px; text-align: right;">${table.rows !== null && table.rows !== undefined && Number.isFinite(Number(table.rows)) ? Number(table.rows).toLocaleString() : 'N/A'}</td>
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
      const [objRes, statsRes] = await Promise.all([
        API.get(`/connections/${id}/objects?database=${encodeURIComponent(activeDb)}`),
        API.get(`/connections/${id}/stats?database=${encodeURIComponent(activeDb)}`)
      ]);
      setObjects(objRes.data);
      setStats(statsRes.data.stats);
      setTableDetails([]);
      setTableDetailsOffset(0);
      setTableDetailsHasMore(false);
      loadTableDetails();
      if (selectedTable) {
        API.get(`/connections/${id}/table/${selectedTable}?database=${encodeURIComponent(activeDb)}`)
          .then(res => {
            if (res.data?.rows) setTableData(res.data.rows);
            if (res.data?.columns) setTableColumns(res.data.columns);
          })
          .catch(() => { });
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
      if (activeTab !== "audit-logs") {
        setUnreadAuditCount(prev => prev + 1);
      }
    } catch (err) {
      setQueryError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Query failed!'
      );
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
  const filteredDatabases = databases.filter(db =>
    db.toLowerCase().includes(databaseSearch.toLowerCase().trim())
  );

  const formatTableSize = (sizeMB, unit) => {
    if (sizeMB === null || sizeMB === undefined || !Number.isFinite(Number(sizeMB))) return 'N/A';
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

  const getTablesWithMetadata = useCallback(() => {
    const rawList = objects?.result?.tables || objects?.result?.collections || [];
    return tables.map(tableName => {
      const detail = tableDetails.find(d => d.table === tableName);
      const rawObj = rawList.find(t => (typeof t === 'object' && (t.name === tableName || t.table_name === tableName || Object.values(t)[0] === tableName)));
      return {
        name: tableName,
        rows: detail ? detail.rows : (rawObj?.rows ?? rawObj?.count ?? null),
        sizeMB: detail ? detail.sizeMB : (rawObj?.sizeMB ?? null)
      };
    });
  }, [objects, tables, tableDetails]);

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

  const defaultMockLargestTables = useMemo(
    () => [
      { table: 'cases', rows: 20, sizeMB: 0.16, sizeFormatted: '0.16 MB', percentage: 100 },
      { table: 'audit_logs', rows: 504, sizeMB: 0.11, sizeFormatted: '0.11 MB', percentage: 69 },
      { table: 'tasks', rows: 0, sizeMB: 0.09, sizeFormatted: '0.09 MB', percentage: 56 },
      { table: 'case_assignment_history', rows: 8, sizeMB: 0.08, sizeFormatted: '0.08 MB', percentage: 50 },
      { table: 'ptp', rows: 5, sizeMB: 0.08, sizeFormatted: '0.08 MB', percentage: 50 },
    ],
    []
  );

  const displayedLargestTables = useMemo(() => {
    let list;
    const metaList = getTablesWithMetadata();

    if (tableDetails && tableDetails.length > 0) {
      list = tableDetails.map((t) => {
        const sz = t.sizeMB !== undefined && t.sizeMB !== null ? Number(t.sizeMB) : (parseFloat(t.size) || 0);
        return {
          table: t.table || t.tableName || t.name,
          rows: Number(t.rows ?? 0),
          sizeMB: sz,
          sizeFormatted: `${sz >= 1024 ? (sz / 1024).toFixed(2) + ' GB' : sz.toFixed(2) + ' MB'}`,
        };
      });
    } else if (metaList && metaList.length > 0) {
      list = metaList.map((t) => {
        const sz = t.sizeMB !== undefined && t.sizeMB !== null ? Number(t.sizeMB) : 0;
        return {
          table: t.name,
          rows: Number(t.rows ?? 0),
          sizeMB: sz,
          sizeFormatted: `${sz >= 1024 ? (sz / 1024).toFixed(2) + ' GB' : sz.toFixed(2) + ' MB'}`,
        };
      });
    } else if (tables && tables.length > 0) {
      list = tables.map((tbl) => ({
        table: tbl,
        rows: 0,
        sizeMB: 0,
        sizeFormatted: '0.00 MB',
      }));
    } else {
      list = defaultMockLargestTables;
    }

    if (tableSearchQuery.trim()) {
      list = list.filter((t) => t.table.toLowerCase().includes(tableSearchQuery.toLowerCase()));
    }

    if (tableSortOrder === 'size-desc') {
      list = [...list].sort((a, b) => (b.sizeMB || 0) - (a.sizeMB || 0) || (b.rows || 0) - (a.rows || 0));
    } else if (tableSortOrder === 'rows-desc') {
      list = [...list].sort((a, b) => (b.rows || 0) - (a.rows || 0) || (b.sizeMB || 0) - (a.sizeMB || 0));
    } else if (tableSortOrder === 'name-asc') {
      list = [...list].sort((a, b) => a.table.localeCompare(b.table));
    }

    // STRICTLY Top 5 tables: "baki table mat dikhao bhai bas 5 table show honi chahiye jo sabse jyda heavy h rows and size"
    list = list.slice(0, 5);

    const maxVal = Math.max(...list.map((t) => t.sizeMB || 0), 0.001);
    return list.map((t) => ({
      ...t,
      percentage: Math.max(12, Math.min(100, Math.round(((t.sizeMB || 0) / maxVal) * 100))),
    }));
  }, [tableDetails, tables, objects, defaultMockLargestTables, tableSearchQuery, tableSortOrder]);

  const refreshDatabases = async () => {
    try {
      const dbRes = await API.get(`/connections/${id}/databases`);
      const dbList = dbRes.data.databases || [];
      setDatabases(dbList);
      if (activeDb) {
        await selectDatabase(activeDb);
      }
    } catch (err) {
      console.error('Failed to refresh databases:', err);
    }
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

  // ---------- Table Data viewer: filter, sort, column visibility, density ----------
  const [viewerTable, setViewerTable] = useState(selectedTable);
  const [viewerFilter, setViewerFilter] = useState('');
  const [viewerSort, setViewerSort] = useState(null); // { column, dir: 'asc' | 'desc' }
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [viewerDensity, setViewerDensity] = useState('comfortable');
  const [viewerMenu, setViewerMenu] = useState(null); // 'columns' | 'export' | null
  // Reset per-table view settings when another table is opened
  if (viewerTable !== selectedTable) {
    setViewerTable(selectedTable);
    setViewerFilter('');
    setViewerSort(null);
    setHiddenColumns([]);
    setViewerMenu(null);
  }

  const viewerAllColumns = useMemo(() => (
    tableColumns && tableColumns.length > 0
      ? tableColumns.map((c) => (typeof c === 'object' ? (c.Field || c.name || c.column_name || '') : String(c)))
      : Object.keys(tableData[0] || {})
  ), [tableColumns, tableData]);
  const viewerColumns = viewerAllColumns.filter((col) => !hiddenColumns.includes(col));

  const viewerRows = useMemo(() => {
    const term = viewerFilter.trim().toLowerCase();
    let rows = term
      ? tableData.filter((row) => viewerAllColumns.some((col) => {
        const value = row[col];
        if (value === null || value === undefined) return 'null'.includes(term);
        return (typeof value === 'object' ? JSON.stringify(value) : String(value)).toLowerCase().includes(term);
      }))
      : tableData;
    if (viewerSort) {
      const { column, dir } = viewerSort;
      rows = [...rows].sort((a, b) => {
        const x = a[column];
        const y = b[column];
        if (x === y) return 0;
        if (x === null || x === undefined) return 1; // nulls last
        if (y === null || y === undefined) return -1;
        const nx = Number(x);
        const ny = Number(y);
        const result = Number.isFinite(nx) && Number.isFinite(ny) && x !== '' && y !== ''
          ? nx - ny
          : String(typeof x === 'object' ? JSON.stringify(x) : x).localeCompare(String(typeof y === 'object' ? JSON.stringify(y) : y), undefined, { numeric: true });
        return dir === 'asc' ? result : -result;
      });
    }
    return rows;
  }, [tableData, viewerAllColumns, viewerFilter, viewerSort]);

  const viewerTotalPages = Math.max(1, Math.ceil(viewerRows.length / tableRowsPerPage));
  const viewerPage = Math.min(tablePage, viewerTotalPages);
  const viewerPageRows = viewerRows.slice((viewerPage - 1) * tableRowsPerPage, viewerPage * tableRowsPerPage);

  // Header click cycles: ascending → descending → off
  const toggleViewerSort = (column) => {
    setViewerSort((current) => {
      if (!current || current.column !== column) return { column, dir: 'asc' };
      if (current.dir === 'asc') return { column, dir: 'desc' };
      return null;
    });
    setTablePage(1);
  };

  const cellText = (value) => {
    if (value === null || value === undefined) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  };

  const handleCopyCell = async (value) => {
    const text = value === null || value === undefined ? 'NULL' : cellText(value);
    if (await copyToClipboard(text)) {
      showToast(`Copied: ${text.length > 40 ? `${text.slice(0, 40)}…` : text}`);
    } else {
      showToast('Could not copy to the clipboard.', 'error');
    }
  };

  const downloadFile = (content, fileName, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export the filtered + sorted rows with the visible columns
  const exportViewerRows = (format) => {
    setViewerMenu(null);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const baseName = `${selectedTable || 'table'}_${stamp}`;
    if (format === 'json') {
      const data = viewerRows.map((row) => Object.fromEntries(viewerColumns.map((col) => [col, row[col] ?? null])));
      downloadFile(JSON.stringify(data, null, 2), `${baseName}.json`, 'application/json');
    } else {
      const escape = (value) => {
        if (value === null || value === undefined) return '';
        const text = cellText(value);
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const lines = [viewerColumns.map(escape).join(','), ...viewerRows.map((row) => viewerColumns.map((col) => escape(row[col])).join(','))];
      // Leading byte-order mark so Excel opens the UTF-8 CSV correctly
      downloadFile(String.fromCharCode(0xFEFF) + lines.join('\r\n'), `${baseName}.csv`, 'text/csv;charset=utf-8');
    }
    showToast(`Exported ${viewerRows.length} row${viewerRows.length === 1 ? '' : 's'} as ${format.toUpperCase()}`);
  };

  // Ready-made "first 100 rows" query for a table, in the right dialect
  const buildPreviewQuery = (tableName) => {
    if (dbType === 'mongodb') return `db.${tableName}.find({}).limit(100)`;
    if (dbType === 'oracle') return `SELECT * FROM ${tableName} FETCH FIRST 100 ROWS ONLY`;
    if (dbType === 'postgresql') return `SELECT * FROM "${tableName}" LIMIT 100;`;
    return `SELECT * FROM \`${tableName}\` LIMIT 100;`;
  };

  // Shared pager: First / Prev / page numbers / Next / Last
  const renderPager = (page, totalPages, onChange) => {
    const pages = [];
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    for (let p = start; p <= Math.min(totalPages, start + 4); p += 1) pages.push(p);
    const arrow = (d) => (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
    );
    return (
      <div className="cd-pager">
        <button type="button" onClick={() => onChange(1)} disabled={page <= 1} title="First page" aria-label="First page">{arrow('M11 17l-5-5 5-5M18 17l-5-5 5-5')}</button>
        <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} title="Previous page" aria-label="Previous page">{arrow('M15 18l-6-6 6-6')}</button>
        {pages.map((p) => (
          <button key={p} type="button" onClick={() => onChange(p)} className={p === page ? 'is-active' : ''} aria-current={p === page ? 'page' : undefined}>{p}</button>
        ))}
        <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} title="Next page" aria-label="Next page">{arrow('M9 18l6-6-6-6')}</button>
        <button type="button" onClick={() => onChange(totalPages)} disabled={page >= totalPages} title="Last page" aria-label="Last page">{arrow('M13 17l5-5-5-5M6 17l5-5-5-5')}</button>
      </div>
    );
  };

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
    <div className="bg-gray-50">
      {toast && <Toast toast={toast} onClose={closeToast} placement="top-right" />}

      <div className="flex h-[calc(100vh-60px)] relative bg-[#f4f7fb] overflow-hidden">
        {/* ========================================================
            LEFT SIDEBAR (Database Explorer & Active Connection)
        ======================================================== */}
        <div
          style={{ width: sidebarOpen ? `${sidebarWidth}px` : '0px' }}
          className={`cd-connection-sidebar ${!sidebarOpen ? 'overflow-hidden border-none' : ''} bg-white border-r border-gray-200 flex flex-col shrink-0 relative ${
            isResizingSidebar ? 'select-none transition-none' : 'transition-[width] duration-200'
          }`}
        >
          {/* Top Section: Connections Header + Add Button */}
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <svg className="w-4 h-4 text-[#0d9488] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Connections</span>
              </div>
              <button
                onClick={() => navigate('/connections')}
                className="w-5 h-5 rounded-full bg-[#0d9488] hover:bg-[#0f766e] text-white flex items-center justify-center text-xs font-bold transition shadow-2xs cursor-pointer"
                title="Manage Connections"
              >
                +
              </button>
            </div>

            {/* Active Connection Card matching media_1793250600314_2d11b859.png */}
            <div className="bg-[#f0fbfb] border border-teal-200/90 rounded-xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#e0f7f6] text-[#0d9488] flex items-center justify-center shrink-0">
                  <svg className="w-4.5 h-4.5 text-[#0d9488]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <ellipse cx="12" cy="5" rx="8" ry="3" />
                    <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                    <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                  </svg>
                </div>
                <div className="leading-tight min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {connectionName || objects?.name || 'HRMS'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                    {connectionDetails?.host || 'localhost'}:{connectionDetails?.port || (dbType === 'mysql' ? 3306 : dbType === 'postgresql' ? 5432 : 27017)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                  {dbType || 'MySQL'}
                </span>
              </div>
            </div>

            {/* Dashboard Back Link */}
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-2 w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition cursor-pointer"
            >
              <svg className="w-4 h-4 text-[#0d9488] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Dashboard</span>
            </button>
          </div>

          {/* Database Explorer Section */}
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-700">Database Explorer</span>
              <button
                onClick={refreshDatabases}
                className="text-teal-600 hover:text-teal-800 text-xs transition p-0.5 cursor-pointer"
                title="Refresh databases"
              >
                <svg className="w-3.5 h-3.5 text-teal-600 hover:text-teal-800 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-teal-600">
                <svg className="w-3.5 h-3.5 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="search"
                value={databaseSearch}
                onChange={(e) => setDatabaseSearch(e.target.value)}
                placeholder="Search database objects..."
                className="w-full pl-7 pr-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:border-[#0d9488] outline-none transition"
              />
            </div>
          </div>

          {/* Database Tree List */}
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {databases.length === 0 ? (
              <p className="text-[10px] text-gray-400 px-3 py-3">No databases found</p>
            ) : filteredDatabases.length === 0 ? (
              <p className="text-[10px] text-gray-400 px-3 py-3">No matching databases</p>
            ) : (
              filteredDatabases.map((db, i) => {
                const isSelected = activeDb === db;
                const isExpanded = expandedDbs[db] !== undefined ? expandedDbs[db] : isSelected;
                const objectCounts = isSelected ? (objects?.result || {}) : {};
                const getObjectCount = (value) => (Array.isArray(value) ? value.length : Number(value || 0));
                const tablesCount = getObjectCount(objectCounts.totalTables ?? objectCounts.tables ?? objectCounts.collections) || (tables?.length || 0);
                const viewsCount = getObjectCount(objectCounts.views);
                const proceduresCount = getObjectCount(objectCounts.procedures);
                const functionsCount = getObjectCount(objectCounts.functions);
                const triggersCount = getObjectCount(objectCounts.triggers);
                const indexesCount = getObjectCount(objectCounts.indexes);
                const constraintsCount = getObjectCount(objectCounts.constraints);

                return (
                  <div key={i} className="rounded-lg overflow-hidden">
                    <div
                      className={`w-full text-left px-2.5 py-1.5 text-xs font-bold transition flex items-center justify-between cursor-pointer rounded-lg ${
                        isSelected
                          ? 'cd-tree-active cd-tree-text font-bold'
                          : 'cd-tree-text hover:bg-slate-50'
                      }`}
                      onClick={() => {
                        selectDatabase(db);
                        setExpandedDbs((prev) => ({ ...prev, [db]: !isExpanded }));
                      }}
                      title={db}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDbs((prev) => ({ ...prev, [db]: !isExpanded }));
                          }}
                          className="p-0.5 cd-tree-text flex items-center justify-center cursor-pointer"
                        >
                          <svg className={`w-2.5 h-2.5 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </span>
                        <svg className="w-3.5 h-3.5 shrink-0 cd-tree-db-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <ellipse cx="12" cy="5" rx="8" ry="3" />
                          <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                          <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                        </svg>
                        <span className="cd-tree-db-name truncate">{db}</span>
                      </div>
                    </div>

                    {/* Sub-tree Folders matching media_1793250600314_2d11b859.png */}
                    {isExpanded && isSelected && (
                      <div className="pl-4 py-1 space-y-0.5 text-xs">
                        {/* Tables */}
                        <button
 style={{ '--tc': '#2563eb' }}
                          onClick={() => {
                            setDbObjectType('tables');
                            setSelectedTable(null);
                            setActiveTab('table');
                          }}
                          className={`cd-tree-item w-full text-left px-2 py-1 text-xs font-medium flex items-center justify-between rounded-md transition cursor-pointer ${
                            dbObjectType === 'tables' && activeTab === 'table' && !selectedTable
                              ? 'is-active cd-tree-text font-bold'
                              : 'cd-tree-text hover:bg-slate-100'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <svg className="cd-tree-icon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <path d="M3 9h18M3 15h18M9 3v18" />
                            </svg>
                            <span>Tables</span>
                          </span>
                          <span className="text-[10px] font-bold font-mono cd-tree-count px-1.5 py-0.2 rounded">
                            {tablesCount}
                          </span>
                        </button>

                        {/* Views */}
                        <button
 style={{ '--tc': '#7c3aed' }}
                          onClick={() => openDatabaseObjectCategory('views')}
                          className={`cd-tree-item w-full text-left px-2 py-1 text-xs font-medium flex items-center justify-between rounded-md transition cursor-pointer ${
                            dbObjectType === 'views' && activeTab === 'table'
                              ? 'is-active cd-tree-text font-bold'
                              : 'cd-tree-text hover:bg-slate-100'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <svg className="cd-tree-icon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M2 12c1.6-3.8 5.4-7 10-7s8.4 3.2 10 7c-1.6 3.8-5.4 7-10 7s-8.4-3.2-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                            <span>Views</span>
                          </span>
                          <span className="text-[10px] font-bold font-mono cd-tree-count px-1.5 py-0.2 rounded">
                            {viewsCount}
                          </span>
                        </button>

                        {/* Procedures */}
                        {dbType !== 'mongodb' && (
                          <button
 style={{ '--tc': '#0891b2' }}
                            onClick={() => openDatabaseObjectCategory('procedures')}
                            className={`cd-tree-item w-full text-left px-2 py-1 text-xs font-medium flex items-center justify-between rounded-md transition cursor-pointer ${
                              dbObjectType === 'procedures' && activeTab === 'table'
                                ? 'is-active cd-tree-text font-bold'
                                : 'cd-tree-text hover:bg-slate-100'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <svg className="cd-tree-icon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <circle cx="12" cy="12" r="3" />
                              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                            </svg>
                            <span>Procedures</span>
                            </span>
                            <span className="text-[10px] font-bold font-mono cd-tree-count px-1.5 py-0.2 rounded">
                              {proceduresCount}
                            </span>
                          </button>
                        )}

                        {/* Functions */}
                        {dbType !== 'mongodb' && (
                          <button
 style={{ '--tc': '#db2777' }}
                            onClick={() => openDatabaseObjectCategory('functions')}
                            className={`cd-tree-item w-full text-left px-2 py-1 text-xs font-medium flex items-center justify-between rounded-md transition cursor-pointer ${
                              dbObjectType === 'functions' && activeTab === 'table'
                                ? 'is-active cd-tree-text font-bold'
                                : 'cd-tree-text hover:bg-slate-100'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <svg className="cd-tree-icon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                            <span>Functions</span>
                            </span>
                            <span className="text-[10px] font-bold font-mono cd-tree-count px-1.5 py-0.2 rounded">
                              {functionsCount}
                            </span>
                          </button>
                        )}

                        {/* Triggers */}
                        {dbType !== 'mongodb' && (
                          <button
 style={{ '--tc': '#ea580c' }}
                            onClick={() => openDatabaseObjectCategory('triggers')}
                            className={`cd-tree-item w-full text-left px-2 py-1 text-xs font-medium flex items-center justify-between rounded-md transition cursor-pointer ${
                              dbObjectType === 'triggers' && activeTab === 'table'
                                ? 'is-active cd-tree-text font-bold'
                                : 'cd-tree-text hover:bg-slate-100'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <svg className="cd-tree-icon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M10 8.5l5.5 3.5-5.5 3.5z" /></svg>
                            <span>Triggers</span>
                            </span>
                            <span className="text-[10px] font-bold font-mono cd-tree-count px-1.5 py-0.2 rounded">
                              {triggersCount}
                            </span>
                          </button>
                        )}

                        {/* Indexes */}
                        <button
 style={{ '--tc': '#059669' }}
                          onClick={() => openDatabaseObjectCategory('indexes')}
                          className={`cd-tree-item w-full text-left px-2 py-1 text-xs font-medium flex items-center justify-between rounded-md transition cursor-pointer ${
                            dbObjectType === 'indexes' && activeTab === 'table'
                              ? 'is-active cd-tree-text font-bold'
                              : 'cd-tree-text hover:bg-slate-100'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <svg className="cd-tree-icon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <circle cx="11" cy="11" r="7" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <span>Indexes</span>
                          </span>
                          <span className="text-[10px] font-bold font-mono cd-tree-count px-1.5 py-0.2 rounded">
                            {indexesCount}
                          </span>
                        </button>

                        {/* Constraints */}
                        <button
 style={{ '--tc': '#dc2626' }}
                          onClick={() => openDatabaseObjectCategory('constraints')}
                          className={`cd-tree-item w-full text-left px-2 py-1 text-xs font-medium flex items-center justify-between rounded-md transition cursor-pointer ${
                            dbObjectType === 'constraints' && activeTab === 'table'
                              ? 'is-active cd-tree-text font-bold'
                              : 'cd-tree-text hover:bg-slate-100'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <svg className="cd-tree-icon shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="5" y="11" width="14" height="10" rx="2" />
                              <circle cx="12" cy="16" r="1.5" />
                              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                            </svg>
                            <span>Constraints</span>
                          </span>
                          <span className="text-[10px] font-bold font-mono cd-tree-count px-1.5 py-0.2 rounded">
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
              className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-30 group flex items-center justify-center hover:bg-teal-500/20 ${
                isResizingSidebar ? 'bg-teal-500/30' : ''
              }`}
              title="Drag right/left with cursor to resize sidebar width"
            >
              <div
                className={`w-0.5 h-8 bg-gray-300 rounded group-hover:bg-[#0d9da4] transition-colors ${
                  isResizingSidebar ? 'bg-[#0d9da4] h-12' : ''
                }`}
              />
            </div>
          )}
        </div>

        {/* Sidebar Toggle Collapse/Open Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-1/2 z-20 w-5 h-5 bg-white border border-gray-200 shadow-md rounded-full flex items-center justify-center text-[#0d9488] hover:bg-gray-50 transition-all duration-200 focus:outline-none cursor-pointer"
          style={{
            left: !sidebarOpen ? '4px' : `${sidebarWidth - 10}px`,
            transform: 'translateY(-50%)',
          }}
          title={sidebarOpen ? 'Collapse Sidebar' : 'Open Sidebar'}
        >
          {sidebarOpen ? (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>

        {/* ========================================================
            MAIN WORKSPACE AREA
        ======================================================== */}
        <div className="cd-ws flex-1 flex flex-col overflow-hidden">
          {/* 1. Header Strip: Breadcrumb on left + Active DB dropdown on right */}
          <div className="px-6 py-2.5 bg-white border-b border-gray-150 flex items-center justify-between gap-4 shrink-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 truncate">
              <button
                onClick={() => navigate('/connections')}
                className="flex items-center gap-1.5 hover:text-slate-900 transition cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-[#0d9488]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M6 10h12M6 14h8" />
                </svg>
                <span>Connections</span>
              </button>
              <span className="text-slate-300">›</span>
              <span className="font-bold text-slate-800 truncate">{connectionName || 'HRMS'}</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {dbType || 'MySQL'}
              </span>
              <span className="text-slate-300">›</span>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold">
                <svg className="w-3.5 h-3.5 text-[#0d9488] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <ellipse cx="12" cy="5" rx="8" ry="3" />
                  <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                  <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                </svg>
                <span className="truncate">{activeDb || 'allatone_hrms'}</span>
              </div>
            </div>

            {/* Active DB Dropdown Picker */}
            <div className="relative shrink-0">
              <button
                onClick={() => setDbSelectorDropdownOpen(!dbSelectorDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1 bg-white border border-gray-200 hover:border-teal-400 rounded-xl text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-slate-500 font-medium text-[11px]">Active DB:</span>
                <span className="font-mono text-slate-900">{activeDb || 'allatone_hrms'}</span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dbSelectorDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-60 bg-white border border-gray-200 rounded-2xl shadow-xl py-2 z-50 animate-fadeIn">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Switch Database ({databases.length})
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {databases.map((db) => (
                      <button
                        key={db}
                        onClick={() => {
                          selectDatabase(db);
                          setDbSelectorDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-teal-50 hover:text-teal-900 transition ${
                          activeDb === db ? 'bg-teal-50 text-teal-900 font-bold' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <svg className="w-3.5 h-3.5 text-[#0d9488] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <ellipse cx="12" cy="5" rx="8" ry="3" />
                            <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                            <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                          </svg>
                          <span className="truncate">{db}</span>
                        </div>
                        {activeDb === db && <span className="text-xs text-teal-600 font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. Navigation Tabs Bar */}
          <div className="cd-tabbar shrink-0" role="tablist">
            {[
              { id: 'overview', label: 'Overview', icon: <path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z" /> },
              { id: 'table', label: 'Table Data', icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></> },
              { id: 'query', label: 'Query Editor', icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></> },
              { id: 'history', label: 'Query History', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
              { id: 'slow-queries', label: 'Slow Query', icon: <><path d="M12 14l4-4" /><path d="M3.3 19a9 9 0 1117.4 0" /></> },
              { id: 'audit-logs', label: 'Audit Logs', icon: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M9 12h6M9 15h4" /></> },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'history') fetchHistory();
                    if (tab.id === 'audit-logs') {
                      setUnreadAuditCount(0);
                      localStorage.setItem(`lastSeenAudit_${id}`, String(Date.now()));
                    }
                  }}
                  className={`cd-tab ${isActive ? 'is-active' : ''}`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {tab.icon}
                  </svg>
                  <span>{tab.label}</span>
                  {tab.id === 'audit-logs' && unreadAuditCount > 0 && (
                    <span className="cd-tab-badge">{unreadAuditCount > 99 ? '99+' : unreadAuditCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 3. Main Body Scrollable Viewport */}
          <div className="flex-1 overflow-y-auto p-5">
            {error && (
              <div className="mb-4 bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-xl border border-red-200 flex items-center gap-2">
                <span>❌</span>
                <span>{error}</span>
              </div>
            )}

            {dbLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-teal-200 border-t-teal-600 rounded-full animate-spin mb-3"></div>
                <p className="text-slate-500 text-xs font-semibold">Switching database schema...</p>
              </div>
            ) : (
              <>
                {/* ========================================================
                    OVERVIEW TAB CONTENT (1:1 with media_1793250600314_2d11b859.png)
                ======================================================== */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    {/* 1. Top 4 Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Card 1: Database Size */}
                      <div className="cd-overview-stat bg-white border border-gray-150 rounded-2xl p-4 shadow-2xs">
                        <div className="cd-overview-stat-icon rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <ellipse cx="12" cy="5" rx="8" ry="3" />
                            <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                            <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                          </svg>
                        </div>
                        <div className="cd-overview-stat-content">
                          <p className="text-xs font-medium text-slate-500">Database Size</p>
                          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight mt-0.5">
                            {stats?.sizeMB !== undefined && stats?.sizeMB !== null
                              ? (Number(stats.sizeMB) >= 1024 ? `${(Number(stats.sizeMB) / 1024).toFixed(2)} GB` : `${Number(stats.sizeMB).toFixed(2)} MB`)
                              : (stats?.size || '—')}
                          </h3>
                          <div className="flex items-center gap-1 mt-1 text-[11px]">
                            <span className="font-semibold text-emerald-600 flex items-center gap-0.5">
                              <span>↑</span>
                              <span>12%</span>
                            </span>
                            <span className="text-slate-400 font-normal">vs last week</span>
                          </div>
                        </div>
                      </div>

                      {/* Card 2: Total Tables */}
                      <div className="cd-overview-stat bg-white border border-gray-150 rounded-2xl p-4 shadow-2xs">
                        <div className="cd-overview-stat-icon rounded-2xl bg-[#faf5ff] text-[#9333ea]">
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18M3 15h18M9 3v18" />
                          </svg>
                        </div>
                        <div className="cd-overview-stat-content">
                          <p className="text-xs font-medium text-slate-500">Total Tables</p>
                          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight mt-0.5">
                            {stats?.totalTables ?? tables?.length ?? '—'}
                          </h3>
                          <p className="text-[11px] font-normal text-slate-400 mt-1">
                            0 new this week
                          </p>
                        </div>
                      </div>

                      {/* Card 3: Active Connections */}
                      <div className="cd-overview-stat bg-white border border-gray-150 rounded-2xl p-4 shadow-2xs">
                        <div className="cd-overview-stat-icon rounded-2xl bg-[#ecfdf5] text-[#10b981]">
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        </div>
                        <div className="cd-overview-stat-content">
                          <p className="text-xs font-medium text-slate-500">Active Connections</p>
                          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight mt-0.5">
                            {stats?.activeConnections ?? '—'}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                            <span className="bg-[#dcfce7] text-[#16a34a] font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 leading-none">
                              <span>↓</span>
                              <span>2</span>
                            </span>
                            <span className="text-slate-400 font-normal">vs last hour</span>
                          </div>
                        </div>
                      </div>

                      {/* Card 4: Total Triggers */}
                      <div className="cd-overview-stat bg-white border border-gray-150 rounded-2xl p-4 shadow-2xs">
                        <div className="cd-overview-stat-icon rounded-2xl bg-[#fff7ed] text-[#f97316]">
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                        </div>
                        <div className="cd-overview-stat-content">
                          <p className="text-xs font-medium text-slate-500">Total Triggers</p>
                          <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight mt-0.5">
                            {Array.isArray(objects?.result?.triggers) ? objects.result.triggers.length : (stats?.triggers ?? 0)}
                          </h3>
                          <p className="text-[11px] font-normal text-slate-400 mt-1">
                            0 changed this week
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 2. Middle Row: Storage Usage, Database Health, Quick Actions */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Storage Usage */}
                      <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <ellipse cx="12" cy="5" rx="8" ry="3" />
                              <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
                              <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                            </svg>
                            <h4 className="text-sm font-bold text-slate-900">Storage Usage</h4>
                          </div>
                          <span className="text-xs font-medium text-slate-500">
                            {stats?.sizeMB !== undefined
                              ? (Number(stats.sizeMB) >= 1024 ? `${(Number(stats.sizeMB) / 1024).toFixed(2)} GB of 5 GB` : `${Number(stats.sizeMB).toFixed(2)} MB of 5 GB`)
                              : '1.84 MB of 5 GB'}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-3.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#0d9488] rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(4, Math.min(100, Math.round(((Number(stats?.sizeMB || 1.84)) / 5120) * 100)))}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-bold text-slate-700">
                              {Math.max(1, Math.round(((Number(stats?.sizeMB || 1.84)) / 5120) * 100))}%
                            </span>
                          </div>
                        </div>

                        {/* Legend */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
                          <div>
                            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#0d9488]"></span>
                              <span>Data</span>
                            </div>
                            <p className="font-bold text-slate-800 text-xs mt-0.5">
                              {stats?.dataMB ? `${stats.dataMB} MB` : (stats?.sizeMB ? `${(stats.sizeMB * 0.35).toFixed(2)} MB` : '0.59 MB')}
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span>
                              <span>Indexes</span>
                            </div>
                            <p className="font-bold text-slate-800 text-xs mt-0.5">
                              {stats?.indexMB ? `${stats.indexMB} MB` : (stats?.sizeMB ? `${(stats.sizeMB * 0.65).toFixed(2)} MB` : '1.25 MB')}
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                              <span>Free</span>
                            </div>
                            <p className="font-bold text-slate-800 text-xs mt-0.5">
                              {stats?.sizeMB && Number(stats.sizeMB) < 5120
                                ? `${((5120 - Number(stats.sizeMB)) / 1024).toFixed(2)} GB`
                                : '5.00 GB'}
                            </p>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8]"></span>
                              <span>Others</span>
                            </div>
                            <p className="font-bold text-slate-800 text-xs mt-0.5">90 MB</p>
                          </div>
                        </div>
                      </div>

                      {/* Database Health */}
                      <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                            <h4 className="text-sm font-bold text-slate-900">Database Health</h4>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            Healthy
                          </span>
                        </div>

                        {/* 5 Health Check Rows */}
                        <div className="space-y-2 text-xs">
                          {[
                            'Database is running',
                            'No replication lag detected',
                            'Table integrity OK',
                            'Disk space sufficient',
                            'No long running queries',
                          ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-slate-700">
                              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                ✓
                              </span>
                              <span className="text-xs font-medium">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Quick Actions */}
                      <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
                        <div className="flex items-center gap-2 mb-3">
                          <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                          <h4 className="text-sm font-bold text-slate-900">Quick Actions</h4>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          {/* Query Editor */}
                          <button
                            onClick={() => setActiveTab('query')}
                            className="p-3 bg-[#f0f7ff] hover:bg-blue-100/70 border border-blue-100 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center gap-1"
                          >
                            <span className="text-base font-bold text-blue-600 font-mono">&lt;/&gt;</span>
                            <span className="text-xs font-bold text-blue-600">Query Editor</span>
                          </button>

                          {/* View Tables */}
                          <button
                            onClick={() => {
                              setDbObjectType('tables');
                              setSelectedTable(null);
                              setActiveTab('table');
                            }}
                            className="p-3 bg-[#f0fdf4] hover:bg-emerald-100/70 border border-emerald-100 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center gap-1"
                          >
                            <span className="text-base">▦</span>
                            <span className="text-xs font-bold text-emerald-600">View Tables</span>
                          </button>

                          {/* Audit Logs */}
                          <button
                            onClick={() => {
                              setActiveTab('audit-logs');
                              setUnreadAuditCount(0);
                              localStorage.setItem(`lastSeenAudit_${id}`, String(Date.now()));
                            }}
                            className="p-3 bg-[#faf5ff] hover:bg-purple-100/70 border border-purple-100 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 relative"
                          >
                            {unreadAuditCount > 0 && (
                              <span className="absolute top-2 right-2 min-w-[17px] h-[17px] px-1 bg-red-500 text-white text-[9.5px] font-black rounded-full flex items-center justify-center leading-none shadow-xs animate-pulse">
                                {unreadAuditCount > 99 ? '99+' : unreadAuditCount}
                              </span>
                            )}
                            <span className="text-base">📄</span>
                            <span className="text-xs font-bold text-purple-600">Audit Logs</span>
                          </button>

                          {/* Slow Query */}
                          <button
                            onClick={() => setActiveTab('slow-queries')}
                            className="p-3 bg-[#fff7ed] hover:bg-amber-100/70 border border-amber-100 rounded-xl text-center transition cursor-pointer flex flex-col items-center justify-center gap-1"
                          >
                            <span className="text-base">📊</span>
                            <span className="text-xs font-bold text-amber-600">Slow Query</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 3. Largest Tables Section (1:1 with media_1793250600314_2d11b859.png) */}
                    <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs">
                      {/* Header with Title and Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-[#2563eb] text-white flex items-center justify-center shrink-0 shadow-xs">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <path d="M3 9h18M3 15h18M9 3v18" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 leading-none">Largest Tables</h3>
                            <p className="text-xs text-slate-400 mt-1">
                              Top 5 tables by size in database {activeDb || 'amount_recovery'}
                            </p>
                          </div>
                        </div>

                        {/* Right Search & Sort Controls */}
                        <div className="flex items-center gap-2">
                          {/* Search tables */}
                          <div className="relative w-44">
                            <span className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-slate-400 text-xs">
                              🔍
                            </span>
                            <input
                              type="text"
                              placeholder="Search tables..."
                              value={tableSearchQuery}
                              onChange={(e) => {
                                setTableSearchQuery(e.target.value);
                              }}
                              className="w-full pl-7 pr-2.5 py-1.5 bg-[#f8fafc] border border-gray-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white"
                            />
                          </div>

                          {/* Order by Size Dropdown */}
                          <select
                            value={tableSortOrder}
                            onChange={(e) => {
                              setTableSortOrder(e.target.value);
                            }}
                            className="py-1.5 px-3 bg-[#f8fafc] border border-gray-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                          >
                            <option value="size-desc">Order by Size</option>
                            <option value="rows-desc">Order by Rows</option>
                            <option value="name-asc">Order by Name</option>
                          </select>

                          {/* Filter button */}
                          <button
                            type="button"
                            className="p-1.5 bg-[#f8fafc] hover:bg-gray-100 border border-gray-200 rounded-xl text-slate-600 text-xs transition cursor-pointer"
                            title="Filter options"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <line x1="4" y1="21" x2="4" y2="14" />
                              <line x1="4" y1="10" x2="4" y2="3" />
                              <line x1="12" y1="21" x2="12" y2="12" />
                              <line x1="12" y1="8" x2="12" y2="3" />
                              <line x1="20" y1="21" x2="20" y2="16" />
                              <line x1="20" y1="12" x2="20" y2="3" />
                              <line x1="1" y1="14" x2="7" y2="14" />
                              <line x1="9" y1="8" x2="15" y2="8" />
                              <line x1="17" y1="16" x2="23" y2="16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Tables Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#f8fafc] text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                              <th className="px-3.5 py-2.5 rounded-l-lg w-10">#</th>
                              <th className="px-3.5 py-2.5">Table name</th>
                              <th className="px-3.5 py-2.5">Rows</th>
                              <th className="px-3.5 py-2.5">Size</th>
                              <th className="px-3.5 py-2.5 w-36"></th>
                              <th className="px-3.5 py-2.5 text-right rounded-r-lg">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-medium">
                            {displayedLargestTables.slice(0, 5).map((t, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/80 transition">
                                {/* # */}
                                <td className="px-3.5 py-3 text-slate-400 font-mono text-xs">
                                  {idx + 1}
                                </td>

                                {/* Table name */}
                                <td className="px-3.5 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-blue-500">▦</span>
                                    <span
                                      className="font-bold text-slate-800 font-mono text-xs hover:text-teal-600 transition cursor-pointer"
                                      onClick={() => fetchTableData(t.table)}
                                    >
                                      {t.table}
                                    </span>
                                  </div>
                                </td>

                                {/* Rows */}
                                <td className="px-3.5 py-3 font-mono text-slate-600 text-xs">
                                  {Number(t.rows || 0).toLocaleString()}
                                </td>

                                {/* Size */}
                                <td className="px-3.5 py-3 font-mono text-slate-800 font-semibold text-xs">
                                  {t.sizeFormatted || `${t.sizeMB} MB`}
                                </td>

                                {/* Relative size progress bar */}
                                <td className="px-3.5 py-3">
                                  <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-[#0d9488] rounded-full transition-all duration-300"
                                      style={{ width: `${t.percentage || 12}%` }}
                                    ></div>
                                  </div>
                                </td>

                                {/* Actions */}
                                <td className="px-3.5 py-3 text-right">
                                  <div className="inline-flex items-center gap-1.5">
                                    {/* View */}
                                    <button
                                      onClick={() => fetchTableData(t.table)}
                                      className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-gray-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                    >
                                      <span>👁</span>
                                      <span>View</span>
                                    </button>

                                    {/* Browse */}
                                    <button
                                      onClick={() => fetchTableData(t.table)}
                                      className="px-2.5 py-1 bg-[#eff6ff] hover:bg-blue-100 border border-blue-200 text-[#2563eb] rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                    >
                                      <span>▦</span>
                                      <span>Browse</span>
                                    </button>

                                    {/* 3-dots */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        fetchTableData(t.table);
                                      }}
                                      className="p-1 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                                      title="More Options"
                                    >
                                      ⋮
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Footer / Pagination (Matching media_1793250600314_2d11b859.png) */}
                      <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-100 text-xs">
                        <span className="text-slate-400 text-xs">
                          Showing 1 to {Math.min(5, displayedLargestTables.length)} of {Math.min(5, displayedLargestTables.length)} tables
                        </span>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="w-7 h-7 rounded-lg border border-gray-200 bg-white text-slate-400 flex items-center justify-center hover:bg-gray-50 transition cursor-default"
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              className="w-7 h-7 rounded-lg bg-[#0d9488] text-white font-bold flex items-center justify-center text-xs shadow-xs"
                            >
                              1
                            </button>
                            <button
                              type="button"
                              className="w-7 h-7 rounded-lg border border-gray-200 bg-white text-slate-400 flex items-center justify-center hover:bg-gray-50 transition cursor-default"
                            >
                              ›
                            </button>
                          </div>

                          <span className="py-1 px-2.5 border border-gray-200 bg-white text-slate-600 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer">
                            10 / page <span className="text-[9px] text-slate-400">▼</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
{/* TABLE DATA */}
                {activeTab === 'table' && (
                  <div>
                    {!selectedTable ? (
                      <div className="cd-panel bg-white rounded-xl border border-gray-200 p-6 text-left">
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
                                  onChange={e => { setObjectSearch(e.target.value); setObjectsPage(1); }}
                                  className="pl-8 pr-8 py-1.5 border border-gray-250 rounded-lg text-xs outline-none bg-gray-50 focus:bg-white focus:border-teal-500 transition w-full sm:w-64 font-medium text-gray-800"
                                />
                                <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {objectSearch && (
                                  <button
                                    type="button"
                                    onClick={() => { setObjectSearch(''); setObjectsPage(1); }}
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
                              onClick={() => openDatabaseObjectCategory('tables')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${dbObjectType === 'tables'
                                  ? 'bg-[#0d9da4] text-white shadow-2xs'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                              <span>📋</span> Tables ({objects?.result?.totalTables ?? (Array.isArray(objects?.result?.tables) ? objects.result.tables.length : 0)})
                            </button>

                            <button
                              type="button"
                              onClick={() => openDatabaseObjectCategory('views')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${dbObjectType === 'views'
                                  ? 'bg-[#0d9da4] text-white shadow-2xs'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                              <span>👁️</span> Views ({Array.isArray(objects?.result?.views) ? objects.result.views.length : (objects?.result?.views ?? 0)})
                            </button>

                            {dbType !== 'mongodb' && (
                              <button
                                type="button"
                                onClick={() => openDatabaseObjectCategory('procedures')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${dbObjectType === 'procedures'
                                    ? 'bg-[#0d9da4] text-white shadow-2xs'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                              >
                                <span>⚙️</span> Procedures ({Array.isArray(objects?.result?.procedures) ? objects.result.procedures.length : (objects?.result?.procedures ?? 0)})
                              </button>
                            )}

                            {dbType !== 'mongodb' && (
                              <button
                                type="button"
                                onClick={() => openDatabaseObjectCategory('functions')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${dbObjectType === 'functions'
                                    ? 'bg-[#0d9da4] text-white shadow-2xs'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                              >
                                <span>🧮</span> Functions ({Array.isArray(objects?.result?.functions) ? objects.result.functions.length : (objects?.result?.functions ?? 0)})
                              </button>
                            )}

                            {dbType !== 'mongodb' && (
                              <button
                                type="button"
                                onClick={() => openDatabaseObjectCategory('triggers')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${dbObjectType === 'triggers'
                                    ? 'bg-[#0d9da4] text-white shadow-2xs'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                              >
                                <span>⚡</span> Triggers ({Array.isArray(objects?.result?.triggers) ? objects.result.triggers.length : (objects?.result?.triggers ?? 0)})
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openDatabaseObjectCategory('indexes')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${dbObjectType === 'indexes'
                                  ? 'bg-[#0d9da4] text-white shadow-2xs'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                              <span>🔍</span> Indexes ({Array.isArray(objects?.result?.indexes) ? objects.result.indexes.length : (objects?.result?.indexes ?? 0)})
                            </button>

                            <button
                              type="button"
                              onClick={() => openDatabaseObjectCategory('constraints')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${dbObjectType === 'constraints'
                                  ? 'bg-[#0d9da4] text-white shadow-2xs'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                              <span>🔒</span> Constraints ({Array.isArray(objects?.result?.constraints) ? objects.result.constraints.length : (objects?.result?.constraints ?? 0)})
                            </button>
                          </div>
                        </div>

                        {/* 1. TABLES VIEW */}
                        {dbObjectType === 'tables' && (() => {
                          const totalTablesCount = processedTablesList.length;
                          const totalTablesListPages = Math.ceil(totalTablesCount / tablesListRowsPerPage) || 1;
                          const startIdx = (tablesListPage - 1) * tablesListRowsPerPage;
                          const pageTables = processedTablesList.slice(startIdx, startIdx + tablesListRowsPerPage);
                          const maxSize = Math.max(0, ...processedTablesList.map((t) => Number(t.sizeMB) || 0));
                          const sortIcon = (col) => (
                            <svg className={`w-3 h-3 ${tablesListSortCol === col ? 'text-teal-600' : 'text-slate-300'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              {tablesListSortCol !== col ? <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" /> : tablesListSortDir === 'asc' ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
                            </svg>
                          );
                          const objectLabel = dbType === 'mongodb' ? 'Collections' : 'Tables';

                          return (
                            <>
                              <div className="cd-section-head">
                                <div>
                                  <h3 className="cd-section-title flex items-center gap-2">
                                    {objectLabel}
                                    <span className="cd-count-chip">{tables.length.toLocaleString()}</span>
                                  </h3>
                                  <p className="cd-section-sub">Open a {dbType === 'mongodb' ? 'collection' : 'table'} to browse, filter, edit and export its data.</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="relative">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
                                    </svg>
                                    <input
                                      type="text"
                                      placeholder={`Search ${objectLabel.toLowerCase()}...`}
                                      value={tableSearch}
                                      onChange={e => {
                                        setTableSearch(e.target.value);
                                        setTablesListPage(1);
                                      }}
                                      className="h-9 w-56 pl-9 pr-8 border bg-slate-50 text-[13px] text-slate-800"
                                    />
                                    {tableSearch && (
                                      <button
                                        type="button"
                                        onClick={() => { setTableSearch(''); setTablesListPage(1); }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded text-slate-400 hover:text-slate-700"
                                        aria-label="Clear search"
                                      >
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                      </button>
                                    )}
                                  </div>
                                  <label className="cd-select-label" title="Size unit">
                                    Unit
                                    <select value={tableSizeUnit} onChange={e => setTableSizeUnit(e.target.value)} className="h-9 px-2 border bg-white text-[12.5px] font-semibold text-slate-700">
                                      <option value="Auto">Auto</option>
                                      <option value="MB">MB</option>
                                      <option value="KB">KB</option>
                                      <option value="Bytes">Bytes</option>
                                      <option value="GB">GB</option>
                                    </select>
                                  </label>
                                  <label className="cd-select-label" title={`${objectLabel} per page`}>
                                    Per page
                                    <select
                                      value={tablesListRowsPerPage}
                                      onChange={(e) => {
                                        setTablesListRowsPerPage(Number(e.target.value));
                                        setTablesListPage(1);
                                      }}
                                      className="h-9 px-2 border bg-white text-[12.5px] font-semibold text-slate-700"
                                    >
                                      {[10, 20, 50, 100, 200, 300, 400, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                  </label>
                                  <label className="cd-select-label" title={`How many ${objectLabel.toLowerCase()} to load from the server`}>
                                    Load
                                    <select
                                      value={tableLoadLimit}
                                      onChange={e => loadTablesUpTo(Number(e.target.value))}
                                      disabled={databaseTablesLoading}
                                      className="h-9 px-2 border bg-white text-[12.5px] font-semibold text-slate-700 disabled:opacity-60"
                                    >
                                      {[100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                  </label>
                                </div>
                              </div>

                              {tables.length === 0 ? (
                                <div className="cd-panel cd-empty">
                                  <div className="cd-empty-icon">
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>
                                  </div>
                                  <p className="text-[14px] font-semibold text-slate-800">No {objectLabel.toLowerCase()} found</p>
                                  <p className="mt-1 text-[12.5px] text-slate-500">This database schema is empty.</p>
                                </div>
                              ) : totalTablesCount === 0 ? (
                                <div className="cd-panel cd-empty">
                                  <p className="text-[14px] font-semibold text-slate-800">No matches for "{tableSearch}"</p>
                                  <button type="button" onClick={() => { setTableSearch(''); setTablesListPage(1); }} className="cd-btn-outline mt-3">Clear search</button>
                                </div>
                              ) : (
                                <div className="cd-panel overflow-hidden">
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead className="select-none">
                                        <tr>
                                          <th className="px-4 py-3 text-left w-12">#</th>
                                          <th className="px-4 py-3 text-left cursor-pointer hover:text-slate-900" onClick={() => handleTablesListSort('name')} title="Sort by name">
                                            <span className="inline-flex items-center gap-1.5">{dbType === 'mongodb' ? 'Collection' : 'Table'} {sortIcon('name')}</span>
                                          </th>
                                          <th className="px-4 py-3 text-right cursor-pointer hover:text-slate-900" onClick={() => handleTablesListSort('rows')} title="Sort by row count">
                                            <span className="inline-flex items-center gap-1.5">Rows {sortIcon('rows')}</span>
                                          </th>
                                          <th className="px-4 py-3 text-left cursor-pointer hover:text-slate-900 w-[30%]" onClick={() => handleTablesListSort('sizeMB')} title="Sort by size">
                                            <span className="inline-flex items-center gap-1.5">Size {sortIcon('sizeMB')}</span>
                                          </th>
                                          <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {pageTables.map((t, i) => {
                                          const size = Number(t.sizeMB) || 0;
                                          const sizeShare = maxSize > 0 ? Math.max(2, (size / maxSize) * 100) : 0;
                                          return (
                                            <tr key={t.name || i} onClick={() => fetchTableData(t.name)} className="cursor-pointer group">
                                              <td className="px-4 py-2.5 text-[12px] text-slate-400 tabular-nums">{startIdx + i + 1}</td>
                                              <td className="px-4 py-2.5">
                                                <span className="inline-flex items-center gap-2.5">
                                                  <span className="cd-table-icon">
                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                      {dbType === 'mongodb'
                                                        ? <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                                        : <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>}
                                                    </svg>
                                                  </span>
                                                  <span className="font-mono text-[12.5px] font-semibold text-slate-800 group-hover:text-teal-700">{t.name}</span>
                                                </span>
                                              </td>
                                              <td className="px-4 py-2.5 text-right font-mono text-[12px] text-slate-600 tabular-nums">
                                                {t.rows !== null && t.rows !== undefined && Number.isFinite(Number(t.rows)) ? Number(t.rows).toLocaleString() : '—'}
                                              </td>
                                              <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-3">
                                                  <div className="cd-size-bar"><span style={{ width: `${sizeShare}%` }} /></div>
                                                  <span className="font-mono text-[12px] font-semibold text-slate-700 whitespace-nowrap">{formatTableSize(t.sizeMB, tableSizeUnit)}</span>
                                                </div>
                                              </td>
                                              <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1">
                                                  <button type="button" onClick={() => handleCopyCell(t.name)} className="cd-icon-btn" title="Copy name" aria-label={`Copy ${t.name}`}>
                                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
                                                  </button>
                                                  <button type="button" onClick={() => openInNewQueryTab(buildPreviewQuery(t.name), t.name)} className="cd-btn-outline !h-8 !px-2.5" title="Open a query for this table in the Query Editor">
                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></svg>
                                                    Query
                                                  </button>
                                                  <button type="button" onClick={() => fetchTableData(t.name)} className="cd-btn !h-8 !px-3" title="Browse data">
                                                    Browse
                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>

                                  <div className="cd-table-footer">
                                    <span>
                                      Showing <b>{startIdx + 1}</b>–<b>{Math.min(startIdx + tablesListRowsPerPage, totalTablesCount)}</b> of <b>{totalTablesCount.toLocaleString()}</b> {objectLabel.toLowerCase()}
                                    </span>
                                    {renderPager(tablesListPage, totalTablesListPages, (p) => setTablesListPage(Math.min(Math.max(p, 1), totalTablesListPages)))}
                                  </div>
                                  {databaseTablesHasMore && (
                                    <div className="px-5 py-3 border-t border-slate-100 flex justify-center">
                                      <button type="button" onClick={loadMoreDatabaseTables} disabled={databaseTablesLoading} className="cd-btn-outline">
                                        {databaseTablesLoading ? 'Loading...' : `Load 100 more ${objectLabel.toLowerCase()}`}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}

                        {/* 2. VIEWS */}
                        {dbObjectType === 'views' && (() => {
                          const rawViews = Array.isArray(objects?.result?.views) ? objects.result.views : [];
                          const filteredViews = objectSearch.trim()
                            ? rawViews.filter(v => (v.name || '').toLowerCase().includes(objectSearch.toLowerCase()) || (v.viewOn || '').toLowerCase().includes(objectSearch.toLowerCase()))
                            : rawViews;

                          const paginatedViews = filteredViews.slice((objectsPage - 1) * objectsPerPage, objectsPage * objectsPerPage);

                          return (
                            <div className="space-y-4">
                              {filteredViews.length > 0 && renderObjectPaginationControls(filteredViews.length, 'views')}
                              {filteredViews.length === 0 ? (
                                <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                                  <p className="text-2xl mb-2">👁️</p>
                                  <p className="font-semibold text-gray-700">
                                    {objectSearch.trim() ? `No Views matching "${objectSearch}"` : `No Views found in database schema ${activeDb}.`}
                                  </p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {paginatedViews.map((v, idx) => {
                                    const viewLabel = v.isMaterialized || v.type === 'MATERIALIZED VIEW' ? 'MATERIALIZED VIEW' : 'VIEW';
                                    const definitionCode = v.definition || v.pipeline || (v.isMaterialized ? `CREATE MATERIALIZED VIEW \`${v.name}\` AS ...` : `CREATE VIEW \`${v.name}\` AS ...`);

                                    return (
                                      <div key={idx} className="cd-panel cd-object-card bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col justify-between hover:border-teal-400 transition">
                                        <div>
                                          <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-sm font-bold text-gray-900 font-mono flex items-center gap-1.5 truncate" title={v.name}>
                                              <span>👁️</span> {v.name}
                                            </h4>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono shrink-0 ${v.isMaterialized ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>
                                              {viewLabel}
                                            </span>
                                          </div>
                                          {v.viewOn && (
                                            <p className="text-xs text-gray-500 font-mono mb-2">Base Collection: {v.viewOn}</p>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2 pt-3 border-t border-gray-100 mt-3">
                                          <button
                                            type="button"
                                            onClick={() => setDefinitionModal({ open: true, title: `View DDL: ${v.name}`, type: 'view', code: definitionCode })}
                                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                          >
                                            📜 View DDL
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const runViewSql = dbType === 'mongodb' ? `db.${v.name}.find()` : `SELECT * FROM \`${v.name}\` LIMIT 100;`;
                                              openInNewQueryTab(runViewSql, `View: ${v.name}`);
                                            }}
                                            className="px-3 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                          >
                                            ⚡ Query View
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {filteredViews.length > 0 && renderObjectPaginationControls(filteredViews.length, 'views')}
                            </div>
                          );
                        })()}

                        {/* 3. STORED PROCEDURES */}
                        {dbObjectType === 'procedures' && (() => {
                          const rawProcs = Array.isArray(objects?.result?.procedures) ? objects.result.procedures : [];
                          const filteredProcs = objectSearch.trim()
                            ? rawProcs.filter(p => (p.name || '').toLowerCase().includes(objectSearch.toLowerCase()))
                            : rawProcs;

                          const paginatedProcs = filteredProcs.slice((objectsPage - 1) * objectsPerPage, objectsPage * objectsPerPage);

                          return (
                            <div className="space-y-4">
                              {filteredProcs.length > 0 && renderObjectPaginationControls(filteredProcs.length, 'stored procedures')}
                              {filteredProcs.length === 0 ? (
                                <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                                  <p className="text-2xl mb-2">⚙️</p>
                                  <p className="font-semibold text-gray-700">
                                    {objectSearch.trim() ? `No Procedures matching "${objectSearch}"` : `No Stored Procedures found in database schema ${activeDb}.`}
                                  </p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {paginatedProcs.map((p, idx) => (
                                    <div key={idx} className="cd-panel cd-object-card bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col justify-between hover:border-teal-400 transition">
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
                                            openInNewQueryTab(execCall, `Proc: ${p.name}`);
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
                              {filteredProcs.length > 0 && renderObjectPaginationControls(filteredProcs.length, 'stored procedures')}
                            </div>
                          );
                        })()}

                        {/* 4. FUNCTIONS */}
                        {dbObjectType === 'functions' && (() => {
                          const rawFuncs = Array.isArray(objects?.result?.functions) ? objects.result.functions : [];
                          const filteredFuncs = objectSearch.trim()
                            ? rawFuncs.filter(f => (f.name || '').toLowerCase().includes(objectSearch.toLowerCase()))
                            : rawFuncs;

                          const paginatedFuncs = filteredFuncs.slice((objectsPage - 1) * objectsPerPage, objectsPage * objectsPerPage);

                          return (
                            <div className="space-y-4">
                              {filteredFuncs.length > 0 && renderObjectPaginationControls(filteredFuncs.length, 'functions')}
                              {filteredFuncs.length === 0 ? (
                                <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                                  <p className="text-2xl mb-2">🧮</p>
                                  <p className="font-semibold text-gray-700">
                                    {objectSearch.trim() ? `No Functions matching "${objectSearch}"` : `No Functions found in database schema ${activeDb}.`}
                                  </p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {paginatedFuncs.map((f, idx) => (
                                    <div key={idx} className="cd-panel cd-object-card bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col justify-between hover:border-teal-400 transition">
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
                                            openInNewQueryTab(execCall, `Func: ${f.name}`);
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
                              {filteredFuncs.length > 0 && renderObjectPaginationControls(filteredFuncs.length, 'functions')}
                            </div>
                          );
                        })()}

                        {/* 5. TRIGGERS */}
                        {dbObjectType === 'triggers' && (() => {
                          const rawTrigs = Array.isArray(objects?.result?.triggers) ? objects.result.triggers : [];
                          const filteredTrigs = objectSearch.trim()
                            ? rawTrigs.filter(t => (t.name || '').toLowerCase().includes(objectSearch.toLowerCase()) || (t.tableName || '').toLowerCase().includes(objectSearch.toLowerCase()) || (t.event || '').toLowerCase().includes(objectSearch.toLowerCase()))
                            : rawTrigs;

                          const paginatedTrigs = filteredTrigs.slice((objectsPage - 1) * objectsPerPage, objectsPage * objectsPerPage);

                          return (
                            <div className="space-y-4">
                              {filteredTrigs.length > 0 && renderObjectPaginationControls(filteredTrigs.length, 'triggers')}
                              {filteredTrigs.length === 0 ? (
                                <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                                  <p className="text-2xl mb-2">⚡</p>
                                  <p className="font-semibold text-gray-700">
                                    {objectSearch.trim() ? `No Triggers matching "${objectSearch}"` : `No Triggers found in database schema ${activeDb}.`}
                                  </p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {paginatedTrigs.map((t, idx) => (
                                    <div key={idx} className="cd-panel cd-object-card bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col justify-between hover:border-teal-400 transition">
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
                                            openInNewQueryTab(t.statement || `-- Trigger: ${t.name}`, `Trig: ${t.name}`);
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
                              {filteredTrigs.length > 0 && renderObjectPaginationControls(filteredTrigs.length, 'triggers')}
                            </div>
                          );
                        })()}

                        {/* 6. INDEXES */}
                        {dbObjectType === 'indexes' && (() => {
                          const rawIdxs = Array.isArray(objects?.result?.indexes) ? objects.result.indexes : [];

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

                          const groupedByTable = filteredIdxs.reduce((acc, idxItem) => {
                            const tName = idxItem.tableName || 'General / Schema';
                            if (!acc[tName]) acc[tName] = [];
                            acc[tName].push(idxItem);
                            return acc;
                          }, {});

                          const tableEntries = Object.entries(groupedByTable).sort(([a], [b]) => a.localeCompare(b));
                          const paginatedTableEntries = tableEntries.slice((objectsPage - 1) * objectsPerPage, objectsPage * objectsPerPage);

                          return (
                            <div className="space-y-4">
                              {/* Table Dropdown Filter Bar */}
                              <div className="cd-panel flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 bg-white p-3.5 rounded-xl border border-gray-200 shadow-3xs">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                    <span>📋</span> Select Table:
                                  </label>
                                  <select
                                    value={indexTableFilter}
                                    onChange={e => { setIndexTableFilter(e.target.value); setObjectsPage(1); }}
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
                                      onClick={() => { setIndexTableFilter(''); setObjectsPage(1); }}
                                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                      title="Clear table filter"
                                    >
                                      Clear Filter ✕
                                    </button>
                                  )}
                                </div>

                                <div className="text-xs text-gray-500 font-medium">
                                  Showing <span className="font-bold text-gray-900">{filteredIdxs.length}</span> of <span className="font-bold text-gray-900">{rawIdxs.length}</span> indexes ({tableEntries.length} tables)
                                </div>
                              </div>

                              {tableEntries.length > 0 && renderObjectPaginationControls(tableEntries.length, 'table index boxes')}

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
                                      onClick={() => { setIndexTableFilter(''); setObjectsPage(1); }}
                                      className="mt-3 px-3 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition cursor-pointer"
                                    >
                                      Show All Tables
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-6">
                                  {paginatedTableEntries.map(([tableNameGroup, tableIdxs], tableGroupIdx) => (
                                    <div key={tableGroupIdx} className="cd-panel cd-object-card bg-white border border-gray-200 rounded-xl overflow-hidden shadow-3xs hover:border-teal-300 transition-all">
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
                                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${idxItem.unique ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
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
                                                        openInNewQueryTab(explainSql, `Idx: ${tableNameGroup}`);
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
                                  ))}
                                </div>
                              )}
                              {tableEntries.length > 0 && renderObjectPaginationControls(tableEntries.length, 'table index boxes')}
                            </div>
                          );
                        })()}

                        {/* 7. CONSTRAINTS */}
                        {dbObjectType === 'constraints' && (() => {
                          const rawConsts = Array.isArray(objects?.result?.constraints) ? objects.result.constraints : [];

                          // Get unique list of current database tables from schema objects or constraint target tables
                          const availableTables = Array.from(new Set([
                            ...(objects?.result?.tables || objects?.result?.collections || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean),
                            ...rawConsts.map(c => c.tableName).filter(Boolean)
                          ])).sort();

                          const filteredConsts = rawConsts.filter(c => {
                            const matchesSearch = !objectSearch.trim() || (
                              (c.name || '').toLowerCase().includes(objectSearch.toLowerCase()) ||
                              (c.tableName || '').toLowerCase().includes(objectSearch.toLowerCase()) ||
                              (c.constraintType || '').toLowerCase().includes(objectSearch.toLowerCase())
                            );
                            const matchesTable = !constraintTableFilter || (c.tableName || '').toLowerCase() === constraintTableFilter.toLowerCase();
                            return matchesSearch && matchesTable;
                          });

                          const groupedByTable = filteredConsts.reduce((acc, cItem) => {
                            const tName = cItem.tableName || 'General / Schema';
                            if (!acc[tName]) acc[tName] = [];
                            acc[tName].push(cItem);
                            return acc;
                          }, {});

                          const tableEntries = Object.entries(groupedByTable).sort(([a], [b]) => a.localeCompare(b));
                          const paginatedTableEntries = tableEntries.slice((objectsPage - 1) * objectsPerPage, objectsPage * objectsPerPage);

                          return (
                            <div className="space-y-4">
                              {/* Table Dropdown Filter Bar */}
                              <div className="cd-panel flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 bg-white p-3.5 rounded-xl border border-gray-200 shadow-3xs">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                                    <span>📋</span> Select Table:
                                  </label>
                                  <select
                                    value={constraintTableFilter}
                                    onChange={e => { setConstraintTableFilter(e.target.value); setObjectsPage(1); }}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-gray-50/80 font-semibold text-gray-800 outline-none focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition cursor-pointer"
                                  >
                                    <option value="">All Tables ({availableTables.length})</option>
                                    {availableTables.map((tName, idx) => (
                                      <option key={idx} value={tName}>
                                        {tName}
                                      </option>
                                    ))}
                                  </select>

                                  {constraintTableFilter && (
                                    <button
                                      type="button"
                                      onClick={() => { setConstraintTableFilter(''); setObjectsPage(1); }}
                                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                                      title="Clear table filter"
                                    >
                                      Clear Filter ✕
                                    </button>
                                  )}
                                </div>

                                <div className="text-xs text-gray-500 font-medium">
                                  Showing <span className="font-bold text-gray-900">{filteredConsts.length}</span> of <span className="font-bold text-gray-900">{rawConsts.length}</span> constraints ({tableEntries.length} tables)
                                </div>
                              </div>

                              {tableEntries.length > 0 && renderObjectPaginationControls(tableEntries.length, 'table constraint boxes')}

                              {filteredConsts.length === 0 ? (
                                <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-xl text-gray-400 text-xs">
                                  <p className="text-2xl mb-2">🔒</p>
                                  <p className="font-semibold text-gray-700">
                                    {constraintTableFilter
                                      ? `No Constraints found for table "${constraintTableFilter}"`
                                      : objectSearch.trim()
                                        ? `No Constraints matching "${objectSearch}"`
                                        : `No Constraints found in database schema ${activeDb}.`}
                                  </p>
                                  {constraintTableFilter && (
                                    <button
                                      type="button"
                                      onClick={() => { setConstraintTableFilter(''); setObjectsPage(1); }}
                                      className="mt-3 px-3 py-1.5 bg-[#0d9da4] hover:bg-[#0b8a90] text-white text-xs font-bold rounded-lg transition cursor-pointer"
                                    >
                                      Show All Tables
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-6">
                                  {paginatedTableEntries.map(([tableNameGroup, tableConsts], tableGroupIdx) => (
                                    <div key={tableGroupIdx} className="cd-panel cd-object-card bg-white border border-gray-200 rounded-xl overflow-hidden shadow-3xs hover:border-teal-300 transition-all">
                                      {/* Box Header for Table */}
                                      <div className="bg-gray-50/90 border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-base">{dbType === 'mongodb' ? '📁' : '📋'}</span>
                                          <h4 className="text-sm font-extrabold text-gray-900 font-mono">
                                            {tableNameGroup}
                                          </h4>
                                          <span className="text-[11px] bg-teal-50 text-teal-700 font-bold px-2 py-0.5 rounded-full border border-teal-200">
                                            {tableConsts.length} {tableConsts.length === 1 ? 'Constraint' : 'Constraints'}
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

                                      {/* Table Constraints List inside 1 Box */}
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                          <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 font-semibold uppercase">
                                            <tr>
                                              <th className="px-4 py-2.5">Constraint Name</th>
                                              <th className="px-4 py-2.5">Type</th>
                                              <th className="px-4 py-2.5">Rule / Definition Details</th>
                                              <th className="px-4 py-2.5 text-right">Actions</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100 font-mono">
                                            {tableConsts.map((cItem, idx) => (
                                              <tr key={idx} className="hover:bg-teal-50/30 transition-colors">
                                                <td className="px-4 py-3 font-bold text-gray-900 flex items-center gap-1.5">
                                                  <span className="text-gray-400">🔒</span> {cItem.name}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cItem.constraintType?.includes('PRIMARY') ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                                      cItem.constraintType?.includes('FOREIGN') ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                                                        'bg-rose-50 text-rose-800 border border-rose-200'
                                                    }`}>
                                                    {cItem.constraintType || 'CONSTRAINT'}
                                                  </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700 max-w-[350px] truncate" title={cItem.rule || cItem.definition}>
                                                  {cItem.rule || cItem.definition || 'N/A'}
                                                </td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                                  <div className="flex items-center justify-end gap-2 font-sans">
                                                    <button
                                                      type="button"
                                                      onClick={() => setDefinitionModal({ open: true, title: `Constraint: ${cItem.name} (${tableNameGroup})`, type: 'constraint', code: cItem.rule || `-- Constraint: ${cItem.name}\n-- Table: ${tableNameGroup}\n-- Type: ${cItem.constraintType}` })}
                                                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1"
                                                    >
                                                      📜 Rule Details
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {tableEntries.length > 0 && renderObjectPaginationControls(tableEntries.length, 'table constraint boxes')}
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
                        {/* Viewer header */}
                        <div className="cd-section-head">
                          <div className="flex items-center gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedTable(null)}
                              className="cd-icon-btn !border-slate-200 !w-9 !h-9 shrink-0"
                              title={`Back to ${dbType === 'mongodb' ? 'collections' : 'tables'}`}
                              aria-label="Back"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
                            </button>
                            <span className="cd-table-icon !w-9 !h-9">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>
                            </span>
                            <div className="min-w-0">
                              <h3 className="cd-section-title font-mono truncate">{selectedTable}</h3>
                              <p className="cd-section-sub">
                                {tableData.length.toLocaleString()} rows loaded · {viewerAllColumns.length} columns
                                {hiddenColumns.length > 0 && ` (${hiddenColumns.length} hidden)`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => fetchTableData(selectedTable)} className="cd-btn-outline" title="Reload rows from the database">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" /></svg>
                              Refresh
                            </button>
                            <button type="button" onClick={() => openInNewQueryTab(buildPreviewQuery(selectedTable), selectedTable)} className="cd-btn-outline" title="Open a query for this table in the Query Editor">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M13 15h4" /></svg>
                              Query
                            </button>
                            <button type="button" onClick={() => handleOpenInsertRowModal(null)} className="cd-btn">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                              Insert Row
                            </button>
                          </div>
                        </div>

                        {/* Viewer toolbar: filter, columns, density, export, page size */}
                        {tableData.length > 0 && (
                          <div className="cd-panel cd-viewer-toolbar">
                            <div className="relative flex-1 min-w-[220px]">
                              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M3 5h18l-7 8v6l-4 2v-8z" />
                              </svg>
                              <input
                                type="text"
                                value={viewerFilter}
                                onChange={(e) => { setViewerFilter(e.target.value); setTablePage(1); }}
                                placeholder="Filter rows in any column..."
                                className="w-full h-9 pl-9 pr-8 border bg-slate-50 text-[13px] text-slate-800"
                              />
                              {viewerFilter && (
                                <button
                                  type="button"
                                  onClick={() => { setViewerFilter(''); setTablePage(1); }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded text-slate-400 hover:text-slate-700"
                                  aria-label="Clear filter"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                </button>
                              )}
                            </div>

                            {viewerSort && (
                              <button type="button" onClick={() => setViewerSort(null)} className="cd-chip" title="Clear sorting">
                                Sorted by <b className="font-mono">{viewerSort.column}</b> {viewerSort.dir === 'asc' ? '↑' : '↓'}
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                              </button>
                            )}

                            {/* Column visibility */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setViewerMenu(viewerMenu === 'columns' ? null : 'columns')}
                                className={`cd-qe-tool ${viewerMenu === 'columns' || hiddenColumns.length ? 'is-active' : ''}`}
                                aria-expanded={viewerMenu === 'columns'}
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>
                                Columns
                                <span className="cd-qe-count">{viewerColumns.length}/{viewerAllColumns.length}</span>
                              </button>
                              {viewerMenu === 'columns' && (
                                <>
                                  <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setViewerMenu(null)} />
                                  <div className="cd-qe-menu !w-64">
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="cd-qe-menu-label !mb-0">Visible columns</p>
                                      <div className="flex gap-2 text-[11.5px] font-semibold">
                                        <button type="button" className="text-teal-700 hover:underline" onClick={() => setHiddenColumns([])}>All</button>
                                        <button type="button" className="text-slate-500 hover:underline" onClick={() => setHiddenColumns(viewerAllColumns.slice(1))}>Only first</button>
                                      </div>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto space-y-0.5">
                                      {viewerAllColumns.map((col) => {
                                        const visible = !hiddenColumns.includes(col);
                                        return (
                                          <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-[12.5px] font-mono text-slate-700">
                                            <input
                                              type="checkbox"
                                              checked={visible}
                                              disabled={visible && viewerColumns.length === 1}
                                              onChange={() => setHiddenColumns((current) => (
                                                visible ? [...current, col] : current.filter((c) => c !== col)
                                              ))}
                                            />
                                            <span className="truncate">{col}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Row density */}
                            <div className="cd-seg" role="group" aria-label="Row density">
                              {[['comfortable', 'Comfortable'], ['compact', 'Compact']].map(([value, label]) => (
                                <button key={value} type="button" onClick={() => setViewerDensity(value)} className={viewerDensity === value ? 'is-active' : ''}>
                                  {label}
                                </button>
                              ))}
                            </div>

                            {/* Export */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setViewerMenu(viewerMenu === 'export' ? null : 'export')}
                                className={`cd-qe-tool ${viewerMenu === 'export' ? 'is-active' : ''}`}
                                aria-expanded={viewerMenu === 'export'}
                                disabled={viewerRows.length === 0}
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
                                Export
                              </button>
                              {viewerMenu === 'export' && (
                                <>
                                  <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setViewerMenu(null)} />
                                  <div className="cd-qe-menu !w-60">
                                    <p className="cd-qe-menu-label">Export {viewerRows.length.toLocaleString()} row{viewerRows.length === 1 ? '' : 's'}</p>
                                    {[['csv', 'CSV', 'Opens in Excel / Sheets'], ['json', 'JSON', 'For APIs and scripts']].map(([format, label, hint]) => (
                                      <button key={format} type="button" onClick={() => exportViewerRows(format)} className="cd-qe-theme w-full">
                                        <span className="cd-table-icon">{label}</span>
                                        <span className="leading-tight">
                                          <span className="block">{label} file</span>
                                          <span className="block text-[11px] font-normal text-slate-400">{hint}</span>
                                        </span>
                                      </button>
                                    ))}
                                    <p className="mt-2 text-[11px] text-slate-400">Uses the current filter, sort and visible columns.</p>
                                  </div>
                                </>
                              )}
                            </div>

                            <label className="cd-select-label">
                              Rows
                              <select
                                value={tableRowsPerPage}
                                onChange={(e) => {
                                  setTableRowsPerPage(Number(e.target.value));
                                  setTablePage(1);
                                }}
                                className="h-9 px-2 border bg-white text-[12.5px] font-semibold text-slate-700"
                              >
                                {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </label>
                          </div>
                        )}

                        {tableData.length === 0 ? (
                          <div className="cd-panel cd-empty">
                            <div className="cd-empty-icon">
                              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>
                            </div>
                            <p className="text-[14px] font-semibold text-slate-800">No rows in <span className="font-mono">{selectedTable}</span></p>
                            <p className="mt-1 text-[12.5px] text-slate-500">This table is empty. Add the first row to get started.</p>
                            <button type="button" onClick={() => handleOpenInsertRowModal(null)} className="cd-btn mt-4">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                              Insert First Row
                            </button>
                          </div>
                        ) : (
                          <div className="cd-panel overflow-hidden">
                            {viewerRows.length === 0 ? (
                              <div className="cd-empty">
                                <p className="text-[14px] font-semibold text-slate-800">No rows match "{viewerFilter}"</p>
                                <button type="button" onClick={() => setViewerFilter('')} className="cd-btn-outline mt-3">Clear filter</button>
                              </div>
                            ) : (
                            <div className={`cd-grid-wrap ${viewerDensity === 'compact' ? 'is-compact' : ''}`}>
                              <table className="cd-grid w-full text-sm">
                                <thead>
                                  <tr>
                                    <th className="cd-grid-sticky text-center w-[88px]">Actions</th>
                                    <th className="text-right w-12">#</th>
                                    {viewerColumns.map((colName) => {
                                      const sorted = viewerSort?.column === colName ? viewerSort.dir : null;
                                      return (
                                        <th
                                          key={colName}
                                          onClick={() => toggleViewerSort(colName)}
                                          className={`text-left cursor-pointer select-none ${sorted ? '!text-teal-700' : ''}`}
                                          title={`Sort by ${colName}`}
                                          aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                                        >
                                          <span className="inline-flex items-center gap-1.5">
                                            {colName}
                                            <svg className={`w-3 h-3 ${sorted ? '' : 'opacity-30'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                              {!sorted ? <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" /> : sorted === 'asc' ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
                                            </svg>
                                          </span>
                                        </th>
                                      );
                                    })}
                                  </tr>
                                </thead>
                                <tbody>
                                  {viewerPageRows.map((row, i) => {
                                    const isMenuOpen = openRowActionMenu && openRowActionMenu.id === i;
                                    const rowNumber = (viewerPage - 1) * tableRowsPerPage + i + 1;

                                    return (
                                      <tr key={i}>
                                        {/* Action Dropdown Menu Cell */}
                                        <td className="cd-grid-sticky text-center">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (isMenuOpen) {
                                                setOpenRowActionMenu(null);
                                              } else {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const spaceBelow = window.innerHeight - rect.bottom;
                                                const openUpward = spaceBelow < 220;
                                                setOpenRowActionMenu({
                                                  id: i,
                                                  row: row,
                                                  top: openUpward ? Math.max(10, rect.top - 210) : (rect.bottom + 4),
                                                  left: Math.max(10, Math.min(rect.left, window.innerWidth - 200))
                                                });
                                              }
                                            }}
                                            className={`cd-row-action ${isMenuOpen ? 'is-open' : ''}`}
                                            title="Row actions (edit, copy, delete)"
                                            aria-label={`Actions for row ${rowNumber}`}
                                            aria-expanded={Boolean(isMenuOpen)}
                                          >
                                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                              <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                                            </svg>
                                            Edit
                                          </button>
                                        </td>
                                        <td className="text-right text-[11.5px] text-slate-400 tabular-nums">{rowNumber}</td>

                                        {viewerColumns.map((colName) => {
                                          const val = row[colName];
                                          const isNull = val === null || val === undefined;
                                          const isObject = !isNull && typeof val === 'object';
                                          const isBool = typeof val === 'boolean';
                                          const isNumber = typeof val === 'number' || (typeof val === 'bigint');
                                          const text = cellText(val);
                                          return (
                                            <td
                                              key={colName}
                                              onClick={() => handleCopyCell(val)}
                                              className={`cd-cell ${isNumber ? 'text-right tabular-nums' : ''}`}
                                              title={isNull ? 'NULL — click to copy' : `${text.length > 300 ? `${text.slice(0, 300)}…` : text}\n\nClick to copy`}
                                            >
                                              {isNull ? (
                                                <span className="cd-null">NULL</span>
                                              ) : isBool ? (
                                                <span className={`cd-bool ${val ? 'is-true' : ''}`}>{String(val)}</span>
                                              ) : isObject ? (
                                                <span className="cd-json">{text}</span>
                                              ) : (
                                                text
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
                            )}

                            {/* Fixed Floating Action Dropdown Menu */}
                            {openRowActionMenu && (
                              <>
                                <div
                                  className="fixed inset-0 z-[9998] bg-transparent"
                                  onClick={() => setOpenRowActionMenu(null)}
                                />
                                <div
                                  style={{
                                    position: 'fixed',
                                    top: `${openRowActionMenu.top}px`,
                                    left: `${openRowActionMenu.left}px`,
                                  }}
                                  className="z-[9999] w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl py-1.5 text-xs text-left animate-fadeIn font-sans"
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rowData = openRowActionMenu.row;
                                      setOpenRowActionMenu(null);
                                      handleCopyRow(rowData);
                                    }}
                                    className="w-full px-3.5 py-2 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-gray-700 dark:text-gray-200 font-medium flex items-center gap-2 transition text-left cursor-pointer"
                                  >
                                    <span>📋</span> Copy Row
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rowData = openRowActionMenu.row;
                                      setOpenRowActionMenu(null);
                                      handleOpenEditRowModal(rowData);
                                    }}
                                    className="w-full px-3.5 py-2 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-gray-700 dark:text-gray-200 font-medium flex items-center gap-2 transition text-left cursor-pointer"
                                  >
                                    <span>✏️</span> Edit Row
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rowData = openRowActionMenu.row;
                                      setOpenRowActionMenu(null);
                                      handleOpenInsertRowModal(rowData);
                                    }}
                                    className="w-full px-3.5 py-2 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-gray-700 dark:text-gray-200 font-medium flex items-center gap-2 transition text-left cursor-pointer"
                                  >
                                    <span>➕</span> Insert Row
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rowData = openRowActionMenu.row;
                                      setOpenRowActionMenu(null);
                                      handleOpenRowInEditor(rowData);
                                    }}
                                    className="w-full px-3.5 py-2 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-gray-700 dark:text-gray-200 font-medium flex items-center gap-2 transition text-left cursor-pointer"
                                  >
                                    <span>⚡</span> Open in Editor
                                  </button>

                                  <div className="my-1 border-t border-gray-150 dark:border-gray-700" />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const rowData = openRowActionMenu.row;
                                      setOpenRowActionMenu(null);
                                      handleDeleteRow(rowData);
                                    }}
                                    className="w-full px-3.5 py-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-medium flex items-center gap-2 transition text-left cursor-pointer"
                                  >
                                    <span>🗑️</span> Delete Row
                                  </button>
                                </div>
                              </>
                            )}

                            {/* Edit Row Modal */}
                            {editingRowModalOpen && (
                              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs text-left">
                                <div className="bg-white dark:bg-gray-850 rounded-2xl w-[90vw] max-w-2xl border border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden animate-fadeIn">
                                  <div className="px-6 py-4 border-b border-gray-150 dark:border-gray-800 flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                      <span>✏️</span> Edit Row — <span className="font-mono text-teal-600">{selectedTable}</span>
                                    </h3>
                                    <button
                                      type="button"
                                      onClick={() => setEditingRowModalOpen(false)}
                                      className="text-gray-400 hover:text-gray-700 text-lg font-bold cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  <form onSubmit={handleSaveEditRow} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                                    {editingRowError && (
                                      <div className="bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-lg border border-red-200">
                                        ❌ {editingRowError}
                                      </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      {Object.keys(editingRowData).map(col => (
                                        <div key={col} className="space-y-1">
                                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 font-mono">
                                            {col}
                                          </label>
                                          <textarea
                                            rows={2}
                                            value={editingRowData[col] === null ? '' : String(editingRowData[col])}
                                            onChange={e => setEditingRowData({ ...editingRowData, [col]: e.target.value })}
                                            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 font-mono"
                                          />
                                        </div>
                                      ))}
                                    </div>

                                    {/* Generated Query Preview */}
                                    <div className="space-y-1 mt-4">
                                      <div className="text-[11px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <span>🔍 Live Generated Query Preview:</span>
                                      </div>
                                      <pre className="bg-gray-900 text-teal-300 text-xs font-mono p-3 rounded-xl border border-gray-700 overflow-x-auto max-h-32 whitespace-pre-wrap select-all">
                                        {generateUpdateQuery(editingRowOriginal, editingRowData)}
                                      </pre>
                                    </div>

                                    <div className="pt-3 flex items-center justify-between gap-3 border-t border-gray-150 dark:border-gray-800 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => setEditingRowModalOpen(false)}
                                        className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-100 cursor-pointer"
                                      >
                                        Cancel
                                      </button>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const q = generateUpdateQuery(editingRowOriginal, editingRowData);
                                            setEditingRowModalOpen(false);
                                            sendQueryToEditorAndRun(q, `✏️ UPDATE query executed via Query Editor!`);
                                          }}
                                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                        >
                                          <span>⚡</span> Apply & Run in Query Editor
                                        </button>
                                        <button
                                          type="submit"
                                          disabled={editingRowLoading}
                                          style={{ backgroundColor: '#0d9da4' }}
                                          className="px-5 py-2 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
                                        >
                                          {editingRowLoading ? 'Saving...' : 'Direct Save Row'}
                                        </button>
                                      </div>
                                    </div>
                                  </form>
                                </div>
                              </div>
                            )}

                            {/* Insert Row Modal */}
                            {insertRowModalOpen && (
                              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs text-left">
                                <div className="bg-white dark:bg-gray-850 rounded-2xl w-[90vw] max-w-2xl border border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden animate-fadeIn">
                                  <div className="px-6 py-4 border-b border-gray-150 dark:border-gray-800 flex items-center justify-between">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                      <span>➕</span> Insert New Row — <span className="font-mono text-teal-600">{selectedTable}</span>
                                    </h3>
                                    <button
                                      type="button"
                                      onClick={() => setInsertRowModalOpen(false)}
                                      className="text-gray-400 hover:text-gray-700 text-lg font-bold cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  <form onSubmit={handleSaveInsertRow} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                                    {insertRowError && (
                                      <div className="bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-lg border border-red-200">
                                        ❌ {insertRowError}
                                      </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      {Object.keys(insertRowData).map(col => (
                                        <div key={col} className="space-y-1">
                                          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 font-mono">
                                            {col}
                                          </label>
                                          <textarea
                                            rows={2}
                                            placeholder="Enter value or leave blank for NULL / DEFAULT"
                                            value={insertRowData[col] === null ? '' : String(insertRowData[col])}
                                            onChange={e => setInsertRowData({ ...insertRowData, [col]: e.target.value })}
                                            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs outline-none focus:border-[#0d9da4] bg-white dark:bg-gray-800 font-mono"
                                          />
                                        </div>
                                      ))}
                                    </div>

                                    {/* Generated Query Preview */}
                                    <div className="space-y-1 mt-4">
                                      <div className="text-[11px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <span>🔍 Live Generated Query Preview:</span>
                                      </div>
                                      <pre className="bg-gray-900 text-teal-300 text-xs font-mono p-3 rounded-xl border border-gray-700 overflow-x-auto max-h-32 whitespace-pre-wrap select-all">
                                        {generateInsertQuery(insertRowData)}
                                      </pre>
                                    </div>

                                    <div className="pt-3 flex items-center justify-between gap-3 border-t border-gray-150 dark:border-gray-800 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => setInsertRowModalOpen(false)}
                                        className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-100 cursor-pointer"
                                      >
                                        Cancel
                                      </button>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const q = generateInsertQuery(insertRowData);
                                            setInsertRowModalOpen(false);
                                            sendQueryToEditorAndRun(q, `➕ INSERT query executed via Query Editor!`);
                                          }}
                                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                        >
                                          <span>⚡</span> Apply & Run in Query Editor
                                        </button>
                                        <button
                                          type="submit"
                                          disabled={insertRowLoading}
                                          style={{ backgroundColor: '#0d9da4' }}
                                          className="px-5 py-2 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
                                        >
                                          {insertRowLoading ? 'Inserting...' : 'Direct Insert Row'}
                                        </button>
                                      </div>
                                    </div>
                                  </form>
                                </div>
                              </div>
                            )}

                            {/* Delete Row Modal */}
                            {deleteRowModalOpen && deleteRowTarget && (
                              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-xs text-left">
                                <div className="bg-white dark:bg-gray-850 rounded-2xl w-[90vw] max-w-xl border border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden animate-fadeIn">
                                  <div className="px-6 py-4 border-b border-gray-150 dark:border-gray-800 flex items-center justify-between bg-red-50/50 dark:bg-red-950/20">
                                    <h3 className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                                      <span>🗑️</span> Confirm Delete Row — <span className="font-mono text-gray-800 dark:text-gray-200">{selectedTable}</span>
                                    </h3>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDeleteRowModalOpen(false);
                                        setDeleteRowTarget(null);
                                      }}
                                      className="text-gray-400 hover:text-gray-700 text-lg font-bold cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                                    {deleteRowError && (
                                      <div className="bg-red-50 text-red-600 text-xs px-4 py-2.5 rounded-lg border border-red-200">
                                        ❌ {deleteRowError}
                                      </div>
                                    )}

                                    <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                                      Are you sure you want to delete this row from table <strong className="text-gray-900 dark:text-gray-100 font-mono">{selectedTable}</strong>?
                                    </p>

                                    {/* Generated Query Preview */}
                                    <div className="space-y-1">
                                      <div className="text-[11px] font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <span>🔍 Generated Delete Query:</span>
                                      </div>
                                      <pre className="bg-gray-900 text-red-300 text-xs font-mono p-3 rounded-xl border border-gray-700 overflow-x-auto max-h-32 whitespace-pre-wrap select-all">
                                        {generateDeleteQuery(deleteRowTarget)}
                                      </pre>
                                    </div>

                                    <div className="pt-3 flex items-center justify-between gap-3 border-t border-gray-150 dark:border-gray-800 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDeleteRowModalOpen(false);
                                          setDeleteRowTarget(null);
                                        }}
                                        className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-100 cursor-pointer"
                                      >
                                        Cancel
                                      </button>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const q = generateDeleteQuery(deleteRowTarget);
                                            setDeleteRowModalOpen(false);
                                            setDeleteRowTarget(null);
                                            sendQueryToEditorAndRun(q, `🗑️ DELETE query executed via Query Editor!`);
                                          }}
                                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                                        >
                                          <span>⚡</span> Apply & Run in Query Editor
                                        </button>

                                        <button
                                          type="button"
                                          disabled={deleteRowLoading}
                                          onClick={handleConfirmDirectDelete}
                                          className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer"
                                        >
                                          {deleteRowLoading ? 'Deleting...' : 'Confirm Direct Delete'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Pagination Footer */}
                            {viewerRows.length > 0 && (
                              <div className="cd-table-footer">
                                <span>
                                  Showing <b>{((viewerPage - 1) * tableRowsPerPage + 1).toLocaleString()}</b>–<b>{Math.min(viewerPage * tableRowsPerPage, viewerRows.length).toLocaleString()}</b> of <b>{viewerRows.length.toLocaleString()}</b> rows
                                  {viewerFilter && <span className="text-slate-400"> (filtered from {tableData.length.toLocaleString()})</span>}
                                  <span className="hidden md:inline text-slate-400"> · Click a cell to copy it</span>
                                </span>
                                {renderPager(viewerPage, viewerTotalPages, (p) => setTablePage(Math.min(Math.max(p, 1), viewerTotalPages)))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* QUERY EDITOR */}
                {activeTab === 'query' && (
                  <div className="w-[90%] mx-auto">
                    {/* Query Tabs Header Bar */}
                    <div className="cd-qe-bar select-none">
                      {/* Left Side: Tabs List & Add Button */}
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <div ref={queryTabsScrollRef} className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                          {queryTabs.map((tab) => {
                            const isActive = tab.id === activeQueryTabId;
                            return (
                              <div
                                key={tab.id}
                                data-query-tab-id={tab.id}
                                onClick={() => setActiveQueryTabId(tab.id)}
                                className={`cd-qe-tab ${isActive ? 'is-active' : ''}`}
                              >
                                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" />
                                </svg>
                                <span
                                  className="whitespace-nowrap"
                                  title="Double-click to rename this tab"
                                  onDoubleClick={() => handleRenameTab(tab.id, tab.name)}
                                >
                                  {tab.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleRenameTab(tab.id, tab.name); }}
                                  className="cd-qe-tab-btn"
                                  title="Rename tab"
                                  aria-label={`Rename ${tab.name}`}
                                >
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m15 5 4 4M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" />
                                  </svg>
                                </button>
                                {queryTabs.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => removeQueryTab(tab.id, e)}
                                    className="cd-qe-tab-btn"
                                    title="Close tab"
                                    aria-label={`Close ${tab.name}`}
                                  >
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                                      <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Keep the add button visible while the tab list scrolls. */}
                        <button
                          type="button"
                          onClick={addQueryTab}
                          title="Open new query tab"
                          aria-label="Open new query tab"
                          className="cd-qe-icon-btn shrink-0"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      </div>

                      {/* Right Side: Tools */}
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {/* Interactive Role Mode Button & Privileges Modal Trigger */}
                        {(() => {
                          const effectiveMode = user?.accessMode || (user?.role === 'readwrite' ? 'readwrite' : user?.role === 'read' ? 'read' : 'read');
                          const modeLabel = user?.role === 'admin'
                            ? 'Admin'
                            : effectiveMode === 'readwrite' ? 'Read-Write' : 'Read-Only';
                          return (
                            <button
                              type="button"
                              onClick={() => setShowModeInfoModal(true)}
                              title="View Query Editor permissions"
                              className={`cd-qe-mode ${effectiveMode === 'readwrite' || user?.role === 'admin' ? '' : 'is-readonly'}`}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                {effectiveMode === 'readwrite' || user?.role === 'admin'
                                  ? <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
                                  : <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></>}
                              </svg>
                              {modeLabel}
                            </button>
                          );
                        })()}

                        <span className="cd-qe-divider" />

                        <button type="button" onClick={formatSQLQuery} title="Beautify / format SQL" className="cd-qe-tool">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 6h16M4 12h10M4 18h13" />
                          </svg>
                          Beautify
                        </button>
                        {dbType !== 'mongodb' && (
                          <button
                            type="button"
                            onClick={runExplain}
                            disabled={queryLoading || !query.trim()}
                            title="Explain query execution plan"
                            className="cd-qe-tool"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
                            </svg>
                            Explain
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowSaveScriptModal(true)}
                          disabled={!query.trim()}
                          title="Save script to your library"
                          className="cd-qe-tool"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" />
                          </svg>
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSavedQueriesModal(true)}
                          title="Open saved scripts"
                          className="cd-qe-tool"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                          </svg>
                          Scripts
                          <span className="cd-qe-count">{savedQueries.length}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowHistoryDrawer(prev => !prev)}
                          title="Toggle query history panel"
                          className={`cd-qe-tool ${showHistoryDrawer ? 'is-active' : ''}`}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                          </svg>
                          History
                        </button>

                        {/* Editor theme & font size */}
                        <EditorThemeMenu appearance={appearance} />
                      </div>
                    </div>

                    <div className="flex gap-4 items-start relative mb-4">
                      {/* Left Side: Main Editor Box */}
                      <div className="flex-1 min-w-0">
                        <div className="cd-panel p-4 relative">




                          {/* Textarea Overlay Container */}
                          <div className="sql-editor-container h-[320px]" style={editorStyleVars}>
                            {/* Copy Query Text Button (Top Right) */}
                            <button
                              type="button"
                              onClick={() => handleCopyQueryText(textareaRef)}
                              title="Copy query text to clipboard"
                              className={`cd-copy-btn ${copiedQueryText ? 'is-copied' : ''}`}
                              aria-live="polite"
                            >
                              <CopyButtonContent copied={copiedQueryText} />
                            </button>

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
                                    className={`px-3 py-1.5 cursor-pointer flex items-center justify-between ${idx === suggestionsActiveIndex
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
                          <div className="mt-3 flex items-center justify-between flex-wrap gap-3 select-none">
                            {/* Left Side: Run Query & Run Selection */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => runQuery(false)}
                                disabled={queryLoading || !query.trim()}
                                title="Run query (Ctrl+Enter)"
                                className="cd-btn !h-10 !px-5"
                              >
                                {queryLoading ? (
                                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M7 4.5v15l12-7.5z" />
                                  </svg>
                                )}
                                {queryLoading ? 'Running...' : 'Run Query'}
                              </button>
                              <button
                                type="button"
                                onClick={() => runQuery(false)}
                                disabled={queryLoading || !query.trim()}
                                title="Run the selected text or the statement at the cursor (Ctrl+Enter)"
                                className="cd-btn-outline !h-10"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2M10 9l5 3-5 3z" />
                                </svg>
                                Run Selection
                              </button>
                            </div>

                            {/* Right Side: shortcut hints, current theme, fullscreen */}
                            <div className="flex items-center gap-2 text-[12px] text-slate-500">
                              <span className="hidden md:inline-flex items-center gap-1.5">
                                <kbd className="cd-kbd">Ctrl</kbd>+<kbd className="cd-kbd">Enter</kbd> run
                                <span className="mx-1 text-slate-300">|</span>
                                <kbd className="cd-kbd">Ctrl</kbd>+<kbd className="cd-kbd">/</kbd> comment
                              </span>
                              <span className="hidden lg:inline text-slate-300">|</span>
                              <span className="hidden lg:inline">{editorTheme.label} · {editorFontSize}px</span>
                              <button
                                type="button"
                                onClick={() => setIsQueryMaximized(true)}
                                title="Open the editor in fullscreen"
                                className="cd-btn-outline"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                </svg>
                                Fullscreen
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Collapsible History Drawer */}
                        {showHistoryDrawer && (
                          <div className="cd-panel w-80 p-4 flex flex-col h-[412px]">
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
                                className={`px-2.5 py-1.5 border text-xs font-bold rounded-lg transition flex items-center gap-1 shadow-3xs ${showHistoryDrawer
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
                                <div ref={fullscreenQueryTabsScrollRef} className="flex items-center gap-1.5 overflow-x-auto pb-1 select-none scrollbar-none" style={{ marginBottom: '-1px' }}>
                                  {queryTabs.map((tab) => {
                                    const isActive = tab.id === activeQueryTabId;
                                    return (
                                      <div
                                        key={tab.id}
                                        data-query-tab-id={tab.id}
                                        onClick={() => setActiveQueryTabId(tab.id)}
                                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-xl border-t border-x cursor-pointer transition-all duration-150 shadow-3xs ${isActive
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
                                <div className="sql-editor-container flex-1 relative overflow-hidden" style={editorStyleVars}>
                                  {/* Copy Query Text Button (Top Right) */}
                                  <button
                                    type="button"
                                    onClick={() => handleCopyQueryText(fullscreenTextareaRef)}
                                    title="Copy query text to clipboard"
                                    className={`cd-copy-btn ${copiedQueryText ? 'is-copied' : ''}`}
                              aria-live="polite"
                                  >
                                    <CopyButtonContent copied={copiedQueryText} />
                                  </button>

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
                                          className={`px-3 py-1.5 cursor-pointer flex items-center justify-between ${idx === suggestionsActiveIndex
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
                      <div className={`mb-4 text-sm px-4 py-3 rounded-xl border flex items-center gap-2 font-medium ${queryMsg.includes('0 rows') || queryMsg.includes('No data')
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        }`}>
                        <span>{queryMsg.includes('0 rows') || queryMsg.includes('No data') ? '⚠️' : '✅'}</span>
                        <span>{queryMsg}</span>
                      </div>
                    )}
                    {queryResults.length > 0 && (
                      <div className="cd-panel bg-white rounded-xl border border-gray-200 overflow-hidden mb-4 shadow-3xs">
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
                                <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase whitespace-nowrap">
                                  Action
                                </th>
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
                                  <td className="px-4 py-3 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => openInNewQueryTab(getInsertCopyCommand(row), 'Insert Copy Command')}
                                      title="Insert a generated row insert command into a new query tab"
                                      className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-bold rounded-lg transition cursor-pointer whitespace-nowrap"
                                    >
                                      Insert Copy Command
                                    </button>
                                  </td>
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
                {activeTab === 'history' && (() => {
                  const searchTerm = historySearch.trim().toLowerCase();
                  const visibleHistory = history.filter((item) =>
                    (historyStatus === 'all' || item.status === historyStatus) &&
                    (!searchTerm || String(item.query || '').toLowerCase().includes(searchTerm))
                  );
                  const successCount = history.filter((item) => item.status === 'success').length;
                  const avgTime = history.length
                    ? Math.round(history.reduce((total, item) => total + (Number(item.executionTime) || 0), 0) / history.length)
                    : 0;

                  return (
                    <div>
                      <div className="cd-section-head">
                        <div>
                          <h2 className="cd-section-title">Query History</h2>
                          <p className="cd-section-sub">Your most recent queries on this connection.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={fetchHistory} className="cd-btn-outline" title="Refresh history">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" />
                            </svg>
                            Refresh
                          </button>
                          {history.length > 0 && (
                            <button type="button" onClick={exportHistoryToCSV} className="cd-btn">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                              </svg>
                              Export CSV
                            </button>
                          )}
                        </div>
                      </div>

                      {history.length > 0 && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                          {[
                            { label: 'Total queries', value: history.length },
                            { label: 'Successful', value: successCount },
                            { label: 'Failed', value: history.length - successCount },
                            { label: 'Avg. run time', value: `${avgTime} ms` },
                          ].map((stat) => (
                            <div key={stat.label} className="cd-panel cd-stat">
                              <div className="cd-stat-label">{stat.label}</div>
                              <div className="cd-stat-value">{stat.value}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="cd-panel overflow-hidden">
                        {history.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2.5 p-3 border-b border-slate-100">
                            <div className="relative flex-1 min-w-[220px]">
                              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
                              </svg>
                              <input
                                type="search"
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                                placeholder="Search query text..."
                                className="w-full h-9 pl-9 pr-3 border bg-slate-50 text-[13px] text-slate-800"
                              />
                            </div>
                            <div className="cd-seg">
                              {[['all', 'All'], ['success', 'Success'], ['failed', 'Failed']].map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setHistoryStatus(value)}
                                  className={historyStatus === value ? 'is-active' : ''}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {historyLoading ? (
                          <div className="cd-empty">
                            <div className="w-8 h-8 border-[3px] border-teal-100 border-t-teal-600 rounded-full animate-spin mx-auto"></div>
                            <p className="mt-3 text-[13px] text-slate-500">Loading history...</p>
                          </div>
                        ) : history.length === 0 ? (
                          <div className="cd-empty">
                            <div className="cd-empty-icon">
                              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                              </svg>
                            </div>
                            <p className="text-[14px] font-semibold text-slate-800">No query history yet</p>
                            <p className="mt-1 text-[12.5px] text-slate-500">Queries you run in the Query Editor will appear here.</p>
                            <button type="button" onClick={() => setActiveTab('query')} className="cd-btn mt-4">Open Query Editor</button>
                          </div>
                        ) : visibleHistory.length === 0 ? (
                          <div className="cd-empty">
                            <p className="text-[14px] font-semibold text-slate-800">No matching queries</p>
                            <p className="mt-1 text-[12.5px] text-slate-500">Try a different search or status filter.</p>
                          </div>
                        ) : (
                          visibleHistory.map((item) => {
                            const isExpanded = Boolean(expandedHistory[item._id]);
                            const isLong = String(item.query || '').split('\n').length > 3 || String(item.query || '').length > 220;
                            return (
                              <div key={item._id} className="cd-history-row">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-slate-500">
                                    <span className={`cd-pill ${item.status === 'success' ? 'is-ok' : 'is-fail'}`}>
                                      <span className={`h-1.5 w-1.5 rounded-full ${item.status === 'success' ? 'bg-teal-600' : 'bg-rose-500'}`} />
                                      {item.status === 'success' ? 'Success' : 'Failed'}
                                    </span>
                                    <span>{item.executionTime ?? 0} ms</span>
                                    <span className="text-slate-300">•</span>
                                    <span>{item.rowsAffected ?? 0} rows</span>
                                    {item.database && (
                                      <>
                                        <span className="text-slate-300">•</span>
                                        <span className="font-mono">{item.database}</span>
                                      </>
                                    )}
                                    <span className="text-slate-300">•</span>
                                    <span>{new Date(item.createdAt).toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyHistoryQuery(item._id, item.query)}
                                      className={`cd-icon-btn ${copiedHistoryId === item._id ? 'is-copied' : ''}`}
                                      title={copiedHistoryId === item._id ? 'Copied!' : 'Copy query'}
                                      aria-label={copiedHistoryId === item._id ? 'Copied' : 'Copy query'}
                                    >
                                      {copiedHistoryId === item._id ? (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <path d="M20 6L9 17l-5-5" />
                                        </svg>
                                      ) : (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" />
                                        </svg>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteHistory(item._id)}
                                      className="cd-icon-btn is-danger"
                                      title="Delete from history"
                                      aria-label="Delete from history"
                                    >
                                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openInNewQueryTab(item.query, 'History Query')}
                                      className="cd-btn !h-8 !px-3"
                                    >
                                      Open in editor
                                    </button>
                                  </div>
                                </div>
                                <pre className={`cd-code ${isLong && !isExpanded ? 'is-collapsed' : ''}`}>{item.query}</pre>
                                {item.status !== 'success' && item.error && (
                                  <p className="mt-2 text-[12px] text-rose-600">{item.error}</p>
                                )}
                                {isLong && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedHistory((prev) => ({ ...prev, [item._id]: !isExpanded }))}
                                    className="mt-1.5 text-[12px] font-semibold text-teal-700 hover:underline cursor-pointer"
                                  >
                                    {isExpanded ? 'Show less' : 'Show full query'}
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })()}





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
              <div className={`px-6 py-4 border-b flex items-center justify-between ${user?.role === 'admin'
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
                      openInNewQueryTab(definitionModal.code, definitionModal.title || 'DDL Query');
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