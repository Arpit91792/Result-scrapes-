import { useState } from 'react';
import { List, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function EnrollmentPreviewPage() {
      const [start, setStart] = useState('');
      const [end, setEnd] = useState('');
      const [result, setResult] = useState(null);
      const [error, setError] = useState(null);
      const [loading, setLoading] = useState(false);

      const generate = async () => {
            if (!start || !end) { toast.error('Enter both enrollment numbers'); return; }
            setLoading(true); setError(null); setResult(null);
            try {
                  const res = await api.post('/results/generate-enrollments', { startingEnrollment: start, endingEnrollment: end });
                  setResult(res.data);
            } catch (err) {
                  setError(err.response?.data?.errors?.map(e => e.msg).join(', ') || err.response?.data?.error || 'Failed');
            } finally { setLoading(false); }
      };

      return (
            <div className="max-w-3xl mx-auto space-y-5">
                  <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Enrollment Preview</h1>
                        <p className="text-gray-500 text-sm mt-1">Generate and preview enrollment number ranges before starting a fetch job.</p>
                  </div>

                  <div className="card space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                              <div>
                                    <label className="label">Starting Enrollment</label>
                                    <input type="text" className="input font-mono" placeholder="e.g. 0133CS241001" value={start} onChange={e => setStart(e.target.value)} />
                              </div>
                              <div>
                                    <label className="label">Ending Enrollment</label>
                                    <input type="text" className="input font-mono" placeholder="e.g. 0133CS241067" value={end} onChange={e => setEnd(e.target.value)} />
                              </div>
                        </div>
                        <button onClick={generate} disabled={loading} className="btn-primary">
                              {loading ? 'Generating...' : <><List className="w-4 h-4" /> Generate Enrollment List</>}
                        </button>

                        {error && (
                              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-red-700 dark:text-red-400">
                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    <p className="text-sm">{error}</p>
                              </div>
                        )}
                  </div>

                  {result && (
                        <div className="card space-y-4">
                              <div className="flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                    <h2 className="font-semibold text-gray-800 dark:text-gray-200">
                                          {result.total} Enrollment Numbers Generated
                                    </h2>
                              </div>

                              <div className="grid grid-cols-3 gap-3 text-sm">
                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                                          <p className="text-2xl font-bold text-navy-700 dark:text-primary-400">{result.total}</p>
                                          <p className="text-xs text-gray-500">Total</p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                                          <p className="font-mono font-bold text-xs text-gray-700 dark:text-gray-300">{result.firstEnrollment}</p>
                                          <p className="text-xs text-gray-500">First</p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                                          <p className="font-mono font-bold text-xs text-gray-700 dark:text-gray-300">{result.lastEnrollment}</p>
                                          <p className="text-xs text-gray-500">Last</p>
                                    </div>
                              </div>

                              <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">All Enrollments:</p>
                                    <div className="max-h-64 overflow-y-auto">
                                          <div className="flex flex-wrap gap-1.5">
                                                {result.enrollments.map((e, i) => (
                                                      <span key={e} className="font-mono text-xs bg-gray-100 dark:bg-gray-800 border dark:border-gray-700 px-2 py-1 rounded">
                                                            {e}
                                                      </span>
                                                ))}
                                          </div>
                                    </div>
                              </div>
                        </div>
                  )}
            </div>
      );
}
