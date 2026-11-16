import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Archive } from 'lucide-react';
import api from '../services/api';

const fileIcons = { excel: FileSpreadsheet, pdf: FileText, zip: Archive };
const fileColors = { excel: 'text-green-600', pdf: 'text-red-500', zip: 'text-blue-600' };

export default function DownloadHistoryPage() {
      const [history, setHistory] = useState([]);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
            api.get('/results/download-history').then(r => setHistory(r.data.history)).finally(() => setLoading(false));
      }, []);

      if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-700"></div></div>;

      return (
            <div className="max-w-4xl mx-auto space-y-5">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Download History</h1>

                  <div className="card p-0 overflow-hidden">
                        {history.length === 0 ? (
                              <div className="text-center py-16">
                                    <Download className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
                                    <p className="text-gray-400">No downloads yet</p>
                              </div>
                        ) : (
                              <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-800">
                                          <tr>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">File</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Job</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Type</th>
                                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Date</th>
                                          </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                          {history.map((h) => {
                                                const Icon = fileIcons[h.fileType] || Download;
                                                const color = fileColors[h.fileType] || 'text-gray-500';
                                                return (
                                                      <tr key={h._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                            <td className="px-4 py-3">
                                                                  <div className="flex items-center gap-2">
                                                                        <Icon className={`w-4 h-4 ${color}`} />
                                                                        <span className="text-gray-700 dark:text-gray-300 text-xs font-mono">{h.fileName}</span>
                                                                  </div>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-gray-500">
                                                                  {h.jobId?.collegeCode} · {h.jobId?.branch} Sem {h.jobId?.semester}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                  <span className={`text-xs font-medium uppercase ${color}`}>{h.fileType}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-gray-400">{new Date(h.createdAt).toLocaleString()}</td>
                                                      </tr>
                                                );
                                          })}
                                    </tbody>
                              </table>
                        )}
                  </div>
            </div>
      );
}
