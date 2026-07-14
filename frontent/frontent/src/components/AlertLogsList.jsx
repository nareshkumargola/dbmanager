import { useState, useEffect } from 'react';
import API from '../api/axios';
import { socket } from '../api/socket';

export default function AlertLogsList({ connectionId }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvingId, setResolvingId] = useState(null);

  useEffect(() => {
    fetchAlerts();
  }, [connectionId]);

  useEffect(() => {
    socket.connect();

    const handleNewAlert = (alert) => {
      if (alert.connection === connectionId) {
        setAlerts(prev => {
          // Avoid duplicate alerts in list
          if (prev.some(a => a._id === alert._id)) return prev;
          return [alert, ...prev];
        });
      }
    };

    const handleAlertResolved = (resolvedAlert) => {
      if (resolvedAlert.connection === connectionId) {
        setAlerts(prev => prev.map(a => a._id === resolvedAlert._id ? { ...a, resolved: true, resolvedAt: resolvedAlert.resolvedAt } : a));
      }
    };

    socket.on('new-alert', handleNewAlert);
    socket.on('alert-resolved', handleAlertResolved);

    return () => {
      socket.off('new-alert', handleNewAlert);
      socket.off('alert-resolved', handleAlertResolved);
    };
  }, [connectionId]);

  const fetchAlerts = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get(`/monitor/${connectionId}/alerts`);
      setAlerts(res.data.alerts || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load alert logs.');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAlert = async (alertId) => {
    setResolvingId(alertId);
    try {
      await API.post(`/monitor/${connectionId}/alerts/${alertId}/resolve`);
      setAlerts(prev => prev.map(a => a._id === alertId ? { ...a, resolved: true, resolvedAt: new Date() } : a));
    } catch (err) {
      console.error(err);
      alert('Failed to resolve the alert.');
    } finally {
      setResolvingId(null);
    }
  };

  const activeAlerts = alerts.filter(a => !a.resolved);
  const resolvedAlerts = alerts.filter(a => a.resolved);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        <div className="w-8 h-8 border-[3px] border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mx-auto mb-3"></div>
        Loading database alert logs...
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-3xl mx-auto">

      {error && (
        <div className="bg-red-50 text-red-600 text-xs px-4 py-3 rounded-lg border border-red-200">
          ❌ {error}
        </div>
      )}

      {/* SECTION 1: Active Alerts */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          🚨 Active Server Issues ({activeAlerts.length})
        </h3>
        
        {activeAlerts.length === 0 ? (
          <div className="bg-green-50/50 border border-green-150 rounded-xl p-6 text-center text-gray-500">
            <span className="text-2xl block mb-1">✅</span>
            <p className="text-xs font-bold text-green-700">All Systems Operational</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Database connection and resource pools are within normal limits.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map(alert => (
              <div
                key={alert._id}
                className={`border rounded-xl p-4 shadow-xs transition flex items-center justify-between gap-4 animate-pulse ${
                  alert.severity === 'critical'
                    ? 'border-red-200 bg-red-50/50'
                    : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">
                    {alert.severity === 'critical' ? '🔴' : '🟡'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-900 capitalize">
                        {alert.type.replace('_', ' ')} Alert
                      </span>
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        alert.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 mt-1 leading-relaxed">
                      {alert.message}
                    </p>
                    <span className="text-[9px] text-gray-450 block mt-1.5 font-mono">
                      Detected: {new Date(alert.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleResolveAlert(alert._id)}
                  disabled={resolvingId === alert._id}
                  className="px-3.5 py-1.5 border border-gray-250 hover:bg-white text-gray-800 text-xs font-bold rounded-lg shadow-xs transition bg-white/70"
                >
                  {resolvingId === alert._id ? 'Resolving...' : 'Resolve'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: Resolved Alerts History */}
      <div className="space-y-3 pt-4 border-t border-gray-150">
        <h3 className="text-sm font-bold text-gray-950 flex items-center gap-2">
          📜 Historic Resolved Logs ({resolvedAlerts.length})
        </h3>

        {resolvedAlerts.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No resolved issues log available.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden shadow-xs">
            {resolvedAlerts.map(alert => (
              <div key={alert._id} className="p-4 flex items-start justify-between gap-4 hover:bg-gray-50/50 transition">
                <div className="flex items-start gap-3">
                  <span className="text-base text-gray-450 mt-0.5">✅</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-700 capitalize">
                        {alert.type.replace('_', ' ')}
                      </span>
                      <span className="text-[9px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        Resolved
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {alert.message}
                    </p>
                    <span className="text-[9px] text-gray-400 block mt-1 font-mono">
                      Closed: {new Date(alert.resolvedAt || alert.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
