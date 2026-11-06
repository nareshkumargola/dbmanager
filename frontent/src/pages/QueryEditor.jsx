import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import API from '../api/axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import EditorThemeMenu from '../components/EditorThemeMenu';
import CopyButtonContent from '../components/CopyButtonContent';
import useEditorAppearance from '../hooks/useEditorAppearance';
import { copyToClipboard } from '../utils/clipboard';
import './ConnectionDashboard.css';
import './QueryEditor.css';
import EngineIcon from '../components/EngineIcon';
import { cloudLabel } from '../utils/cloudProviders';

const ENGINE_INFO = {
  mysql: { label: 'MySQL', color: '#0284c7', port: 3306 },
  postgresql: { label: 'PostgreSQL', color: '#4f46e5', port: 5432 },
  mongodb: { label: 'MongoDB', color: '#15803d', port: 27017 },
  oracle: { label: 'Oracle', color: '#dc2626', port: 1521 },
};

// Where a connection points: the host of its connection string, or host and port
const connectionHost = (conn) => {
  if (conn.connectionString) return conn.connectionString.replace(/^[a-z+]+:\/\//i, '').split('@').pop().split(/[/?]/)[0];
  return `${conn.host || 'localhost'}:${conn.port || ENGINE_INFO[conn.type]?.port || ''}`;
};

export default function QueryEditor() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (user?.role !== 'admin' && user?.permissions && !user.permissions.query) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-left">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md text-center shadow-lg">
          <p className="text-4xl mb-4">🚫</p>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-500 mb-6">You do not have permission to access SQL Query Editor features.</p>
          <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition font-bold shadow-sm">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }
  return <QueryEditorContent user={user} location={location} />;
}

function QueryEditorContent({ user, location }) {
  const queryTabsStorageKey = `dms_query_editor_tabs_${user?.id || user?._id || 'guest'}`;
  const activeQueryTabStorageKey = `${queryTabsStorageKey}_active`;
  const [queryTabs, setQueryTabs] = useState(() => {
    try {
      const savedTabs = JSON.parse(localStorage.getItem(queryTabsStorageKey) || 'null');
      if (Array.isArray(savedTabs) && savedTabs.length > 0) {
        return savedTabs.map((tab, index) => ({
          id: tab.id || `query-${index + 1}`,
          name: tab.name || `Query ${index + 1}`,
          query: index === 0 && location.state?.query ? location.state.query : (tab.query || '')
        }));
      }
    } catch (err) {
      console.error('Failed to restore query editor tabs:', err);
    }
    return [{
      id: 'query-1',
      name: 'Query 1',
      query: location.state?.query || 'SELECT * FROM users;'
    }];
  });
  const [activeQueryTabId, setActiveQueryTabId] = useState(() => {
    if (location.state?.query) return queryTabs[0]?.id || 'query-1';
    try {
      return localStorage.getItem(activeQueryTabStorageKey) || 'query-1';
    } catch (err) {
      console.error('Failed to restore active query tab:', err);
      return 'query-1';
    }
  });
  const activeQueryTab = queryTabs.find(tab => tab.id === activeQueryTabId) || queryTabs[0];
  const resolvedActiveQueryTabId = activeQueryTab?.id || activeQueryTabId;
  const query = activeQueryTab?.query || '';
  const setQuery = (value) => {
    setQueryTabs(previous => previous.map(tab => tab.id === resolvedActiveQueryTabId
      ? { ...tab, query: typeof value === 'function' ? value(tab.query) : value }
      : tab));
  };
  const [showHistory, setShowHistory] = useState(false);
  const [showSaveScriptModal, setShowSaveScriptModal] = useState(false);
  const [showSavedQueriesModal, setShowSavedQueriesModal] = useState(false);
  const [savedQueries, setSavedQueries] = useState([]);
  const [scriptTitle, setScriptTitle] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [savingScript, setSavingScript] = useState(false);
  const [queryHistory, setQueryHistory] = useState(() => {
    try {
      const savedHistory = JSON.parse(localStorage.getItem(`dms_query_history_${user?.id || user?._id || 'guest'}`) || '[]');
      return Array.isArray(savedHistory) ? savedHistory : [];
    } catch (err) {
      console.error('Failed to restore query history:', err);
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(queryTabsStorageKey, JSON.stringify(queryTabs));
      localStorage.setItem(activeQueryTabStorageKey, resolvedActiveQueryTabId);
    } catch (err) {
      console.error('Failed to save query editor tabs:', err);
    }
  }, [queryTabs, resolvedActiveQueryTabId, queryTabsStorageKey, activeQueryTabStorageKey]);

  useEffect(() => {
    const fetchSavedQueries = async () => {
      try {
        const res = await API.get('/saved-queries');
        setSavedQueries(res.data.queries || []);
      } catch (err) {
        console.error('Failed to load saved queries:', err);
      }
    };
    fetchSavedQueries();
  }, []);

  const addQueryTab = () => {
    const nextNumber = queryTabs.reduce((max, tab) => {
      const match = tab.name.match(/^Query (\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    let id = `query-${nextNumber}`;
    while (queryTabs.some(tab => tab.id === id)) id = `${id}-new`;
    setQueryTabs(previous => [...previous, { id, name: `Query ${nextNumber}`, query: '' }]);
    setActiveQueryTabId(id);
    setResults([]);
    setColumns([]);
    setError('');
    setMessage('');
    setBatchResults(null);
  };

  const renameQueryTab = (tab) => {
    const name = window.prompt('Enter a name for this query tab:', tab.name);
    if (name?.trim()) {
      setQueryTabs(previous => previous.map(item => item.id === tab.id ? { ...item, name: name.trim() } : item));
    }
  };

  const removeQueryTab = (tabId, event) => {
    event?.stopPropagation();
    if (queryTabs.length < 2) return;
    const remainingTabs = queryTabs.filter(tab => tab.id !== tabId);
    setQueryTabs(remainingTabs);
    if (activeQueryTabId === tabId) {
      setActiveQueryTabId(remainingTabs[remainingTabs.length - 1].id);
      setResults([]);
      setColumns([]);
      setError('');
      setMessage('');
      setBatchResults(null);
    }
  };
  const [results, setResults] = useState([]);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const lineCounterRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Query editor appearance (shared with the connection Query Editor)
  const appearance = useEditorAppearance();
  const { editorTheme, editorFontSize, editorStyleVars } = appearance;

  // Copy button: the tick shows for 2 seconds; a new object per click restarts the timer
  const [copyTick, setCopyTick] = useState(null);
  const copiedQueryText = Boolean(copyTick);
  useEffect(() => {
    if (!copyTick) return undefined;
    const timer = setTimeout(() => setCopyTick(null), 2000);
    return () => clearTimeout(timer);
  }, [copyTick]);

  // Autocomplete suggestions state
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dbTables, setDbTables] = useState([]);

  // Smart Index Advisor & Latency Tracking state
  const [executionTime, setExecutionTime] = useState(null);
  const [indexRecommendation, setIndexRecommendation] = useState(null);

  // CSV Import Wizard state
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importTableName, setImportTableName] = useState('');
  const [importHeaders, setImportHeaders] = useState([]);
  const [importPreviewRows, setImportPreviewRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  // Connection selection state (Single Mode)
  const [connections, setConnections] = useState([]);
  const [selectedConnection, setSelectedConnection] = useState(location.state?.connectionId || '');
  const [connectionType, setConnectionType] = useState('');
  const [databases, setDatabases] = useState([]);
  const [selectedDatabase, setSelectedDatabase] = useState(location.state?.database || '');

  // Multi-Connection & Multi-DB Batch Execution State
  const [executionMode, setExecutionMode] = useState(location.state?.batchMode ? 'batch' : 'single'); // 'single' | 'batch'
  const [batchTypeFilter, setBatchTypeFilter] = useState('all'); // 'all', 'mysql', 'postgresql', 'mongodb', 'oracle'
  const [selectedConnIds, setSelectedConnIds] = useState([]);
  const [connDatabasesMap, setConnDatabasesMap] = useState({}); // { [connId]: string[] }
  const [connDbLoadingMap, setConnDbLoadingMap] = useState({}); // { [connId]: boolean }
  const [selectedDatabasesMap, setSelectedDatabasesMap] = useState({}); // { [connId]: string[] }
  const [batchResults, setBatchResults] = useState(null); // { targets: [...], summary: {...} }
  const [activeResultKey, setActiveResultKey] = useState('summary'); // 'summary' | targetKey
  const [batchConnSearch, setBatchConnSearch] = useState('');

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      const conn = connections.find(c => c._id === selectedConnection);
      if (conn) {
        setConnectionType(conn.type);
        if (conn.type === 'mysql' || conn.type === 'postgresql') {
          fetchDatabases(conn._id);
        } else {
          setDatabases([]);
        }
      }
    } else {
      setConnectionType('');
      setDatabases([]);
    }
  }, [selectedConnection, connections]);

  useEffect(() => {
    if (selectedConnection) {
      fetchDbTables(selectedConnection, selectedDatabase);
    } else {
      fetchDbTables('', '');
    }
  }, [selectedConnection, selectedDatabase]);

  const fetchDbTables = async (connId, dbName) => {
    try {
      if (!connId) {
        const res = await API.get('/db/mysql/tables');
        setDbTables((res.data.tables || []).map(table =>
          table.name || table.table_name || Object.values(table)[0]
        ).filter(Boolean));
        return;
      }

      const params = new URLSearchParams();
      if (dbName) params.append('database', dbName);
      const res = await API.get(`/connections/${connId}/objects?${params.toString()}`);
      if (res.data.success && res.data.result) {
        const type = res.data.type;
        const result = res.data.result;
        let names = [];
        if (type === 'mysql') {
          names = result.tables?.map(t => t.name || t.table_name || Object.values(t)[0]) || [];
        } else if (type === 'postgresql') {
          names = result.tables?.map(t => t.name || t.table_name) || [];
        } else if (type === 'mongodb') {
          names = result.collections?.map(c => c.name) || [];
        }
        setDbTables(names.filter(Boolean));
      }
    } catch (err) {
      setDbTables([]);
      console.error('Failed to fetch DB tables for autocomplete:', err);
    }
  };

  const fetchConnections = async () => {
    try {
      const res = await API.get('/connections');
      const list = res.data.connections || [];
      setConnections(list);
      // If there is an active connection from location state, set it
      if (location.state?.connectionId) {
        setSelectedConnection(location.state.connectionId);
        setSelectedConnIds([location.state.connectionId]);
        fetchDatabasesForConn(location.state.connectionId);
      }
    } catch (err) {
      console.error('Failed to fetch connections:', err);
    }
  };

  const fetchDatabases = async (id) => {
    try {
      const res = await API.get(`/connections/${id}/databases`);
      setDatabases(res.data.databases || []);
      // Pre-select connection's default database if matching
      const conn = connections.find(c => c._id === id);
      if (conn?.database && res.data.databases.includes(conn.database)) {
        setSelectedDatabase(conn.database);
      } else if (res.data.databases?.length > 0 && !selectedDatabase) {
        setSelectedDatabase(res.data.databases[0]);
      }
    } catch (err) {
      console.error('Failed to fetch databases:', err);
    }
  };

  // Batch helper: Fetch databases for a single connection in batch mode
  const fetchDatabasesForConn = async (connId) => {
    setConnDbLoadingMap(prev => ({ ...prev, [connId]: true }));
    try {
      const res = await API.get(`/connections/${connId}/databases`);
      const dbs = res.data.databases || [];
      setConnDatabasesMap(prev => ({ ...prev, [connId]: dbs }));
      const conn = connections.find(c => c._id === connId);
      setSelectedDatabasesMap(prev => {
        if (prev[connId] && prev[connId].length > 0) return prev;
        if (conn?.database && dbs.includes(conn.database)) {
          return { ...prev, [connId]: [conn.database] };
        }
        return { ...prev, [connId]: dbs.length > 0 ? [dbs[0]] : (conn?.database ? [conn.database] : []) };
      });
    } catch (err) {
      console.error(`Failed to fetch databases for conn ${connId}:`, err);
      const conn = connections.find(c => c._id === connId);
      setConnDatabasesMap(prev => ({ ...prev, [connId]: conn?.database ? [conn.database] : [] }));
      setSelectedDatabasesMap(prev => ({ ...prev, [connId]: conn?.database ? [conn.database] : [] }));
    } finally {
      setConnDbLoadingMap(prev => ({ ...prev, [connId]: false }));
    }
  };

  const toggleSelectConnection = (connId) => {
    if (selectedConnIds.includes(connId)) {
      setSelectedConnIds(prev => prev.filter(id => id !== connId));
    } else {
      setSelectedConnIds(prev => [...prev, connId]);
      if (!connDatabasesMap[connId]) {
        fetchDatabasesForConn(connId);
      }
    }
  };

  const toggleSelectDatabase = (connId, dbName) => {
    setSelectedDatabasesMap(prev => {
      const current = prev[connId] || [];
      if (current.includes(dbName)) {
        return { ...prev, [connId]: current.filter(d => d !== dbName) };
      } else {
        return { ...prev, [connId]: [...current, dbName] };
      }
    });
  };

  const selectAllDatabasesForConn = (connId) => {
    const dbs = connDatabasesMap[connId] || [];
    setSelectedDatabasesMap(prev => ({ ...prev, [connId]: [...dbs] }));
  };

  const clearAllDatabasesForConn = (connId) => {
    setSelectedDatabasesMap(prev => ({ ...prev, [connId]: [] }));
  };

  const filteredBatchConnections = useMemo(() => {
    return connections.filter(conn => {
      if (batchTypeFilter !== 'all' && (conn.type || '').toLowerCase() !== batchTypeFilter.toLowerCase()) {
        return false;
      }
      if (batchConnSearch.trim()) {
        const s = batchConnSearch.toLowerCase().trim();
        const name = (conn.name || '').toLowerCase();
        const host = (conn.host || '').toLowerCase();
        const db = (conn.database || '').toLowerCase();
        if (!name.includes(s) && !host.includes(s) && !db.includes(s)) {
          return false;
        }
      }
      return true;
    });
  }, [connections, batchTypeFilter, batchConnSearch]);

  const batchTypeCounts = useMemo(() => connections.reduce((counts, conn) => {
    counts[conn.type] = (counts[conn.type] || 0) + 1;
    return counts;
  }, {}), [connections]);

  const totalBatchTargetsCount = useMemo(() => {
    let count = 0;
    selectedConnIds.forEach(connId => {
      const dbs = selectedDatabasesMap[connId] || [];
      count += (dbs.length > 0 ? dbs.length : 1);
    });
    return count;
  }, [selectedConnIds, selectedDatabasesMap]);

  const handleSelectAllFilteredConnections = () => {
    const filteredIds = filteredBatchConnections.map(c => c._id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedConnIds.includes(id));
    if (allSelected) {
      setSelectedConnIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      const next = Array.from(new Set([...selectedConnIds, ...filteredIds]));
      setSelectedConnIds(next);
      filteredIds.forEach(id => {
        if (!connDatabasesMap[id]) fetchDatabasesForConn(id);
      });
    }
  };

  const exportTargetCSV = (target) => {
    if (!target.results || target.results.length === 0) return;
    const headers = target.columns.join(',');
    const rows = target.results.map(row => 
      target.columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${(target.connectionName || 'conn').replace(/\s+/g, '_')}_${target.database}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const runQuery = async (forceRunAll = false, queryOverride = null) => {
    setError('');
    setMessage('');
    setResults([]);
    setExecutionTime(null);
    setIndexRecommendation(null);
    setLoading(true);

    let queryToRun = queryOverride ?? query;
    let isSelection = false;

    if (!forceRunAll && textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const selectedText = query.substring(start, end).trim();
      if (selectedText) {
        queryToRun = selectedText;
        isSelection = true;
      }
    }

    if (!queryToRun.trim()) {
      setError('Query cannot be empty!');
      setLoading(false);
      return;
    }
    recordQueryHistory(queryToRun);

    // MULTI-CONNECTION & MULTI-DB BATCH RUNNER
    if (executionMode === 'batch') {
      const targets = [];
      selectedConnIds.forEach(connId => {
        const conn = connections.find(c => c._id === connId);
        if (!conn) return;
        const dbs = selectedDatabasesMap[connId] || [];
        if (dbs.length === 0) {
          targets.push({ connection: conn, database: conn.database || '' });
        } else {
          dbs.forEach(db => {
            targets.push({ connection: conn, database: db });
          });
        }
      });

      if (targets.length === 0) {
        setError('Please select at least one connection and database target.');
        setLoading(false);
        return;
      }

      const overallStart = performance.now();
      try {
        const batchResultsArr = await Promise.all(targets.map(async (target) => {
          const tStart = performance.now();
          try {
            const params = new URLSearchParams();
            if (target.database) params.append('database', target.database);
            const res = await API.post(`/connections/${target.connection._id}/query?${params.toString()}`, {
              query: queryToRun,
              database: target.database
            });
            const tEnd = performance.now();
            const data = res.data.results;
            let colList = [];
            if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
              colList = Object.keys(data[0]);
            }
            const rowCount = Array.isArray(data) ? data.length : (data?.affectedRows ?? 0);
            return {
              key: `${target.connection._id}_${target.database || 'default'}`,
              connectionId: target.connection._id,
              connectionName: target.connection.name,
              connectionType: target.connection.type,
              database: target.database || '(default)',
              status: 'success',
              executionTime: (tEnd - tStart).toFixed(1),
              results: Array.isArray(data) ? data : [],
              columns: colList,
              rowCount,
              affectedRows: data?.affectedRows,
              message: Array.isArray(data)
                ? `${data.length} rows retrieved`
                : (data?.affectedRows !== undefined ? `${data.affectedRows} rows affected` : 'Success')
            };
          } catch (err) {
            const tEnd = performance.now();
            return {
              key: `${target.connection._id}_${target.database || 'default'}`,
              connectionId: target.connection._id,
              connectionName: target.connection.name,
              connectionType: target.connection.type,
              database: target.database || '(default)',
              status: 'error',
              executionTime: (tEnd - tStart).toFixed(1),
              results: [],
              columns: [],
              rowCount: 0,
              error: err.response?.data?.error || err.response?.data?.message || err.message || 'Execution failed'
            };
          }
        }));

        const overallEnd = performance.now();
        const totalDuration = (overallEnd - overallStart).toFixed(1);
        const successCount = batchResultsArr.filter(r => r.status === 'success').length;
        const errorCount = batchResultsArr.filter(r => r.status === 'error').length;

        setBatchResults({
          targets: batchResultsArr,
          summary: {
            total: targets.length,
            successCount,
            errorCount,
            totalTime: totalDuration
          }
        });
        setActiveResultKey('summary');
        setExecutionTime(totalDuration);
        setMessage(`Batch executed across ${targets.length} targets (${successCount} successful, ${errorCount} failed) in ${totalDuration}ms`);
      } catch (err) {
        setError(err.message || 'Batch execution failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    // SINGLE CONNECTION MODE
    const startTime = performance.now();

    try {
      const params = new URLSearchParams();
      if (selectedConnection) params.append('connectionId', selectedConnection);
      if (selectedDatabase) params.append('database', selectedDatabase);
      
      let path = '/db/mysql/query';
      if (connectionType === 'postgresql') {
        path = '/db/pg/query';
      }

      const queryPath = `${path}${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await API.post(queryPath, { query: queryToRun });

      const data = res.data.results;
      const endTime = performance.now();
      const latency = endTime - startTime;
      setExecutionTime(latency.toFixed(1));

      // SELECT query — rows aayengi
      if (Array.isArray(data) && data.length > 0) {
        setColumns(Object.keys(data[0]));
        setResults(data);
        setMessage(`${data.length} rows retrieved${isSelection ? ' (Executed selection)' : ''}`);
      }
      // INSERT/UPDATE/DELETE — affected rows aayenge
      else if (data?.affectedRows !== undefined) {
        setMessage(`Query successful! ${data.affectedRows} rows affected${isSelection ? ' (Executed selection)' : ''}`);
      }
      // Empty result
      else {
        setMessage(`Query executed successfully! No rows returned${isSelection ? ' (Executed selection)' : ''}`);
      }

      // Smart Index Advisor Analysis
      if (connectionType !== 'mongodb') {
        const sqlTrim = queryToRun.trim().toUpperCase();
        const isSelect = sqlTrim.startsWith('SELECT');
        if (isSelect) {
          const fromMatch = queryToRun.match(/FROM\s+([A-Za-z0-9_`"]+)/i);
          const whereMatch = queryToRun.match(/WHERE\s+([A-Za-z0-9_`"]+)\s*(=|!=|>|<|LIKE|IN)/i);
          if (fromMatch && whereMatch) {
            const table = fromMatch[1].replace(/[`"]/g, '');
            const column = whereMatch[1].replace(/[`"]/g, '');
            setIndexRecommendation({
              table,
              column,
              sql: `CREATE INDEX idx_${table}_${column} ON ${table}(${column});`,
              latency
            });
          }
        }
      }

    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Query failed!'
      );
    } finally {
      setLoading(false);
    }
  };

  const SQL_KEYWORDS = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT',
    'INNER', 'ON', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'HAVING',
    'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'AS', 'CREATE', 'TABLE', 'DATABASE',
    'DROP', 'ALTER', 'ADD', 'SET', 'VALUES', 'INTO', 'SHOW', 'DATABASES', 'TABLES',
    'USE', 'INDEX'
  ];

  const recordQueryHistory = (queryText) => {
    const cleanQuery = queryText.trim();
    if (!cleanQuery) return;
    const historyKey = `dms_query_history_${user?.id || user?._id || 'guest'}`;
    setQueryHistory(previous => {
      const updated = [
        { query: cleanQuery, timestamp: new Date().toISOString() },
        ...previous.filter(item => item.query !== cleanQuery)
      ].slice(0, 20);
      try {
        localStorage.setItem(historyKey, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save query history:', err);
      }
      return updated;
    });
  };

  const formatSQLQuery = () => {
    if (!query.trim()) return;
    const formatted = query.trim()
      .replace(/\s+/g, ' ')
      .replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|AND|OR|GROUP BY|ORDER BY|LIMIT|OFFSET|HAVING|VALUES|SET|UPDATE|DELETE FROM)\b/gi, '\n$1')
      .replace(/\n\s*\n/g, '\n')
      .trim();
    setQuery(formatted);
  };

  const runExplain = () => {
    const explainType = executionMode === 'single'
      ? connectionType
      : connections.find(connection => connection._id === selectedConnIds[0])?.type;
    if (!query.trim() || !explainType || explainType === 'mongodb') return;
    const originalQuery = query;
    const explainQuery = `${explainType === 'oracle' ? 'EXPLAIN PLAN FOR ' : 'EXPLAIN '}${query.trim()}`;
    setQuery(explainQuery);
    runQuery(true, explainQuery);
    setQuery(originalQuery);
  };

  const handleSaveScript = async () => {
    if (!scriptTitle.trim() || !query.trim()) return;
    setSavingScript(true);
    try {
      await API.post('/saved-queries', {
        title: scriptTitle.trim(),
        description: scriptDescription.trim(),
        query,
        connectionId: executionMode === 'single' ? selectedConnection || undefined : undefined,
        database: executionMode === 'single' ? selectedDatabase || '' : ''
      });
      const res = await API.get('/saved-queries');
      setSavedQueries(res.data.queries || []);
      setMessage(`Script "${scriptTitle.trim()}" saved successfully.`);
      setScriptTitle('');
      setScriptDescription('');
      setShowSaveScriptModal(false);
    } catch (err) {
      console.error('Failed to save query script:', err);
      window.alert(err.response?.data?.message || `Failed to save script: ${err.message}`);
    } finally {
      setSavingScript(false);
    }
  };

  const loadSavedQuery = (savedQuery) => {
    setQuery(savedQuery.query || '');
    setResults([]);
    setColumns([]);
    setBatchResults(null);
    setError('');
    setMessage(`Loaded saved script "${savedQuery.title}".`);
    setShowSavedQueriesModal(false);
  };

  const deleteSavedQuery = async (queryId) => {
    if (!window.confirm('Are you sure you want to delete this saved script?')) return;
    try {
      await API.delete(`/saved-queries/${queryId}`);
      const res = await API.get('/saved-queries');
      setSavedQueries(res.data.queries || []);
      setMessage('Saved script deleted successfully.');
    } catch (err) {
      console.error('Failed to delete saved query:', err);
      window.alert(err.response?.data?.message || 'Failed to delete saved script.');
    }
  };

  const handleTextareaChange = (val) => {
    setQuery(val);
    
    if (textareaRef.current) {
      const cursorIdx = textareaRef.current.selectionStart;
      const textBeforeCursor = val.substring(0, cursorIdx);
      const token = textBeforeCursor.match(/[`"A-Za-z0-9_$.]+$/)?.[0] || '';
      const expectsTable = /\b(?:FROM|JOIN|UPDATE|INTO|TABLE)\s+[`"A-Za-z0-9_$.]*$/i.test(textBeforeCursor);
      const candidates = expectsTable ? dbTables : [...SQL_KEYWORDS, ...dbTables];
      const normalizedToken = token.replace(/^[`"]/, '').toLowerCase();
      const matches = Array.from(new Set(candidates)).filter(candidate => {
        const name = String(candidate).toLowerCase();
        return (!token || name.startsWith(normalizedToken) || name.includes(normalizedToken)) &&
          name !== normalizedToken;
      });

      if ((token || expectsTable) && matches.length > 0) {
        setSuggestions(matches.slice(0, 10));
        setShowSuggestions(true);
        setSelectedSuggestionIdx(0);
      } else {
        setShowSuggestions(false);
      }
    }
  };

  const selectSuggestion = (selectedToken) => {
    if (textareaRef.current) {
      const cursorIdx = textareaRef.current.selectionStart;
      const textBeforeCursor = query.substring(0, cursorIdx);
      const textAfterCursor = query.substring(cursorIdx);

      const token = textBeforeCursor.match(/[`"A-Za-z0-9_$.]+$/)?.[0] || '';
      const newTextBefore = textBeforeCursor.slice(0, textBeforeCursor.length - token.length) + selectedToken;
      const newQuery = newTextBefore + textAfterCursor;
      setQuery(newQuery);
      setShowSuggestions(false);
      
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = newTextBefore.length;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 50);
    }
  };

  const handleCSVFileChange = (e) => {
    setImportError('');
    setImportSuccess('');
    const file = e.target.files[0];
    if (!file) return;

    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) {
          setImportError('CSV file is empty!');
          return;
        }

        const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
        setImportHeaders(headers);

        const preview = [];
        const limit = Math.min(lines.length, 6);
        for (let i = 1; i < limit; i++) {
          const rowValues = lines[i].split(',').map(v => v.replace(/^["']|["']$/g, '').trim());
          const rowObj = {};
          headers.forEach((h, idx) => {
            rowObj[h] = rowValues[idx] || '';
          });
          preview.push(rowObj);
        }
        setImportPreviewRows(preview);
      } catch (err) {
        setImportError('Failed to parse CSV file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleImportCSV = async (e) => {
    e.preventDefault();
    setImportError('');
    setImportSuccess('');
    if (!importFile) {
      setImportError('Please select a CSV file!');
      return;
    }
    if (!importTableName.trim()) {
      setImportError('Please specify the target table name!');
      return;
    }

    setImportLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length <= 1) {
          setImportError('CSV contains no data rows to import!');
          setImportLoading(false);
          return;
        }

        const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
        const valuesList = [];
        
        for (let i = 1; i < lines.length; i++) {
          const rowValues = lines[i].split(',').map(v => {
            const cleanVal = v.replace(/^["']|["']$/g, '').trim();
            if (cleanVal === '' || cleanVal.toLowerCase() === 'null') return 'NULL';
            if (!isNaN(cleanVal) && cleanVal !== '') return cleanVal;
            return `'${cleanVal.replace(/'/g, "''")}'`;
          });
          
          while (rowValues.length < headers.length) {
            rowValues.push('NULL');
          }
          valuesList.push(`(${rowValues.slice(0, headers.length).join(', ')})`);
        }

        const chunkSize = 500;
        let importedCount = 0;
        
        for (let i = 0; i < valuesList.length; i += chunkSize) {
          const chunkValues = valuesList.slice(i, i + chunkSize);
          const sqlQuery = `INSERT INTO \`${importTableName.trim()}\` (\`${headers.join('\`, \`\`')}\`) VALUES ${chunkValues.join(', ')};`;
          
          const params = new URLSearchParams();
          if (selectedConnection) params.append('connectionId', selectedConnection);
          if (selectedDatabase) params.append('database', selectedDatabase);
          
          let path = '/db/mysql/query';
          if (connectionType === 'postgresql') {
            path = '/db/pg/query';
          }
          
          const queryPath = `${path}${params.toString() ? `?${params.toString()}` : ''}`;
          await API.post(queryPath, { query: sqlQuery });
          importedCount += chunkValues.length;
        }

        setImportSuccess(`Successfully imported ${importedCount} records into table '${importTableName}'!`);
        setImportFile(null);
        setImportTableName('');
        setImportHeaders([]);
        setImportPreviewRows([]);
        const fileInput = document.getElementById('csv-file-input');
        if (fileInput) fileInput.value = '';
      } catch (err) {
        setImportError(err.response?.data?.error || 'Import failed: ' + err.message);
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsText(importFile);
  };

  const applyIndexRecommendation = async () => {
    if (!indexRecommendation) return;
    setQuery(indexRecommendation.sql);
    setIndexRecommendation(null);
    setTimeout(() => {
      runQuery(true);
    }, 100);
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

  // Keyboard shortcut — Ctrl+Enter se query run / Auto-complete handles
  const handleCopyQueryText = async () => {
    const textarea = textareaRef.current;
    const selected = textarea ? query.substring(textarea.selectionStart, textarea.selectionEnd).trim() : '';
    const textToCopy = selected || query;
    if (!textToCopy.trim()) {
      setError('Nothing to copy — the editor is empty.');
      return;
    }
    if (await copyToClipboard(textToCopy)) setCopyTick({});
    else setError('Could not copy to the clipboard.');
  };

  // Ctrl+/ comments or uncomments the selected lines (the current line if nothing is selected)
  const toggleLineComment = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = textarea;
    const blockStart = query.lastIndexOf('\n', selectionStart - 1) + 1;
    const nextBreak = query.indexOf('\n', selectionEnd);
    const blockEnd = nextBreak === -1 ? query.length : nextBreak;
    const lines = query.slice(blockStart, blockEnd).split('\n');
    const commentMark = connectionType === 'mongodb' ? '//' : '--';
    const allCommented = lines.every((line) => !line.trim() || line.trimStart().startsWith(commentMark));
    const updated = lines.map((line) => {
      if (!line.trim()) return line;
      if (!allCommented) return `${commentMark} ${line}`;
      return line.replace(new RegExp(`^(\\s*)${commentMark}\\s?`), '$1');
    }).join('\n');
    setQuery(query.slice(0, blockStart) + updated + query.slice(blockEnd));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(blockStart, blockStart + updated.length);
    });
  };
  const handleKeyDown = (e) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIdx(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        selectSuggestion(suggestions[selectedSuggestionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      toggleLineComment();
      return;
    }
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      runQuery(false);
    }
    if (e.key === 'Escape' && isExpanded) {
      setIsExpanded(false);
    }
  };

  return (
    <div className="cd-ws min-h-screen bg-[#f4f7fb] dark:bg-[#0b0f19] text-left">

      {/* Navbar */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <div className="w-[90%] max-w-none mx-auto py-8">

        {/* Header */}
        <div className="aq-hero mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="aq-pill"><span className="aq-pill-dot" />Query Workspace</span>
              <h2 className="aq-title">
                {executionMode === 'batch' ? <>All Connection <span>Query</span></> : <>SQL Query <span>Editor</span></>}
              </h2>
              <p className="aq-subtitle">
                {executionMode === 'batch'
                  ? 'Run one SQL script across selected connections and databases, review each result, and export successful results to CSV.'
                  : 'Choose a connection and database, run the selected statement or full script, and import CSV data into a table.'}
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="aq-mode" role="tablist" aria-label="Query mode">
              <button
                type="button"
                role="tab"
                aria-selected={executionMode === 'single'}
                onClick={() => setExecutionMode('single')}
                className={executionMode === 'single' ? 'is-active' : ''}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></svg>
                Single Connection
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={executionMode === 'batch'}
                onClick={() => {
                  setExecutionMode('batch');
                  if (selectedConnIds.length === 0 && connections.length > 0) {
                    const initialId = selectedConnection || connections[0]._id;
                    setSelectedConnIds([initialId]);
                    if (!connDatabasesMap[initialId]) fetchDatabasesForConn(initialId);
                  }
                }}
                className={executionMode === 'batch' ? 'is-active' : ''}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></svg>
                All Connection Query
                {totalBatchTargetsCount > 0 && (
                  <span className="aq-mode-count">{totalBatchTargetsCount}</span>
                )}
              </button>
            </div>
          </div>

          {executionMode === 'batch' && (
            <div className="aq-stats">
              <div className="aq-stat">
                <span className="aq-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg></span>
                <span><b>{connections.length}</b><small>Connections available</small></span>
              </div>
              <div className="aq-stat is-teal">
                <span className="aq-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
                <span><b>{selectedConnIds.length}</b><small>Connections selected</small></span>
              </div>
              <div className="aq-stat is-blue">
                <span className="aq-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></svg></span>
                <span><b>{totalBatchTargetsCount}</b><small>Database targets</small></span>
              </div>
            </div>
          )}
        </div>

        {/* 1. SINGLE CONNECTION SELECTOR */}
        {executionMode === 'single' && (
          <div className="cd-panel bg-white rounded-xl border border-gray-200 p-5 mb-6 flex flex-wrap items-end gap-4 shadow-sm text-left animate-fadeIn">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Select Connection
              </label>
              <select
                value={selectedConnection}
                onChange={(e) => {
                  setSelectedConnection(e.target.value);
                  setSelectedDatabase('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 outline-none focus:border-gray-500 focus:bg-white transition font-medium"
              >
                <option value="">🐬 Default App Database (MySQL)</option>
                {connections.map(c => (
                  <option key={c._id} value={c._id}>
                    {c.type === 'mysql' ? '🐬' : c.type === 'postgresql' ? '🐘' : c.type === 'mongodb' ? '🍃' : '🔴'} {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            {(connectionType === 'mysql' || connectionType === 'postgresql') && databases.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Select Database / Schema
                </label>
                <select
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 outline-none focus:border-gray-500 focus:bg-white transition font-medium"
                >
                  {databases.map(db => (
                    <option key={db} value={db}>
                      {db}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => {
                fetchConnections();
                if (selectedConnection) {
                  fetchDatabases(selectedConnection);
                }
              }}
              title="Refresh Connections & Databases"
              className="p-2 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition shadow-sm h-[38px] w-[38px] flex items-center justify-center cursor-pointer mr-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M21 4v5h-5" />
              </svg>
            </button>

            <button
              onClick={() => setShowImportWizard(!showImportWizard)}
              title="Import CSV/Excel Data"
              className={`px-3 py-2 border rounded-lg transition-all text-xs font-bold flex items-center gap-1.5 h-[38px] cursor-pointer shadow-xs ${
                showImportWizard 
                  ? 'bg-teal-600 text-white border-teal-650' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
              }`}
            >
              <span>📂</span> Import Wizard
            </button>
          </div>
        )}

        {/* 2. Connections and databases the query runs on */}
        {executionMode === 'batch' && (
          <div className="aq-panel mb-6 text-left animate-fadeIn">
            <div className="aq-panel-head">
              <div className="flex items-start gap-3 min-w-0">
                <span className="aq-head-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></svg></span>
                <div className="min-w-0">
                  <h3>Choose Connections &amp; Databases</h3>
                  <p>Tick a connection, then pick the databases your query should run on.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    fetchConnections();
                    selectedConnIds.forEach(id => fetchDatabasesForConn(id));
                  }}
                  title="Refresh Connections & Databases"
                  className="aq-btn"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 01-14.3 4.9M4 12a8 8 0 0114.3-4.9M18 3v4.5h-4.5M6 21v-4.5h4.5" /></svg>
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportWizard(!showImportWizard)}
                  className={`aq-btn ${showImportWizard ? 'is-on' : ''}`}
                  aria-pressed={showImportWizard}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
                  Import Wizard
                </button>
              </div>
            </div>

            <div className="aq-toolbar">
              <div className="aq-chips" role="group" aria-label="Database type">
                {['all', ...Object.keys(ENGINE_INFO)].map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={batchTypeFilter === type}
                    onClick={() => setBatchTypeFilter(type)}
                    className={`aq-chip ${batchTypeFilter === type ? 'is-active' : ''}`}
                    style={type === 'all' ? undefined : { '--chip': ENGINE_INFO[type].color }}
                  >
                    {type === 'all'
                      ? <span className="aq-chip-all"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg></span>
                      : <EngineIcon type={type} size={18} />}
                    {type === 'all' ? 'All' : ENGINE_INFO[type].label}
                    <span className="aq-chip-count">{type === 'all' ? connections.length : (batchTypeCounts[type] || 0)}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="aq-search">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                  <input
                    type="text"
                    placeholder="Filter connections..."
                    aria-label="Filter connections"
                    value={batchConnSearch}
                    onChange={(e) => setBatchConnSearch(e.target.value)}
                  />
                </div>
                <button type="button" onClick={handleSelectAllFilteredConnections} className="aq-btn">
                  {filteredBatchConnections.length > 0 && filteredBatchConnections.every(c => selectedConnIds.includes(c._id))
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>
            </div>

            {/* Connection & DB Tree List */}
            {filteredBatchConnections.length === 0 ? (
              <div className="aq-empty">No database connections found matching this filter.</div>
            ) : (
              <div className="aq-conn-grid">
                {filteredBatchConnections.map(conn => {
                  const isChecked = selectedConnIds.includes(conn._id);
                  const connDbs = connDatabasesMap[conn._id] || (conn.database ? [conn.database] : []);
                  const selectedDbs = selectedDatabasesMap[conn._id] || [];
                  const isLoadingDbs = !!connDbLoadingMap[conn._id];
                  const cloudText = cloudLabel(conn.cloudProvider, conn.cloudService);

                  return (
                    <div
                      key={conn._id}
                      className={`aq-conn ${isChecked ? 'is-selected' : ''}`}
                      style={{ '--engine': ENGINE_INFO[conn.type]?.color || '#0d9488' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label className="aq-conn-main">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectConnection(conn._id)}
                          />
                          <span className="aq-conn-logo"><EngineIcon type={conn.type} size={24} /></span>
                          <span className="min-w-0">
                            <span className="aq-conn-name">{conn.name}</span>
                            <span className="aq-conn-tags">
                              <span className="aq-type">{ENGINE_INFO[conn.type]?.label || conn.type}</span>
                              {cloudText && <span className="aq-cloud">{cloudText}</span>}
                            </span>
                            <span className="aq-conn-host" title={connectionHost(conn)}>{connectionHost(conn)}</span>
                          </span>
                        </label>

                        {isChecked && (
                          <span className="aq-db-count">
                            {selectedDbs.length} DB{selectedDbs.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Databases to run on (shown when the connection is ticked) */}
                      {isChecked && (
                        <div className="aq-dbs">
                          <div className="aq-dbs-head">
                            <span>Databases</span>
                            {connDbs.length > 1 && (
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => selectAllDatabasesForConn(conn._id)} className="aq-mini">All</button>
                                <button type="button" onClick={() => clearAllDatabasesForConn(conn._id)} className="aq-mini">None</button>
                              </div>
                            )}
                          </div>

                          {isLoadingDbs ? (
                            <div className="aq-dbs-note">
                              <span className="aq-spinner" />
                              Loading databases...
                            </div>
                          ) : connDbs.length === 0 ? (
                            <div className="aq-dbs-note">No accessible databases listed</div>
                          ) : (
                            <div className="aq-db-list">
                              {connDbs.map(dbName => {
                                const isDbSelected = selectedDbs.includes(dbName);
                                return (
                                  <button
                                    key={dbName}
                                    type="button"
                                    aria-pressed={isDbSelected}
                                    onClick={() => toggleSelectDatabase(conn._id, dbName)}
                                    className={`aq-db ${isDbSelected ? 'is-on' : ''}`}
                                  >
                                    {isDbSelected ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}
                                    <span>{dbName}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* What the next run covers */}
            <div className="aq-summary">
              <div className="flex flex-wrap items-center gap-2">
                <span className="aq-live-dot" />
                <span>Ready to run on</span>
                <b className="aq-summary-chip">{selectedConnIds.length} connection{selectedConnIds.length !== 1 ? 's' : ''}</b>
                <b className="aq-summary-chip is-blue">{totalBatchTargetsCount} database{totalBatchTargetsCount !== 1 ? 's' : ''}</b>
              </div>
              <span className="aq-summary-hint">The query runs on every selected database at once.</span>
            </div>
          </div>
        )}

        {/* CSV Import Wizard Panel */}
        {showImportWizard && (
          <div className="cd-panel bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm animate-fadeIn text-left">
            <div className="flex items-center justify-between border-b border-gray-150 pb-3 mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span>📂</span> CSV / Excel Data Import Wizard
              </h3>
              <button 
                onClick={() => setShowImportWizard(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportCSV} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 font-medium">
                    Select CSV File
                  </label>
                  <input
                    type="file"
                    id="csv-file-input"
                    accept=".csv"
                    onChange={handleCSVFileChange}
                    className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 font-medium">
                    Target Table Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. users"
                    value={importTableName}
                    onChange={e => setImportTableName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none bg-gray-50 focus:bg-white focus:ring-1 focus:ring-[#0d9da4] focus:border-[#0d9da4] transition font-medium"
                  />
                </div>
              </div>

              {/* Import status alerts */}
              {importError && (
                <div className="bg-red-50 border border-red-200 text-red-650 text-xs px-4 py-3 rounded-lg">
                  ❌ {importError}
                </div>
              )}
              {importSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-600 text-xs px-4 py-3 rounded-lg">
                  ✅ {importSuccess}
                </div>
              )}

              {/* Grid Preview of loaded CSV */}
              {importHeaders.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden mt-4">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-150 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    CSV Data Preview (First 5 Rows)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-gray-100 border-b border-gray-200 text-[10px] font-bold text-gray-650 uppercase">
                        <tr>
                          {importHeaders.map(h => (
                            <th key={h} className="px-4 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150">
                        {importPreviewRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-gray-50/50">
                            {importHeaders.map(h => (
                              <td key={h} className="px-4 py-2 text-gray-600">{row[h] || 'NULL'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={importLoading || !importFile || !importTableName.trim()}
                  className="px-5 py-2 bg-[#0d9da4] hover:opacity-90 text-white text-xs font-bold rounded-lg transition shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {importLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      Importing...
                    </>
                  ) : (
                    <>
                      <span>▶</span> Start Import Wizard
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Query editor: same layout as the connection Query Editor tab */}
        <div className={isExpanded ? 'fixed inset-4 z-50 overflow-y-auto rounded-2xl bg-[#f4f7fb] dark:bg-[#0b0f19] p-4 shadow-2xl' : ''}>
          <div className="cd-qe-bar select-none">
            {/* Tabs list & add button */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {queryTabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => {
                      setActiveQueryTabId(tab.id);
                      setResults([]);
                      setColumns([]);
                      setError('');
                      setMessage('');
                      setBatchResults(null);
                    }}
                    className={`cd-qe-tab ${tab.id === activeQueryTabId ? 'is-active' : ''}`}
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" />
                    </svg>
                    <span className="whitespace-nowrap" title="Double-click to rename this tab" onDoubleClick={() => renameQueryTab(tab)}>
                      {tab.name}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); renameQueryTab(tab); }}
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
                        onClick={(event) => removeQueryTab(tab.id, event)}
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
                ))}
              </div>
              <button type="button" onClick={addQueryTab} title="Open new query tab" aria-label="Open new query tab" className="cd-qe-icon-btn shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>

            {/* Tools */}
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <button type="button" onClick={formatSQLQuery} disabled={!query.trim()} title="Beautify / format SQL" className="cd-qe-tool">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 6h16M4 12h10M4 18h13" />
                </svg>
                Beautify
              </button>
              {(executionMode === 'single'
                ? connectionType && connectionType !== 'mongodb'
                : (() => {
                  const selectedTypes = selectedConnIds.map(id => connections.find(conn => conn._id === id)?.type);
                  return selectedTypes.length > 0 && new Set(selectedTypes).size === 1 && selectedTypes[0] !== 'mongodb';
                })()) && (
                <button type="button" onClick={runExplain} disabled={!query.trim() || loading} title="Explain query execution plan" className="cd-qe-tool">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                  Explain
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setScriptTitle(activeQueryTab?.name || '');
                  setShowSaveScriptModal(true);
                }}
                disabled={!query.trim()}
                title="Save script to your library"
                className="cd-qe-tool"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" />
                </svg>
                Save
              </button>
              <button type="button" onClick={() => setShowSavedQueriesModal(true)} title="Open saved scripts" className="cd-qe-tool">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Scripts
                <span className="cd-qe-count">{savedQueries.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowHistory(previous => !previous)}
                title="Toggle query history panel"
                className={`cd-qe-tool ${showHistory ? 'is-active' : ''}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                </svg>
                History
              </button>
              <EditorThemeMenu appearance={appearance} />
            </div>
          </div>

          <div className="flex gap-4 items-start relative mb-4">
            {/* Main editor box */}
            <div className="flex-1 min-w-0">
              <div className="cd-panel p-4 relative">
                <div className={`sql-editor-container ${isExpanded ? 'h-[calc(100vh-210px)]' : 'h-[320px]'}`} style={editorStyleVars}>
                  <button
                    type="button"
                    onClick={handleCopyQueryText}
                    title="Copy query text to clipboard"
                    aria-live="polite"
                    className={`cd-copy-btn ${copiedQueryText ? 'is-copied' : ''}`}
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
                    onChange={(e) => handleTextareaChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onScroll={handleScroll}
                    placeholder="Write your query — press Ctrl+Enter to run, Ctrl+/ to comment/uncomment"
                    className="sql-editor-textarea"
                  />
                  <pre
                    ref={highlightRef}
                    className="sql-editor-highlight"
                    dangerouslySetInnerHTML={{
                      __html: highlightSQL(query) + '\n'
                    }}
                  />

                  {/* Floating Suggestions List */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div
                      className="absolute bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden w-64 max-h-48 overflow-y-auto"
                      style={{
                        bottom: '10px',
                        left: '60px',
                      }}
                    >
                      <div className="bg-gray-50 dark:bg-gray-900 px-2 py-1 border-b border-gray-150 dark:border-gray-750 flex justify-between items-center text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                        <span>Suggestions</span>
                        <span>Tab/Enter</span>
                      </div>
                      {suggestions.map((s, idx) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => selectSuggestion(s)}
                          className={`w-full px-3 py-1.5 text-left text-xs font-semibold font-mono flex items-center justify-between transition-colors border-none ${
                            selectedSuggestionIdx === idx
                              ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span>{s}</span>
                          <span className="text-[9px] text-gray-400 font-normal">
                            {SQL_KEYWORDS.includes(s) ? 'keyword' : 'table'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Run bar */}
                <div className="mt-3 flex items-center justify-between flex-wrap gap-3 select-none">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runQuery(false)}
                      disabled={loading || !query.trim()}
                      title="Run the selected text or the statement at the cursor (Ctrl+Enter)"
                      className="cd-btn !h-10 !px-5"
                    >
                      {loading ? (
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M7 4.5v15l12-7.5z" />
                        </svg>
                      )}
                      {loading
                        ? (executionMode === 'batch' ? `Running (${totalBatchTargetsCount} targets)...` : 'Running...')
                        : (executionMode === 'batch' ? `Run Batch (${totalBatchTargetsCount} Target${totalBatchTargetsCount !== 1 ? 's' : ''})` : 'Run Query')}
                    </button>
                    <button
                      type="button"
                      onClick={() => runQuery(true)}
                      disabled={loading || !query.trim()}
                      title="Run the entire script"
                      className="cd-btn-outline !h-10"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                      </svg>
                      Run All
                    </button>
                  </div>

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
                      onClick={() => setIsExpanded(!isExpanded)}
                      title={isExpanded ? 'Exit fullscreen editor' : 'Open the editor in fullscreen'}
                      className="cd-btn-outline"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={isExpanded ? 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7' : 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7'} />
                      </svg>
                      {isExpanded ? 'Exit Fullscreen' : 'Fullscreen'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Collapsible history drawer */}
            {showHistory && (
              <div className="cd-panel w-80 p-4 flex flex-col h-[412px] shrink-0">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 select-none">
                  <h4 className="text-[13px] font-bold text-slate-900">Query History ({queryHistory.length})</h4>
                  <div className="flex items-center gap-1">
                    {queryHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setQueryHistory([]);
                          try {
                            localStorage.removeItem(`dms_query_history_${user?.id || user?._id || 'guest'}`);
                          } catch (err) {
                            console.error('Failed to clear query history:', err);
                          }
                        }}
                        className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                    <button type="button" onClick={() => setShowHistory(false)} className="cd-icon-btn !w-7 !h-7" aria-label="Close history">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
                {queryHistory.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-center p-4">
                    <p className="text-[12px] text-slate-400">Queries you run will appear here.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {queryHistory.map((item, index) => (
                      <button
                        key={`${item.timestamp}-${index}`}
                        type="button"
                        onClick={() => {
                          setQuery(item.query);
                          setResults([]);
                          setColumns([]);
                          setBatchResults(null);
                          setError('');
                          setShowHistory(false);
                        }}
                        title="Click to restore query"
                        className="block w-full p-2.5 rounded-lg bg-slate-50 border border-slate-100 hover:border-teal-500 text-left cursor-pointer transition"
                      >
                        <code className="text-[11px] text-slate-700 font-mono line-clamp-2 block break-all whitespace-pre-wrap">{item.query}</code>
                        <span className="mt-1 block text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg">
            ❌ {error}
          </div>
        )}

        {/* Success Message */}
        {message && !error && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-600 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
            <span>✅ {message}</span>
            {executionTime && (
              <span className="text-xs font-mono bg-green-100 text-green-800 px-2 py-0.5 rounded font-semibold">
                Took {executionTime}ms
              </span>
            )}
          </div>
        )}

        {/* Smart Index Advisor Recommendation Alert */}
        {indexRecommendation && (
          <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3.5 rounded-lg shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-left animate-fadeIn">
            <div>
              <p className="font-bold flex items-center gap-1.5 text-amber-800 text-xs uppercase tracking-wider mb-1 font-medium">
                <span>💡</span> Smart Index Advisor recommendation
              </p>
              <p className="text-amber-700 font-medium">
                Your query filtered table <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-mono">`{indexRecommendation.table}`</code> using a <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-mono">`WHERE`</code> condition on column <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-mono">`{indexRecommendation.column}`</code>. To optimize this read path, consider indexing it.
              </p>
              <div className="mt-2 font-mono bg-amber-100/50 p-2 rounded text-[11px] text-amber-950 select-all border border-amber-200/40">
                {indexRecommendation.sql}
              </div>
            </div>
            <button
              onClick={applyIndexRecommendation}
              className="whitespace-nowrap px-4 py-2 bg-amber-600 hover:bg-amber-755 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5 self-start md:self-center cursor-pointer border-none"
            >
              <span>⚡</span> Auto-Apply Index
            </button>
          </div>
        )}

        {/* Results of a run on several databases */}
        {executionMode === 'batch' && batchResults && (
          <div className="aq-panel aq-results mb-6 text-left animate-fadeIn">
            <div className="aq-results-head">
              <div className="flex items-center gap-3 min-w-0">
                <span className="aq-head-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg></span>
                <div className="min-w-0">
                  <h3>Batch Results</h3>
                  <p>Ran on {batchResults.summary.total} target{batchResults.summary.total !== 1 ? 's' : ''} in {batchResults.summary.totalTime} ms</p>
                </div>
              </div>
              <div className="aq-metrics">
                <div className="aq-metric"><small>Targets</small><b>{batchResults.summary.total}</b></div>
                <div className="aq-metric is-ok"><small>Success</small><b>{batchResults.summary.successCount}</b></div>
                <div className={`aq-metric ${batchResults.summary.errorCount > 0 ? 'is-bad' : ''}`}><small>Errors</small><b>{batchResults.summary.errorCount}</b></div>
                <div className="aq-metric"><small>Time</small><b>{batchResults.summary.totalTime} ms</b></div>
              </div>
            </div>

            {/* Target Tab Navigation */}
            <div className="aq-tabs" role="tablist" aria-label="Batch results">
              <button
                type="button"
                role="tab"
                aria-selected={activeResultKey === 'summary'}
                onClick={() => setActiveResultKey('summary')}
                className={`aq-tab ${activeResultKey === 'summary' ? 'is-active' : ''}`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
                Overview
                <span className="aq-tab-count">{batchResults.targets.length}</span>
              </button>

              {batchResults.targets.map((tgt) => (
                <button
                  key={tgt.key}
                  type="button"
                  role="tab"
                  aria-selected={activeResultKey === tgt.key}
                  onClick={() => setActiveResultKey(tgt.key)}
                  className={`aq-tab ${activeResultKey === tgt.key ? 'is-active' : ''} ${tgt.status === 'error' ? 'is-error' : ''}`}
                >
                  <EngineIcon type={tgt.connectionType} size={15} />
                  <span>{tgt.connectionName} <span className="aq-tab-sep">›</span> {tgt.database}</span>
                  <span className={`aq-tab-badge ${tgt.status === 'success' ? 'is-ok' : 'is-bad'}`}>
                    {tgt.status === 'success' ? `${tgt.rowCount} row${tgt.rowCount !== 1 ? 's' : ''}` : 'Error'}
                  </span>
                </button>
              ))}
            </div>

            {/* TAB CONTENT: Overview */}
            {activeResultKey === 'summary' && (
              <div className="overflow-x-auto">
                <table className="aq-table w-full text-left">
                  <thead>
                    <tr>
                      <th>Connection</th>
                      <th>Database</th>
                      <th>Status</th>
                      <th>Result</th>
                      <th>Time</th>
                      <th className="text-right">Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchResults.targets.map((tgt) => (
                      <tr key={tgt.key}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <span className="aq-table-logo"><EngineIcon type={tgt.connectionType} size={18} /></span>
                            <span className="font-semibold aq-strong">{tgt.connectionName}</span>
                            <span className="aq-type">{ENGINE_INFO[tgt.connectionType]?.label || tgt.connectionType}</span>
                          </div>
                        </td>
                        <td className="font-mono aq-db-name">{tgt.database}</td>
                        <td>
                          {tgt.status === 'success' ? (
                            <span className="aq-status is-ok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Success</span>
                          ) : (
                            <span className="aq-status is-bad"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>Error</span>
                          )}
                        </td>
                        <td>
                          {tgt.status === 'success' ? (
                            <span>{tgt.message}</span>
                          ) : (
                            <span className="aq-error-text line-clamp-1" title={tgt.error}>{tgt.error}</span>
                          )}
                        </td>
                        <td className="font-mono aq-muted">{tgt.executionTime} ms</td>
                        <td className="text-right">
                          <button type="button" onClick={() => setActiveResultKey(tgt.key)} className="aq-btn is-small">
                            View
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB CONTENT: Specific Target Details */}
            {activeResultKey !== 'summary' && (() => {
              const activeTarget = batchResults.targets.find(t => t.key === activeResultKey);
              if (!activeTarget) return null;

              return (
                <div className="p-4 sm:p-5">
                  <div className="aq-target-head">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="aq-conn-logo"><EngineIcon type={activeTarget.connectionType} size={24} /></span>
                      <div className="min-w-0">
                        <h4>
                          {activeTarget.connectionName}
                          <span className="aq-tab-sep">›</span>
                          <span className="font-mono aq-db-name">{activeTarget.database}</span>
                        </h4>
                        <p>
                          Ran in {activeTarget.executionTime} ms
                          <span className={`aq-status ${activeTarget.status === 'success' ? 'is-ok' : 'is-bad'}`}>
                            {activeTarget.status === 'success' ? 'Success' : 'Error'}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {activeTarget.status === 'success' && activeTarget.results?.length > 0 && (
                        <button type="button" onClick={() => exportTargetCSV(activeTarget)} className="aq-btn">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>
                          Export CSV
                        </button>
                      )}
                      <button type="button" onClick={() => setActiveResultKey('summary')} className="aq-btn">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                        Back to Overview
                      </button>
                    </div>
                  </div>

                  {/* If Error */}
                  {activeTarget.status === 'error' && (
                    <div className="aq-error-box">
                      <p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>Query failed on this database</p>
                      <pre>{activeTarget.error}</pre>
                    </div>
                  )}

                  {/* If Success with No Rows Returned or Affected Rows */}
                  {activeTarget.status === 'success' && activeTarget.results?.length === 0 && (
                    <div className="aq-ok-box">
                      <p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{activeTarget.message || 'Statement executed successfully. No rows returned.'}</p>
                      <small>Time: {activeTarget.executionTime} ms</small>
                    </div>
                  )}

                  {/* If Success with Tabular Data Rows */}
                  {activeTarget.status === 'success' && activeTarget.results?.length > 0 && (
                    <div className="aq-data">
                      <div className="aq-data-head">
                        <span>{activeTarget.results.length} row{activeTarget.results.length !== 1 ? 's' : ''} returned</span>
                        <span className="font-mono">{activeTarget.executionTime} ms</span>
                      </div>
                      <div className="overflow-x-auto max-h-[450px]">
                        <table className="aq-table w-full text-left">
                          <thead>
                            <tr>
                              {activeTarget.columns.map((col, cIdx) => (
                                <th key={cIdx} className="whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activeTarget.results.map((row, rIdx) => (
                              <tr key={rIdx}>
                                {activeTarget.columns.map((col, cIdx) => (
                                  <td key={cIdx} className="whitespace-nowrap font-mono">
                                    {row[col] === null ? (
                                      <span className="aq-null">null</span>
                                    ) : (
                                      String(row[col])
                                    )}
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
              );
            })()}
          </div>
        )}

        {/* Results Table (Single Mode) */}
        {executionMode === 'single' && results.length > 0 && (
          <div className="cd-panel bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm animate-fadeIn">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">
                Results — {results.length} rows
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">

                {/* Head */}
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {columns.map((col, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Body */}
                <tbody className="divide-y divide-gray-100">
                  {results.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      {columns.map((col, j) => (
                        <td
                          key={j}
                          className="px-4 py-3 text-gray-700 whitespace-nowrap font-mono"
                        >
                          {row[col] === null ? (
                            <span className="text-gray-300 italic">null</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          </div>
        )}

        {showSaveScriptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <h3 className="mb-1 text-lg font-bold text-gray-900">💾 Save Query Script</h3>
              <p className="mb-4 text-xs text-gray-500">Save this script to reuse it across connections.</p>
              <label className="mb-1 block text-xs font-bold text-gray-700">Script title</label>
              <input
                autoFocus
                value={scriptTitle}
                onChange={event => setScriptTitle(event.target.value)}
                placeholder="e.g. Monthly active users"
                className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
              />
              <label className="mb-1 block text-xs font-bold text-gray-700">Description (optional)</label>
              <textarea
                rows={3}
                value={scriptDescription}
                onChange={event => setScriptDescription(event.target.value)}
                placeholder="What does this script do?"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-500"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSaveScriptModal(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveScript}
                  disabled={savingScript || !scriptTitle.trim()}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
                >
                  {savingScript ? 'Saving...' : 'Save Script'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showSavedQueriesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">📁 Saved Scripts Library</h3>
                  <p className="text-xs text-gray-500">{savedQueries.length} scripts in your library</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSavedQueriesModal(false)}
                  className="rounded px-2 text-lg font-bold text-gray-400 hover:text-gray-800 cursor-pointer"
                >
                  ×
                </button>
              </div>
              {savedQueries.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">No saved scripts yet. Save a query to see it here.</p>
              ) : (
                <div className="space-y-3 overflow-y-auto pr-1">
                  {savedQueries.map(item => (
                    <div key={item._id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-gray-900">{item.title}</h4>
                          {item.description && <p className="mt-1 text-xs text-gray-500">{item.description}</p>}
                          <p className="mt-1 text-[10px] text-gray-400">
                            {item.database || 'Any database'}{item.connectionName ? ` · ${item.connectionName}` : ''}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => loadSavedQuery(item)}
                            className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 cursor-pointer"
                          >
                            Open in Editor
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSavedQuery(item._id)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <pre className="mt-3 max-h-28 overflow-auto rounded-lg border border-gray-200 bg-white p-3 text-[11px] text-gray-700">{item.query}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}