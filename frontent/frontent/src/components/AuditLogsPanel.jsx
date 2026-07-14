import { useState, useEffect } from 'react';
import API from '../api/axios';

export default function AuditLogsPanel({ connectionId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
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
      case 'RUN_QUERY':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold">RUN QUERY</span>;
      case 'RESTORE_BACKUP':
        return <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold">RESTORE BACKUP</span>;
      case 'EXPORT_BACKUP':
        return <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[10px] font-bold">EXPORT BACKUP</span>;
      case 'CREATE_DB_USER':
        return <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold">CREATE DB USER</span>;
      case 'DELETE_DB_USER':
        return <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold">DELETE DB USER</span>;
      case 'UPDATE_DB_USER':
        return <span className="bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded text-[10px] font-bold">UPDATE DB USER</span>;
      default:
        return <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold">{action}</span>;
    }
  };

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    const userEmail = log.user?.email?.toLowerCase() || '';
    const userName = log.user?.name?.toLowerCase() || '';
    const details = log.details?.toLowerCase() || '';
    const action = log.action?.toLowerCase() || '';
    return userEmail.includes(term) || userName.includes(term) || details.includes(term) || action.includes(term);
  });

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
      
      {/* Search Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-gray-900">📜 Shared Connection Audit Logs</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Chronological actions tracked for all shared users of this connection.</p>
        </div>
        <div className="relative shrink-0">
          <input
            type="text"
            placeholder="Search by user, action, details..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full sm:w-60 px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none focus:border-gray-400 bg-gray-50/50"
          />
        </div>
      </div>

      {/* Logs Table / List */}
      {filteredLogs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-450 italic text-xs">
          No audit logs matching search parameters were found.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-150 overflow-hidden shadow-xs">
          {filteredLogs.map(log => {
            const isExpanded = expandedLogId === log._id;
            const isQuery = log.action === 'RUN_QUERY';

            return (
              <div key={log._id} className="p-4 hover:bg-gray-50/30 transition">
                <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                  <div className="space-y-1.5 flex-grow">
                    
                    {/* User and Action badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {getActionBadge(log.action)}
                      <span className="text-[11px] font-bold text-gray-800">
                        {log.user?.name || 'Unknown User'}
                      </span>
                      <span className="text-[10px] text-gray-450 font-mono">
                        ({log.user?.email || 'N/A'})
                      </span>
                      <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono uppercase">
                        {log.user?.role}
                      </span>
                    </div>

                    {/* Action Summary / Details preview */}
                    <p className={`text-xs text-gray-650 leading-relaxed ${isExpanded ? '' : 'truncate max-w-2xl'}`}>
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

    </div>
  );
}
