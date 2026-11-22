import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout/Layout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import FetchResultsPage from './pages/FetchResultsPage';
import EnrollmentPreviewPage from './pages/EnrollmentPreviewPage';
import DashboardPage from './pages/DashboardPage';
import AllResultsPage from './pages/AllResultsPage';
import StudentDetailsPage from './pages/StudentDetailsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import DownloadHistoryPage from './pages/DownloadHistoryPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import TRConverterPage from './pages/TRConverterPage';
import NotFoundPage from './pages/NotFoundPage';

function ProtectedRoute({ children }) {
      const { user, loading } = useAuth();
      if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-700"></div></div>;
      if (!user) return <Navigate to="/login" replace />;
      return children;
}

function PublicRoute({ children }) {
      const { user, loading } = useAuth();
      if (loading) return null;
      if (user) return <Navigate to="/dashboard" replace />;
      return children;
}

function AdminEntryRoute() {
      const { user, loading } = useAuth();
      if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-700"></div></div>;
      if (!user) return <AdminPage />;
      if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
      return <Outlet />;
}

function AppRoutes() {
      return (
            <Routes>
                  <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                  <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
                  <Route path="/admin" element={<AdminEntryRoute />}>
                        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                              <Route index element={<AdminPage />} />
                        </Route>
                  </Route>
                  <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                        <Route index element={<HomePage />} />
                        <Route path="dashboard" element={<DashboardPage />} />
                        <Route path="fetch-results" element={<FetchResultsPage />} />
                        <Route path="tr-converter" element={<TRConverterPage />} />
                        <Route path="enrollment-preview" element={<EnrollmentPreviewPage />} />
                        <Route path="results/:jobId" element={<AllResultsPage />} />
                        <Route path="results/:jobId/student/:studentId" element={<StudentDetailsPage />} />
                        <Route path="analytics" element={<AnalyticsPage />} />
                        <Route path="downloads" element={<DownloadHistoryPage />} />
                        <Route path="settings" element={<SettingsPage />} />
                  </Route>
                  <Route path="*" element={<NotFoundPage />} />
            </Routes>
      );
}

export default function App() {
      return (
            <ThemeProvider>
                  <AuthProvider>
                        <AppRoutes />
                  </AuthProvider>
            </ThemeProvider>
      );
}
