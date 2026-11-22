import { NavLink, useLocation } from 'react-router-dom';
import {
      Home, LayoutDashboard, Search, List, BarChart3,
      Download, Settings, Shield, X, GraduationCap, FileText, FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/fetch-results', label: 'Fetch Results', icon: Search },
      { to: '/tr-converter', label: 'TR Converter', icon: FileSpreadsheet },
      { to: '/enrollment-preview', label: 'Enrollment Preview', icon: List },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/downloads', label: 'Download History', icon: Download },
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/admin', label: 'Admin Panel', icon: Shield },
];

export default function Sidebar({ open, onClose }) {
      const { user } = useAuth();
      const visibleNavItems = navItems.filter(item => item.to !== '/admin' || user?.role === 'admin');

      return (
            <>
                  {/* Overlay */}
                  {open && (
                        <div
                              className="fixed inset-0 bg-black/50 z-20 lg:hidden"
                              onClick={onClose}
                        />
                  )}

                  {/* Sidebar */}
                  <aside className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-64 flex flex-col
        bg-navy-700 dark:bg-navy-900
        transform transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
                        {/* Logo */}
                        <div className="flex items-center justify-between p-4 border-b border-navy-800">
                              <div className="flex items-center gap-3">
                                    <div className="bg-white/10 p-1.5 rounded-lg flex items-center justify-center">
                                          <img src="/sirt_logo.png" alt="SIRT Logo" className="w-8 h-8 object-contain" />
                                    </div>
                                    <div>
                                          <p className="text-white font-bold text-sm leading-tight">SIRT Smart</p>
                                          <p className="text-white/60 text-xs">Result Manager</p>
                                    </div>
                              </div>
                              <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white">
                                    <X className="w-5 h-5" />
                              </button>
                        </div>

                        {/* Nav */}
                        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                              {visibleNavItems.map((item) => (
                                    <NavLink
                                          key={item.to}
                                          to={item.to}
                                          end={item.end}
                                          onClick={onClose}
                                          className={({ isActive }) =>
                                                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${isActive
                                                      ? 'bg-white/20 text-white'
                                                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                                                }`
                                          }
                                    >
                                          <item.icon className="w-4 h-4 flex-shrink-0" />
                                          {item.label}
                                    </NavLink>
                              ))}
                        </nav>

                        {/* Footer */}
                        <div className="p-4 border-t border-navy-800 text-center">
                              <p className="text-white/40 text-xs">SIRT Smart Result Manager v1.0</p>
                              <p className="text-white/30 text-[10px] mt-0.5">by Arpit Tripathi</p>
                        </div>
                  </aside>
            </>
      );
}
