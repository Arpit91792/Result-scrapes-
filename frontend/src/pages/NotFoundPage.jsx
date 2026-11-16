import { Link } from 'react-router-dom';

export default function NotFoundPage() {
      return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
                  <div className="text-center">
                        <p className="text-7xl font-bold text-navy-700 dark:text-primary-400">404</p>
                        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mt-4">Page Not Found</h1>
                        <p className="text-gray-400 mt-2">This page doesn't exist or you don't have access.</p>
                        <Link to="/" className="btn-primary mt-6 inline-flex">Go Home</Link>
                  </div>
            </div>
      );
}
