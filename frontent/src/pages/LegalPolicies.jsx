import { useState } from 'react';
import Navbar from '../components/Navbar';

export default function LegalPolicies() {
  const [activeTab, setActiveTab] = useState('privacy');

  const tabs = [
    { id: 'privacy', label: 'Privacy Policy' },
    { id: 'terms', label: 'Terms of Service' },
    { id: 'security', label: 'Database Security Standards' },
    { id: 'cookies', label: 'Session & Cookies' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-left">
      {/* Navbar configuration */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <div className="max-w-4xl mx-auto px-5 py-8">
        {/* Title Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-teal-900 dark:text-teal-50">Legal Agreements &amp; Security Policies</h1>
          <p className="text-sm text-teal-800/70 dark:text-teal-200/80 mt-1">
            Review how Allatone DMS safeguards database credentials, limits user liability, and tracks audit activities.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap border-b border-gray-200 dark:border-gray-800 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'border-[#0d9da4] text-[#0d9da4]'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dynamic Tab Content Cards */}
        <div className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-xs leading-relaxed text-xs text-gray-650 dark:text-gray-300">
          
          {/* Privacy Policy */}
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">1. Information We Collect</h2>
              <p>
                To provide a secure database connection tunnel, we collect user identity credentials (email, name, hashed passwords) and encrypted database configuration settings (hosts, ports, database names, database users).
              </p>
              <p className="bg-teal-50/50 dark:bg-teal-950/20 p-3 rounded-lg border border-teal-100 dark:border-teal-900/30 text-[11px] font-semibold text-teal-800 dark:text-teal-400">
                🔒 <strong>Database Secrets Protection:</strong> All passwords and connection URI secrets are fully encrypted at rest using AES-256-GCM. We never store database credentials in raw plain text format.
              </p>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">2. Query Logging &amp; Audit Trails</h2>
              <p>
                For auditing, compliance, and tracking developer activities, we record the raw SQL/NoSQL command, database connection target, timestamp, and user ID of every query executed on our platform. These logs are preserved in read-only tables for safety audit purposes and to investigate database security issues.
              </p>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">3. Data Sharing Restrictions</h2>
              <p>
                We do not sell, rent, lease, or distribute your identity details, database credentials, or query analytics data to any third-party marketing companies, advertisers, or vendors. Access to connection parameters is restricted strictly to authorized developers.
              </p>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">4. Data Retention &amp; Archival Policy</h2>
              <p>
                Query history records and slow query logs are retained in our operational databases for a default period of 365 days. Upon completion of this period, log entries are systematically archived into secure, cold-storage objects and deleted from live databases. Audit trails detailing configuration edits are stored indefinitely to maintain compliance history.
              </p>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">5. User Rights &amp; Access Controls</h2>
              <p>
                Users can request absolute deletion of their profiles and active database connections by contacting the system administrator. Please note that data deletion requests will exclude mandatory security audit logs (like transactional histories and permission modification flags) which must be preserved to satisfy regulatory compliance standards.
              </p>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">6. Compliance &amp; Regulatory Standards</h2>
              <p>
                Our platform operates under strict compliance standards designed around SOC 2 Type II, HIPAA, and GDPR guidelines. All connection sessions utilize TLS 1.3 encryption. Backend nodes run on isolated sandbox environments ensuring data packets do not cross-talk, protecting your company's network integrity.
              </p>
            </div>
          )}

          {/* Terms of Service */}
          {activeTab === 'terms' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">1. Acceptance of Terms</h2>
              <p>
                By connecting a database and executing queries, you agree to comply with our security protocols and accept full responsibility for operations performed.
              </p>

              <div className="bg-red-50/40 dark:bg-red-950/20 p-3.5 rounded-lg border border-red-150 dark:border-red-900/20 text-red-650 dark:text-red-400">
                ⚠️ <strong>Limitation of Liability:</strong> Allatone DMS serves as a database client tunnel. The developer/user is solely responsible for query safety. We are not liable for database downtime, loss of tables, row deletions (e.g. DROP, TRUNCATE, DELETE commands), or security breaches caused by user negligence.
              </div>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">2. Database Ownership &amp; Rights</h2>
              <p>
                You warrant that you hold legitimate permissions, rights, and auth keys to access and edit any target databases connected to the platform.
              </p>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">3. Account Termination</h2>
              <p>
                Administrators reserve the right to suspend developer privileges or remove accounts immediately if malicious activities or password brute-forcing is detected.
              </p>
            </div>
          )}

          {/* Database Security Standards */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">1. Isolation of Database Credentials</h2>
              <p>
                DMS backend APIs are designed so that decrypted connection passwords never traverse back to the browser. The browser only receives metadata (connection name, database type, hostname).
              </p>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">2. Immutable Audit Logs Policy</h2>
              <p>
                All log operations recorded in the System Audit Trail cannot be edited, modified, or deleted by standard developer accounts. Only system level administrators have read-only access to audit dashboards.
              </p>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">3. Transit Security</h2>
              <p>
                Every query command sent from the browser editor uses secure HTTPS (TLS 1.3) protocols to ensure mid-stream packets cannot be intercepted by network sniffers.
              </p>
            </div>
          )}

          {/* Cookies & Sessions */}
          {activeTab === 'cookies' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">1. JWT Token Authentication</h2>
              <p>
                To keep developers logged in, we store a secure JSON Web Token (JWT) in the browser's LocalStorage. This token authenticates every API request sent to the server.
              </p>

              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-4">2. Session Lifetime &amp; Expiry</h2>
              <p>
                Authentication sessions automatically expire after 24 hours of inactivity. When expired, the user is redirected to the login screen to protect against unauthorized access on shared devices.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
