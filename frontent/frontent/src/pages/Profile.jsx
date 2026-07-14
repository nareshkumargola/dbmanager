import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Navbar from '../components/Navbar';

export default function Profile() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [user, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <Navbar backTo="/dashboard" backText="Dashboard" />

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">My Profile</h2>
          <p className="text-sm text-gray-500 mt-1">
            View your account details
          </p>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">

          {/* Avatar + Name */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
            <div className="w-16 h-16 rounded-full bg-[#0d9da4] text-white flex items-center justify-center text-2xl font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {user?.name}
              </h3>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-4">

            {/* Name */}
            <div className="flex items-center justify-between py-3 border-b border-gray-50">
              <span className="text-sm text-gray-500">Full Name</span>
              <span className="text-sm font-medium text-gray-900">
                {user?.name}
              </span>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between py-3 border-b border-gray-50">
              <span className="text-sm text-gray-500">Email</span>
              <span className="text-sm font-medium text-gray-900">
                {user?.email}
              </span>
            </div>

            {/* Role */}
            <div className="flex items-center justify-between py-3 border-b border-gray-50">
              <span className="text-sm text-gray-500">Role</span>
              <span className={`text-xs px-3 py-1 rounded-full font-medium
                ${user?.role === 'admin' 
                  ? 'bg-[#0d9da4] text-white' 
                  : user?.role === 'developer'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
                }`}>
                {user?.role}
              </span>
            </div>

            {/* Account ID */}
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-gray-500">Account ID</span>
              <span className="text-xs text-gray-400 font-mono">
                {user?._id}
              </span>
            </div>

          </div>
        </div>



        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full py-2.5 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 transition"
        >
          Logout
        </button>

      </div>
    </div>
  );
}