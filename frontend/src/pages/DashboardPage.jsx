import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Clock, CheckCircle, XCircle, PauseCircle, Users, Download, ArrowRight } from 'lucide-react';
import api from '../services/api';

function JobCard({ job }) {
      const pct = job.totalStudents ? Math.round((job.completedCount / job.totalStudents) * 100) : 0;
      const statusColors = {
            running: 'bg-blue-100 text-blue-700',
            completed: 'bg-green-100 text-green-700',
            paused: 'bg-yellow-100 text-yellow-700',
            cancelled: 'bg-red-100 text-red-700',
            pending: 'bg-gray-100 text-gray-600',
            failed: 'bg-red-100 text-red-700',
      };

      return (
            <Link to={`/results/${job._id}`} className="card hover:shadow-md transition-shadow block">
                  <div className="flex items-start justify-between mb-3">
                        <div>
                              <p className="font-semibold text-gray-800 dark:text-gray-200">
                                    {job.collegeCode} · {job.branch} · Sem {job.semester}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                    {job.examinationSession} {job.examinationYear}
                                    {job.dataSource === 'demo' && <span className="ml-1 text-amber-500">[DEMO]</span>}
                              </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[job.status] || 'bg-gray-100 text-gray-600'}`}>
                              {job.status}
                        </span>
                  </div>

                  <div className="mb-2">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                              <span>{job.completedCount}/{job.totalStudents} students</span>
                              <span>{pct}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-navy-700 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                  </div>

                  <div className="flex gap-3 text-xs text-gray-500">
                        <span className="text-green-600 font-medium">✓ {job.passedCount ?? 0} Pass</span>
                        <span className="text-red-500">✗ {job.failedCount ?? 0} Fail</span>
                        <span className="text-gray-400">? {job.missingCount ?? 0} Missing</span>
                        <span className="ml-auto flex items-center gap-1">View <ArrowRight className="w-3 h-3" /></span>
                  </div>
            </Link>
      );
}

export default function DashboardPage() {
      const [jobs, setJobs] = useState([]);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
            api.get('/results/jobs')
                  .then(res => setJobs(res.data.jobs))
                  .catch(() => { })
                  .finally(() => setLoading(false));
      }, []);

      const totalStudents = jobs.reduce((a, j) => a + (j.totalStudents || 0), 0);
      const totalPassed = jobs.reduce((a, j) => a + (j.passedCount || 0), 0);
      const totalFailed = jobs.reduce((a, j) => a + (j.failedCount || 0), 0);
      const runningJobs = jobs.filter(j => j.status === 'running').length;

      return (
            <div className="space-y-6 max-w-5xl mx-auto">
                  <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
                        <p className="text-gray-500 text-sm mt-0.5">Overview of all your fetch jobs</p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                              { icon: BarChart3, label: 'Total Jobs', value: jobs.length, color: 'text-primary-600' },
                              { icon: Users, label: 'Total Students', value: totalStudents, color: 'text-gray-700 dark:text-gray-300' },
                              { icon: CheckCircle, label: 'Passed', value: totalPassed, color: 'text-green-600' },
                              { icon: Clock, label: 'Running', value: runningJobs, color: 'text-blue-600' },
                        ].map(s => (
                              <div key={s.label} className="card p-4">
                                    <div className="flex items-center justify-between">
                                          <div>
                                                <p className="text-xs text-gray-500">{s.label}</p>
                                                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                                          </div>
                                          <s.icon className={`w-8 h-8 opacity-20 ${s.color}`} />
                                    </div>
                              </div>
                        ))}
                  </div>

                  {/* Quick Actions */}
                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Quick Actions</h2>
                        <div className="flex flex-wrap gap-3">
                              <Link to="/fetch-results" className="btn-primary text-sm py-2">
                                    Start New Fetch
                              </Link>
                              <Link to="/downloads" className="btn-secondary text-sm py-2">
                                    <Download className="w-4 h-4" /> Download History
                              </Link>
                        </div>
                  </div>

                  {/* Job List */}
                  <div>
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Recent Fetch Jobs</h2>
                        {loading ? (
                              <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-700"></div></div>
                        ) : jobs.length === 0 ? (
                              <div className="card text-center py-12">
                                    <BarChart3 className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                                    <p className="text-gray-500 dark:text-gray-400">No fetch jobs yet.</p>
                                    <Link to="/fetch-results" className="btn-primary text-sm mt-4 inline-flex">Start Fetching</Link>
                              </div>
                        ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {jobs.map(job => <JobCard key={job._id} job={job} />)}
                              </div>
                        )}
                  </div>
            </div>
      );
}
