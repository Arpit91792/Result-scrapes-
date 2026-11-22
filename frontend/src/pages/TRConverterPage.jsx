import { useCallback, useEffect, useRef, useState } from 'react';
import {
      AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Download,
      FileSpreadsheet, FileText, Loader2, UploadCloud, X, XCircle,
} from 'lucide-react';
import api from '../services/api';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const EMPTY_PROGRESS = { loaded: 0, total: 0, percentage: 0 };

function formatBytes(bytes) {
      if (!bytes) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function SummaryCard({ label, value, icon: Icon }) {
      return (
            <div className="card p-4">
                  <div className="flex items-center justify-between gap-3">
                        <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 mt-1">{value ?? 0}</p>
                        </div>
                        <Icon className="w-7 h-7 text-primary-600 opacity-60" />
                  </div>
            </div>
      );
}

export default function TRConverterPage() {
      const [file, setFile] = useState(null);
      const [dragging, setDragging] = useState(false);
      const [uploadProgress, setUploadProgress] = useState(EMPTY_PROGRESS);
      const [job, setJob] = useState(null);
      const [jobs, setJobs] = useState([]);
      const [jobsLoading, setJobsLoading] = useState(true);
      const [preview, setPreview] = useState(null);
      const [selectedSheet, setSelectedSheet] = useState('');
      const [page, setPage] = useState(1);
      const [error, setError] = useState('');
      const [busy, setBusy] = useState(false);
      const fileInput = useRef(null);
      const uploadController = useRef(null);

      const loadPreview = useCallback(async (jobId, pageNumber = 1, sheetName = '') => {
            const params = { page: pageNumber, limit: 20 };
            if (sheetName) params.sheet = sheetName;
            const response = await api.get(`/tr-converter/${jobId}/preview`, { params });
            setPreview({ ...response.data, jobId });
            setPage(response.data.page);
            if (response.data.sheet) {
                  setSelectedSheet(response.data.sheet);
            } else if (response.data.sheets && response.data.sheets.length > 0 && !sheetName) {
                  setSelectedSheet(response.data.sheets[0].sheetName);
            }
      }, []);

      const refreshJobs = useCallback(async () => {
            const response = await api.get('/tr-converter/jobs');
            const latestJobs = response.data.jobs;
            setJobs(latestJobs);
            setJob(current => {
                  if (!current) return current;
                  return latestJobs.find(item => item.jobId === current.jobId) || current;
            });
            setJobsLoading(false);
            return latestJobs;
      }, []);

      useEffect(() => {
            refreshJobs().catch(requestError => {
                  setJobsLoading(false);
                  setError(requestError.response?.data?.error || 'Could not load TR conversions.');
            });
      }, [refreshJobs]);

      const hasProcessingJob = jobs.some(item => item.status === 'processing');
      useEffect(() => {
            if (!hasProcessingJob) return undefined;
            const interval = setInterval(() => {
                  refreshJobs().catch(requestError => {
                        setError(requestError.response?.data?.error || 'Could not refresh TR processing status.');
                  });
            }, 2500);
            return () => clearInterval(interval);
      }, [hasProcessingJob, refreshJobs]);

      useEffect(() => {
            if (!['completed', 'exported'].includes(job?.status) || preview?.jobId === job.jobId) return;
            loadPreview(job.jobId, 1).catch(requestError => {
                  setError(requestError.response?.data?.error || 'Could not load student preview.');
            });
      }, [job?.jobId, job?.status, loadPreview, preview?.jobId]);

      const selectFile = candidate => {
            setError('');
            if (!candidate) return;
            if (!candidate.name.toLowerCase().endsWith('.pdf') || (
                  candidate.type && candidate.type !== 'application/pdf' && candidate.type !== 'application/octet-stream'
            )) {
                  setError('Choose a PDF file.');
                  return;
            }
            if (candidate.size > MAX_FILE_SIZE) {
                  setError('The PDF must be smaller than 100 MB.');
                  return;
            }
            setFile(candidate);
            setJob(null);
            setPreview(null);
            setUploadProgress(EMPTY_PROGRESS);
      };

      const uploadFile = async () => {
            if (!file) return;
            setBusy(true);
            setError('');
            const controller = new AbortController();
            uploadController.current = controller;
            try {
                  const formData = new FormData();
                  formData.append('file', file);
                  const response = await api.post('/tr-converter/upload', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                        timeout: 0,
                        signal: controller.signal,
                        onUploadProgress: event => {
                              setUploadProgress({
                                    loaded: event.loaded,
                                    total: event.total || file.size,
                                    percentage: event.total ? Math.round((event.loaded / event.total) * 100) : 0,
                              });
                        },
                  });
                  setJob(response.data);
                  await refreshJobs();
            } catch (requestError) {
                  if (requestError.code !== 'ERR_CANCELED') {
                        setError(requestError.response?.data?.error || requestError.message || 'PDF upload failed.');
                  }
            } finally {
                  uploadController.current = null;
                  setBusy(false);
            }
      };

      const startProcessing = async () => {
            if (!job) return;
            setBusy(true);
            setError('');
            try {
                  const response = await api.post(`/tr-converter/${job.jobId}/process`);
                  setJob(response.data);
                  await refreshJobs();
            } catch (requestError) {
                  setError(requestError.response?.data?.error || 'Could not start PDF processing.');
                  refreshJobs().catch(refreshError => {
                        setError(refreshError.response?.data?.error || 'Could not refresh TR conversion status.');
                  });
            } finally {
                  setBusy(false);
            }
      };

      const openJob = conversion => {
            setError('');
            setPreview(null);
            setSelectedSheet('');
            setJob(conversion);
      };

      const removeJob = async conversion => {
            setBusy(true);
            setError('');
            try {
                  await api.delete(`/tr-converter/${conversion.jobId}`);
                  if (job?.jobId === conversion.jobId) {
                        setJob(null);
                        setPreview(null);
                  }
                  await refreshJobs();
            } catch (requestError) {
                  setError(requestError.response?.data?.error || 'Could not remove this TR conversion.');
            } finally {
                  setBusy(false);
            }
      };

      const cancel = async () => {
            if (uploadController.current) {
                  uploadController.current.abort();
                  setFile(null);
                  return;
            }
            if (!job) {
                  setFile(null);
                  return;
            }
            setBusy(true);
            try {
                  await api.delete(`/tr-converter/${job.jobId}`);
                  setJob(null);
                  setPreview(null);
                  setFile(null);
                  setError('');
                  await refreshJobs();
            } catch (requestError) {
                  setError(requestError.response?.data?.error || 'Could not cancel this conversion.');
            } finally {
                  setBusy(false);
            }
      };

      const changePreviewPage = async nextPage => {
            if (!job || nextPage < 1 || nextPage > (preview?.totalPages || 1)) return;
            try {
                  await loadPreview(job.jobId, nextPage, selectedSheet);
            } catch (requestError) {
                  setError(requestError.response?.data?.error || 'Could not load student preview.');
            }
      };

      const changePreviewSheet = async sheetName => {
            if (!job || sheetName === selectedSheet) return;
            setSelectedSheet(sheetName);
            try {
                  await loadPreview(job.jobId, 1, sheetName);
            } catch (requestError) {
                  setError(requestError.response?.data?.error || 'Could not switch sheet.');
            }
      };

      const downloadExcel = async (targetJob = job) => {
            if (!targetJob) return;
            setBusy(true);
            setError('');
            try {
                  const response = await api.post(`/tr-converter/${targetJob.jobId}/export`, {}, { responseType: 'blob' });
                  const url = URL.createObjectURL(response.data);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'RGPV_TR_Converted.xlsx';
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                  if (job?.jobId === targetJob.jobId) {
                        setJob(null);
                        setFile(null);
                  }
                  refreshJobs().catch(() => {
                        setError('Excel downloaded, but the TR conversion list could not be refreshed.');
                  });
            } catch (requestError) {
                  const responseData = requestError.response?.data;
                  let message = responseData?.error;
                  if (!message && responseData instanceof Blob) {
                        const responseText = await responseData.text();
                        if (responseText) {
                              try {
                                    message = JSON.parse(responseText).error;
                              } catch {
                                    message = null;
                              }
                        }
                        if (!message && requestError.response?.status) {
                              message = `Excel export failed (HTTP ${requestError.response.status}).`;
                        }
                  }
                  setError(message || requestError.message || 'Excel download failed.');
            } finally {
                  setBusy(false);
            }
      };

      const summary = job && preview?.jobId === job.jobId
            ? preview?.summary
            : job?.summary;
      const canCancel = !job || job.status === 'uploaded' || job.status === 'failed';

      return (
            <div className="max-w-6xl mx-auto space-y-6">
                  <header>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">TR Converter</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              Convert an RGPV Tabulation Register PDF into a subject-wise Excel workbook.
                        </p>
                  </header>

                  <section className="card">
                        <div className="flex items-center gap-3 mb-4">
                              <div className="rounded-lg bg-primary-100 dark:bg-primary-900/30 p-2">
                                    <FileSpreadsheet className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                              </div>
                              <div>
                                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">Upload Tabulation Register</h2>
                                    <p className="text-xs text-gray-500">PDF only · Up to 100 MB · Files are temporary</p>
                              </div>
                        </div>

                        {!job && (
                              <div
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={event => {
                                          if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click();
                                    }}
                                    onClick={() => fileInput.current?.click()}
                                    onDragOver={event => { event.preventDefault(); setDragging(true); }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={event => {
                                          event.preventDefault();
                                          setDragging(false);
                                          selectFile(event.dataTransfer.files[0]);
                                    }}
                                    className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                                          dragging
                                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                                : 'border-gray-300 dark:border-gray-700 hover:border-primary-400'
                                    }`}
                              >
                                    <input
                                          ref={fileInput}
                                          type="file"
                                          accept="application/pdf,.pdf"
                                          className="hidden"
                                          onChange={event => selectFile(event.target.files[0])}
                                    />
                                    <UploadCloud className="w-10 h-10 mx-auto text-primary-600 mb-3" />
                                    <p className="font-medium text-gray-700 dark:text-gray-200">Drop your PDF here or click to browse</p>
                                    <p className="text-xs text-gray-500 mt-1">Large multi-page registers are processed page by page.</p>
                              </div>
                        )}

                        {file && !job && (
                              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                          <FileText className="w-5 h-5 flex-shrink-0 text-red-500" />
                                          <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{file.name}</p>
                                                <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                                          </div>
                                    </div>
                                    <div className="flex gap-2">
                                          <button className="btn-secondary text-sm" onClick={cancel} disabled={busy}>
                                                <X className="w-4 h-4" /> Cancel
                                          </button>
                                          <button className="btn-primary text-sm" onClick={uploadFile} disabled={busy}>
                                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                                                Upload PDF
                                          </button>
                                    </div>
                              </div>
                        )}

                        {busy && uploadProgress.total > 0 && !job && (
                              <div className="mt-4">
                                    <div className="mb-1 flex justify-between text-xs text-gray-500">
                                          <span>Uploading</span><span>{uploadProgress.percentage}%</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                          <div className="h-full bg-primary-600 transition-all" style={{ width: `${uploadProgress.percentage}%` }} />
                                    </div>
                              </div>
                        )}

                        {job && (
                              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                          <FileText className="w-5 h-5 flex-shrink-0 text-red-500" />
                                          <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{job.fileName}</p>
                                                <p className="text-xs text-gray-500">{formatBytes(job.fileSize)}</p>
                                          </div>
                                    </div>
                                    <div className="flex gap-2">
                                          <button
                                                className="btn-secondary text-sm"
                                                onClick={() => { setJob(null); setPreview(null); setError(''); }}
                                          >
                                                All TRs
                                          </button>
                                          {job.status === 'uploaded' && (
                                                <button className="btn-primary text-sm" onClick={startProcessing} disabled={busy || hasProcessingJob}>
                                                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                                                      {hasProcessingJob ? 'Another TR is processing' : 'Process PDF'}
                                                </button>
                                          )}
                                          {canCancel && (
                                                <button className="btn-secondary text-sm" onClick={cancel} disabled={busy}>
                                                      <X className="w-4 h-4" /> {job.status === 'failed' ? 'Start over' : 'Cancel'}
                                                </button>
                                          )}
                                    </div>
                              </div>
                        )}

                        {job?.status === 'processing' && (
                              <div className="mt-4">
                                    <div className="mb-1 flex justify-between text-xs text-gray-500">
                                          <span>Processing pages with text extraction and OCR fallback</span>
                                          <span>{job.progress?.currentPage || 0}/{job.progress?.totalPages || 0} pages · {job.progress?.percentage || 0}%</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                          <div className="h-full bg-primary-600 transition-all" style={{ width: `${job.progress?.percentage || 0}%` }} />
                                    </div>
                              </div>
                        )}

                        {job?.status === 'completed' && (
                              <div className="mt-4 flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                                    <CheckCircle2 className="w-5 h-5" /> PDF processing completed. Review the extracted records before export.
                              </div>
                        )}
                        {job?.status === 'failed' && (
                              <div className="mt-4 flex items-center gap-2 text-sm text-red-600">
                                    <XCircle className="w-5 h-5" /> {job.error || 'Processing failed.'}
                              </div>
                        )}
                  </section>

                  <section className="card space-y-4">
                        <div className="flex items-start justify-between gap-3">
                              <div>
                                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">All TR conversions</h2>
                                    <p className="mt-1 text-xs text-gray-500">
                                          Your uploaded, processing, completed, failed, and exported TRs are listed here. Processing status refreshes automatically.
                                    </p>
                              </div>
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                    {jobs.length} TR{jobs.length === 1 ? '' : 's'}
                              </span>
                        </div>
                        {jobsLoading ? (
                              <div className="flex justify-center py-6">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                              </div>
                        ) : jobs.length === 0 ? (
                              <p className="rounded-lg bg-gray-50 py-6 text-center text-sm text-gray-500 dark:bg-gray-800">
                                    No TR conversions yet. Upload a PDF to get started.
                              </p>
                        ) : (
                              <div className="space-y-3">
                                    {jobs.map(conversion => {
                                          const isProcessing = conversion.status === 'processing';
                                          const progress = conversion.progress?.percentage || 0;
                                          const statusStyles = {
                                                uploaded: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                                                processing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                                                completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
                                                exported: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
                                                failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
                                          };
                                          return (
                                                <div key={conversion.jobId} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                  <FileText className={`h-5 w-5 flex-shrink-0 ${isProcessing ? 'text-amber-500' : 'text-red-500'}`} />
                                                                  <div className="min-w-0">
                                                                        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{conversion.fileName}</p>
                                                                        <p className="text-xs text-gray-500">
                                                                              {formatBytes(conversion.fileSize)}
                                                                              {conversion.summary && ` · ${conversion.summary.totalStudents} students`}
                                                                              {isProcessing && ` · Page ${conversion.progress?.currentPage || 0}/${conversion.progress?.totalPages || 0}`}
                                                                              {conversion.createdAt && ` · ${new Date(conversion.createdAt).toLocaleString()}`}
                                                                              {conversion.error && ` · ${conversion.error}`}
                                                                        </p>
                                                                  </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusStyles[conversion.status] || 'bg-gray-100 text-gray-700'}`}>
                                                                        {conversion.status}
                                                                  </span>
                                                                  {['completed', 'exported'].includes(conversion.status) && (
                                                                        <button
                                                                              className="btn-primary !px-3 !py-1.5 text-xs flex items-center gap-1"
                                                                              onClick={() => downloadExcel(conversion)}
                                                                              disabled={busy}
                                                                              title="Download Excel"
                                                                        >
                                                                              <Download className="w-3.5 h-3.5" />
                                                                              Download
                                                                        </button>
                                                                  )}
                                                                  {conversion.status === 'uploaded' && (
                                                                        <button
                                                                              className="btn-secondary !px-3 !py-1.5 text-xs"
                                                                              onClick={() => openJob(conversion)}
                                                                        >
                                                                              Continue
                                                                        </button>
                                                                  )}
                                                                  {conversion.status !== 'processing' && (
                                                                        <button
                                                                              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                                                                              onClick={() => removeJob(conversion)}
                                                                              disabled={busy}
                                                                              title="Remove conversion"
                                                                        >
                                                                              <X className="h-4 w-4" />
                                                                        </button>
                                                                  )}
                                                            </div>
                                                      </div>
                                                      {isProcessing && (
                                                            <div className="mt-3">
                                                                  <div className="mb-1 flex justify-between text-xs text-gray-500">
                                                                        <span>Processing PDF</span><span>{progress}%</span>
                                                                  </div>
                                                                  <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                                                        <div className="h-full bg-primary-600 transition-all" style={{ width: `${progress}%` }} />
                                                                  </div>
                                                            </div>
                                                      )}
                                                </div>
                                          );
                                    })}
                              </div>
                        )}
                  </section>

                  {error && (
                        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
                        </div>
                  )}

                  {summary && (
                        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                              <SummaryCard label="PDF pages" value={summary.totalPages} icon={FileText} />
                              <SummaryCard label="Pages processed" value={summary.pagesProcessed} icon={CheckCircle2} />
                              <SummaryCard label="Students extracted" value={summary.totalStudents} icon={FileSpreadsheet} />
                              <SummaryCard label="Worksheets" value={summary.worksheetsCount || 1} icon={FileSpreadsheet} />
                              <SummaryCard label="Valid records" value={summary.validStudentRecords} icon={CheckCircle2} />
                              <SummaryCard label="Duplicates" value={summary.duplicateEnrollmentNumbers} icon={AlertCircle} />
                        </section>
                  )}
            </div>
      );
}
