import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Sun, Moon, User } from 'lucide-react';

export default function SettingsPage() {
      const { user } = useAuth();
      const { theme, toggleTheme } = useTheme();

      return (
            <div className="max-w-2xl mx-auto space-y-5">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>

                  {/* Profile */}
                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                              <User className="w-4 h-4" /> Profile
                        </h2>
                        <div className="space-y-3 text-sm">
                              <div className="flex justify-between py-2 border-b dark:border-gray-800">
                                    <span className="text-gray-500">Username</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{user?.username}</span>
                              </div>
                              <div className="flex justify-between py-2 border-b dark:border-gray-800">
                                    <span className="text-gray-500">Email</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{user?.email}</span>
                              </div>
                              <div className="flex justify-between py-2 border-b dark:border-gray-800">
                                    <span className="text-gray-500">Role</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200 capitalize">{user?.role?.replace('_', ' ')}</span>
                              </div>
                              <div className="flex justify-between py-2 border-b dark:border-gray-800">
                                    <span className="text-gray-500">College Code</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{user?.collegeCode || '—'}</span>
                              </div>
                              <div className="flex justify-between py-2">
                                    <span className="text-gray-500">College Name</span>
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{user?.collegeName || '—'}</span>
                              </div>
                        </div>
                  </div>

                  {/* Theme */}
                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Appearance</h2>
                        <div className="flex items-center justify-between">
                              <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme</p>
                                    <p className="text-xs text-gray-400">Switch between light and dark mode</p>
                              </div>
                              <button
                                    onClick={toggleTheme}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${theme === 'dark' ? 'bg-gray-800 text-yellow-400' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                              >
                                    {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                                    {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                              </button>
                        </div>
                  </div>

                  {/* Info */}
                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">About</h2>
                        <div className="text-sm text-gray-500 space-y-1">
                              <p>RGPV Smart Bulk Result Manager v1.0</p>
                              <p>Results are fetched from official RGPV portals only.</p>
                        </div>
                  </div>
            </div>
      );
}
