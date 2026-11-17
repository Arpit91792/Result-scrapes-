import { Menu, Sun, Moon, LogOut, User, Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';

export default function Header({ onMenuClick }) {
      const { user, logout } = useAuth();
      const { theme, toggleTheme } = useTheme();
      const navigate = useNavigate();

      const handleLogout = () => {
            logout();
            navigate('/login');
      };

      return (
            <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 h-16 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
                  <div className="flex items-center gap-4">
                        <button
                              onClick={onMenuClick}
                              className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                              <Menu className="w-5 h-5" />
                        </button>
                        <div>
                              <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-200 hidden md:block">
                                    SIRT Smart Bulk Result Manager
                              </h1>
                              <p className="text-xs text-gray-500 dark:text-gray-400 hidden md:block">
                                    Sagar Institute of Research & Technology, Bhopal
                              </p>
                        </div>
                  </div>

                  <div className="flex items-center gap-2">
                        {/* Theme toggle */}
                        <button
                              onClick={toggleTheme}
                              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
                              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                        >
                              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                        </button>

                        {/* User info */}
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800">
                              <div className="bg-navy-700 p-1 rounded-full">
                                    <User className="w-4 h-4 text-white" />
                              </div>
                              <div className="hidden md:block">
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{user?.username}</p>
                                    <p className="text-xs text-gray-400 capitalize">{user?.role?.replace('_', ' ')}</p>
                              </div>
                        </div>

                        {/* Logout */}
                        <button
                              onClick={handleLogout}
                              className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                              title="Logout"
                        >
                              <LogOut className="w-5 h-5" />
                        </button>
                  </div>
            </header>
      );
}
