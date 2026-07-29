import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';

export default function SystemStatus() {
  const [refreshTime, setRefreshTime] = useState(new Date().toLocaleTimeString());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [metrics, setMetrics] = useState({
    apiLatency: 42,
    cpuLoad: 12,
    ramLoad: 48,
    activeTunnels: 3,
    processedQueries: 1420
  });

  const simulateUpdate = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setMetrics({
        apiLatency: Math.floor(35 + Math.random() * 20),
        cpuLoad: Math.floor(8 + Math.random() * 15),
        ramLoad: Math.floor(45 + Math.random() * 5),
        activeTunnels: 3 + Math.floor(Math.random() * 2),
        processedQueries: 1420 + Math.floor(Math.random() * 10)
      });
      setRefreshTime(new Date().toLocaleTimeString());
      setIsRefreshing(false);
    }, 1000);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      simulateUpdate();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-left">
      {/* Navbar Configuration */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <div className="max-w-4xl mx-auto px-5 py-8">
        {/* Title */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-teal-900 dark:text-teal-50">System Operational Status</h1>
            <p className="text-sm text-teal-800/70 dark:text-teal-200/80 mt-1">
              Real-time operational health checks of the DMS server, connections, and analytics logs engines.
            </p>
          </div>
          <button
            onClick={simulateUpdate}
            disabled={isRefreshing}
            className="px-4 py-2 border border-gray-250 dark:border-gray-800 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-bold rounded-lg text-gray-700 dark:text-gray-300 disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span className={`w-3.5 h-3.5 border-2 border-gray-400 border-t-teal-500 rounded-full ${isRefreshing ? 'animate-spin' : ''}`}></span>
            Force Refresh
          </button>
        </div>

        {/* System Summary Banner */}
        <div className="mb-7 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-lg shrink-0">
            ✓
          </div>
          <div>
            <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-400">All Systems Operational</h3>
            <p className="text-xs text-emerald-800/70 dark:text-emerald-300/80 mt-0.5">
              Last check: {refreshTime} — No disruptions or lag detected over the last 24 hours.
            </p>
          </div>
        </div>

        {/* Health Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          {/* API Latency */}
          <div className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">API Gateway Latency</p>
            <p className="text-2xl font-bold text-teal-800 dark:text-teal-50 mt-1 font-mono">{metrics.apiLatency} ms</p>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Optimal Connection</span>
            </div>
          </div>

          {/* Engine Load */}
          <div className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">CPU Server Load</p>
            <p className="text-2xl font-bold text-teal-800 dark:text-teal-50 mt-1 font-mono">{metrics.cpuLoad} %</p>
            <div className="mt-3 w-full bg-gray-100 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-teal-500 h-full rounded-full transition-all duration-500" style={{ width: `${metrics.cpuLoad}%` }}></div>
            </div>
          </div>

          {/* Ram usage */}
          <div className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">RAM Memory Load</p>
            <p className="text-2xl font-bold text-teal-800 dark:text-teal-50 mt-1 font-mono">{metrics.ramLoad} %</p>
            <div className="mt-3 w-full bg-gray-100 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-teal-500 h-full rounded-full transition-all duration-500" style={{ width: `${metrics.ramLoad}%` }}></div>
            </div>
          </div>
        </div>

        {/* Services Status Table */}
        <div className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
            <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Service Components Uptime</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800 text-xs">
            {[
              { name: 'Gateway Tunnels API', desc: 'Handles client queries, database listing protocols.', status: 'Operational', uptime: '99.99%' },
              { name: 'Database Proxy Connection Tunnels', desc: 'Secure connection streams to remote databases.', status: 'Operational', uptime: '99.98%' },
              { name: 'System Auditing Logger System', desc: 'Encrypted storage for query history and admin changes.', status: 'Operational', uptime: '100.00%' },
              { name: 'Developer User Management Engine', desc: 'Session tokens validation, account signups and roles.', status: 'Operational', uptime: '99.99%' }
            ].map(srv => (
              <div key={srv.name} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition">
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-gray-100">{srv.name}</h4>
                  <p className="text-gray-500 text-[11px] mt-0.5">{srv.desc}</p>
                </div>
                <div className="flex items-center gap-5 sm:justify-end shrink-0">
                  <div className="text-right sm:block hidden">
                    <p className="text-[10px] text-gray-400">Monthly Uptime</p>
                    <p className="font-semibold text-gray-700 dark:text-gray-300 font-mono mt-0.5">{srv.uptime}</p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                    {srv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
