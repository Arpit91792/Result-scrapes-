import { useAuth } from '../contexts/AuthContext';
import { Shield, AlertCircle } from 'lucide-react';

export default function AdminPage() {
      const { user } = useAuth();

      if (user?.role !== 'admin') {
            return (
                  <div className="max-w-xl mx-auto mt-20 text-center">
                        <div className="card">
                              <Shield className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                              <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Admin Access Required</h1>
                              <p className="text-gray-400 text-sm mt-2">This page is restricted to administrators only.</p>
                        </div>
                  </div>
            );
      }

      return (
            <div className="max-w-4xl mx-auto space-y-5">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Shield className="w-6 h-6 text-primary-500" /> Admin Panel
                  </h1>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-blue-700 dark:text-blue-400">
                              Admin panel features (user management, system stats, job oversight) are available here. Connect to the backend admin API endpoints to manage users and monitor all jobs.
                        </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="card">
                              <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Your Admin Account</h2>
                              <p className="text-sm text-gray-500">Username: <strong>{user.username}</strong></p>
                              <p className="text-sm text-gray-500">Email: <strong>{user.email}</strong></p>
                              <p className="text-sm text-gray-500">Role: <strong className="text-primary-600">Admin</strong></p>
                        </div>
                        <div className="card">
                              <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">System Status</h2>
                              <p className="text-sm text-green-600 font-medium">✓ Backend connected</p>
                              <p className="text-sm text-green-600 font-medium">✓ Database connected</p>
                              <p className="text-sm text-green-600 font-medium">✓ Socket.IO active</p>
                        </div>
                  </div>
            </div>
      );
}
