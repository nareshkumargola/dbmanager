import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../api/axios';
import Navbar from '../components/Navbar';

export default function MongoCollection() {
  const { collectionName } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [collectionName]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await API.get(`/db/mongo/collection/${collectionName}`);
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading collection...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">
            {collectionName}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {data.length} documents — MongoDB Collection
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Empty */}
        {data.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">
              This collection has no documents
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.map((doc, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                {/* Document number */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Document {i + 1}
                  </span>
                  <span className="text-xs text-gray-400">
                    {doc._id?.toString()}
                  </span>
                </div>

                {/* Document fields */}
                <div className="space-y-2">
                  {Object.entries(doc).map(([key, value], j) => (
                    <div
                      key={j}
                      className="flex items-start gap-4 py-2 border-b border-gray-50 last:border-0"
                    >
                      {/* Key */}
                      <span className="text-xs font-semibold text-gray-500 w-32 shrink-0 mt-0.5">
                        {key}
                      </span>

                      {/* Value */}
                      <span className="text-sm text-gray-700 break-all">
                        {value === null ? (
                          <span className="text-gray-300 italic">null</span>
                        ) : typeof value === 'object' ? (
                          <pre className="text-xs bg-gray-50 px-3 py-2 rounded-lg overflow-x-auto">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          String(value)
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}