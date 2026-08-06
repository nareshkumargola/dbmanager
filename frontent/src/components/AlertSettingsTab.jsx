import { useState, useEffect } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function AlertSettingsTab({ connectionId }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [threshold, setThreshold] = useState(90);
  const [slowQueryThreshold, setSlowQueryThreshold] = useState(100);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings();
  }, [connectionId]);

  const fetchSettings = async () => {
    setFetching(true);
    setError('');
    try {
      // Fetch connection details to pre-populate settings
      const res = await API.get('/connections');
      const conn = res.data.connections.find(c => c._id === connectionId);
      if (conn) {
        setEnabled(conn.alertsEnabled || false);
        setEmail(conn.alertEmail || (user && user.email) || '');
        setSlackWebhook(conn.alertSlackWebhook || '');
        setDiscordWebhook(conn.alertDiscordWebhook || '');
        setThreshold(conn.alertThreshold || 90);
        setSlowQueryThreshold(conn.slowQueryThreshold || 100);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to load alert configurations.');
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccess('');
    setError('');
    try {
      const res = await API.put(`/monitor/${connectionId}/alert-settings`, {
        alertsEnabled: enabled,
        alertEmail: email,
        alertSlackWebhook: slackWebhook || null,
        alertDiscordWebhook: discordWebhook || null,
        alertThreshold: threshold,
        slowQueryThreshold: slowQueryThreshold
      });
      setSuccess(res.data.message || 'Alert configurations saved successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save configurations.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
        <div className="w-8 h-8 border-[3px] border-teal-100 border-t-[#0d9da4] rounded-full animate-spin mx-auto mb-3"></div>
        Loading alert configurations...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm text-left max-w-xl mx-auto">
      <div className="mb-6">
        <h3 className="text-base font-bold text-gray-900">🔔 Notification & Alert Configurations</h3>
        <p className="text-xs text-gray-400 mt-1 leading-normal">
          Apne database servers ke status par nazar rakhne ke liye email notification alerts aur utilization warning thresholds setup karein.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-600 text-xs px-4 py-3 rounded-lg border border-red-200">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 text-green-600 text-xs px-4 py-3 rounded-lg border border-green-200">
          Refreshed: {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        
        {/* Toggle Switch */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <label className="block text-xs font-bold text-gray-800">Enable Server Health Monitoring</label>
            <p className="text-[10px] text-gray-400 leading-normal">Agar database unreachable hota hai ya limits cross karta hai toh alert notify karein.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={() => setEnabled(!enabled)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-250 rounded-full peer peer-focus:ring-2 peer-focus:ring-teal-200 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0d9da4]"></div>
          </label>
        </div>

        {enabled && (
          <div className="space-y-4 animate-fadeIn">
            {/* Email Address */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Admin Email Address
              </label>
              <input
                type="email"
                placeholder="e.g. admin@coinfinity.io"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none bg-gray-50/50 focus:bg-white focus:border-gray-400 transition"
              />
            </div>

            {/* Advanced Slack/Discord Webhooks collapsible (Optional) */}
            <details className="group border border-gray-200 rounded-lg p-3 bg-gray-50/50">
              <summary className="text-xs font-bold text-gray-750 cursor-pointer list-none flex justify-between items-center select-none">
                <span>🔗 Slack & Discord Webhooks (Optional)</span>
                <span className="text-[10px] text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="mt-3.5 space-y-4 pt-3 border-t border-gray-200/60">
                {/* Slack Webhook */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Slack Channel Webhook URL
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. https://hooks.slack.com/services/..."
                    value={slackWebhook}
                    onChange={e => setSlackWebhook(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none bg-white focus:border-gray-450 transition"
                  />
                </div>

                {/* Discord Webhook */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Discord Channel Webhook URL
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. https://discord.com/api/webhooks/..."
                    value={discordWebhook}
                    onChange={e => setDiscordWebhook(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none bg-white focus:border-gray-450 transition"
                  />
                </div>
              </div>
            </details>

            {/* Connection Threshold Slider */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-gray-700">
                  Connection Utilization Warning Threshold
                </label>
                <span className="text-xs font-bold text-[#0d9da4]">
                  {threshold}%
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="50"
                  max="98"
                  value={threshold}
                  onChange={e => setThreshold(parseInt(e.target.value))}
                  className="flex-grow accent-[#0d9da4] h-1.5 bg-gray-200 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] text-gray-400 font-medium font-mono min-w-[20px]">50-98%</span>
              </div>
              <p className="text-[9px] text-gray-400 mt-1 leading-normal">
                Active connection counts max connections limit ka ye percentage cross karte hi warning trigger hogi.
              </p>
            </div>

            {/* Slow Query Warning Threshold Slider */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-gray-700">
                  Slow Query Warning Threshold
                </label>
                <span className="text-xs font-bold text-[#0d9da4]">
                  {slowQueryThreshold}ms
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="50"
                  value={slowQueryThreshold}
                  onChange={e => setSlowQueryThreshold(parseInt(e.target.value))}
                  className="flex-grow accent-[#0d9da4] h-1.5 bg-gray-200 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] text-gray-400 font-medium font-mono min-w-[20px]">50-2000ms</span>
              </div>
              <p className="text-[9px] text-gray-400 mt-1 leading-normal">
                Koi bhi database query execution agar is milliseconds limits se zyada time legi, to warning dispatch ki jayegi.
              </p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ background: '#0d9da4', color: '#ffffff' }}
          className="w-full py-2.5 text-xs font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition shadow-xs flex items-center justify-center gap-2"
        >
          {loading ? 'Saving configurations...' : '💾 Save Configurations'}
        </button>

      </form>
    </div>
  );
}
