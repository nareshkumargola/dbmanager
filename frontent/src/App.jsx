import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavbarProvider } from './context/NavbarContext';
import Layout from './components/Layout';
import PageBoundary from './components/PageBoundary';
import { lazyPage } from './utils/lazyPage';

const Login = lazyPage(() => import('./pages/Login'));
const ForgotPassword = lazyPage(() => import('./pages/ForgotPassword'));
const ResetPassword = lazyPage(() => import('./pages/ResetPassword'));
const loadDashboard = () => import('./pages/Dashboard');
const Dashboard = lazyPage(loadDashboard);
const MysqlTable = lazyPage(() => import('./pages/MysqlTable'));
const MongoCollection = lazyPage(() => import('./pages/MongoCollection'));
const QueryEditor = lazyPage(() => import('./pages/QueryEditor'));
const QueryHistory = lazyPage(() => import('./pages/QueryHistory'));
const Profile = lazyPage(() => import('./pages/Profile'));
const Backup = lazyPage(() => import('./pages/Backup'));
const SlowQuery = lazyPage(() => import('./pages/SlowQuery'));
const UserManagement = lazyPage(() => import('./pages/UserManagement'));
const loadConnections = () => import('./pages/Connections');
const Connections = lazyPage(loadConnections);
const ConnectionDashboard = lazyPage(() => import('./pages/ConnectionDashboard'));
const DatabaseSelector = lazyPage(() => import('./pages/DatabaseSelector'));
const ConnectionUsers = lazyPage(() => import('./pages/ConnectionUsers'));
const ConnectionMonitor = lazyPage(() => import('./pages/ConnectionMonitor'));
const ConnectionBinlog = lazyPage(() => import('./pages/ConnectionBinlog'));
const ConnectionBackup = lazyPage(() => import('./pages/ConnectionBackup'));
const HelpDocs = lazyPage(() => import('./pages/HelpDocs'));
const SystemStatus = lazyPage(() => import('./pages/SystemStatus'));
const LegalPolicies = lazyPage(() => import('./pages/LegalPolicies'));

// Protected Route
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  return children;
}

// Public Route
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" />;
  return children;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <PageBoundary>
      <Routes>

        {/* Default */}
        <Route path="/" element={<Navigate to="/dashboard" />} />

        {/* Public */}
        <Route path="/login" element={
          <PublicRoute><Login /></PublicRoute>
        } />
        <Route path="/signup" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={
          <PublicRoute><ForgotPassword /></PublicRoute>
        } />
        <Route path="/reset-password/:token" element={
          <PublicRoute><ResetPassword /></PublicRoute>
        } />

        {/* Protected Routes wrapped in persistent Layout */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/audit-logs" element={<Dashboard />} />
          <Route path="/system-users" element={<Dashboard />} />
          <Route path="/mysql/table/:tableName" element={<MysqlTable />} />
          <Route path="/mongo/collection/:collectionName" element={<MongoCollection />} />
          <Route path="/query" element={<QueryEditor />} />
          <Route path="/history" element={<QueryHistory />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/backup" element={<Backup />} />
          <Route path="/slow-queries" element={<SlowQuery />} />
          <Route path="/permissions" element={<UserManagement />} />
          <Route path="/connections" element={<Connections />} />
          <Route path="/connections/:id" element={<ConnectionDashboard />} />
          <Route path="/connections/:id/select-db" element={<DatabaseSelector />} />
          <Route path="/connections/:id/db/:database" element={<ConnectionDashboard />} />
          <Route path="/connections/:id/users" element={<ConnectionUsers />} />
          <Route path="/connections/:id/monitor" element={<ConnectionMonitor />} />
          <Route path="/connections/:id/binlog" element={<ConnectionBinlog />} />
          <Route path="/connections/:id/backup" element={<ConnectionBackup />} />
          <Route path="/help-docs" element={<HelpDocs />} />
          <Route path="/status" element={<SystemStatus />} />
          <Route path="/legal-policies" element={<LegalPolicies />} />
        </Route>
        {/* 404 */}
        <Route path="*" element={
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
            <p className="text-gray-500 text-sm mb-6">Page nahi mila!</p>
            <a href="/dashboard" className="text-sm text-gray-900 underline">
              Dashboard pe wapas jao
            </a>
          </div>
        } />

      </Routes>
      </PageBoundary>
    </BrowserRouter>
  );
}

export default function App() {
  // Fetch the two most used pages once the browser is idle, so opening them feels instant
  useEffect(() => {
    const preload = () => {
      loadDashboard().catch(() => {});
      loadConnections().catch(() => {});
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(preload);
    else setTimeout(preload, 1500);
  }, []);

  return (
    <AuthProvider>
      <NavbarProvider>
        <AppRoutes />
      </NavbarProvider>
    </AuthProvider>
  );
}