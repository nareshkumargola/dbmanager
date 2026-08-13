import { useState, useEffect } from 'react';
import API from '../api/axios';

export default function ConnectionSchemaSelector({ value = [], onChange, role = 'developer' }) {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbMap, setDbMap] = useState({}); // { [connId]: string[] }
  const [loadingDbs, setLoadingDbs] = useState({}); // { [connId]: boolean }
  const [errorMap, setErrorMap] = useState({});

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      // Fetch all system connections (admin endpoint or standard list)
      const res = await API.get('/connections/all').catch(() => API.get('/connections'));
      const list = res.data.connections || [];
      setConnections(list);

      // Pre-fetch databases for already enabled connections in value
      list.forEach(conn => {
        const isEnabled = value.some(v => v.connectionId === conn._id);
        if (isEnabled) {
          fetchDatabasesForConnection(conn._id);
        }
      });
    } catch (err) {
      console.error('Failed to load connections list:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDatabasesForConnection = async (connId) => {
    if (dbMap[connId] || loadingDbs[connId]) return;
    try {
      setLoadingDbs(prev => ({ ...prev, [connId]: true }));
      setErrorMap(prev => ({ ...prev, [connId]: null }));
      const res = await API.get(`/connections/${connId}/databases`);
      const dbs = res.data.databases || [];
      setDbMap(prev => ({ ...prev, [connId]: dbs }));
    } catch (err) {
      console.error(`Failed to fetch databases for conn ${connId}:`, err);
      setErrorMap(prev => ({ ...prev, [connId]: err.response?.data?.message || 'Could not fetch databases' }));
    } finally {
      setLoadingDbs(prev => ({ ...prev, [connId]: false }));
    }
  };

  const handleToggleConnection = (connId) => {
    const existingIndex = value.findIndex(v => v.connectionId === connId);
    let updated = [];
    if (existingIndex > -1) {
      // Remove connection access
      updated = value.filter(v => v.connectionId !== connId);
    } else {
      // Enable connection access with all databases by default
      const dbs = dbMap[connId] || ['*'];
      updated = [...value, { connectionId: connId, databases: dbs }];
      fetchDatabasesForConnection(connId);
    }
    onChange(updated);
  };

  const handleToggleDatabase = (connId, dbName) => {
    const connEntry = value.find(v => v.connectionId === connId);
    if (!connEntry) return;

    let currentDbs = connEntry.databases || [];
    // If currently '*' (all), resolve to actual db list minus target
    if (currentDbs.includes('*')) {
      const allAvailable = dbMap[connId] || [];
      currentDbs = allAvailable.length > 0 ? [...allAvailable] : [dbName];
    }

    let updatedDbs = [];
    if (currentDbs.includes(dbName)) {
      updatedDbs = currentDbs.filter(d => d !== dbName);
    } else {
      updatedDbs = [...currentDbs, dbName];
    }

    const updated = value.map(v => {
      if (v.connectionId === connId) {
        return { ...v, databases: updatedDbs };
      }
      return v;
    });

    onChange(updated);
  };

  const handleSelectAllDbs = (connId, selectAll) => {
    const allAvailable = dbMap[connId] || [];
    const updated = value.map(v => {
      if (v.connectionId === connId) {
        return { ...v, databases: selectAll ? (allAvailable.length > 0 ? [...allAvailable] : ['*']) : [] };
      }
      return v;
    });
    onChange(updated);
  };

  if (role === 'admin') {
    return (
      <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 rounded-xl text-xs text-purple-700 dark:text-purple-300 font-medium">
        👑 <strong>Admin Role:</strong> Full unrestricted access to all database connections and schemas across the entire system.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 text-xs text-gray-500 animate-pulse flex items-center gap-2">
        <span className="animate-spin">🌀</span> Loading system database connections...
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="p-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl">
        ⚠️ No database connections have been added by Admin yet. Add database connections first under "Manage Connections".
      </div>
    );
  }

  return (
    <div className="space-y-3 text-left">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider text-[11px]">
          🗄️ Granted Database Connections &amp; Schemas Access
        </label>
        <span className="text-[11px] text-teal-600 font-semibold">
          {value.length} of {connections.length} Connections Granted
        </span>
      </div>

      <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
        {connections.map(conn => {
          const connEntry = value.find(v => v.connectionId === conn._id);
          const isConnEnabled = !!connEntry;
          const connDbs = connEntry?.databases || [];
          const availableDbs = dbMap[conn._id] || [];
          const isFetchingDbs = loadingDbs[conn._id];
          const isAllSelected = isConnEnabled && availableDbs.length > 0 && availableDbs.every(d => connDbs.includes(d) || connDbs.includes('*'));

          return (
            <div
              key={conn._id}
              className={`border rounded-xl transition-all overflow-hidden ${
                isConnEnabled
                  ? 'border-teal-500 bg-teal-50/30 dark:bg-teal-950/20 dark:border-teal-600'
                  : 'border-gray-200 dark:border-gray-750 bg-white dark:bg-gray-800/60'
              }`}
            >
              {/* Connection Header Bar */}
              <div className="p-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none grow">
                  <input
                    type="checkbox"
                    checked={isConnEnabled}
                    onChange={() => handleToggleConnection(conn._id)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-gray-900 dark:text-gray-100">
                        {conn.name}
                      </span>
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded-full font-bold bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300">
                        {conn.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                      {conn.host ? `${conn.host}:${conn.port}` : 'Remote Instance'} {conn.database ? `(${conn.database})` : ''}
                    </p>
                  </div>
                </label>

                {isConnEnabled && (
                  <button
                    type="button"
                    onClick={() => fetchDatabasesForConnection(conn._id)}
                    className="text-[10px] px-2.5 py-1 font-bold text-teal-700 dark:text-teal-300 bg-teal-100/70 dark:bg-teal-900/50 hover:bg-teal-200 rounded-lg transition"
                  >
                    {isFetchingDbs ? '🌀 Fetching...' : dbMap[conn._id] ? '🔄 Refresh DBs' : '🔍 Load DBs'}
                  </button>
                )}
              </div>

              {/* Databases Sub-section when Connection Enabled */}
              {isConnEnabled && (
                <div className="px-3 pb-3 pt-1 border-t border-teal-200/60 dark:border-teal-800/40 bg-white/70 dark:bg-gray-850/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Allowed Databases / Schemas:
                    </span>

                    {availableDbs.length > 0 && (
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-teal-700 dark:text-teal-400 font-semibold select-none">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={(e) => handleSelectAllDbs(conn._id, e.target.checked)}
                          className="rounded text-teal-600 focus:ring-teal-500 w-3 h-3"
                        />
                        Select All ({availableDbs.length})
                      </label>
                    )}
                  </div>

                  {isFetchingDbs ? (
                    <p className="text-[11px] text-gray-400 animate-pulse py-1">Loading database schemas...</p>
                  ) : errorMap[conn._id] ? (
                    <p className="text-[11px] text-amber-600 py-1">⚠️ {errorMap[conn._id]}</p>
                  ) : availableDbs.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[130px] overflow-y-auto pr-1">
                      {availableDbs.map(db => {
                        const isChecked = connDbs.includes('*') || connDbs.includes(db);
                        return (
                          <label
                            key={db}
                            className={`flex items-center gap-2 p-1.5 rounded-lg border text-[11px] font-medium cursor-pointer transition select-none ${
                              isChecked
                                ? 'border-teal-400 bg-teal-50/70 dark:bg-teal-900/40 text-teal-900 dark:text-teal-200'
                                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleDatabase(conn._id, db)}
                              className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
                            />
                            <span className="truncate" title={db}>{db}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 italic py-1">
                      All databases permitted by default on this connection. Click "Load DBs" to specify individual schemas.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
