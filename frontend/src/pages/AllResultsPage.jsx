import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
      Users, CheckCircle, XCircle, Clock, AlertTriangle, AlertCircle,
      Download, Pause, Play, StopCircle, RefreshCw, Search,
      ChevronUp, ChevronDown, Eye, Wifi, WifiOff, Terminal,
      FileSpreadsheet, Archive, ExternalLink, Loader2, ScanLine, Brain
} from 'lucide-react';
import api from '../services/api';
import {
      joinJobRoom, leaveJobRoom, onProgress, onLog,
      onJobCompleted, onCaptchaRequired, onCaptchaStatus,
      resolveCaptcha, getSocket
} from '../services/socket';
import toast from 'react-hot-toast';

/* ── OCR CAPTCHA Status Banner ─────────────────────────────────────────────── */
function CaptchaBanner({ captchaState, onResumeManual }) {
      if (!captchaState) return null;

      const { status, text, manual } = captchaState;

      const configs = {
            detected: { bg: 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700', icon: <ScanLine className="w-5 h-5 text-blue-600" />, title: '🔍 CAPTCHA detected — starting OCR...', sub: 'Tesseract OCR is reading the CAPTCHA image.' },
            solving: { bg: 'bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-700', icon: <Brain className="w-5 h-5 text-yellow-600 animate-pulse" />, title: `🧠 OCR solving... ${text || ''}`, sub: 'Preprocessing image and running text recognition.' },
            filling: { bg: 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700', icon: <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />, title: `✏️ Filling CAPTCHA: "${text}"`, sub: 'OCR read the text — submitting form automatically.' },
            solved: { bg: 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700', icon: <CheckCircle className="w-5 h-5 text-green-600" />, title: `✅ CAPTCHA solved automatically: "${text}"`, sub: 'OCR succeeded — extracting result data.' },
            wrong: { bg: 'bg-orange-50 border-orange-300 dark:bg-orange-900/20 dark:border-orange-700', icon: <AlertTriangle className="w-5 h-5 text-orange-500" />, title: `⚠️ OCR text "${text}" was wrong — retrying`, sub: 'Fetching fresh CAPTCHA image and re-running OCR.' },
            failed: { bg: 'bg-red-50 border-red-400 dark:bg-red-900/20 dark:border-red-700', icon: <AlertCircle className="w-5 h-5 text-red-600" />, title: '❌ Auto OCR failed after 5 attempts', sub: 'Please solve the CAPTCHA manually in the browser window, then click Resume.' },
            completed: { bg: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700', icon: <CheckCircle className="w-5 h-5 text-green-600" />, title: '✅ CAPTCHA processing complete', sub: 'Result extracted successfully.' },
      };

      const cfg = configs[status] || configs.detected;

      return (
            <div className={`rounded-xl border-2 p-4 flex flex-wrap items-start gap-3 ${cfg.bg}`}>
                  <div className="mt-0.5 flex-shrink-0">{cfg.icon}</div>
                  <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">{cfg.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{cfg.sub}</p>
                  </div>
                  {status === 'failed' && (
                        <button
                              onClick={onResumeManual}
                              className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex-shrink-0 flex items-center gap-2"
                        >
                              <Play className="w-4 h-4" /> Resume After Manual CAPTCHA
                        </button>
                  )}
            </div>
      );
}

/* ── Status badge helpers ──────────────────────────────────────────────────── */
function StatusBadge({ status }) {
      const map = {
            PASS: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
            FAIL: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
            ABSENT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
            WITHHELD: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
            NOT_FOUND: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
            PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
            ERROR: 'bg-gray-100 text-gray-600',
      };
      return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100 text-gray-600'}`}>
                  {status}
            </span>
      );
}

function FetchBadge({ status }) {
      const map = {
            completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
            pending: 'bg-yellow-100 text-yellow-700',
            missing: 'bg-orange-100 text-orange-700',
            verification_required: 'bg-purple-100 text-purple-700',
            network_error: 'bg-red-100 text-red-700',
            portal_error: 'bg-red-100 text-red-700',
      };
      return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-500'}`}>
                  {(status || '').replace(/_/g, ' ')}
            </span>
      );
}

/* ── Stat card ─────────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color }) {
      return (
            <div className="card p-3">
                  <div className="flex items-start justify-between">
                        <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{label}</p>
                              <p className={`text-xl font-bold mt-0.5 ${color}`}>{value ?? '—'}</p>
                        </div>
                        <Icon className={`w-5 h-5 ${color} opacity-25 flex-shrink-0`} />
                  </div>
            </div>
      );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */
export default function AllResultsPage() {
      const { jobId } = useParams();
      const [job, setJob] = useState(null);
      const [students, setStudents] = useState([]);
      const [total, setTotal] = useState(0);
      const [page, setPage] = useState(1);
      const [loading, setLoading] = useState(true);
      const [progress, setProgress] = useState(null);
      const [logs, setLogs] = useState([]);
      const [captchaState, setCaptchaState] = useState(null);  // OCR status
      const [manualAlert, setManualAlert] = useState(false); // manual fallback
      const [exporting, setExporting] = useState('');
      const [filters, setFilters] = useState({
            status: '', search: '', sortBy: 'enrollmentNumber', sortOrder: 'asc',
      });
      const [liveConn, setLiveConn] = useState(false);
      const logsBottomRef = useRef(null);
      const pollRef = useRef(null);

      /* ── Data fetchers ─────────────────────────────────────────────────────────── */
      const fetchJob = useCallback(async () => {
            try {
                  const r = await api.get(`/results/job/${jobId}`);
                  setJob(r.data.job);
                  setProgress(r.data.job);
            } catch { toast.error('Could not load job'); }
      }, [jobId]);

      const fetchStudents = useCallback(async () => {
            try {
                  const params = new URLSearchParams({
                        page, limit: 50,
                        sortBy: filters.sortBy,
                        sortOrder: filters.sortOrder,
                        ...(filters.status && { status: filters.status }),
                        ...(filters.search && { search: filters.search }),
                  });
                  const r = await api.get(`/results/job/${jobId}/students?${params}`);
                  setStudents(r.data.students);
                  setTotal(r.data.total);
            } catch { /* silent */ }
            finally { setLoading(false); }
      }, [jobId, page, filters]);

      useEffect(() => { fetchJob(); fetchStudents(); }, [fetchJob, fetchStudents]);

      /* ── Socket.IO ─────────────────────────────────────────────────────────────── */
      useEffect(() => {
            const socket = getSocket();
            setLiveConn(socket.connected);

            const onConn = () => setLiveConn(true);
            const onDisc = () => setLiveConn(false);
            socket.on('connect', onConn);
            socket.on('disconnect', onDisc);

            joinJobRoom(jobId);

            const offProg = onProgress(data => {
                  if (String(data.jobId) !== String(jobId)) return;
                  setProgress(data);
                  setJob(j => j ? { ...j, ...data } : j);
            });

            const offLog = onLog(data => {
                  if (String(data.jobId) !== String(jobId)) return;
                  setLogs(prev => [...prev, data].slice(-100));
            });

            const offDone = onJobCompleted(data => {
                  if (String(data.jobId) !== String(jobId)) return;
                  toast.success('Fetching complete!');
                  setCaptchaState(null);
                  fetchJob(); fetchStudents();
            });

            // OCR CAPTCHA status updates
            const offCaptchaStatus = onCaptchaStatus(data => {
                  if (String(data.jobId) !== String(jobId)) return;
                  setCaptchaState({ status: data.status, text: data.text || '' });
                  if (data.status === 'solved' || data.status === 'completed') {
                        setTimeout(() => setCaptchaState(null), 3000);
                  }
            });

            // Manual fallback required
            const offCaptchaReq = onCaptchaRequired(data => {
                  if (String(data.jobId) !== String(jobId)) return;
                  setCaptchaState({ status: 'failed', text: '' });
                  setManualAlert(true);
                  toast('⚠️ OCR failed — please solve CAPTCHA manually in browser', {
                        icon: '🔒', duration: 10000,
                  });
            });

            // Poll while running
            pollRef.current = setInterval(() => {
                  setProgress(prev => {
                        if (prev?.status === 'running') fetchStudents();
                        return prev;
                  });
            }, 6000);

            return () => {
                  leaveJobRoom(jobId);
                  offProg(); offLog(); offDone(); offCaptchaStatus(); offCaptchaReq();
                  socket.off('connect', onConn);
                  socket.off('disconnect', onDisc);
                  clearInterval(pollRef.current);
            };
      }, [jobId]); // eslint-disable-line

      useEffect(() => {
            logsBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, [logs]);

      /* ── Job controls ──────────────────────────────────────────────────────────── */
      const ctrl = async (action) => {
            try {
                  await api.post(`/results/job/${jobId}/${action}`);
                  toast.success(action.charAt(0).toUpperCase() + action.slice(1) + 'd');
                  fetchJob();
            } catch { toast.error(`Failed to ${action} job`); }
      };

      const handleManualResume = () => {
            resolveCaptcha(jobId);
            setManualAlert(false);
            setCaptchaState(null);
            toast.success('Verification signal sent — processing will resume');
      };

      /* ── Excel export ──────────────────────────────────────────────────────────── */
      const handleExcel = async (filter = 'all', fileName = 'All Results.xlsx') => {
            setExporting(filter);
            try {
                  const res = await api.get(`/results/export/${jobId}/excel?filter=${filter}`, { responseType: 'blob' });
                  let downloadName = fileName;
                  const disposition = res.headers && (res.headers['content-disposition'] || res.headers['Content-Disposition']);
                  if (disposition && disposition.indexOf('filename=') !== -1) {
                        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
                        if (matches != null && matches[1]) {
                              downloadName = matches[1].replace(/['"]/g, '').trim();
                        }
                  }
                  const url = URL.createObjectURL(new Blob([res.data]));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = downloadName;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(`${downloadName} downloaded!`);
            } catch { toast.error('Export failed — ensure results exist'); }
            finally { setExporting(''); }
      };

      /* ── Single Student PDF Download ───────────────────────────────────────────── */
      const [downloadingPdf, setDownloadingPdf] = useState(null);
      const handleDownloadStudentPDF = async (student) => {
            setDownloadingPdf(student._id);
            try {
                  const res = await api.get(`/results/export/${jobId}/pdf/${student._id}`, { responseType: 'blob' });
                  let downloadName = `${student.enrollmentNumber}_${(student.studentName || 'Student').trim().replace(/\s+/g, '_')}_Result.pdf`;
                  const disposition = res.headers && (res.headers['content-disposition'] || res.headers['Content-Disposition']);
                  if (disposition && disposition.indexOf('filename=') !== -1) {
                        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
                        if (matches != null && matches[1]) {
                              downloadName = matches[1].replace(/['"]/g, '').trim();
                        }
                  }
                  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = downloadName;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(`${downloadName} downloaded!`);
            } catch {
                  toast.error('Failed to generate student PDF');
            } finally {
                  setDownloadingPdf(null);
            }
      };

      /* ── Filter helpers ────────────────────────────────────────────────────────── */
      const setF = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

      const toggleSort = (col) => {
            if (filters.sortBy === col) {
                  setF('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc');
            } else {
                  setFilters(f => ({ ...f, sortBy: col, sortOrder: 'asc' }));
                  setPage(1);
            }
      };

      const SortIcon = ({ col }) => {
            if (filters.sortBy !== col) return null;
            return filters.sortOrder === 'asc'
                  ? <ChevronUp className="w-3 h-3 inline ml-0.5" />
                  : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
      };

      /* ── Derived ───────────────────────────────────────────────────────────────── */
      const p = progress || job;
      const pct = p?.totalStudents ? Math.min(100, Math.round((p.completedCount / p.totalStudents) * 100)) : 0;

      const statusColorMap = {
            running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
            completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
            paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
            cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
            failed: 'bg-red-100 text-red-700',
            pending: 'bg-gray-100 text-gray-600',
      };

      if (!job && loading) {
            return (
                  <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-700" />
                  </div>
            );
      }

      return (
            <div className="max-w-7xl mx-auto space-y-4">

                  {/* ── Header ── */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                    {job?.collegeCode} · {job?.branch} · Sem {job?.semester}
                              </h1>
                              <p className="text-sm text-gray-500 mt-0.5">
                                    {job?.examinationSession} {job?.examinationYear} &bull; {job?.course} &bull; {job?.resultType} &bull; {job?.resultMode}
                                    {job?.dataSource === 'demo' && (
                                          <span className="ml-2 bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-semibold">DEMO</span>
                                    )}
                              </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 ${liveConn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    {liveConn ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                                    {liveConn ? 'Live' : 'Offline'}
                              </span>
                              <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${statusColorMap[p?.status] || 'bg-gray-100 text-gray-600'
                                    }`}>
                                    {p?.status || 'unknown'}
                              </span>
                              {job?.dataSource !== 'demo' && (
                                    <a
                                          href="https://result.rgpv.ac.in/Result/ProgramSelect.aspx"
                                          target="_blank" rel="noreferrer"
                                          className="text-xs flex items-center gap-1 text-primary-500 hover:underline"
                                    >
                                          Portal <ExternalLink className="w-3 h-3" />
                                    </a>
                              )}
                        </div>
                  </div>

                  {/* ── OCR CAPTCHA Status Banner ── */}
                  {captchaState && (
                        <CaptchaBanner captchaState={captchaState} onResumeManual={handleManualResume} />
                  )}

                  {/* ── Manual CAPTCHA alert (after OCR failure) ── */}
                  {manualAlert && !captchaState && (
                        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-700 rounded-xl p-4 flex flex-wrap items-start gap-3">
                              <AlertCircle className="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                    <p className="font-bold text-red-800 dark:text-red-300">🔒 Manual CAPTCHA Required</p>
                                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                                          Automatic OCR failed after 5 attempts. Please solve the CAPTCHA manually in the
                                          Chromium browser window, then click <strong>Resume After Manual CAPTCHA</strong>.
                                    </p>
                              </div>
                              <button
                                    onClick={handleManualResume}
                                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex-shrink-0 flex items-center gap-2"
                              >
                                    <CheckCircle className="w-4 h-4" /> Resume After Manual CAPTCHA
                              </button>
                        </div>
                  )}

                  {/* ── Progress bar ── */}
                  <div className="card">
                        <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Progress</span>
                                    {p?.currentEnrollment && p?.status === 'running' && (
                                          <span className="font-mono text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                                                → {p.currentEnrollment}
                                          </span>
                                    )}
                                    {captchaState?.status === 'solving' && (
                                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <Brain className="w-3 h-3 animate-pulse" /> OCR solving CAPTCHA...
                                          </span>
                                    )}
                                    {captchaState?.status === 'filling' && (
                                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Filling: &quot;{captchaState.text}&quot;
                                          </span>
                                    )}
                              </div>
                              <span className="text-lg font-bold text-navy-700 dark:text-primary-400">{pct}%</span>
                        </div>

                        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                          width: `${pct}%`,
                                          background: p?.status === 'completed'
                                                ? 'linear-gradient(90deg, #16a34a, #22c55e)'
                                                : captchaState
                                                      ? 'linear-gradient(90deg, #d97706, #f59e0b)'
                                                      : 'linear-gradient(90deg, #1E3A5F, #4F46E5)',
                                    }}
                              />
                        </div>
                        <p className="text-xs text-gray-400 mt-1 text-right">
                              {Math.min(p?.completedCount ?? 0, p?.totalStudents ?? 0)} / {p?.totalStudents ?? 0} processed
                        </p>

                        <div className="flex flex-wrap gap-2 mt-3">
                              {p?.status === 'running' && (
                                    <button onClick={() => ctrl('pause')} className="btn-secondary text-xs py-1.5">
                                          <Pause className="w-3.5 h-3.5" /> Pause
                                    </button>
                              )}
                              {p?.status === 'paused' && (
                                    <button onClick={() => ctrl('resume')} className="btn-primary text-xs py-1.5">
                                          <Play className="w-3.5 h-3.5" /> Resume
                                    </button>
                              )}
                              {['running', 'paused'].includes(p?.status) && (
                                    <button onClick={() => ctrl('cancel')} className="btn-danger text-xs py-1.5">
                                          <StopCircle className="w-3.5 h-3.5" /> Cancel
                                    </button>
                              )}
                              {['completed', 'cancelled', 'failed'].includes(p?.status) && (
                                    <button onClick={() => ctrl('resume')} className="btn-secondary text-xs py-1.5">
                                          <Play className="w-3.5 h-3.5" /> Re-run / Resume
                                    </button>
                              )}
                              <button onClick={() => { fetchJob(); fetchStudents(); }} className="btn-secondary text-xs py-1.5">
                                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                              </button>
                        </div>
                  </div>

                  {/* ── Stats grid ── */}
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                        <StatCard icon={Users} label="Total" value={p?.totalStudents} color="text-gray-600 dark:text-gray-300" />
                        <StatCard icon={CheckCircle} label="Done" value={Math.min(p?.completedCount ?? 0, p?.totalStudents ?? 0)} color="text-blue-600" />
                        <StatCard icon={CheckCircle} label="Passed" value={p?.passedCount} color="text-green-600" />
                        <StatCard icon={XCircle} label="Failed" value={p?.failedCount} color="text-red-600" />
                        <StatCard icon={Clock} label="Pending" value={Math.max(0, (p?.totalStudents ?? 0) - (p?.completedCount ?? 0))} color="text-yellow-600" />
                        <StatCard icon={AlertTriangle} label="Missing" value={p?.missingCount} color="text-orange-500" />
                        <StatCard icon={ScanLine} label="CAPTCHA" value={p?.verificationRequiredCount} color="text-purple-600" />
                        <StatCard icon={XCircle} label="Errors" value={p?.failedRequestsCount} color="text-red-400" />
                  </div>

                  {/* ── Export ── */}
                  <div className="card">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                              <FileSpreadsheet className="w-4 h-4 text-green-600" /> Download Results
                        </h3>
                        <div className="flex flex-wrap gap-2">
                              {[
                                    { label: 'All Results.xlsx', filter: 'all', fileName: 'All Results.xlsx', cls: 'btn-primary text-xs py-1.5 !bg-green-700 hover:!bg-green-800' },
                                    { label: 'Passed Students.xlsx', filter: 'passed', fileName: 'Passed Students.xlsx', cls: 'btn-primary text-xs py-1.5' },
                                    { label: 'Failed Students.xlsx', filter: 'failed', fileName: 'Failed Students.xlsx', cls: 'btn-danger text-xs py-1.5' },
                              ].map(({ label, filter, fileName, cls }) => (
                                    <button key={filter} onClick={() => handleExcel(filter, fileName)} disabled={!!exporting} className={cls}>
                                          {exporting === filter
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Download className="w-3.5 h-3.5" />}
                                          {label}
                                    </button>
                              ))}
                        </div>
                  </div>

                  {/* ── Filters ── */}
                  <div className="card py-3">
                        <div className="flex flex-wrap gap-3 items-end">
                              <div className="flex-1 min-w-44">
                                    <label className="label text-xs">Search</label>
                                    <div className="relative">
                                          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                                          <input
                                                type="text" className="input pl-8 text-sm py-2"
                                                placeholder="Enrollment or name..."
                                                value={filters.search}
                                                onChange={e => setF('search', e.target.value)}
                                          />
                                    </div>
                              </div>
                              <div>
                                    <label className="label text-xs">Status</label>
                                    <select className="input text-sm py-2" value={filters.status} onChange={e => setF('status', e.target.value)}>
                                          <option value="">All Status</option>
                                          <option value="PASS">Pass</option>
                                          <option value="FAIL">Fail</option>
                                          <option value="ABSENT">Absent</option>
                                          <option value="PENDING">Pending</option>
                                          <option value="NOT_FOUND">Not Found</option>
                                    </select>
                              </div>
                              <span className="text-xs text-gray-400 self-end pb-2">{total} records</span>
                        </div>
                  </div>

                  {/* ── Results table ── */}
                  <div className="card p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                    <thead className="bg-navy-700 dark:bg-navy-900 text-white text-xs">
                                          <tr>
                                                <th className="px-3 py-3 text-left font-semibold w-10">#</th>
                                                <th className="px-3 py-3 text-left font-semibold">
                                                      <button onClick={() => toggleSort('enrollmentNumber')} className="hover:text-blue-200 flex items-center gap-0.5">
                                                            Enrollment <SortIcon col="enrollmentNumber" />
                                                      </button>
                                                </th>
                                                <th className="px-3 py-3 text-left font-semibold">Student Name</th>
                                                <th className="px-3 py-3 text-left font-semibold hidden md:table-cell">Branch</th>
                                                <th className="px-3 py-3 text-center font-semibold">
                                                      <button onClick={() => toggleSort('sgpa')} className="hover:text-blue-200 flex items-center gap-0.5 mx-auto">
                                                            SGPA <SortIcon col="sgpa" />
                                                      </button>
                                                </th>
                                                <th className="px-3 py-3 text-center font-semibold hidden sm:table-cell">
                                                      <button onClick={() => toggleSort('cgpa')} className="hover:text-blue-200 flex items-center gap-0.5 mx-auto">
                                                            CGPA <SortIcon col="cgpa" />
                                                      </button>
                                                </th>
                                                <th className="px-3 py-3 text-center font-semibold hidden md:table-cell">Backlogs</th>
                                                <th className="px-3 py-3 text-center font-semibold">Result</th>
                                                <th className="px-3 py-3 text-center font-semibold hidden sm:table-cell">Fetch</th>
                                                <th className="px-3 py-3 text-center font-semibold">View</th>
                                          </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                          {loading ? (
                                                <tr>
                                                      <td colSpan={10} className="text-center py-16">
                                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-700 mx-auto" />
                                                      </td>
                                                </tr>
                                          ) : students.length === 0 ? (
                                                <tr>
                                                      <td colSpan={10} className="text-center py-16 text-gray-400 text-sm">
                                                            No results yet — job is <strong>{p?.status}</strong>
                                                      </td>
                                                </tr>
                                          ) : students.map((s, i) => (
                                                <tr key={s._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                                      <td className="px-3 py-2.5 text-gray-400 text-xs">{(page - 1) * 50 + i + 1}</td>
                                                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                                                            {s.enrollmentNumber}
                                                      </td>
                                                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 max-w-[160px] truncate">
                                                            {s.studentName || <span className="text-gray-300 italic text-xs">—</span>}
                                                      </td>
                                                      <td className="px-3 py-2.5 text-xs text-gray-500 hidden md:table-cell">{s.branch}</td>
                                                      <td className="px-3 py-2.5 text-center font-bold text-sm">
                                                            {s.sgpa != null ? <span className="text-blue-700 dark:text-blue-400">{s.sgpa}</span> : <span className="text-gray-300">—</span>}
                                                      </td>
                                                      <td className="px-3 py-2.5 text-center text-xs hidden sm:table-cell">
                                                            {s.cgpa != null ? s.cgpa : '—'}
                                                      </td>
                                                      <td className="px-3 py-2.5 text-center hidden md:table-cell">
                                                            {s.backlogs != null
                                                                  ? s.backlogs > 0 ? <span className="text-red-600 font-semibold">{s.backlogs}</span> : <span className="text-green-600">0</span>
                                                                  : '—'}
                                                      </td>
                                                      <td className="px-3 py-2.5 text-center"><StatusBadge status={s.resultStatus} /></td>
                                                      <td className="px-3 py-2.5 text-center hidden sm:table-cell"><FetchBadge status={s.fetchStatus} /></td>
                                                      <td className="px-3 py-2.5 text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                  <Link
                                                                        to={`/results/${jobId}/student/${s._id}`}
                                                                        title="View Details"
                                                                        className="p-1 rounded text-primary-600 hover:text-primary-800 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                                                                  >
                                                                        <Eye className="w-4 h-4" />
                                                                  </Link>
                                                                  <button
                                                                        onClick={() => handleDownloadStudentPDF(s)}
                                                                        disabled={downloadingPdf === s._id}
                                                                        title="Download PDF Report"
                                                                        className="p-1 rounded text-red-600 hover:text-red-800 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                                                                  >
                                                                        {downloadingPdf === s._id ? (
                                                                              <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                                                                        ) : (
                                                                              <Download className="w-4 h-4" />
                                                                        )}
                                                                  </button>
                                                            </div>
                                                      </td>
                                                </tr>
                                          ))}
                                    </tbody>
                              </table>
                        </div>

                        {total > 50 && (
                              <div className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-800">
                                    <p className="text-xs text-gray-400">
                                          {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}
                                    </p>
                                    <div className="flex gap-2">
                                          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs py-1 px-3">← Prev</button>
                                          <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs py-1 px-3">Next →</button>
                                    </div>
                              </div>
                        )}
                  </div>

                  {/* ── Live Logs ── */}
                  {logs.length > 0 && (
                        <div className="card">
                              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                    <Terminal className="w-4 h-4" /> Live Logs
                                    <span className="text-xs text-gray-400 font-normal ml-auto">{logs.length} entries</span>
                              </h3>
                              <div className="bg-gray-950 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-0.5">
                                    {logs.map((log, i) => (
                                          <div key={i} className={
                                                log.level === 'error' ? 'text-red-400' :
                                                      log.level === 'warn' ? 'text-yellow-300' :
                                                            'text-green-400'
                                          }>
                                                <span className="text-gray-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                                {' '}{log.message}
                                          </div>
                                    ))}
                                    <div ref={logsBottomRef} />
                              </div>
                        </div>
                  )}
            </div>
      );
}
