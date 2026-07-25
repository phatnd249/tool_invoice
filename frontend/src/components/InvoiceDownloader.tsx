import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Play, Terminal, Trash2, ChevronDown, ChevronRight, Building2,
  MapPin, PhoneCall, User, CheckCircle2, Loader2, XCircle, Check,
  Activity, Wifi, WifiOff, RefreshCw, Ban, History,
} from 'lucide-react';
import OverwriteConfirmDialog, { type OverwriteMode } from './OverwriteConfirmDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { API_BASE_URL } from '../config';

interface Company {
  id: number;
  taxCode: string;
  name: string;
  address?: string | null;
  taxAddress?: string | null;
  representative?: string | null;
  phone?: string | null;
  status?: string | null;
  companyType?: string | null;
  lastSyncedAt?: string | null;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'error' | 'warning' | 'system' | 'success';
}

interface ProgressState {
  status: 'idle' | 'connecting' | 'downloading' | 'done' | 'error';
  total: number;
  current: number;
  message?: string;
  jobId?: string; // Lưu jobId để có thể reconnect
}

interface GdtHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';
  summary: string;
}

interface DownloadJob {
  id: string;
  companyId: number | null;
  companyName: string | null;
  status: string;
  progressCurrent: number;
  progressTotal: number;
  progressMessage: string | null;
  successCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Kết nối SSE stream cho một job cụ thể.
 * Trả về hàm cleanup để ngắt kết nối.
 */
function connectJobSSE(
  jobId: string,
  token: string,
  callbacks: {
    onProgress: (data: any) => void;
    onLog: (data: any) => void;
    onDone: (data: any) => void;
    onError: (data: any) => void;
  },
): () => void {
  const baseUrl = API_BASE_URL || '';
  // EventSource không hỗ trợ custom headers, nên truyền token qua query param
  const url = `${baseUrl}/api/invoices/download/stream/${jobId}?token=${encodeURIComponent(token)}`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener('progress', (event) => {
    try { callbacks.onProgress(JSON.parse(event.data)); } catch {}
  });

  eventSource.addEventListener('log', (event) => {
    try { callbacks.onLog(JSON.parse(event.data)); } catch {}
  });

  eventSource.addEventListener('done', (event) => {
    try { callbacks.onDone(JSON.parse(event.data)); } catch {}
    eventSource.close();
  });

  eventSource.addEventListener('error', (event) => {
    try {
      const msgEvent = event as MessageEvent;
      if (msgEvent.data) callbacks.onError(JSON.parse(msgEvent.data));
    } catch {}
    eventSource.close();
  });

  return () => {
    eventSource.close();
  };
}

// ── Main Component ─────────────────────────────────────────────
export default function InvoiceDownloader() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);
  const [progressMap, setProgressMap] = useState<Record<number, ProgressState>>({});
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: new Date().toLocaleTimeString(), message: 'Sẵn sàng nhận lệnh tải...', type: 'system' },
  ]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const sseCleanupRef = useRef<Record<number, () => void>>({});
  // Lưu jobId đang active theo companyId để hỗ trợ reconnect
  const activeJobIdsRef = useRef<Record<number, string>>({});

  // Auto scroll log
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      const el = logContainerRef.current;
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [logs.length, autoScroll]);

  const handleLogScroll = useCallback(() => {
    if (!logContainerRef.current) return;
    const el = logContainerRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  const fetchCompanies = useCallback(async () => {
    setCompaniesLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/companies`);
      setCompanies(res.data);
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setCompaniesLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
  }, []);

  const clearLogs = () => {
    setLogs([{ time: new Date().toLocaleTimeString(), message: 'Bảng Log đã được làm sạch.', type: 'system' }]);
  };

  const toggleAccordion = (companyId: number) => {
    setExpandedCompanyId(prev => (prev === companyId ? null : companyId));
  };

  const [gdtHealthMap, setGdtHealthMap] = useState<Record<number, GdtHealthStatus>>({});

  const performHealthCheck = useCallback(async (companyId: number) => {
    const token = localStorage.getItem('token');
    const companyName = companies.find(c => c.id === companyId)?.name || `#${companyId}`;
    setGdtHealthMap(prev => ({ ...prev, [companyId]: { overall: 'checking', summary: 'Đang kiểm tra GDT...' } }));
    addLog(`[Health] ${companyName}: Đang kiểm tra kết nối GDT...`, 'info');

    try {
      const res = await axios.get(`${API_BASE_URL}/api/gdt/health`, {
        params: { companyId },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;

      setGdtHealthMap(prev => ({
        ...prev,
        [companyId]: { overall: data.overall, summary: data.summary },
      }));

      let healthMsg = `[Health] ${companyName}: GDT `;
      if (data.overall === 'healthy') {
        healthMsg += 'hoạt động tốt ✅';
        addLog(healthMsg, 'success');
      } else if (data.overall === 'degraded') {
        healthMsg += `hoạt động không ổn định — ${data.summary}`;
        addLog(healthMsg, 'warning');
        toast.warning(`[${companyName}] ${data.summary}`, { duration: 5000 });
      } else if (data.overall === 'unhealthy') {
        healthMsg += `không khả dụng — ${data.summary}`;
        addLog(healthMsg, 'error');
        toast.error(`[${companyName}] ${data.summary}`, { duration: 8000 });
      }

      if (data.tokenStatus === 'expired') {
        addLog(`[Health] ${companyName}: Token GDT đã hết hạn, cần đăng nhập lại`, 'warning');
      } else if (data.tokenStatus === 'missing') {
        addLog(`[Health] ${companyName}: Không có token GDT — chỉ kiểm tra kết nối mạng`, 'info');
      }

      return data;
    } catch (err: any) {
      const msg = err.response?.data?.summary || err.message || 'Không thể kiểm tra GDT';
      setGdtHealthMap(prev => ({
        ...prev,
        [companyId]: { overall: 'unknown', summary: msg },
      }));
      addLog(`[Health] ${companyName}: ${msg}`, 'error');
      toast.error(`[${companyName}] Không thể kiểm tra GDT: ${msg}`, { duration: 8000 });
      return null;
    }
  }, [companies, addLog]);

  // Khi expand company, chỉ toggle accordion, không tự động health check GDT
  const handleToggleAccordion = (companyId: number) => {
    toggleAccordion(companyId);
  };

  /**
   * Tạo job download mới và kết nối SSE.
   */
  const startDownload = async (companyId: number, startDate: string, endDate: string, invoiceType: string, overwriteMode?: string) => {
    const companyName = companies.find(c => c.id === companyId)?.name || `#${companyId}`;
    const token = localStorage.getItem('token');
    if (!token) {
      addLog(`[${companyName}] Lỗi: Chưa đăng nhập.`, 'error');
      toast.error('Vui lòng đăng nhập lại.');
      return;
    }

    // Cleanup SSE cũ nếu có
    if (sseCleanupRef.current[companyId]) {
      sseCleanupRef.current[companyId]();
      delete sseCleanupRef.current[companyId];
    }

    setProgressMap(prev => ({ ...prev, [companyId]: { status: 'connecting', total: 0, current: 0 } }));
    addLog(`[${companyName}] Đang tạo job tải hoá đơn...`, 'info');

    try {
      // Bước 1: Gọi POST /download để tạo job
      const res = await axios.post(
        `${API_BASE_URL}/api/invoices/download`,
        {
          companyId,
          startDate,
          endDate,
          invoiceType,
          overwriteMode: overwriteMode || 'SKIP',
          saveToDb: true,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const { jobId } = res.data;
      if (!jobId) throw new Error('Không nhận được jobId từ server.');

      activeJobIdsRef.current[companyId] = jobId;
      addLog(`[${companyName}] Job #${jobId.slice(0, 8)} đã được tạo.`, 'info');

      // Bước 2: Kết nối SSE stream
      sseCleanupRef.current[companyId] = connectJobSSE(
        jobId,
        token,
        {
          onProgress: (data) => {
            setProgressMap(prev => {
              const existing = prev[companyId];
              return {
                ...prev,
                [companyId]: {
                  ...existing,
                  status: 'downloading',
                  current: data.current,
                  total: data.total,
                  jobId,
                },
              };
            });
          },
          onLog: (data) => {
            addLog(`[${companyName}] ${data.message}`, data.type || 'info');
          },
          onDone: (data) => {
            setProgressMap(prev => ({
              ...prev,
              [companyId]: {
                status: 'done',
                total: data.successCount,
                current: data.successCount,
                message: data.message,
                jobId,
              },
            }));
            addLog(`[${companyName}] ✅ ${data.message}`, data.errorCount > 0 ? 'warning' : 'success');
            delete activeJobIdsRef.current[companyId];
          },
          onError: (data) => {
            setProgressMap(prev => ({
              ...prev,
              [companyId]: { status: 'error', total: 0, current: 0, message: data.message },
            }));
            addLog(`[${companyName}] ❌ ${data.message}`, 'error');
            delete activeJobIdsRef.current[companyId];
          },
        },
      );

      // Cập nhật trạng thái kết nối
      setProgressMap(prev => {
        const existing = prev[companyId];
        return { ...prev, [companyId]: { ...existing, status: 'downloading', jobId } };
      });
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Lỗi không xác định';
      setProgressMap(prev => ({ ...prev, [companyId]: { status: 'error', total: 0, current: 0, message: msg } }));
      addLog(`[${companyName}] ❌ ${msg}`, 'error');
      toast.error(`[${companyName}] ${msg}`);
    }
  };

  /**
   * Huỷ job đang chạy.
   */
  const cancelDownload = async (companyId: number) => {
    const jobId = activeJobIdsRef.current[companyId];
    if (!jobId) return;

    const companyName = companies.find(c => c.id === companyId)?.name || `#${companyId}`;
    const token = localStorage.getItem('token');

    try {
      await axios.post(
        `${API_BASE_URL}/api/invoices/download/jobs/${jobId}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      addLog(`[${companyName}] Đã yêu cầu huỷ job.`, 'warning');
    } catch (err: any) {
      addLog(`[${companyName}] Lỗi khi huỷ job: ${err.message}`, 'error');
    }
  };

  /**
   * Kiểm tra job đang chạy khi component mount (hỗ trợ reconnect sau reload).
   */
  useEffect(() => {
    const checkActiveJobs = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        const res = await axios.get(`${API_BASE_URL}/api/invoices/download/jobs`, {
          params: { status: 'RUNNING', limit: 10 },
          headers: { Authorization: `Bearer ${token}` },
        });

        const runningJobs: DownloadJob[] = res.data;
        if (runningJobs.length === 0) {
          addLog('Không có job tải nào đang chạy.', 'system');
          return;
        }

        addLog(`Phát hiện ${runningJobs.length} job đang chạy từ trước.`, 'system');

        // Reconnect cho từng job
        for (const job of runningJobs) {
          if (!job.companyId) continue;

          const cid = job.companyId;
          addLog(`[${job.companyName || `#${cid}`}] Đang kết nối lại job ${job.id.slice(0, 8)}...`, 'system');

          activeJobIdsRef.current[cid] = job.id;

          setProgressMap(prev => ({
            ...prev,
            [cid]: {
              status: 'downloading',
              total: job.progressTotal,
              current: job.progressCurrent,
              jobId: job.id,
            },
          }));

          // Cleanup old SSE
          if (sseCleanupRef.current[cid]) {
            sseCleanupRef.current[cid]();
          }

          sseCleanupRef.current[cid] = connectJobSSE(job.id, token, {
            onProgress: (data) => {
              setProgressMap(prev => {
                const existing = prev[cid];
                return { ...prev, [cid]: { ...existing, status: 'downloading', current: data.current, total: data.total } };
              });
            },
            onLog: (data) => {
              const companyName = companies.find(c => c.id === cid)?.name || job.companyName || `#${cid}`;
              addLog(`[${companyName}] ${data.message}`, data.type || 'info');
            },
            onDone: (data) => {
              setProgressMap(prev => ({ ...prev, [cid]: { status: 'done', total: data.successCount, current: data.successCount, message: data.message } }));
              addLog(`[${job.companyName || `#${cid}`}] ✅ ${data.message}`, data.errorCount > 0 ? 'warning' : 'success');
              delete activeJobIdsRef.current[cid];
            },
            onError: (data) => {
              setProgressMap(prev => ({ ...prev, [cid]: { status: 'error', total: 0, current: 0, message: data.message } }));
              addLog(`[${job.companyName || `#${cid}`}] ❌ ${data.message}`, 'error');
              delete activeJobIdsRef.current[cid];
            },
          });
        }
      } catch (err) {
        // Lỗi khi kiểm tra job (có thể chưa có job nào)
        console.debug('No active jobs found or error checking:', err);
      }
    };

    // Kiểm tra job active sau khi load companies
    if (companies.length > 0) {
      checkActiveJobs();
    }
  }, [companies.length, addLog]);

  // Cleanup SSE khi unmount
  useEffect(() => {
    return () => {
      Object.values(sseCleanupRef.current).forEach(cleanup => cleanup());
    };
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Company Accordion List */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Danh Sách Doanh Nghiệp
        </h2>

        {companiesLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-6 h-6 mr-3 animate-spin" />
            Đang tải danh sách doanh nghiệp...
          </div>
        ) : companies.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-semibold">Chưa có doanh nghiệp nào</p>
              <p className="text-sm mt-1">Vui lòng vào mục Quản trị &gt; Doanh nghiệp để thêm</p>
            </CardContent>
          </Card>
        ) : (
          companies.map(company => (
            <CompanyCard
              key={company.id}
              company={company}
              isExpanded={expandedCompanyId === company.id}
              onToggle={() => handleToggleAccordion(company.id)}
              addLog={addLog}
              progress={progressMap[company.id] || { status: 'idle', total: 0, current: 0 }}
              onStartDownload={startDownload}
              onCancelDownload={cancelDownload}
              gdtHealth={gdtHealthMap[company.id]}
              onHealthCheck={() => performHealthCheck(company.id)}
              isReconnected={!!activeJobIdsRef.current[company.id]}
            />
          ))
        )}
      </div>

      {/* Log Console */}
      <Card className="min-h-[400px] max-h-screen flex flex-col">
        <CardHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Terminal className="h-5 w-5" />
              Tiến Trình Tải
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={clearLogs} className="h-8 text-xs gap-1">
              <Trash2 className="h-3.5 w-3.5" />
              Xóa log
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-4 py-0 h-full overflow-scroll">
          <div
            ref={logContainerRef}
            onScroll={handleLogScroll}
            className="h-full bg-black rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-1.5 select-text"
          >
            {logs.map((log, idx) => {
              let color = 'text-green-400';
              let icon = '•';
              if (log.type === 'error') { color = 'text-red-400'; icon = '✖'; }
              else if (log.type === 'warning') { color = 'text-yellow-400'; icon = '⚠'; }
              else if (log.type === 'system') { color = 'text-muted-foreground'; icon = '■'; }
              else if (log.type === 'info') icon = '›';
              else if (log.type === 'success') { color = 'text-emerald-400'; icon = '✓'; }

              return (
                <div key={idx} className={`leading-relaxed ${color} animate-fade-in`}>
                  <span className="opacity-50 mr-1.5">{icon}</span>
                  <span className="opacity-40 mr-1.5">[{log.time}]</span>
                  {log.message}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <style>{`
        @keyframes log-fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: log-fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}

// ── Company Card ───────────────────────────────────────────────
function CompanyCard({
  company, isExpanded, onToggle, addLog: _addLog, progress, onStartDownload, onCancelDownload,
  gdtHealth, onHealthCheck, isReconnected,
}: {
  company: Company;
  isExpanded: boolean;
  onToggle: () => void;
  addLog: (message: string, type: LogEntry['type']) => void;
  progress: ProgressState;
  onStartDownload: (companyId: number, startDate: string, endDate: string, invoiceType: string, overwriteMode?: string) => void;
  onCancelDownload: (companyId: number) => void;
  gdtHealth?: GdtHealthStatus;
  onHealthCheck: () => void;
  isReconnected?: boolean;
}) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [invoiceType, setInvoiceType] = useState('BOTH');

  const formatInvoiceType = (value: unknown): string => {
    const labels: Record<string, string> = { SELL: 'Hóa đơn Bán ra', BUY: 'Hóa đơn Mua vào', BOTH: 'Cả hai loại' };
    return labels[String(value)] || String(value);
  };
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingDownloadParams, setPendingDownloadParams] = useState<{
    formattedStart: string;
    formattedEnd: string;
  } | null>(null);
  const [existingCount, setExistingCount] = useState(0);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);

  const addLog = _addLog;

  const formatDatePayload = (d: Date | undefined) => {
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedStart = formatDatePayload(dateRange?.from);
    const formattedEnd = formatDatePayload(dateRange?.to);

    if (!formattedStart || !formattedEnd) {
      toast.error(`[${company.name}] Cần chọn đầy đủ ngày bắt đầu và kết thúc.`);
      return;
    }

    if (gdtHealth?.overall === 'unhealthy') {
      toast.warning(`[${company.name}] GDT đang không khả dụng. Tải có thể thất bại.`, {
        duration: 5000,
      });
    }

    setIsCheckingExisting(true);
    addLog(`[${company.name}] Đang kiểm tra hoá đơn đã tải trước đó...`, 'info');

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE_URL}/api/invoices/check-existing`,
        {
          companyId: company.id,
          startDate: formattedStart,
          endDate: formattedEnd,
          invoiceType,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const data = res.data;

      if (data.hasExisting) {
        setExistingCount(data.count);
        setPendingDownloadParams({ formattedStart, formattedEnd });
        setShowOverwriteDialog(true);
        addLog(`[${company.name}] Phát hiện ${data.count} hoá đơn đã tải trước đó.`, 'warning');
      } else {
        addLog(`[${company.name}] Không có hoá đơn nào đã tải trước đó.`, 'info');
        onStartDownload(company.id, formattedStart, formattedEnd, invoiceType);
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Lỗi kiểm tra hoá đơn';
      addLog(`[${company.name}] Lỗi kiểm tra: ${msg}`, 'error');
      addLog(`[${company.name}] Tiến hành tải bình thường...`, 'info');
      onStartDownload(company.id, formattedStart, formattedEnd, invoiceType);
    } finally {
      setIsCheckingExisting(false);
    }
  };

  const handleOverwriteConfirm = (mode: OverwriteMode) => {
    setShowOverwriteDialog(false);

    if (mode === 'SKIP') {
      addLog(`[${company.name}] Người dùng chọn bỏ qua, không tải lại.`, 'info');
      toast.info(`[${company.name}] Đã bỏ qua tải hoá đơn.`);
      return;
    }

    if (!pendingDownloadParams) return;

    const overwriteStr = mode === 'OVERWRITE' ? 'OVERWRITE' : 'NEW_VERSION';
    const modeLabel = mode === 'OVERWRITE' ? 'Ghi đè' : 'Tạo bản sao';
    addLog(`[${company.name}] Người dùng chọn "${modeLabel}".`, 'info');

    onStartDownload(
      company.id,
      pendingDownloadParams.formattedStart,
      pendingDownloadParams.formattedEnd,
      invoiceType,
      overwriteStr,
    );

    setPendingDownloadParams(null);
  };

  const isDownloading = progress.status === 'connecting' || progress.status === 'downloading' || isCheckingExisting;
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  // ── GDT Health Badge ──
  const healthBadge = () => {
    if (!gdtHealth) return null;

    switch (gdtHealth.overall) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <Wifi className="w-3 h-3" />
            GDT OK
          </span>
        );
      case 'degraded':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            title={gdtHealth.summary}
          >
            <Activity className="w-3 h-3" />
            GDT Chậm
          </span>
        );
      case 'unhealthy':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            title={gdtHealth.summary}
          >
            <WifiOff className="w-3 h-3" />
            GDT Lỗi
          </span>
        );
      case 'checking':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Đang kiểm tra...
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 hover:bg-muted/30 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex items-center gap-2">
            <div>
              <p className="font-semibold text-sm truncate">{company.name}</p>
              <p className="text-xs text-muted-foreground font-mono">MST: {company.taxCode}</p>
            </div>
            {healthBadge()}
            {/* Badge hiển thị job đang chạy */}
            {isReconnected && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Activity className="w-3 h-3 animate-pulse" />
                Đang tải
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 ml-3">
          {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
        </div>
      </button>

      {isExpanded && (
        <>
          <Separator />
          <CardContent className="space-y-4">
            {/* Company Info */}
            {(company.address || company.representative || company.phone || company.status) && (
              <div className="bg-muted/30 border rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                {company.address && (
                  <div className="flex gap-2 col-span-full">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span>{company.address}</span>
                  </div>
                )}
                {company.representative && (
                  <div className="flex gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span>{company.representative}</span>
                  </div>
                )}
                {company.phone && (
                  <div className="flex gap-2">
                    <PhoneCall className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span>{company.phone}</span>
                  </div>
                )}
                {company.status && (
                  <div className="flex gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-green-500 font-medium">{company.status}</span>
                  </div>
                )}
              </div>
            )}

            {/* GDT Health Detail */}
            {gdtHealth && (gdtHealth.overall === 'degraded' || gdtHealth.overall === 'unhealthy') && gdtHealth.summary && (
              <div className={`text-xs p-2 rounded-lg border ${
                gdtHealth.overall === 'unhealthy'
                  ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400'
                  : 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950/30 dark:border-yellow-800 dark:text-yellow-400'
              }`}>
                {gdtHealth.overall === 'unhealthy' ? '🔴' : '🟡'} {gdtHealth.summary}
              </div>
            )}

            {/* Reconnected notification */}
            {isReconnected && (
              <div className="text-xs p-2 rounded-lg border bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400">
                <History className="w-3 h-3 inline mr-1" />
                Job đã được kết nối lại sau khi reload. Tiến trình đang tiếp tục.
              </div>
            )}

            {/* Progress */}
            {progress.status !== 'idle' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {progress.status === 'connecting' && 'Đang kết nối...'}
                    {progress.status === 'downloading' && `Đang tải: ${progress.current}/${progress.total} hoá đơn`}
                    {progress.status === 'done' && (
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        Hoàn thành ({progress.total} hoá đơn)
                      </span>
                    )}
                    {progress.status === 'error' && (
                      <span className="text-destructive font-medium flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        {progress.message || 'Có lỗi xảy ra'}
                      </span>
                    )}
                  </span>
                  {progress.status === 'downloading' && (
                    <span className="font-mono text-primary font-semibold">{pct}%</span>
                  )}
                </div>
                {(progress.status === 'connecting' || progress.status === 'downloading') && (
                  <Progress value={Math.max(pct, 2)} className="h-2" />
                )}
              </div>
            )}

            <form onSubmit={handleDownload} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Khoảng ngày</Label>
                  <DateRangePicker
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                    placeholder="Chọn khoảng thời gian"
                    disabled={isDownloading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`type-${company.id}`}>Loại hóa đơn</Label>
                  <Select value={invoiceType} onValueChange={v => setInvoiceType(v ?? 'BOTH')} disabled={isDownloading}>
                    <SelectTrigger id={`type-${company.id}`}>
                      <SelectValue>
                        {formatInvoiceType}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SELL">Hóa đơn Bán ra</SelectItem>
                      <SelectItem value="BUY">Hóa đơn Mua vào</SelectItem>
                      <SelectItem value="BOTH">Cả hai loại</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                {isDownloading ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => onCancelDownload(company.id)}
                    className="flex-1"
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    Huỷ tải
                  </Button>
                ) : (
                  <Button type="submit" disabled={isDownloading} className="w-full">
                    {isCheckingExisting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang kiểm tra...</>
                    ) : (
                      <><Play className="mr-2 h-4 w-4" />Tải Hóa Đơn</>
                    )}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </>
      )}

      <OverwriteConfirmDialog
        open={showOverwriteDialog}
        onOpenChange={setShowOverwriteDialog}
        companyName={company.name}
        startDate={pendingDownloadParams?.formattedStart || ''}
        endDate={pendingDownloadParams?.formattedEnd || ''}
        existingCount={existingCount}
        onConfirm={handleOverwriteConfirm}
      />
    </Card>
  );
}
