import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

export default function ConnectionBackup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id } = useParams();

  if (user?.role !== 'admin' && user?.permissions && !user.permissions.backup) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-left">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md text-center shadow-lg">
          <p className="text-4xl mb-4">🚫</p>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-500 mb-6">You do not have permission to access Backup & Restore features.</p>
          <button onClick={() => navigate('/dashboard')} className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition font-bold shadow-sm">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const [connectionName, setConnectionName] = useState('');
  const [connection, setConnection] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [backupMsg, setBackupMsg] = useState('');
  const [backupError, setBackupError] = useState('');
  const [loading, setLoading] = useState(true);

  // New selective backup states
  const [activeTab, setActiveTab] = useState('selective'); // 'selective' or 'server'
  const [databases, setDatabases] = useState([]); // [{ name, tables: [], loaded: false, expanded: false }]
  const [selections, setSelections] = useState({}); // { [dbName]: string[] }
  const [dbsLoading, setDbsLoading] = useState(false);
  const [tablesLoading, setTablesLoading] = useState({}); // { [dbName]: boolean }
   const [searchQuery, setSearchQuery] = useState('');
 
   // Import backup states
   const [importFile, setImportFile] = useState(null);
   const [importDbName, setImportDbName] = useState('');
   const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    const fetchConnectionDetails = async () => {
      try {
        setLoading(true);
        const connRes = await API.get('/connections');
        const conn = connRes.data.connections.find(c => c._id === id);
        if (!conn) {
          throw new Error('Connection not found in your list! Please go back to the Connections page and select it again.');
        }
        setConnectionName(conn.name);
        setConnection(conn);
      } catch (err) {
        console.error('Error loading backup page connection configs:', err);
        setBackupError(err.response?.data?.message || err.message || 'Failed to load connection details.');
      } finally {
        setLoading(false);
      }
    };
    fetchConnectionDetails();
  }, [id]);

  useEffect(() => {
    if (connection) {
      fetchDatabases();
    }
  }, [connection]);

  const fetchDatabases = async () => {
    setDbsLoading(true);
    setBackupError('');
    try {
      const res = await API.get(`/connections/${id}/databases`);
      if (res.data?.success) {
        const dbList = res.data.databases.map(dbName => ({
          name: dbName,
          tables: [],
          loaded: false,
          expanded: false
        }));
        setDatabases(dbList);
      }
    } catch (err) {
      console.error('Error loading databases:', err);
      setBackupError('Failed to load databases of this server.');
    } finally {
      setDbsLoading(false);
    }
  };

  const toggleExpandDb = async (dbName) => {
    const dbIndex = databases.findIndex(d => d.name === dbName);
    if (dbIndex === -1) return;

    const db = databases[dbIndex];
    const newDbs = [...databases];

    if (!db.loaded) {
      setTablesLoading(prev => ({ ...prev, [dbName]: true }));
      try {
        const res = await API.get(`/connections/${id}/objects?database=${dbName}`);
        if (res.data?.success) {
          const type = res.data.type;
          let tableNames = [];
          if (type === 'mongodb') {
            tableNames = (res.data.result?.collections || []).map(c => c.name);
          } else {
            tableNames = (res.data.result?.tables || []).map(t => Object.values(t)[0]);
          }
          newDbs[dbIndex] = {
            ...db,
            tables: tableNames,
            loaded: true,
            expanded: !db.expanded,
          };
        }
      } catch (err) {
        console.error(`Error loading tables for DB ${dbName}:`, err);
        setBackupError(`Failed to fetch tables for ${dbName}`);
      } finally {
        setTablesLoading(prev => ({ ...prev, [dbName]: false }));
      }
    } else {
      newDbs[dbIndex] = {
        ...db,
        expanded: !db.expanded,
      };
    }
    setDatabases(newDbs);
  };

  const handleDbCheckboxChange = async (dbName, currentState) => {
    const dbIndex = databases.findIndex(d => d.name === dbName);
    if (dbIndex === -1) return;
    const db = databases[dbIndex];

    let tables = db.tables;
    if (!db.loaded) {
      setTablesLoading(prev => ({ ...prev, [dbName]: true }));
      try {
        const res = await API.get(`/connections/${id}/objects?database=${dbName}`);
        if (res.data?.success) {
          const type = res.data.type;
          if (type === 'mongodb') {
            tables = (res.data.result?.collections || []).map(c => c.name);
          } else {
            tables = (res.data.result?.tables || []).map(t => Object.values(t)[0]);
          }
          const newDbs = [...databases];
          newDbs[dbIndex] = {
            ...db,
            tables,
            loaded: true,
          };
          setDatabases(newDbs);
        }
      } catch (err) {
        console.error(`Error loading tables for DB ${dbName}:`, err);
        setBackupError(`Failed to fetch tables for ${dbName} selection`);
        setTablesLoading(prev => ({ ...prev, [dbName]: false }));
        return;
      } finally {
        setTablesLoading(prev => ({ ...prev, [dbName]: false }));
      }
    }

    setSelections(prev => {
      const nextSelections = { ...prev };
      if (currentState === 'all') {
        // Uncheck all
        delete nextSelections[dbName];
      } else {
        // Check all
        nextSelections[dbName] = [...tables];
      }
      return nextSelections;
    });
  };

  const handleTableCheckboxChange = (dbName, tableName) => {
    setSelections(prev => {
      const nextSelections = { ...prev };
      const currentSelected = nextSelections[dbName] || [];

      if (currentSelected.includes(tableName)) {
        nextSelections[dbName] = currentSelected.filter(t => t !== tableName);
        if (nextSelections[dbName].length === 0) {
          delete nextSelections[dbName];
        }
      } else {
        nextSelections[dbName] = [...currentSelected, tableName];
      }
      return nextSelections;
    });
  };

  const getDbSelectionState = (db) => {
    const selected = selections[db.name];
    if (!selected || selected.length === 0) return 'none';
    if (!db.loaded) return 'all'; // If not loaded but exists in selections, assume all checked
    if (selected.length === db.tables.length) return 'all';
    return 'partial';
  };

  const takeBackup = async () => {
    setBackupLoading(true);
    setBackupError('');
    setBackupMsg('');
    try {
      const res = await API.get(`/backup/download?connectionId=${id}`, {
        responseType: 'blob',
      });
      const fileExt = connection?.type === 'mongodb' ? 'json' : 'sql';
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `backup_server_${Date.now()}.${fileExt}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setBackupMsg('Backup downloaded successfully!');
    } catch (err) {
      setBackupError('Backup failed!');
    } finally {
      setBackupLoading(false);
    }
  };

  const takeSelectedBackup = async () => {
    const totalDbsSelected = Object.keys(selections).length;
    if (totalDbsSelected === 0) {
      setBackupError('Please select at least one database or table to generate backup!');
      return;
    }

    setBackupLoading(true);
    setBackupError('');
    setBackupMsg('');
    try {
      const res = await API.post(`/backup/download`, {
        connectionId: id,
        selections
      }, {
        responseType: 'blob',
      });
      const fileExt = connection?.type === 'mongodb' ? 'json' : 'sql';
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `backup_selection_${Date.now()}.${fileExt}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setBackupMsg('Selected backup downloaded successfully!');
    } catch (err) {
      console.error(err);
      setBackupError('Backup of selected items failed!');
    } finally {
      setBackupLoading(false);
    }
  };

  const restoreBackup = async () => {
    const isMongo = connection?.type === 'mongodb';
    const fileExt = isMongo ? '.json' : '.sql';
    if (!selectedFile) {
      setBackupError(`Please select a ${fileExt} file first!`);
      return;
    }
    const confirmMsg = isMongo 
      ? 'Are you sure you want to restore the MongoDB database server? This will delete existing target collections and insert documents from the JSON script.'
      : 'Are you sure you want to restore the database server? This will execute statements for all databases contained inside the SQL script.';
      
    if (!window.confirm(confirmMsg)) return;

    setRestoreLoading(true);
    setBackupError('');
    setBackupMsg('');
    try {
      const formData = new FormData();
      formData.append('sqlFile', selectedFile);
      const res = await API.post(`/backup/restore?connectionId=${id}`, formData);
      if (isMongo) {
        setBackupMsg(`Restore completed successfully! Restored ${res.data.collections} collections and ${res.data.documents} documents.`);
      } else {
        setBackupMsg(`Restore completed successfully! Executed ${res.data.statements} statements.`);
      }
      setSelectedFile(null);
    } catch (err) {
      setBackupError(err.response?.data?.message || err.response?.data?.error || 'Restore failed!');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleImportBackup = async () => {
    if (!importFile) return;
    if (!importDbName.trim()) {
      setBackupError('Please specify a target database name!');
      return;
    }

    const isMongo = connection?.type === 'mongodb';
    const confirmMsg = `Are you sure you want to import this backup file into the database "${importDbName}"? This will overwrite existing tables/collections if they match.`;
    if (!window.confirm(confirmMsg)) return;

    setImportLoading(true);
    setBackupError('');
    setBackupMsg('');
    try {
      const formData = new FormData();
      formData.append('sqlFile', importFile);
      const res = await API.post(
        `/backup/restore?connectionId=${id}&database=${encodeURIComponent(importDbName.trim())}`,
        formData
      );
      if (isMongo) {
        setBackupMsg(`Import successfully completed! Restored ${res.data.collections} collections and ${res.data.documents} documents into database "${importDbName}".`);
      } else {
        setBackupMsg(`Import successfully completed! Executed ${res.data.statements} SQL statements into database "${importDbName}".`);
      }
      setImportFile(null);
      setImportDbName('');
      fetchDatabases();
    } catch (err) {
      setBackupError(err.response?.data?.message || err.response?.data?.error || 'Import failed!');
    } finally {
      setImportLoading(false);
    }
  };

  // Custom checkbox renderer for a consistent premium feel
  const renderCheckbox = (state, onChange) => {
    return (
      <button
        type="button"
        onClick={onChange}
        className="focus:outline-none flex items-center justify-center p-0.5"
      >
        {state === 'all' && (
          <div className="w-4 h-4 rounded bg-indigo-600 flex items-center justify-center text-white transition-all scale-100 hover:bg-indigo-700 shadow-sm">
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {state === 'partial' && (
          <div className="w-4 h-4 rounded bg-indigo-600 flex items-center justify-center text-white transition-all scale-100 hover:bg-indigo-700 shadow-sm">
            <svg className="w-2 h-0.5 bg-white" viewBox="0 0 10 10"></svg>
          </div>
        )}
        {state === 'none' && (
          <div className="w-4 h-4 rounded border border-gray-300 bg-white transition-all hover:border-gray-400"></div>
        )}
      </button>
    );
  };

  // Total tables selected label
  const getSelectedCountLabel = () => {
    let dbs = 0;
    let tbls = 0;
    Object.entries(selections).forEach(([dbName, tables]) => {
      if (tables.length > 0) {
        dbs++;
        tbls += tables.length;
      }
    });
    if (dbs === 0) return 'No items selected';
    return `${dbs} database(s), ${tbls} table/collection(s) selected`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading backup details...</p>
        </div>
      </div>
    );
  }

  // Filter databases and their tables
  const filteredDatabases = databases.filter(db => {
    const matchesDbName = db.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTableName = db.tables.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesDbName || matchesTableName;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col text-left">
      <Navbar
        backTo="/connections"
        backText="Connections"
        extraLeft={
          <span className="text-sm font-medium text-gray-900">
            💾 {connectionName} (Backup & Restore)
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto bg-gray-50/30">
        <div className="w-[90%] mx-auto py-8 space-y-6">
          
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs">
            <h2 className="text-lg font-bold text-gray-900">Server Backup & Restore</h2>
            <p className="text-xs text-gray-400 mt-1 leading-normal">
              Manage database dumps for this server connection. Select specific databases and tables/collections to download a custom backup file, or upload a script to restore tables.
            </p>
          </div>

          {backupError && (
            <div className="bg-red-50 text-red-600 border border-red-100 rounded-xl p-4 text-xs font-semibold leading-normal">
              ⚠️ {backupError}
            </div>
          )}
          
          {backupMsg && (
            <div className="bg-green-50 text-green-700 border border-green-100 rounded-xl p-4 text-xs font-semibold leading-normal">
              ✅ {backupMsg}
            </div>
          )}

          {/* Backup Options Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('selective')}
              className={`flex-grow pb-2.5 text-xs font-bold border-b-2 text-center transition flex items-center justify-center gap-1.5 ${
                activeTab === 'selective'
                  ? 'text-[#0d9da4]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
              style={activeTab === 'selective' ? { borderColor: '#0d9da4' } : {}}
            >
              🎯 Export Backup
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`flex-1 pb-2.5 text-xs font-bold border-b-2 text-center transition flex items-center justify-center gap-1.5 ${
                activeTab === 'import'
                  ? 'text-[#0d9da4]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
              style={activeTab === 'import' ? { borderColor: '#0d9da4' } : {}}
            >
              📥 Import Backup
            </button>
             <button
              onClick={() => setActiveTab('server')}
              className={`flex-1 pb-2.5 text-xs font-bold border-b-2 text-center transition flex items-center justify-center gap-1.5 ${
                activeTab === 'server'
                  ? 'text-[#0d9da4]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
              style={activeTab === 'server' ? { borderColor: '#0d9da4' } : {}}
            >
              🌐 Server-Wide Backup
            </button>
          </div>

          {/* Tab 1: Selective Backup */}
          {activeTab === 'selective' && (
            <div className="bg-white rounded-xl border border-gray-250 p-6 shadow-xs flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Custom Database Selection</h3>
                <p className="text-xs text-gray-400 mt-0.5 leading-normal">
                  Expand database nodes to load and select specific tables. Only the checked items will be included in the backup.
                </p>
              </div>

              {/* Search Box */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search databases or tables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
                />
                <span className="absolute left-2.5 top-2 text-gray-400 text-xs">🔍</span>
              </div>

              {/* Selection Tree */}
              <div className="border border-gray-200 rounded-lg max-h-80 overflow-y-auto divide-y divide-gray-100">
                {dbsLoading ? (
                  <div className="p-8 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                    Fetching databases...
                  </div>
                ) : filteredDatabases.length === 0 ? (
                  <div className="p-8 text-center text-xs text-gray-400">
                    No databases or tables match your search.
                  </div>
                ) : (
                  filteredDatabases.map((db) => {
                    const selectionState = getDbSelectionState(db);
                    const selectedTablesCount = selections[db.name]?.length || 0;
                    const isSearching = searchQuery.length > 0;
                    
                    // Filter tables shown based on search query
                    const shownTables = db.tables.filter(t => 
                      t.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      db.name.toLowerCase().includes(searchQuery.toLowerCase())
                    );

                    return (
                      <div key={db.name} className="bg-white">
                        {/* Database Row */}
                        <div className="flex items-center justify-between p-3 hover:bg-gray-50/50 transition">
                          <div className="flex items-center gap-2">
                            {/* Expand button */}
                            <button
                              onClick={() => toggleExpandDb(db.name)}
                              className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 transition"
                            >
                              <svg
                                className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
                                  db.expanded || isSearching ? 'rotate-90' : ''
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>

                            {/* Checkbox */}
                            {renderCheckbox(selectionState, () => handleDbCheckboxChange(db.name, selectionState))}

                            {/* Database Icon & Name */}
                            <div className="flex items-center gap-1.5 ml-1">
                              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                              </svg>
                              <span className="text-xs font-semibold text-gray-800">{db.name}</span>
                            </div>
                          </div>

                          {/* Selected Count Badge */}
                          <div className="text-[10px] font-bold text-gray-400 bg-gray-100/70 px-2 py-0.5 rounded-full">
                            {selectedTablesCount} selected
                          </div>
                        </div>

                        {/* Tables List */}
                        {(db.expanded || isSearching) && (
                          <div className="pl-9 pr-3 pb-3 pt-1 border-t border-gray-50 bg-gray-50/20 space-y-2">
                            {tablesLoading[db.name] ? (
                              <div className="py-2 text-[10px] text-gray-400 flex items-center gap-1.5">
                                <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                                Loading tables...
                              </div>
                            ) : db.loaded && shownTables.length === 0 ? (
                              <div className="py-2 text-[10px] text-gray-400 italic">
                                No tables/collections found
                              </div>
                            ) : (
                              shownTables.map((table) => {
                                const isTableChecked = selections[db.name]?.includes(table) || false;
                                return (
                                  <div key={table} className="flex items-center gap-2 py-1">
                                    {renderCheckbox(
                                      isTableChecked ? 'all' : 'none',
                                      () => handleTableCheckboxChange(db.name, table)
                                    )}
                                    <div className="flex items-center gap-1.5 ml-1">
                                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                      <span className="text-[11px] font-medium text-gray-600">{table}</span>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selection Summary */}
              <div className="flex items-center justify-between text-xs text-gray-500 bg-indigo-50/40 border border-indigo-100/50 rounded-lg p-3">
                <span className="font-semibold text-indigo-700">Summary:</span>
                <span className="font-medium text-gray-700">{getSelectedCountLabel()}</span>
              </div>

              {/* Action Button */}
              <button
                onClick={takeSelectedBackup}
                disabled={backupLoading || Object.keys(selections).length === 0}
                className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition shadow-xs flex items-center justify-center gap-2"
              >
                {backupLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Generating Export Backup...
                  </>
                ) : (
                  '⬇ Download Export Backup'
                )}
              </button>
            </div>
          )}

          {/* Tab 2: Server-Wide Backup */}
          {activeTab === 'server' && (
            <>
              <div className="bg-white rounded-xl border border-gray-250 p-6 shadow-xs flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Generate Complete Server Backup</h3>
                  <p className="text-xs text-gray-400 mt-0.5 leading-normal">
                    Download a consolidated {connection?.type === 'mongodb' ? 'JSON' : 'SQL'} file containing structural definitions and data rows for ALL user databases on this host.
                  </p>
                </div>
                <button
                  onClick={takeBackup}
                  disabled={backupLoading}
                  className="w-full py-2.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800 disabled:opacity-60 transition shadow-xs flex items-center justify-center gap-2"
                >
                  {backupLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Generating Backup...
                    </>
                  ) : (
                    '⬇ Download Complete Server Backup'
                  )}
                </button>
              </div>

              {/* Restore Action Card (remains the same) */}
              <div className="bg-white rounded-xl border border-gray-250 p-6 shadow-xs flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Restore Server Data</h3>
                  <p className="text-xs text-gray-400 mt-0.5 leading-normal">
                    Upload a structured backup {connection?.type === 'mongodb' ? 'JSON' : 'SQL'} file to reconstruct databases and populate their data tables.
                  </p>
                </div>

                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50/50 transition flex flex-col items-center justify-center gap-2"
                  onClick={() => document.getElementById('sqlFileConn').click()}
                >
                  {selectedFile ? (
                    <div>
                      <p className="text-xs font-bold text-gray-900">{selectedFile.name}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                    </div>
                  ) : (
                    <>
                      <span className="text-3xl">📤</span>
                      <span className="text-xs font-semibold text-gray-400">
                        Click here to select a {connection?.type === 'mongodb' ? '.json' : '.sql'} backup file
                      </span>
                    </>
                  )}
                </div>

                <input
                  id="sqlFileConn"
                  type="file"
                  accept={connection?.type === 'mongodb' ? ".json" : ".sql"}
                  onChange={e => {
                    const file = e.target.files[0];
                    const ext = connection?.type === 'mongodb' ? '.json' : '.sql';
                    if (file?.name.endsWith(ext)) {
                      setSelectedFile(file);
                    } else {
                      setBackupError(`Only ${ext} files are allowed!`);
                    }
                  }}
                  className="hidden"
                />

                <button
                  onClick={restoreBackup}
                  disabled={restoreLoading || !selectedFile}
                  className="w-full py-2.5 border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 disabled:opacity-60 transition shadow-xs flex items-center justify-center gap-2"
                >
                  {restoreLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin"></div>
                      Restoring Server Database...
                    </>
                  ) : (
                    '⬆ Execute Restore Script'
                  )}
                </button>
              </div>
            </>
          )}

          {/* Tab 3: Import Backup */}
          {activeTab === 'import' && (
            <div className="bg-white rounded-xl border border-gray-250 p-6 shadow-xs flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Import Database Backup</h3>
                <p className="text-xs text-gray-400 mt-0.5 leading-normal">
                  Upload a {connection?.type === 'mongodb' ? '.json' : '.sql'} backup file and specify a target database name. If the database does not exist, it will be created and populated.
                </p>
              </div>

              {/* Upload Box */}
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50/50 transition flex flex-col items-center justify-center gap-2"
                onClick={() => document.getElementById('importBackupFile').click()}
              >
                {importFile ? (
                  <div>
                    <p className="text-xs font-bold text-[#0d9da4]">{importFile.name}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{(importFile.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <>
                    <span className="text-3xl">📤</span>
                    <span className="text-xs font-semibold text-gray-400">
                      Click to select a {connection?.type === 'mongodb' ? '.json' : '.sql'} backup file
                    </span>
                  </>
                )}
              </div>

              <input
                id="importBackupFile"
                type="file"
                accept={connection?.type === 'mongodb' ? ".json" : ".sql"}
                onChange={e => {
                  const file = e.target.files[0];
                  const ext = connection?.type === 'mongodb' ? '.json' : '.sql';
                  if (file?.name.endsWith(ext)) {
                    setImportFile(file);
                    setBackupError('');
                  } else {
                    setBackupError(`Only ${ext} files are allowed!`);
                  }
                }}
                className="hidden"
              />

              {importFile && (
                <div className="space-y-3.5 pt-2">
                  {/* Database Name Inputs */}
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">
                      Enter Database Name (New or Existing)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. my_imported_db"
                      value={importDbName}
                      onChange={e => setImportDbName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none bg-gray-50/50 focus:bg-white focus:border-gray-400 transition"
                    />
                  </div>

                  {databases.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">
                        Or Pick from Existing Databases
                      </label>
                      <select
                        onChange={e => {
                          if (e.target.value) {
                            setImportDbName(e.target.value);
                          }
                        }}
                        defaultValue=""
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none bg-gray-50/50 focus:bg-white focus:border-gray-400 transition"
                      >
                        <option value="" disabled>-- Select Database --</option>
                        {databases.map(db => (
                          <option key={db.name} value={db.name}>{db.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    onClick={handleImportBackup}
                    disabled={importLoading || !importDbName.trim()}
                    style={{ background: '#0d9da4', color: '#ffffff' }}
                    className="w-full py-2.5 text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-60 transition shadow-xs flex items-center justify-center gap-2"
                  >
                    {importLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Importing backup into database "{importDbName}"...
                      </>
                    ) : (
                      '⚡ Import Backup Data'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}



        </div>
      </div>
    </div>
  );
}
