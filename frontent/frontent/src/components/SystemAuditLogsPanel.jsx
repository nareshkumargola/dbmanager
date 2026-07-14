import { useState, useEffect } from 'react';
import API from '../api/axios';

export default function SystemAuditLogsPanel() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter States
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [queryType, setQueryType] = useState('');
  const [expandedLogId, setExpandedLogId] = useState(null);

  useEffect(() => {
    fetchUsers();
    fetchSystemLogs();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await API.get('/users');
      setUsers(res.data.users || []);
    } catch (e) {
      console.error('Failed to load users list:', e);
    }
  };

  const fetchSystemLogs = async () => {
    setLoading(true);
    setError('');
    try {
      // Build query parameters
      const params = {};
      if (selectedUser) params.userId = selectedUser;
      if (selectedAction) params.action = selectedAction;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (queryType) params.queryType = queryType;

      const res = await API.get('/audit-logs', { params });
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load system audit logs.');
    } finally {
      setLoading(false);
    }
  };

  // Re-trigger fetch when filters change
  const handleApplyFilters = (e) => {
    if (e) e.preventDefault();
    fetchSystemLogs();
  };

  const handleClearFilters = () => {
    setSelectedUser('');
    setSelectedAction('');
    setStartDate('');
    setEndDate('');
    setQueryType('');
    // Fetch all logs again
    setTimeout(() => {
      fetchSystemLogs();
    }, 50);
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'RUN_QUERY':
        return <span className="bg-blue-50 text-blue-700 border border-blue-150 px-2 py-0.5 rounded text-[10px] font-bold">RUN QUERY</span>;
      case 'RESTORE_BACKUP':
        return <span className="bg-purple-50 text-purple-700 border border-purple-150 px-2 py-0.5 rounded text-[10px] font-bold">RESTORE BACKUP</span>;
      case 'EXPORT_BACKUP':
        return <span className="bg-green-50 text-green-700 border border-green-150 px-2 py-0.5 rounded text-[10px] font-bold">EXPORT BACKUP</span>;
      case 'CREATE_DB_USER':
        return <span className="bg-amber-50 text-amber-700 border border-amber-150 px-2 py-0.5 rounded text-[10px] font-bold">CREATE DB USER</span>;
      case 'DELETE_DB_USER':
        return <span className="bg-rose-50 text-rose-700 border border-rose-150 px-2 py-0.5 rounded text-[10px] font-bold">DELETE DB USER</span>;
      case 'UPDATE_DB_USER':
        return <span className="bg-orange-50 text-orange-700 border border-orange-150 px-2 py-0.5 rounded text-[10px] font-bold">UPDATE DB USER</span>;
      case 'LOGIN':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-150 px-2 py-0.5 rounded text-[10px] font-bold">LOGIN</span>;
      case 'LOGOUT':
        return <span className="bg-gray-100 text-gray-700 border border-gray-250 px-2 py-0.5 rounded text-[10px] font-bold">LOGOUT</span>;
      default:
        return <span className="bg-gray-50 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold">{action}</span>;
    }
  };

  // Export to Excel (CSV Format)
  const exportToExcel = () => {
    if (logs.length === 0) {
      alert('No data available to export.');
      return;
    }

    const headers = ['Timestamp', 'User Name', 'User Email', 'Role', 'Connection Target', 'Action Category', 'Operation Details'];
    const rows = logs.map(log => [
      new Date(log.createdAt).toLocaleString(),
      log.user?.name || 'Unknown',
      log.user?.email || 'N/A',
      log.user?.role || 'N/A',
      log.connection?.name || 'Global System',
      log.action,
      log.details.replace(/"/g, '""') // Escape double quotes for CSV
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `system_audit_logs_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF
  const exportToPDF = async () => {
    if (logs.length === 0) {
      alert('No data available to export.');
      return;
    }

    const element = document.createElement('div');
    element.style.padding = '24px';
    element.style.fontFamily = 'system-ui, sans-serif';
    element.style.fontSize = '10px';
    element.innerHTML = `
      <h2 style="text-align: center; color: #111827; margin-bottom: 5px;">📜 System Activity Audit Trail</h2>
      <p style="text-align: center; color: #6b7280; font-size: 8px; margin-bottom: 20px;">Report Generated: ${new Date().toLocaleString()}</p>
      
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="background-color: #f3f4f6; border-bottom: 1.5px solid #d1d5db; color: #374151;">
            <th style="padding: 6px; border: 1.5px solid #e5e7eb;">Timestamp</th>
            <th style="padding: 6px; border: 1.5px solid #e5e7eb;">User</th>
            <th style="padding: 6px; border: 1.5px solid #e5e7eb;">Connection</th>
            <th style="padding: 6px; border: 1.5px solid #e5e7eb;">Action</th>
            <th style="padding: 6px; border: 1.5px solid #e5e7eb;">Details</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(log => `
            <tr style="border-bottom: 1.5px solid #e5e7eb; color: #4b5563;">
              <td style="padding: 6px; border: 1.5px solid #e5e7eb; white-space: nowrap;">${new Date(log.createdAt).toLocaleString()}</td>
              <td style="padding: 6px; border: 1.5px solid #e5e7eb;">${log.user?.name || 'Unknown'}<br/><span style="font-size: 7px; color: #9ca3af;">${log.user?.email || ''}</span></td>
              <td style="padding: 6px; border: 1.5px solid #e5e7eb;">${log.connection?.name || 'Global System'}</td>
              <td style="padding: 6px; border: 1.5px solid #e5e7eb;"><strong>${log.action}</strong></td>
              <td style="padding: 6px; border: 1.5px solid #e5e7eb; font-size: 8px; font-family: monospace; max-width: 250px; overflow-wrap: break-word;">${log.details.substring(0, 120)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    const options = {
      margin: 10,
      filename: `system_audit_report_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' }
    };

    try {
      const mod = await import('html2pdf.js');
      const html2pdf = mod.default || mod;
      html2pdf().set(options).from(element).save();
    } catch (e) {
      console.error('PDF generation failed', e);
      alert('PDF download failed.');
    }
  };

  return (
    <div className="space-y-6 bg-white p-6 rounded-xl border border-gray-150 text-left">
      
      {/* Search & Filter Form */}
      <form onSubmit={handleApplyFilters} className="bg-gray-50/80 p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <h4 className="text-xs font-bold text-teal-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <span>🔍</span> Filter Options
        </h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* User selector */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Filter by User</label>
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none bg-white focus:border-teal-400"
            >
              <option value="">All Users</option>
              {users.map(u => (
                <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>

          {/* Action category selector */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Action Category</label>
            <select
              value={selectedAction}
              onChange={e => setSelectedAction(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none bg-white focus:border-teal-400"
            >
              <option value="">All Actions</option>
              <option value="RUN_QUERY">RUN_QUERY (SQL Run)</option>
              <option value="EXPORT_BACKUP">EXPORT_BACKUP</option>
              <option value="RESTORE_BACKUP">RESTORE_BACKUP</option>
              <option value="CREATE_DB_USER">CREATE_DB_USER</option>
              <option value="DELETE_DB_USER">DELETE_DB_USER</option>
              <option value="UPDATE_DB_USER">UPDATE_DB_USER</option>
              <option value="LOGIN">LOGIN ACTIVITY</option>
              <option value="LOGOUT">LOGOUT ACTIVITY</option>
            </select>
          </div>

          {/* Query type query filter (Select, Insert, etc) */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">SQL Query Type</label>
            <select
              value={queryType}
              onChange={e => setQueryType(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none bg-white focus:border-teal-400"
              disabled={selectedAction !== '' && selectedAction !== 'RUN_QUERY'}
            >
              <option value="">All SQL Types</option>
              <option value="select">SELECT Queries</option>
              <option value="insert">INSERT Queries</option>
              <option value="update">UPDATE Queries</option>
              <option value="delete">DELETE / DROP Queries</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none bg-white focus:border-teal-400 font-mono"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-250 rounded-lg text-xs outline-none bg-white focus:border-teal-400 font-mono"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={handleClearFilters}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 transition"
          >
            🧹 Clear Filters
          </button>
          <button
            type="submit"
            style={{ backgroundColor: '#0d9da4', color: '#ffffff' }}
            className="px-5 py-2 text-xs font-bold rounded-lg hover:opacity-90 transition shadow-sm"
          >
            🔍 Apply Filters
          </button>
        </div>
      </form>

      {/* Export Toolbar */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-150 pb-3 flex-wrap sm:flex-nowrap">
        <span className="text-xs font-bold text-teal-900 bg-teal-50 ring-1 ring-teal-200 px-3 py-1 rounded-full">
          {logs.length} Total Audit Records Found
        </span>
        
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            className="px-3.5 py-1.5 border border-green-200 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 transition shadow-2xs flex items-center gap-1.5"
          >
            <span>📥</span> Export Excel (CSV)
          </button>
          <button
            onClick={exportToPDF}
            className="px-3.5 py-1.5 border border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition shadow-2xs flex items-center gap-1.5"
          >
            <span>📄</span> Export PDF Report
          </button>
        </div>
      </div>

      {/* error message */}
      {error && (
        <div className="bg-red-50 text-red-600 text-xs px-4 py-3 rounded-lg border border-red-200">
          ❌ {error}
        </div>
      )}

      {/* Logs Listing Table */}
      {loading ? (
        <div className="py-20 text-center text-gray-500">
          <div className="w-8 h-8 border-[3px] border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mx-auto mb-3"></div>
          Applying filters and loading system audit trail logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="py-16 text-center text-gray-400 italic text-xs">
          No system-wide activity logs found matching the filter criteria.
        </div>
      ) : (
        <div className="border border-gray-250 rounded-xl overflow-hidden shadow-2xs bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Team Member</th>
                  <th className="px-5 py-3">Connection Target</th>
                  <th className="px-5 py-3">Action Category</th>
                  <th className="px-5 py-3">Summary Details</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 bg-white">
                {logs.map(log => {
                  const isExpanded = expandedLogId === log._id;
                  const isQuery = log.action === 'RUN_QUERY';

                  return (
                    <tr key={log._id} className="hover:bg-gray-50/50 align-top transition-colors">
                      {/* Timestamp */}
                      <td className="px-5 py-3.5 text-gray-500 font-mono whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>

                      {/* User Info */}
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-gray-800">{log.user?.name || 'Unknown'}</p>
                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">{log.user?.email || 'N/A'}</p>
                      </td>

                      {/* Connection info */}
                      <td className="px-5 py-3.5">
                        {log.connection ? (
                          <>
                            <p className="font-semibold text-gray-700">{log.connection.name}</p>
                            <span className="text-[9px] font-bold text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded uppercase mt-1 inline-block">
                              {log.connection.type}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">Global App System</span>
                        )}
                      </td>

                      {/* Action category */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>

                      {/* Details summary */}
                      <td className="px-5 py-3.5 max-w-sm">
                        <p className={`text-xs text-gray-650 leading-relaxed ${isExpanded ? '' : 'truncate'}`}>
                          {log.details}
                        </p>
                        {isExpanded && isQuery && (
                          <div className="mt-3 bg-gray-900 rounded-lg p-3 overflow-x-auto border border-gray-800 animate-fadeIn text-left">
                            <pre className="text-[10px] font-mono text-green-400 whitespace-pre-wrap leading-relaxed">
                              {log.details}
                            </pre>
                          </div>
                        )}
                      </td>

                      {/* Action expand */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {isQuery && (
                          <button
                            type="button"
                            onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                            className="text-[#0d9da4] hover:underline font-bold"
                          >
                            {isExpanded ? 'Collapse' : 'View Query'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
