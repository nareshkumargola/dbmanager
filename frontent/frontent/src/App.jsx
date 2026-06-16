import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Signup from './pages/Signup';
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

        {/* Protected */}
        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />
        <Route path="/mysql/table/:tableName" element={
          <ProtectedRoute><MysqlTable /></ProtectedRoute>
        } />
        <Route path="/mongo/collection/:collectionName" element={
          <ProtectedRoute><MongoCollection /></ProtectedRoute>
        } />
        <Route path="/query" element={
          <ProtectedRoute><QueryEditor /></ProtectedRoute>
        } />
        <Route path="/history" element={
          <ProtectedRoute><QueryHistory /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><Profile /></ProtectedRoute>
        } />
        <Route path="/backup" element={
          <ProtectedRoute><Backup /></ProtectedRoute>
        } />
        <Route path="/slow-queries" element={
          <ProtectedRoute><SlowQuery /></ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute><UserManagement /></ProtectedRoute>
        } />
        <Route path="/connections" element={
          <ProtectedRoute><Connections /></ProtectedRoute>
        } />
        <Route path="/connections/:id" element={
          <ProtectedRoute><ConnectionDashboard /></ProtectedRoute>
        } />
        <Route path="/connections/:id/select-db" element={
          <ProtectedRoute><DatabaseSelector /></ProtectedRoute>
        } />
        <Route path="/connections/:id/db/:database" element={
          <ProtectedRoute><ConnectionDashboard /></ProtectedRoute>
        } />
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
      <AppRoutes />
    </AuthProvider>
  );
}