import { useState, useEffect, useMemo } from 'react';
import API from '../api/axios';

export default function AuditLogsPanel({ connectionId, databases = [] }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedTargetDb, setSelectedTargetDb] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedLogId, setExpandedLogId] = useState(null);

  useEffect(() => {
    fetchAuditLogs();
  }, [connectionId]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get(`/connections/${connectionId}/audit-logs`);
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to fetch connection audit logs.');
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'CREATE_CONNECTION':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">CREATE CONNECTION</span>;
      case 'UPDATE_CONNECTION':
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">UPDATE CONNECTION</span>;
      case 'DELETE_CONNECTION':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold">DELETE CONNECTION</span>;
      case 'TEST_CONNECTION':
        return <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-[10px] font-bold">TEST CONNECTION</span>;
      case 'INSERT_DATA':
        return <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[10px] font-bold">INSERT DATA</span>;
      case 'UPDATE_DATA':
        return <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[10px] font-bold">UPDATE DATA</span>;
      case 'DELETE_DATA':
        return <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold">DELETE DATA</span>;
      case 'CREATE_TABLE':
        return <span className="bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded text-[10px] font-bold">CREATE TABLE</span>;
      case 'ALTER_TABLE':
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">ALTER TABLE</span>;
      case 'DROP_TABLE':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold">DROP TABLE</span>;
      case 'CREATE_DATABASE':
        return <span className="bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded text-[10px] font-bold">CREATE DB</span>;
      case 'DROP_DATABASE':
        return <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-bold">DROP DB</span>;
      case 'RUN_QUERY':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold">RUN QUERY</span>;
      case 'SLOW_QUERY':
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">SLOW QUERY</span>;
      case 'RESTORE_BACKUP':
        return <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold">RESTORE BACKUP</span>;
      case 'EXPORT_BACKUP':
        return <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[10px] font-bold">EXPORT BACKUP</span>;
      case 'CREATE_DB_USER':
        return <span className="bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded text-[10px] font-bold">CREATE DB USER</span>;
      case 'DELETE_DB_USER':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold">DELETE DB USER</span>;
      case 'UPDATE_DB_USER':
        return <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[10px] font-bold">UPDATE DB USER</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">{action ? action.replace(/_/g, ' ') : 'ACTION'}</span>;
    }
  };

  // Collect unique action types for the dropdown
  const availableActions = useMemo(() => {
    const defaultActions = [
      'CREATE_CONNECTION',
      'UPDATE_CONNECTION',
      'DELETE_CONNECTION',
      'TEST_CONNECTION',
      'INSERT_DATA',
      'UPDATE_DATA',
      'DELETE_DATA',
      'CREATE_TABLE',
      'ALTER_TABLE',
      'DROP_TABLE',
      'RUN_QUERY',
      'SLOW_QUERY',
      'EXPORT_BACKUP',
      'RESTORE_BACKUP',
      'CREATE_DB_USER',
      'DELETE_DB_USER',
      'UPDATE_DB_USER'
    ];
    const logActions = logs.map(l => l.action).filter(Boolean);
    const combined = Array.from(new Set([...defaultActions, ...logActions]));
    return combined.sort();
  }, [logs]);

  // Combined filtered logs based on search term, selected action, and selected target DB
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // 1. Search term matching
      const term = searchTerm.toLowerCase().trim();
      if (term) {
        const userEmail = log.user?.email?.toLowerCase() || '';
        const userName = log.user?.name?.toLowerCase() || '';
        const details = log.details?.toLowerCase() || '';
        const action = log.action?.toLowerCase() || '';
        const matchesSearch = userEmail.includes(term) || userName.includes(term) || details.includes(term) || action.includes(term);
        if (!matchesSearch) return false;
      }

      // 2. Action filter matching
      if (selectedAction && log.action !== selectedAction) {
        return false;
      }

      // 3. Target DB filter matching
      if (selectedTargetDb) {
        const dbUpper = selectedTargetDb.toUpperCase();
        const details = log.details || '';
        const detailsUpper = details.toUpperCase();
        
        // Matches format like [TARGET_DB] or database: TARGET_DB or details containing DB name
        const tagPattern = `[${dbUpper}]`;
        const hasTag = detailsUpper.includes(tagPattern);
        const hasDbString = detailsUpper.includes(`DATABASE: ${dbUpper}`) || detailsUpper.includes(`FOR DATABASE: ${dbUpper}`);
        const hasDirectMatch = detailsUpper.includes(dbUpper);

        if (!hasTag && !hasDbString && !hasDirectMatch) {
          return false;
        }
      }

      return true;
    });
  }, [logs, searchTerm, selectedAction, selectedTargetDb]);

  // Reset pagination when filters or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedAction, selectedTargetDb, pageSize]);

  // Pagination calculations
  const totalLogs = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalLogs);
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  // Pagination Bar Component
  const renderPaginationBar = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-xl border border-gray-200 shadow-3xs text-xs select-none">
      
      {/* Rows Per Page & Data Counter */}
      <div className="flex items-center gap-3 text-gray-600">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-gray-500">Show:</span>
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="px-2 py-1 border border-gray-250 rounded-lg text-xs font-bold text-gray-700 bg-gray-50 focus:bg-white outline-none cursor-pointer"
          >
            <option value={10}>10 rows</option>
            <option value={20}>20 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>
        </div>

        <span className="text-gray-300">|</span>

        <span className="text-[11px] font-medium text-gray-500">
          Showing <strong className="text-gray-800">{totalLogs === 0 ? 0 : startIndex + 1}</strong>–<strong className="text-gray-800">{endIndex}</strong> of <strong className="text-gray-800">{totalLogs}</strong> audit logs
        </span>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setCurrentPage(1)}
          disabled={validCurrentPage === 1}
          className="px-2 py-1 border border-gray-250 rounded-md bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition"
          title="First Page"
        >
          ««
        </button>
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={validCurrentPage === 1}
          className="px-2.5 py-1 border border-gray-250 rounded-md bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition"
        >
          Prev
        </button>

        <span className="px-3 py-1 font-bold text-gray-700 text-xs">
          Page {validCurrentPage} of {totalPages}
        </span>

        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={validCurrentPage === totalPages || totalLogs === 0}
          className="px-2.5 py-1 border border-gray-250 rounded-md bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition"
        >
          Next
        </button>
        <button
          onClick={() => setCurrentPage(totalPages)}
          disabled={validCurrentPage === totalPages || totalLogs === 0}
          className="px-2 py-1 border border-gray-250 rounded-md bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition"
          title="Last Page"
        >
          »»
        </button>
      </div>

    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        <div className="w-8 h-8 border-[3px] border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mx-auto mb-3"></div>
        Loading database audit logs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 text-xs px-4 py-3 rounded-lg border border-red-200 text-left max-w-xl mx-auto">
        ❌ {error}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-left">
      
      {/* Top Header Bar with Filter Dropdowns & Search */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white px-4 py-3 rounded-xl border border-gray-200 shadow-3xs select-none">
        
        {/* Title */}
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-xs font-extrabold text-gray-900 whitespace-nowrap flex items-center gap-1.5">
            <span>📜</span> System Activity Audit Trail
            <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200 font-sans">
              Admin View
            </span>
          </h3>
        </div>

        {/* Filter Controls: Target DB, Action Type, Search */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Target DB Dropdown */}
          <div className="flex items-center gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:inline">🗄️Database:</label>
            <select
              value={selectedTargetDb}
              onChange={e => setSelectedTargetDb(e.target.value)}
              className="px-2.5 py-1 border border-gray-250 rounded-lg text-xs outline-none focus:border-teal-500 bg-gray-50/80 focus:bg-white text-gray-700 font-medium transition cursor-pointer"
            >
              <option value=""> All Databases</option>
              {databases.map((db, idx) => (
                <option key={typeof db === 'string' ? db : db.name || idx} value={typeof db === 'string' ? db : db.name}>
                  {typeof db === 'string' ? db : db.name}
                </option>
              ))}
            </select>
          </div>

          {/* Action Filter Dropdown */}
          <div className="flex items-center gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider hidden sm:inline">Action:</label>
            <select
              value={selectedAction}
              onChange={e => setSelectedAction(e.target.value)}
              className="px-2.5 py-1 border border-gray-250 rounded-lg text-xs outline-none focus:border-teal-500 bg-gray-50/80 focus:bg-white text-gray-700 font-medium transition cursor-pointer"
            >
              <option value="">⚡ All Actions</option>
              {availableActions.map(act => (
                <option key={act} value={act}>
                  {act.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative shrink-0 flex-grow sm:flex-grow-0">
            <input
              type="text"
              placeholder="Search user, query..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full sm:w-44 px-3 py-1 border border-gray-250 rounded-lg text-xs outline-none focus:border-teal-500 bg-gray-50/60 focus:bg-white transition"
            />
          </div>

        </div>
      </div>

      {/* TOP Pagination Bar (Placed right above logs list) */}
      {renderPaginationBar()}

      {/* Logs Table / List */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-450 italic text-xs">
          No audit logs matching search/filter parameters were found.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-150 overflow-hidden shadow-xs">
          {paginatedLogs.map(log => {
            const isExpanded = expandedLogId === log._id;
            const isQuery = log.action === 'RUN_QUERY' || log.action === 'SLOW_QUERY';

            return (
              <div key={log._id} className="p-4 hover:bg-gray-50/30 transition">
                <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                  <div className="space-y-1.5 flex-grow min-w-0">
                    
                    {/* User and Action badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {getActionBadge(log.action)}
                      <span className="text-[11px] font-bold text-gray-800">
                        {log.user?.name || 'Unknown User'}
                      </span>
                      <span className="text-[10px] text-gray-450 font-mono">
                        ({log.user?.email || 'N/A'})
                      </span>
                      {log.user?.role && (
                        <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono uppercase">
                          {log.user.role}
                        </span>
                      )}
                    </div>

                    {/* Action Summary / Details preview */}
                    <p className={`text-xs text-gray-650 leading-relaxed font-mono ${isExpanded ? '' : 'truncate max-w-3xl'}`}>
                      {log.details}
                    </p>

                    {/* Timestamp */}
                    <p className="text-[9px] text-gray-400 font-mono">
                      Timestamp: {new Date(log.createdAt).toLocaleString()}
                    </p>

                    {/* Expandable Query section */}
                    {isExpanded && isQuery && (
                      <div className="mt-3 bg-gray-900 rounded-lg p-3 text-left overflow-x-auto border border-gray-800 animate-fadeIn">
                        <pre className="text-[10px] font-mono text-green-400 whitespace-pre-wrap leading-relaxed">
                          {log.details}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Actions buttons */}
                  {isQuery && (
                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                      className="text-[10px] font-bold text-[#0d9da4] hover:underline shrink-0 whitespace-nowrap"
                    >
                      {isExpanded ? 'Collapse' : 'Show Query'}
                    </button>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Pagination Bar */}
      {totalLogs > 0 && renderPaginationBar()}

    </div>
  );
}
