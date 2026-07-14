import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavbarProvider } from './context/NavbarContext';
import Layout from './components/Layout';

import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import MysqlTable from './pages/MysqlTable';
import MongoCollection from './pages/MongoCollection';
import QueryEditor from './pages/QueryEditor';
import QueryHistory from './pages/QueryHistory';
import Profile from './pages/Profile';
import Backup from './pages/Backup';
import SlowQuery from './pages/SlowQuery';
import UserManagement from './pages/UserManagement';
import Connections from './pages/Connections';
import ConnectionDashboard from './pages/ConnectionDashboard';
import DatabaseSelector from './pages/DatabaseSelector';
import ConnectionUsers from './pages/ConnectionUsers';
import ConnectionMonitor from './pages/ConnectionMonitor';
import ConnectionBinlog from './pages/ConnectionBinlog';
import ConnectionBackup from './pages/ConnectionBackup';
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
      <Routes>

        {/* Default */}
        <Route path="/" element={<Navigate to="/dashboard" />} />

        {/* Public */}
        <Route path="/login" element={
          <PublicRoute><Login /></PublicRoute>
        } />
        <Route path="/signup" element={
          <PublicRoute><Signup /></PublicRoute>
        } />
        <Route path="/forgot-password" element={
          <PublicRoute><ForgotPassword /></PublicRoute>
        } />
        <Route path="/reset-password/:token" element={
          <PublicRoute><ResetPassword /></PublicRoute>
        } />

        {/* Protected Routes wrapped in persistent Layout */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
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
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavbarProvider>
        <AppRoutes />
      </NavbarProvider>
    </AuthProvider>
  );
}