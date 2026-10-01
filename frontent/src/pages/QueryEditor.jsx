import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import API from '../api/axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

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
  const [query, setQuery] = useState(
    location.state?.query || 'SELECT * FROM users;'
  );
  const [results, setResults] = useState([]);
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const lineCounterRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(false);

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

  const runQuery = async (forceRunAll = false) => {
    setError('');
    setMessage('');
    setResults([]);
    setExecutionTime(null);
    setIndexRecommendation(null);
    setLoading(true);

    let queryToRun = query;
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

    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      runQuery(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-left">

      {/* Navbar */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 text-left flex items-center gap-2">
              <span>SQL Query Editor</span>
              {executionMode === 'batch' && (
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                  Batch Multi-Target Active
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500 mt-1 text-left">
              {executionMode === 'batch' 
                ? 'Execute a single SQL script across multiple connections and multiple databases simultaneously.'
                : 'Execute MySQL, PostgreSQL, MongoDB and Oracle queries — or press Ctrl+Enter to run.'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-1 bg-gray-200/80 rounded-xl border border-gray-300 self-start sm:self-auto shadow-inner">
            <button
              type="button"
              onClick={() => setExecutionMode('single')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                executionMode === 'single'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>🎯</span> Single Connection
            </button>
            <button
              type="button"
              onClick={() => {
                setExecutionMode('batch');
                if (selectedConnIds.length === 0 && connections.length > 0) {
                  const initialId = selectedConnection || connections[0]._id;
                  setSelectedConnIds([initialId]);
                  if (!connDatabasesMap[initialId]) fetchDatabasesForConn(initialId);
                }
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                executionMode === 'batch'
                  ? 'bg-[#0d9da4] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>⚡</span> All Connection Query
              {totalBatchTargetsCount > 0 && (
                <span className="bg-white/20 px-1.5 py-0.2 rounded-full text-[10px] ml-0.5">
                  {totalBatchTargetsCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 1. SINGLE CONNECTION SELECTOR */}
        {executionMode === 'single' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 flex flex-wrap items-end gap-4 shadow-sm text-left animate-fadeIn">
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

        {/* 2. MULTI-CONNECTION & MULTI-DATABASE DISPATCHER PANEL */}
        {executionMode === 'batch' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm text-left animate-fadeIn">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-gray-150 gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>🌐</span> Multi-Connection & Multi-Database Target Dispatcher
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select database engine type, check connections, and select multiple databases per connection.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    fetchConnections();
                    selectedConnIds.forEach(id => fetchDatabasesForConn(id));
                  }}
                  title="Refresh Connections & Databases"
                  className="px-3 py-1.5 border border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M21 4v5h-5" />
                  </svg>
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportWizard(!showImportWizard)}
                  className={`px-3 py-1.5 border rounded-lg transition text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                    showImportWizard ? 'bg-teal-600 text-white border-teal-650' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
                  }`}
                >
                  <span>📂</span> Import Wizard
                </button>
              </div>
            </div>

            {/* Engine Type Filter & Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              {/* Type Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: 'All Engines', icon: '🗄️' },
                  { id: 'mysql', label: 'MySQL', icon: '🐬' },
                  { id: 'postgresql', label: 'PostgreSQL', icon: '🐘' },
                  { id: 'mongodb', label: 'MongoDB', icon: '🍃' },
                  { id: 'oracle', label: 'Oracle', icon: '🔴' }
                ].map(type => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setBatchTypeFilter(type.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                      batchTypeFilter === type.id
                        ? 'bg-[#0d9da4] text-white border-[#0d9da4] shadow-xs'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span>{type.icon}</span> {type.label}
                  </button>
                ))}
              </div>

              {/* Search & Bulk Select */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter connections..."
                  value={batchConnSearch}
                  onChange={(e) => setBatchConnSearch(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-gray-50 focus:bg-white outline-none focus:border-[#0d9da4] transition w-44 font-medium"
                />
                <button
                  type="button"
                  onClick={handleSelectAllFilteredConnections}
                  className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:text-teal-700 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition cursor-pointer"
                >
                  {filteredBatchConnections.length > 0 && filteredBatchConnections.every(c => selectedConnIds.includes(c._id))
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>
            </div>

            {/* Connection & DB Tree List */}
            {filteredBatchConnections.length === 0 ? (
              <div className="py-8 text-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p className="text-sm text-gray-500 font-medium">No database connections found matching this filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto p-1">
                {filteredBatchConnections.map(conn => {
                  const isChecked = selectedConnIds.includes(conn._id);
                  const connDbs = connDatabasesMap[conn._id] || (conn.database ? [conn.database] : []);
                  const selectedDbs = selectedDatabasesMap[conn._id] || [];
                  const isLoadingDbs = !!connDbLoadingMap[conn._id];

                  return (
                    <div
                      key={conn._id}
                      className={`border rounded-xl p-3.5 transition-all flex flex-col justify-between ${
                        isChecked
                          ? 'border-teal-400 bg-teal-50/20 shadow-xs'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      {/* Connection Header */}
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-start gap-2.5 cursor-pointer flex-1 select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectConnection(conn._id)}
                            className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 h-4 w-4 cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">
                                {conn.type === 'mysql' ? '🐬' : conn.type === 'postgresql' ? '🐘' : conn.type === 'mongodb' ? '🍃' : '🔴'}
                              </span>
                              <span className="text-xs font-bold text-gray-900">{conn.name}</span>
                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 border border-gray-200">
                                {conn.type}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                              {conn.host}:{conn.port || (conn.type === 'mysql' ? 3306 : 5432)}
                            </p>
                          </div>
                        </label>

                        {isChecked && (
                          <span className="text-[11px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {selectedDbs.length} DB{selectedDbs.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Databases Multi-Select area (shown when connection is checked) */}
                      {isChecked && (
                        <div className="mt-3 pt-2.5 border-t border-teal-100/80">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">
                              Select Databases:
                            </span>
                            <div className="flex items-center gap-1">
                              {connDbs.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => selectAllDatabasesForConn(conn._id)}
                                    className="text-[10px] font-bold text-teal-700 hover:underline cursor-pointer"
                                  >
                                    All
                                  </button>
                                  <span className="text-gray-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => clearAllDatabasesForConn(conn._id)}
                                    className="text-[10px] font-bold text-gray-500 hover:underline cursor-pointer"
                                  >
                                    None
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {isLoadingDbs ? (
                            <div className="py-2 flex items-center gap-1.5 text-xs text-teal-700">
                              <div className="w-3 h-3 border-2 border-teal-600/30 border-t-teal-600 rounded-full animate-spin"></div>
                              <span>Loading databases...</span>
                            </div>
                          ) : connDbs.length === 0 ? (
                            <div className="text-[11px] text-gray-400 italic">No accessible databases listed</div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                              {connDbs.map(dbName => {
                                const isDbSelected = selectedDbs.includes(dbName);
                                return (
                                  <button
                                    key={dbName}
                                    type="button"
                                    onClick={() => toggleSelectDatabase(conn._id, dbName)}
                                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1 border ${
                                      isDbSelected
                                        ? 'bg-teal-600 text-white border-teal-700 font-bold shadow-xs'
                                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                                    }`}
                                  >
                                    <span>{isDbSelected ? '✓' : '+'}</span>
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

            {/* Target Summary Status Banner */}
            <div className="mt-4 pt-3 border-t border-gray-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-semibold text-gray-700">
                  Ready Target Dispatch: <span className="text-teal-700 font-bold">{selectedConnIds.length}</span> Connection{selectedConnIds.length !== 1 ? 's' : ''} &middot; <span className="text-teal-700 font-bold">{totalBatchTargetsCount}</span> Database Target{totalBatchTargetsCount !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="text-[11px] text-gray-500">
                Single query script will execute concurrently across all selected databases in one click.
              </span>
            </div>
          </div>
        )}

        {/* CSV Import Wizard Panel */}
        {showImportWizard && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm animate-fadeIn text-left">
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

        {/* Query Box */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">

          {/* Query Toolbar */}
          <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => runQuery(false)}
                disabled={loading || !query.trim()}
                title="Execute Selection or Current Statement (Ctrl+Enter)"
                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <span>⚡</span> Run Selection
              </button>
              <button
                type="button"
                onClick={() => runQuery(true)}
                disabled={loading || !query.trim()}
                title="Execute Entire Script"
                className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <span>📜</span> Run All
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? "Collapse Editor View" : "Expand Editor View"}
              className="px-2.5 py-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900 rounded-lg transition shadow-xs flex items-center gap-1.5 text-xs font-bold"
            >
              <span>{isExpanded ? '↙️' : '↗️'}</span>
              <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            </button>
          </div>

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
          <div className={`sql-editor-container ${isExpanded ? 'h-[480px]' : 'h-[280px]'}`}>
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
              placeholder="SQL query yahan likho..."
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

          {/* Run Button */}
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-400">
              {/* ⚠️ DROP, TRUNCATE, ALTER, CREATE allowed nahi hai */}
              please use quiry and manage 
            </p>
            <button
              onClick={() => runQuery(false)}
              disabled={loading || !query.trim()}
              className="px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition disabled:opacity-60 font-semibold flex items-center gap-2 cursor-pointer"
            >
              {loading 
                ? (executionMode === 'batch' ? `Running (${totalBatchTargetsCount} targets)...` : 'Running...') 
                : (executionMode === 'batch' ? `▶ Run Batch (${totalBatchTargetsCount} Target${totalBatchTargetsCount !== 1 ? 's' : ''})` : '▶ Run Query')}
            </button>
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

        {/* MULTI-DATABASE BATCH EXECUTION RESULTS DASHBOARD */}
        {executionMode === 'batch' && batchResults && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm mb-6 text-left animate-fadeIn">
            {/* Top Metrics Row */}
            <div className="p-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚡</span>
                <div>
                  <h3 className="text-sm font-bold tracking-wide">Multi-Database Batch Execution Results</h3>
                  <p className="text-xs text-gray-300">
                    Dispatched query across {batchResults.summary.total} targets in {batchResults.summary.totalTime} ms
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold">
                <div className="bg-gray-800/80 border border-gray-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span className="text-gray-400">Targets:</span>
                  <span className="text-white">{batchResults.summary.total}</span>
                </div>
                <div className="bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span>✅ Success:</span>
                  <span>{batchResults.summary.successCount}</span>
                </div>
                {batchResults.summary.errorCount > 0 && (
                  <div className="bg-rose-950/60 border border-rose-700/50 text-rose-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                    <span>❌ Errors:</span>
                    <span>{batchResults.summary.errorCount}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Target Tab Navigation */}
            <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-200 overflow-x-auto text-xs">
              <button
                type="button"
                onClick={() => setActiveResultKey('summary')}
                className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  activeResultKey === 'summary'
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <span>📊</span> Overview Matrix ({batchResults.targets.length})
              </button>

              {batchResults.targets.map((tgt) => (
                <button
                  key={tgt.key}
                  type="button"
                  onClick={() => setActiveResultKey(tgt.key)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 border ${
                    activeResultKey === tgt.key
                      ? 'bg-white text-teal-800 border-teal-500 shadow-sm font-bold'
                      : tgt.status === 'error'
                      ? 'border-red-200 bg-red-50/50 text-red-700 hover:bg-red-50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <span>{tgt.connectionType === 'mysql' ? '🐬' : tgt.connectionType === 'postgresql' ? '🐘' : tgt.connectionType === 'mongodb' ? '🍃' : '🔴'}</span>
                  <span>{tgt.connectionName} &gt; {tgt.database}</span>
                  <span className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                    tgt.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {tgt.status === 'success' ? `${tgt.rowCount}r` : 'ERR'}
                  </span>
                </button>
              ))}
            </div>

            {/* TAB CONTENT: Overview Matrix */}
            {activeResultKey === 'summary' && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-gray-100 border-b border-gray-200 text-gray-600 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="px-4 py-3">Connection</th>
                      <th className="px-4 py-3">Target Database</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Result / Rows</th>
                      <th className="px-4 py-3">Latency</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150">
                    {batchResults.targets.map((tgt) => (
                      <tr key={tgt.key} className="hover:bg-gray-50/80 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span>{tgt.connectionType === 'mysql' ? '🐬' : tgt.connectionType === 'postgresql' ? '🐘' : tgt.connectionType === 'mongodb' ? '🍃' : '🔴'}</span>
                            <span className="font-bold text-gray-900">{tgt.connectionName}</span>
                            <span className="text-[10px] uppercase text-gray-500">({tgt.connectionType})</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono font-medium text-teal-800">
                          {tgt.database}
                        </td>
                        <td className="px-4 py-3">
                          {tgt.status === 'success' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-800">
                              <span>✓</span> Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                              <span>✕</span> Error
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {tgt.status === 'success' ? (
                            <span className="font-medium">{tgt.message}</span>
                          ) : (
                            <span className="text-red-600 font-mono text-[11px] line-clamp-1" title={tgt.error}>
                              {tgt.error}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-500">
                          {tgt.executionTime} ms
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setActiveResultKey(tgt.key)}
                            className="px-2.5 py-1 text-xs font-semibold text-teal-700 hover:text-white bg-teal-50 hover:bg-teal-600 rounded border border-teal-200 hover:border-teal-600 transition cursor-pointer"
                          >
                            View Output &rarr;
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
                <div className="p-4">
                  {/* Target Details Header Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-150 gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {activeTarget.connectionType === 'mysql' ? '🐬' : activeTarget.connectionType === 'postgresql' ? '🐘' : activeTarget.connectionType === 'mongodb' ? '🍃' : '🔴'}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-900">{activeTarget.connectionName}</h4>
                          <span className="text-xs text-gray-400">&gt;</span>
                          <span className="text-xs font-mono font-bold text-teal-700">{activeTarget.database}</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Executed in {activeTarget.executionTime} ms &middot; Status: {activeTarget.status.toUpperCase()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeTarget.status === 'success' && activeTarget.results?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => exportTargetCSV(activeTarget)}
                          className="px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <span>📥</span> Export CSV
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveResultKey('summary')}
                        className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold transition cursor-pointer"
                      >
                        Back to Overview
                      </button>
                    </div>
                  </div>

                  {/* If Error */}
                  {activeTarget.status === 'error' && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
                      <p className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <span>❌</span> Database Query Execution Error
                      </p>
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all mt-1 bg-white/70 p-3 rounded-lg border border-red-200">
                        {activeTarget.error}
                      </pre>
                    </div>
                  )}

                  {/* If Success with No Rows Returned or Affected Rows */}
                  {activeTarget.status === 'success' && activeTarget.results?.length === 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
                      <p className="text-sm font-semibold text-gray-700">
                        ✅ {activeTarget.message || 'Statement executed successfully. No rows returned.'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Latency: {activeTarget.executionTime} ms</p>
                    </div>
                  )}

                  {/* If Success with Tabular Data Rows */}
                  {activeTarget.status === 'success' && activeTarget.results?.length > 0 && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-150 flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-700">
                          {activeTarget.results.length} rows returned
                        </span>
                        <span className="text-gray-400 font-mono text-[11px]">
                          {activeTarget.executionTime} ms
                        </span>
                      </div>
                      <div className="overflow-x-auto max-h-[450px]">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-100 border-b border-gray-200 sticky top-0 uppercase text-[10px] font-bold text-gray-600 tracking-wider">
                            <tr>
                              {activeTarget.columns.map((col, cIdx) => (
                                <th key={cIdx} className="px-4 py-2.5 whitespace-nowrap bg-gray-100">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-150">
                            {activeTarget.results.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-gray-50/70 transition">
                                {activeTarget.columns.map((col, cIdx) => (
                                  <td key={cIdx} className="px-4 py-2.5 text-gray-700 whitespace-nowrap font-mono">
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
                </div>
              );
            })()}
          </div>
        )}

        {/* Results Table (Single Mode) */}
        {executionMode === 'single' && results.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm animate-fadeIn">
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

      </div>
    </div>
  );
}