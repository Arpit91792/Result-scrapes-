import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, User, BookOpen, Award, Download, AlertCircle } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

function InfoRow({ label, value }) {
      if (value == null || value === '') return null;
      return (
            <div className="flex justify-between py-2 border-b dark:border-gray-800 last:border-0">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 text-right">{String(value)}</span>
            </div>
      );
}

export default function StudentDetailsPage() {
      const { jobId, studentId } = useParams();
      const [student, setStudent] = useState(null);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
            api.get(`/results/student/${studentId}`)
                  .then(res => setStudent(res.data.student))
                  .catch(() => toast.error('Failed to load student'))
                  .finally(() => setLoading(false));
      }, [studentId]);

      const handleDownloadPDF = async () => {
            try {
                  const res = await api.get(`/results/export/${jobId}/pdf/${studentId}`, { responseType: 'blob' });
                  const url = URL.createObjectURL(new Blob([res.data]));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `result_${student.enrollmentNumber}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
            } catch {
                  toast.error('PDF generation failed');
            }
      };

      if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-700"></div></div>;
      if (!student) return <div className="text-center py-20 text-gray-400">Student not found</div>;

      const isDemo = student.source === 'demo';

      return (
            <div className="max-w-3xl mx-auto space-y-5">
                  {/* Back */}
                  <Link to={`/results/${jobId}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <ArrowLeft className="w-4 h-4" /> Back to Results
                  </Link>

                  {/* Demo banner */}
                  {isDemo && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-amber-600" />
                              <p className="text-xs text-amber-700 dark:text-amber-400">
                                    <strong>DEMO DATA</strong> — This is sample data for testing purposes only. Not real student information.
                              </p>
                        </div>
                  )}

                  {/* Header */}
                  <div className="card bg-gradient-to-r from-navy-700 to-navy-900 text-white border-0">
                        <div className="flex items-center gap-4">
                              <div className="bg-white/10 p-3 rounded-xl">
                                    <User className="w-8 h-8" />
                              </div>
                              <div>
                                    <h1 className="text-xl font-bold">{student.studentName || 'Unknown Student'}</h1>
                                    <p className="text-white/70 font-mono text-sm">{student.enrollmentNumber}</p>
                                    <div className="flex gap-2 mt-2">
                                          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${student.resultStatus === 'PASS' ? 'bg-green-500 text-white' :
                                                      student.resultStatus === 'FAIL' ? 'bg-red-500 text-white' :
                                                            'bg-gray-500 text-white'
                                                }`}>{student.resultStatus}</span>
                                          {student.sgpa != null && (
                                                <span className="text-xs bg-white/20 px-3 py-1 rounded-full">SGPA: {student.sgpa}</span>
                                          )}
                                    </div>
                              </div>
                              <div className="ml-auto">
                                    <button onClick={handleDownloadPDF} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition">
                                          <Download className="w-4 h-4" /> PDF Report
                                    </button>
                              </div>
                        </div>
                  </div>

                  {/* Student Info */}
                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                              <User className="w-4 h-4 text-primary-500" /> Student Information
                        </h2>
                        <InfoRow label="Enrollment Number" value={student.enrollmentNumber} />
                        <InfoRow label="Student Name" value={student.studentName} />
                        <InfoRow label="College Code" value={student.collegeCode} />
                        <InfoRow label="College Name" value={student.collegeName} />
                        <InfoRow label="Course" value={student.course} />
                        <InfoRow label="Branch" value={student.branch} />
                        <InfoRow label="Semester" value={student.semester} />
                        <InfoRow label="Examination Year" value={student.examinationYear} />
                        <InfoRow label="Examination Session" value={student.examinationSession} />
                        <InfoRow label="Result Type" value={student.resultType} />
                        <InfoRow label="Result Mode" value={student.resultMode} />
                        <InfoRow label="Data Source" value={student.source} />
                        <InfoRow label="Fetched At" value={student.fetchedAt ? new Date(student.fetchedAt).toLocaleString() : null} />
                  </div>

                  {/* Subjects */}
                  {student.subjects && student.subjects.length > 0 && (
                        <div className="card p-0 overflow-hidden">
                              <div className="p-4 border-b dark:border-gray-800">
                                    <h2 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                          <BookOpen className="w-4 h-4 text-primary-500" /> Subject Details
                                    </h2>
                              </div>
                              <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                          <thead className="bg-gray-50 dark:bg-gray-800">
                                                <tr>
                                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Code</th>
                                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Subject Name</th>
                                                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Internal</th>
                                                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">External</th>
                                                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Practical</th>
                                                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Total</th>
                                                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Credits</th>
                                                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Grade</th>
                                                </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                                {student.subjects.map((sub, i) => (
                                                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                            <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">{sub.subjectCode || '—'}</td>
                                                            <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{sub.subjectName || '—'}</td>
                                                            <td className="px-4 py-2.5 text-center">{sub.internalMarks ?? '—'}</td>
                                                            <td className="px-4 py-2.5 text-center">{sub.externalMarks ?? '—'}</td>
                                                            <td className="px-4 py-2.5 text-center">{sub.practicalMarks ?? '—'}</td>
                                                            <td className="px-4 py-2.5 text-center font-semibold">{sub.totalMarks ?? '—'}</td>
                                                            <td className="px-4 py-2.5 text-center">{sub.credits ?? '—'}</td>
                                                            <td className="px-4 py-2.5 text-center">
                                                                  <span className={`font-bold text-sm ${sub.grade === 'F' ? 'text-red-500' : sub.grade === 'O' ? 'text-green-600' : 'text-blue-600'}`}>
                                                                        {sub.grade || '—'}
                                                                  </span>
                                                            </td>
                                                      </tr>
                                                ))}
                                          </tbody>
                                    </table>
                              </div>
                        </div>
                  )}

                  {/* Summary */}
                  <div className="card">
                        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                              <Award className="w-4 h-4 text-primary-500" /> Academic Summary
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {[
                                    { label: 'SGPA', value: student.sgpa, color: 'text-blue-700 dark:text-blue-400' },
                                    { label: 'CGPA', value: student.cgpa, color: 'text-indigo-700 dark:text-indigo-400' },
                                    { label: 'Total Credits', value: student.totalCredits, color: 'text-gray-700 dark:text-gray-300' },
                                    { label: 'Backlogs', value: student.backlogs, color: student.backlogs > 0 ? 'text-red-600' : 'text-green-600' },
                              ].map(item => (
                                    <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-center">
                                          <p className={`text-2xl font-bold ${item.color}`}>{item.value ?? 'N/A'}</p>
                                          <p className="text-xs text-gray-500 mt-1">{item.label}</p>
                                    </div>
                              ))}
                        </div>
                        <div className="mt-4 flex justify-center">
                              <span className={`px-6 py-2 rounded-xl font-bold text-lg ${student.resultStatus === 'PASS' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                          student.resultStatus === 'FAIL' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                    }`}>{student.resultStatus}</span>
                        </div>
                  </div>

                  {/* Important disclaimer for non-demo */}
                  {!isDemo && (
                        <div className="bg-gray-50 dark:bg-gray-800/50 border dark:border-gray-700 rounded-lg p-3">
                              <p className="text-xs text-gray-500 text-center">
                                    This is a reference summary only. For official records, visit{' '}
                                    <a href="https://result.rgpv.ac.in" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">
                                          result.rgpv.ac.in
                                    </a>
                              </p>
                        </div>
                  )}
            </div>
      );
}
