import { useState } from 'react';
import Navbar from '../components/Navbar';

export default function HelpDocs() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const guides = [
    {
      id: 'whitelist-ip',
      category: 'network',
      title: 'Database Firewall IP Whitelisting',
      content: `To allow Allatone DMS to communicate with your database, you must configure your database firewall or cloud security group (e.g., AWS Security Group, Azure Firewall, or GCP firewall) to accept traffic from our servers.

All traffic from our platform originates from the following IP addresses:
• 192.168.1.100 (Primary Gateway)
• 34.120.45.89 (Failover Tunnel)
• 104.24.12.110 (Compliance Node)

For MySQL:
GRANT ALL PRIVILEGES ON database_name.* TO 'your_user'@'34.120.45.89' IDENTIFIED BY 'password';

For MongoDB Atlas:
Go to Network Access -> IP Access List -> Click "Add IP Address" and enter '34.120.45.89'.`,
      tags: ['mysql', 'mongodb', 'firewall', 'ip', 'aws', 'gcp']
    },
    {
      id: 'mongo-conn',
      category: 'connections',
      title: 'How to Connect MongoDB Databases',
      content: `Allatone DMS supports both MongoDB Standalone and MongoDB Atlas Replica Sets.

Format for MongoDB Atlas:
mongodb+srv://<username>:<password>@cluster.mongodb.net/database_name?retryWrites=true&w=majority

Format for Local/Standard Mongo:
mongodb://<username>:<password>@<host>:<port>/database_name?authSource=admin

Ensure that you have enabled authentication on your Mongo instance and that the user has at least 'readWrite' privileges.`,
      tags: ['mongodb', 'atlas', 'connection string']
    },
    {
      id: 'query-timeouts',
      category: 'querying',
      title: 'Handling Long-Running Queries and Timeouts',
      content: `To ensure platform stability, Allatone DMS imposes a strict execution limit on raw queries:
• SELECT/Find Reads: Max 30 seconds execution limit.
• UPDATE/DELETE/Writes: Max 60 seconds execution limit.

If your query exceeds this timeout, the server terminates the session to prevent database lockups. Optimize your query using indexes (e.g., EXPLAIN in SQL or explain() in Mongo) to improve performance.`,
      tags: ['timeout', 'explain', 'limit', 'performance']
    },
    {
      id: 'roles-faq',
      category: 'general',
      title: 'User Roles & Privilege Levels FAQ',
      content: `Allatone DMS operates on a strict Role-Based Access Control (RBAC) model:
• Admins: Can manage database connections, change roles, register new users, and view the entire system audit trail logs.
• Developers: Can view connections, execute SQL/NoSQL queries, and manage database tables/collections. They cannot access system audit logs or delete connections created by others.`,
      tags: ['roles', 'permissions', 'admin', 'developer']
    }
  ];

  const filteredGuides = guides.filter(guide => {
    const matchesCategory = activeCategory === 'all' || guide.category === activeCategory;
    const matchesSearch = guide.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          guide.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          guide.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-left">
      {/* Navbar Layout configuration */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <div className="max-w-4xl mx-auto px-5 py-8">
        {/* Header Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-teal-900 dark:text-teal-50">Help Center &amp; Documentation</h1>
          <p className="text-sm text-teal-800/70 dark:text-teal-200/80 mt-1">
            Access guides, database connectivity instructions, whitelisting parameters, and platform FAQs.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search documentation, whitelist details, error guides..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl text-xs text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-1 focus:ring-[#0d9da4] focus:border-[#0d9da4] transition font-medium"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-200 dark:border-gray-800 pb-4">
          {['all', 'network', 'connections', 'querying', 'general'].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                activeCategory === cat
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-white dark:bg-gray-850 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Help Cards */}
        <div className="space-y-5">
          {filteredGuides.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-850 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
              <p className="text-xs text-gray-450 italic">No matching guides found for "{searchQuery}"</p>
            </div>
          ) : (
            filteredGuides.map(guide => (
              <div 
                key={guide.id}
                className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs transition hover:shadow-sm"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/20 text-[#0d9da4] dark:text-teal-400">
                    {guide.category}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-2">{guide.title}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {guide.content}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {guide.tags.map(tag => (
                    <span 
                      key={tag} 
                      className="text-[9px] font-semibold font-mono bg-gray-50 dark:bg-gray-800/40 text-gray-500 px-1.5 py-0.5 rounded border border-gray-150 dark:border-gray-800/60"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
