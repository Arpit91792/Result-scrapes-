import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
      Search, Upload, AlertCircle, CheckCircle, Loader2,
      ChevronRight, FlaskConical, Info, Hash
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const BRANCHES = ['CSE', 'IT', 'AIML', 'CSBS', 'CY', 'EC', 'EX', 'ME', 'CE', 'EE', 'CH', 'BT', 'Civil', 'Arch', 'Pharma', 'Other'];

// Full RGPV programme list — matches ProgramSelect.aspx labels exactly
const COURSES = [
      'B.E.',
      'B.Tech.',
      'M.C.A.',
      'B.Pharmacy',
      'B.Pharmacy (PCI)',
      'B.Arch.',
      'M.Pharmacy',
      'M.E.',
      'M.Tech.',
      'B.E. (PTDC)',
      'M.Tech. (PT)',
      'MAM',
      'MCA (DD)',
      'Diploma',
      'Ph.D.',
      'Pharm.D.',
      'M.Arch.',
      'M.C.A. (2 Year)',
      'M.B.A.',
      'B.Tech. (PTDC)',
      'M.Pharm-PCI',
      'B.Design',
      'M.Plan',
      'MCA-Bridge Course',
];

const SESSIONS = ['June', 'November'];
const RESULT_TYPES = ['Main', 'Revaluation'];
const RESULT_MODES = ['Grading', 'Non-Grading'];
const YEARS = Array.from({ length: 8 }, (_, i) => String(new Date().getFullYear() - i));

// Portal page hint shown to user
const PROGRAMME_INFO = {
      'B.E._Grading': 'BEGradeResult.aspx — B.E. Grading',
      'B.E._Non-Grading': 'BEResult.aspx — B.E. Non-Grading',
      'B.Tech._Grading': 'BtGradeResult.aspx — B.Tech. Grading',
      'B.Tech._Non-Grading': 'BtResult.aspx — B.Tech. Non-Grading',
      'M.C.A._Grading': 'MCArslt.aspx — M.C.A.',
      'M.B.A._Grading': 'MBAGradeResult.aspx — M.B.A.',
      'M.Tech._Grading': 'MtGradeResult.aspx — M.Tech.',
      'Diploma_Grading': 'DiplomaGradeResult.aspx — Diploma',
      'B.Pharmacy_Grading': 'BpharmaGradeResult.aspx — B.Pharmacy',
      'MCA (DD)_Grading': 'McaDDrslt.aspx — MCA (DD)',
      'B.Arch._Grading': 'BArchGradeResult.aspx — B.Arch.',
};

export default function FetchResultsPage() {
      const navigate = useNavigate();
      const fileRef = useRef();

      const [form, setForm] = useState({
            university: 'RGPV', collegeCode: '', collegeName: '',
            course: 'B.Tech.', branch: 'CSE', semester: '7',
            examinationYear: String(new Date().getFullYear()),
            examinationSession: 'November',
            resultType: 'Main', resultMode: 'Grading',
            enrollmentPrefix: '',
            startingEnrollment: '',
            endingEnrollment: '',
            lateralStartingEnrollment: '',
            lateralEndingEnrollment: '',
      });

      const [includeLateral, setIncludeLateral] = useState(false);
      const [demoMode, setDemoMode] = useState(false);
      const [generating, setGenerating] = useState(false);
      const [enrollmentResult, setEnrollmentResult] = useState(null);
      const [enrollmentError, setEnrollmentError] = useState(null);
      const [uploadedList, setUploadedList] = useState(null);
      const [starting, setStarting] = useState(false);

      const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

      const progKey = `${form.course}_${form.resultMode}`;

      // ── Generate enrollment list ─────────────────────────────────────────────────
      const handleGenerate = async () => {
            const hasRegular = Boolean(form.startingEnrollment && form.endingEnrollment);
            const hasLateral = Boolean(includeLateral && form.lateralStartingEnrollment && form.lateralEndingEnrollment);

            if (!hasRegular && !hasLateral) {
                  toast.error('Enter starting and ending enrollment numbers for regular or lateral entry');
                  return;
            }

            if (includeLateral && (!form.lateralStartingEnrollment || !form.lateralEndingEnrollment) && !hasRegular) {
                  toast.error('Enter both starting and ending enrollment numbers for lateral entry');
                  return;
            }

            setGenerating(true);
            setEnrollmentError(null);
            try {
                  const payload = {
                        ...(hasRegular ? {
                              startingEnrollment: form.startingEnrollment.trim().toUpperCase(),
                              endingEnrollment: form.endingEnrollment.trim().toUpperCase(),
                        } : {}),
                        ...(hasLateral ? {
                              lateralStartingEnrollment: form.lateralStartingEnrollment.trim().toUpperCase(),
                              lateralEndingEnrollment: form.lateralEndingEnrollment.trim().toUpperCase(),
                        } : {}),
                  };

                  const res = await api.post('/results/generate-enrollments', payload);
                  setEnrollmentResult(res.data);
                  setUploadedList(null);
                  toast.success(`Generated ${res.data.total} enrollment numbers`);
            } catch (err) {
                  const msg = err.response?.data?.errors?.map(e => e.msg || e).join(', ')
                        || err.response?.data?.error || 'Generation failed';
                  setEnrollmentError(msg);
            } finally {
                  setGenerating(false);
            }
      };

      // ── Upload CSV/Excel ──────────────────────────────────────────────────────────
      const handleFileUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const fd = new FormData();
            fd.append('file', file);
            try {
                  const res = await api.post('/results/upload-enrollments', fd, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                  });
                  setUploadedList(res.data.enrollments);
                  setEnrollmentResult({ ...res.data, firstEnrollment: res.data.enrollments[0], lastEnrollment: res.data.enrollments[res.data.total - 1] });
                  toast.success(`Loaded ${res.data.total} enrollments from file`);
            } catch {
                  toast.error('Failed to parse file');
            }
      };

      // ── Start fetch job ───────────────────────────────────────────────────────────
      const handleStart = async () => {
            if (!form.collegeCode) { toast.error('College Code is required'); return; }
            if (!enrollmentResult?.total) { toast.error('Generate or upload enrollment list first'); return; }

            setStarting(true);
            try {
                  const payload = {
                        ...form,
                        semester: parseInt(form.semester),
                        demoMode,
                        ...(includeLateral && form.lateralStartingEnrollment && form.lateralEndingEnrollment ? {
                              lateralStartingEnrollment: form.lateralStartingEnrollment.trim().toUpperCase(),
                              lateralEndingEnrollment: form.lateralEndingEnrollment.trim().toUpperCase(),
                        } : {}),
                        ...(uploadedList ? { customEnrollments: uploadedList } : {}),
                  };
                  const res = await api.post('/results/start-fetch', payload);
                  toast.success(demoMode ? 'Demo job started!' : 'Fetch job started — browser will open');
                  navigate(`/results/${res.data.job._id}`);
            } catch (err) {
                  const msg = err.response?.data?.errors?.[0]?.msg
                        || err.response?.data?.error || 'Failed to start job';
                  toast.error(msg);
            } finally {
                  setStarting(false);
            }
      };

      return (
            <div className="max-w-4xl mx-auto space-y-5">

                  {/* Title */}
                  <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fetch Results</h1>
                        <p className="text-gray-500 text-sm mt-1">
                              Fetch RGPV examination results in bulk from the official portal.
                        </p>
                  </div>

                  {/* Mode toggle */}
                  <div className={`rounded-xl p-4 border flex flex-wrap items-start justify-between gap-3 ${demoMode
                        ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700'
                        : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700'
                        }`}>
                        <div className="flex items-start gap-3">
                              <FlaskConical className={`w-5 h-5 mt-0.5 flex-shrink-0 ${demoMode ? 'text-amber-600' : 'text-blue-600'}`} />
                              <div>
                                    <p className={`text-sm font-semibold ${demoMode ? 'text-amber-800 dark:text-amber-400' : 'text-blue-800 dark:text-blue-400'}`}>
                                          {demoMode ? '🧪 Demo Mode — No real portal access' : '🌐 Live Mode — Uses result.rgpv.ac.in'}
                                    </p>
                                    <p className={`text-xs mt-0.5 ${demoMode ? 'text-amber-600 dark:text-amber-500' : 'text-blue-600 dark:text-blue-500'}`}>
                                          {demoMode
                                                ? 'Generates realistic sample data marked [DEMO]. Test the full workflow safely.'
                                                : `Portal: ${PROGRAMME_INFO[progKey] || 'BtGradeResult.aspx'}. CAPTCHA requires manual completion.`}
                                    </p>
                              </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Demo</span>
                              <div onClick={() => setDemoMode(d => !d)}
                                    className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors ${demoMode ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${demoMode ? 'translate-x-6' : 'translate-x-1'}`} />
                              </div>
                        </label>
                  </div>

                  {/* ── Step 1: College Information ── */}
                  <div className="card">
                        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                              <span className="bg-navy-700 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">1</span>
                              College Information
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div>
                                    <label className="label">University</label>
                                    <input className="input bg-gray-50 dark:bg-gray-800 cursor-not-allowed" value="RGPV" readOnly />
                              </div>
                              <div>
                                    <label className="label">College Code *</label>
                                    <input className="input" placeholder="e.g. 0133" value={form.collegeCode} onChange={set('collegeCode')} />
                              </div>
                              <div>
                                    <label className="label">College Name</label>
                                    <input className="input" placeholder="e.g. SIRT Bhopal" value={form.collegeName} onChange={set('collegeName')} />
                              </div>
                              <div>
                                    <label className="label">Course *</label>
                                    <select className="input" value={form.course} onChange={set('course')}>
                                          {COURSES.map(c => <option key={c}>{c}</option>)}
                                    </select>
                              </div>
                              <div>
                                    <label className="label">Branch *</label>
                                    <select className="input" value={form.branch} onChange={set('branch')}>
                                          {BRANCHES.map(b => <option key={b}>{b}</option>)}
                                    </select>
                              </div>
                              <div>
                                    <label className="label">Semester *</label>
                                    <select className="input" value={form.semester} onChange={set('semester')}>
                                          {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                                    </select>
                              </div>
                        </div>
                  </div>

                  {/* ── Step 2: Examination Information ── */}
                  <div className="card">
                        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                              <span className="bg-navy-700 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">2</span>
                              Examination Information
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                              <div>
                                    <label className="label">Year *</label>
                                    <select className="input" value={form.examinationYear} onChange={set('examinationYear')}>
                                          {YEARS.map(y => <option key={y}>{y}</option>)}
                                    </select>
                              </div>
                              <div>
                                    <label className="label">Session *</label>
                                    <select className="input" value={form.examinationSession} onChange={set('examinationSession')}>
                                          {SESSIONS.map(s => <option key={s}>{s}</option>)}
                                    </select>
                              </div>
                              <div>
                                    <label className="label">Result Type</label>
                                    <select className="input" value={form.resultType} onChange={set('resultType')}>
                                          {RESULT_TYPES.map(t => <option key={t}>{t}</option>)}
                                    </select>
                              </div>
                              <div>
                                    <label className="label">Result Mode</label>
                                    <select className="input" value={form.resultMode} onChange={set('resultMode')}>
                                          {RESULT_MODES.map(m => <option key={m}>{m}</option>)}
                                    </select>
                              </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                              <Info className="w-3 h-3" />
                              Portal page: <span className="font-mono text-primary-500">{PROGRAMME_INFO[progKey] || 'BtGradeResult.aspx'}</span>
                        </p>
                  </div>

                  {/* ── Step 3: Enrollment Range ── */}
                  <div className="card">
                        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                              <span className="bg-navy-700 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">3</span>
                              Enrollment Range
                        </h2>

                        {/* Regular Students Range */}
                        <div className="mb-4">
                              <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                          Regular Students Range
                                    </p>
                                    <span className="text-[11px] text-gray-400">1st Year Admitted Batch</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                          <label className="label">Starting Enrollment</label>
                                          <input
                                                className="input font-mono uppercase"
                                                placeholder="e.g. 0133CS241001"
                                                value={form.startingEnrollment}
                                                onChange={e => setForm(f => ({ ...f, startingEnrollment: e.target.value.toUpperCase() }))}
                                          />
                                    </div>
                                    <div>
                                          <label className="label">Ending Enrollment</label>
                                          <input
                                                className="input font-mono uppercase"
                                                placeholder="e.g. 0133CS241067"
                                                value={form.endingEnrollment}
                                                onChange={e => setForm(f => ({ ...f, endingEnrollment: e.target.value.toUpperCase() }))}
                                          />
                                    </div>
                              </div>
                        </div>

                        {/* Lateral Entry Students Option */}
                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                              <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                                    <input
                                          type="checkbox"
                                          checked={includeLateral}
                                          onChange={e => setIncludeLateral(e.target.checked)}
                                          className="w-4 h-4 text-primary-600 rounded border-gray-300 dark:border-gray-600 focus:ring-primary-500 cursor-pointer"
                                    />
                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                          Include Lateral Entry Students (Diploma / 2nd Year Direct Entry)
                                    </span>
                              </label>

                              {includeLateral && (
                                    <div className="mt-3 bg-blue-50/60 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4">
                                          <div className="flex items-center justify-between mb-2.5">
                                                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
                                                      Lateral Entry Range
                                                </p>
                                                <span className="text-[11px] text-blue-600 dark:text-blue-400">
                                                      Roll series like 3D01 or 3001
                                                </span>
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                      <label className="label">Lateral Starting Enrollment *</label>
                                                      <input
                                                            className="input font-mono uppercase bg-white dark:bg-gray-900"
                                                            placeholder="e.g. 0133CS253D01 or 0133CS243001"
                                                            value={form.lateralStartingEnrollment}
                                                            onChange={e => setForm(f => ({ ...f, lateralStartingEnrollment: e.target.value.toUpperCase() }))}
                                                      />
                                                </div>
                                                <div>
                                                      <label className="label">Lateral Ending Enrollment *</label>
                                                      <input
                                                            className="input font-mono uppercase bg-white dark:bg-gray-900"
                                                            placeholder="e.g. 0133CS253D12 or 0133CS243015"
                                                            value={form.lateralEndingEnrollment}
                                                            onChange={e => setForm(f => ({ ...f, lateralEndingEnrollment: e.target.value.toUpperCase() }))}
                                                      />
                                                </div>
                                          </div>
                                    </div>
                              )}
                        </div>

                        <div className="flex flex-wrap gap-3 mt-5">
                              <button onClick={handleGenerate} disabled={generating} className="btn-primary">
                                    {generating
                                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                                          : <><Hash className="w-4 h-4" /> GENERATE ENROLLMENT LIST</>}
                              </button>
                              <div>
                                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
                                    <button onClick={() => fileRef.current.click()} className="btn-secondary">
                                          <Upload className="w-4 h-4" /> Upload CSV / Excel
                                    </button>
                              </div>
                        </div>

                        {enrollmentError && (
                              <div className="mt-3 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-red-700 dark:text-red-400 text-sm">
                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {enrollmentError}
                              </div>
                        )}

                        {enrollmentResult && (
                              <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                                          <div className="flex items-center gap-2">
                                                <CheckCircle className="w-5 h-5 text-green-600" />
                                                <span className="font-semibold text-green-800 dark:text-green-400">
                                                      {enrollmentResult.total} Enrollment Numbers Ready
                                                </span>
                                          </div>
                                          {enrollmentResult.regular && enrollmentResult.lateral && (
                                                <div className="flex items-center gap-2 text-xs">
                                                      <span className="bg-white dark:bg-gray-800 px-2.5 py-1 rounded border border-green-200 dark:border-green-800 text-gray-700 dark:text-gray-300 font-medium">
                                                            {enrollmentResult.regular.total} Regular
                                                      </span>
                                                      <span className="bg-white dark:bg-gray-800 px-2.5 py-1 rounded border border-green-200 dark:border-green-800 text-blue-600 dark:text-blue-400 font-medium">
                                                            +{enrollmentResult.lateral.total} Lateral Entry
                                                      </span>
                                                </div>
                                          )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-3">
                                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                                                <p className="text-2xl font-bold text-navy-700 dark:text-primary-400">{enrollmentResult.total}</p>
                                                <p className="text-gray-400 text-xs">Total Students</p>
                                          </div>
                                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                                                <p className="font-mono font-bold text-xs text-gray-700 dark:text-gray-300 break-all">
                                                      {enrollmentResult.firstEnrollment || enrollmentResult.enrollments?.[0]}
                                                </p>
                                                <p className="text-gray-400 text-xs">First Enrollment</p>
                                          </div>
                                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                                                <p className="font-mono font-bold text-xs text-gray-700 dark:text-gray-300 break-all">
                                                      {enrollmentResult.lastEnrollment || enrollmentResult.enrollments?.[enrollmentResult.total - 1]}
                                                </p>
                                                <p className="text-gray-400 text-xs">Last Enrollment</p>
                                          </div>
                                    </div>

                                    {/* Preview */}
                                    {enrollmentResult.enrollments && (
                                          <>
                                                <p className="text-xs text-gray-500 mb-1">Preview (first 15):</p>
                                                <div className="flex flex-wrap gap-1">
                                                      {enrollmentResult.enrollments.slice(0, 15).map(e => (
                                                            <span key={e} className="font-mono text-xs bg-white dark:bg-gray-800 border dark:border-gray-700 px-2 py-0.5 rounded">{e}</span>
                                                      ))}
                                                      {enrollmentResult.total > 15 && (
                                                            <span className="text-xs text-gray-400 self-center">+{enrollmentResult.total - 15} more</span>
                                                      )}
                                                </div>
                                          </>
                                    )}
                              </div>
                        )}
                  </div>

                  {/* ── Start Button ── */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                        {!demoMode && (
                              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 flex-1 text-xs text-blue-700 dark:text-blue-400">
                                    <strong>Live mode:</strong> A Chromium browser window will open. If a CAPTCHA appears, solve it manually
                                    then click <em>"Resume After Verification"</em> in the dashboard.
                              </div>
                        )}
                        <button
                              onClick={handleStart}
                              disabled={starting || !enrollmentResult?.total}
                              className="btn-primary px-8 py-3 text-sm font-semibold flex-shrink-0"
                        >
                              {starting
                                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Starting...</>
                                    : <><Search className="w-5 h-5" /> {demoMode ? 'Start Demo Fetch' : 'Start Live Fetch'}</>}
                        </button>
                  </div>
            </div>
      );
}
