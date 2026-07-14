import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import Navbar from '../components/Navbar';

export default function MysqlTable() {
  const { tableName } = useParams();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTableData();
  }, [tableName]);

  const fetchTableData = async () => {
    try {
      setLoading(true);
      const res = await API.get(`/db/mysql/table/${tableName}`);
      setRows(res.data.rows);
      setColumns(res.data.columns);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading table data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              {tableName}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {rows.length} rows — {columns.length} columns
            </p>
          </div>
          <button
            onClick={() => navigate('/query')}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
          >
            Query Editor
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Table */}
        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">
              This table has no data
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">

                {/* Table Head */}
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {columns.map((col, i) => (
                      <th
                        key={i}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        <div>{col.Field}</div>
                        <div className="text-gray-400 font-normal normal-case">
                          {col.Type}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-gray-50 transition"
                    >
                      {columns.map((col, j) => (
                        <td
                          key={j}
                          className="px-4 py-3 text-gray-700 whitespace-nowrap"
                        >
                          {row[col.Field] === null ? (
                            <span className="text-gray-300 italic">null</span>
                          ) : (
                            String(row[col.Field])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>

            {/* Table Footer */}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400">
                Showing {rows.length} rows — Max 100 rows
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}