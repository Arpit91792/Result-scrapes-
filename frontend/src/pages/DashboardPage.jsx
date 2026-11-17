import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Clock, CheckCircle, XCircle, PauseCircle, Users, Download, ArrowRight, Layers, Trash2, Loader2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

function JobCard({ job, onDelete, deletingId }) {
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
            <Link to={`/results/${job._id}`} className="card hover:shadow-md transition-shadow block relative group">
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
                        <div className="flex items-center gap-1.5">
                              {job.status === 'running' && (
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 flex items-center gap-1">
                                          <Layers className="w-3 h-3" /> {job.maxTabs || 100} Tabs
                                    </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColors[job.status] || 'bg-gray-100 text-gray-600'}`}>
                                    {job.status}
                              </span>
                              <button
                                    onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          onDelete(job);
                                    }}
                                    disabled={deletingId === job._id}
                                    title="Delete this fetch job"
                                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ml-1"
                              >
                                    {deletingId === job._id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                                    ) : (
                                          <Trash2 className="w-3.5 h-3.5" />
                                    )}
                              </button>
                        </div>
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
      const [deletingId, setDeletingId] = useState(null);

      const fetchJobs = () => {
            api.get('/results/jobs')
                  .then(res => setJobs(res.data.jobs))
                  .catch(() => { })
                  .finally(() => setLoading(false));
      };

      useEffect(() => {
            fetchJobs();
      }, []);

      const handleDeleteJob = async (job) => {
            const confirmMsg = `Are you sure you want to delete this fetch job (${job.collegeCode} · ${job.branch} Sem ${job.semester})?\n\nThis will permanently delete the job and all its student result records.`;
            if (!window.confirm(confirmMsg)) return;

            setDeletingId(job._id);
            try {
                  await api.delete(`/results/job/${job._id}`);
                  toast.success('Fetch job deleted successfully');
                  setJobs(prev => prev.filter(j => j._id !== job._id));
            } catch (err) {
                  toast.error(err.response?.data?.error || 'Failed to delete job');
            } finally {
                  setDeletingId(null);
            }
      };

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
                                    {jobs.map(job => (
                                          <JobCard
                                                key={job._id}
                                                job={job}
                                                onDelete={handleDeleteJob}
                                                deletingId={deletingId}
                                          />
                                    ))}
                              </div>
                        )}
                  </div>
            </div>
      );
}
