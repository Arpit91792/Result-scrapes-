import { Link } from 'react-router-dom';
import { Search, BarChart3, Download, Shield, ArrowRight, GraduationCap, FileSpreadsheet, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const features = [
      { icon: Search, title: 'Bulk Result Fetching', desc: 'Fetch results for entire batches using enrollment number ranges from official RGPV sources.' },
      { icon: FileSpreadsheet, title: 'Excel Export', desc: 'Download professionally formatted Excel workbooks with all students, subject marks, and analytics.' },
      { icon: BarChart3, title: 'Live Dashboard', desc: 'Real-time progress tracking with Socket.IO — monitor every step of the fetching process.' },
      { icon: Users, title: 'Student Details', desc: 'Detailed subject-wise marks, grades, SGPA, CGPA, and backlog information per student.' },
      { icon: Shield, title: 'Secure & Private', desc: 'JWT authentication, role-based access control, and no public exposure of student data.' },
      { icon: Download, title: 'PDF & ZIP Export', desc: 'Generate individual student summary reports and download as ZIP archives.' },
];

export default function HomePage() {
      const { user } = useAuth();

      return (
            <div className="max-w-5xl mx-auto space-y-10">
                  {/* Hero */}
                  <div className="card bg-gradient-to-br from-navy-700 to-navy-900 text-white border-0">
                        <div className="flex flex-col md:flex-row items-center gap-6">
                              <div className="bg-white/10 p-4 rounded-2xl">
                                    <GraduationCap className="w-16 h-16 text-white" />
                              </div>
                              <div>
                                    <h1 className="text-3xl font-bold">RGPV Smart Bulk Result Manager</h1>
                                    <p className="text-white/70 mt-2 text-lg">
                                          Fetch, analyze, and export examination results for entire college batches from official RGPV sources.
                                    </p>
                                    <div className="flex flex-wrap gap-3 mt-4">
                                          <Link to="/fetch-results" className="bg-white text-navy-700 font-semibold px-5 py-2 rounded-lg hover:bg-gray-100 transition flex items-center gap-2">
                                                <Search className="w-4 h-4" /> Start Fetching
                                          </Link>
                                          <Link to="/dashboard" className="bg-white/10 text-white font-semibold px-5 py-2 rounded-lg hover:bg-white/20 transition flex items-center gap-2">
                                                Dashboard <ArrowRight className="w-4 h-4" />
                                          </Link>
                                    </div>
                              </div>
                        </div>
                  </div>

                  {/* Welcome */}
                  <div className="card">
                        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                              Welcome back, {user?.username}!
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
                              {user?.collegeName ? `${user.collegeName} (${user.collegeCode})` : 'College user'} — Authorized portal access.
                        </p>
                  </div>

                  {/* Important Notice */}
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
                        <h3 className="font-semibold text-amber-800 dark:text-amber-400 mb-2">⚠️ Important Usage Notice</h3>
                        <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1 list-disc list-inside">
                              <li>This tool fetches results only from official, publicly accessible RGPV portals.</li>
                              <li>CAPTCHA challenges are presented to users for manual completion — never automatically bypassed.</li>
                              <li>Generated Excel and PDF files are reference documents, not official marksheets.</li>
                              <li>Use Demo Mode to test the system without accessing the live portal.</li>
                              <li>Unauthorized scraping or bulk automated access may violate RGPV terms of service.</li>
                        </ul>
                  </div>

                  {/* Features Grid */}
                  <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4">Features</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {features.map((f) => (
                                    <div key={f.title} className="card hover:shadow-md transition-shadow">
                                          <div className="bg-primary-100 dark:bg-primary-900/30 w-10 h-10 rounded-lg flex items-center justify-center mb-3">
                                                <f.icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                          </div>
                                          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{f.title}</h3>
                                          <p className="text-sm text-gray-500 dark:text-gray-400">{f.desc}</p>
                                    </div>
                              ))}
                        </div>
                  </div>
            </div>
      );
}
