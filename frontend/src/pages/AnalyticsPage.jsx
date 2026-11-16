import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Users, Award } from 'lucide-react';
import api from '../services/api';

export default function AnalyticsPage() {
      const [jobs, setJobs] = useState([]);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
            api.get('/results/jobs').then(r => setJobs(r.data.jobs)).finally(() => setLoading(false));
      }, []);

      const totalStudents = jobs.reduce((a, j) => a + (j.totalStudents || 0), 0);
      const totalPassed = jobs.reduce((a, j) => a + (j.passedCount || 0), 0);
      const totalFailed = jobs.reduce((a, j) => a + (j.failedCount || 0), 0);
      const passRate = totalStudents > 0 ? ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1) : 0;

      if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-700"></div></div>;

      return (
            <div className="max-w-5xl mx-auto space-y-6">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Analytics</h1>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                              { icon: Users, label: 'Total Students Processed', value: totalStudents, color: 'text-primary-600' },
                              { icon: Award, label: 'Overall Pass Rate', value: `${passRate}%`, color: 'text-green-600' },
                              { icon: BarChart3, label: 'Total Passed', value: totalPassed, color: 'text-blue-600' },
                              { icon: TrendingUp, label: 'Total Failed', value: totalFailed, color: 'text-red-600' },
                        ].map(s => (
                              <div key={s.label} className="card p-4">
                                    <s.icon className={`w-8 h-8 ${s.color} mb-2`} />
                                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                              </div>
                        ))}
                  </div>

                  {/* Per-job breakdown */}
                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Job Breakdown</h2>
                        {jobs.length === 0 ? (
                              <p className="text-gray-400 text-center py-8">No jobs yet. Start fetching results to see analytics.</p>
                        ) : (
                              <div className="space-y-3">
                                    {jobs.map(job => {
                                          const pct = job.totalStudents ? ((job.passedCount || 0) / job.totalStudents * 100).toFixed(0) : 0;
                                          return (
                                                <div key={job._id} className="flex items-center gap-4">
                                                      <div className="w-48 flex-shrink-0">
                                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{job.branch} Sem {job.semester}</p>
                                                            <p className="text-xs text-gray-400">{job.examinationSession} {job.examinationYear}</p>
                                                      </div>
                                                      <div className="flex-1">
                                                            <div className="flex gap-1 h-5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-800">
                                                                  <div className="bg-green-500 h-full" style={{ width: `${pct}%` }} title={`${pct}% pass`} />
                                                                  <div className="bg-red-400 h-full" style={{ width: `${job.totalStudents ? (job.failedCount / job.totalStudents * 100).toFixed(0) : 0}%` }} />
                                                            </div>
                                                      </div>
                                                      <div className="w-20 text-right text-xs text-gray-500">{pct}% pass</div>
                                                </div>
                                          );
                                    })}
                              </div>
                        )}
                  </div>
            </div>
      );
}
