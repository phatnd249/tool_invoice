import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Play, Sliders, Terminal, Trash2, ChevronDown, ChevronRight, Building2,
  MapPin, PhoneCall, User, CheckCircle2, Loader2, XCircle, Check,
} from 'lucide-react';
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
  type: 'info' | 'error' | 'warning' | 'system';
}

interface ProgressState {
  status: 'idle' | 'connecting' | 'downloading' | 'done' | 'error';
  total: number;
  current: number;
  message?: string;
}

// ── Progress Bar Component ────────────────────────────────────
function ProgressBar({ state }: { state: ProgressState }) {
  const pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">
          {state.status === 'connecting' && 'Đang kết nối...'}
          {state.status === 'downloading' && `Đang tải: ${state.current}/${state.total} hoá đơn`}
          {state.status === 'done' && (
            <span className="text-success-default font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              Hoàn thành ({state.total} hoá đơn)
            </span>
          )}
          {state.status === 'error' && (
            <span className="text-danger-default font-medium flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              {state.message || 'Có lỗi xảy ra'}
            </span>
          )}
        </span>
        {state.status === 'downloading' && (
          <span className="font-mono text-accent-default font-semibold">{pct}%</span>
        )}
      </div>
      {(state.status === 'connecting' || state.status === 'downloading') && (
        <div className="w-full h-2 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent-default to-accent-hover-default rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Accordion Item ─────────────────────────────────────────────
interface AccordionProps {
  company: Company;
  isExpanded: boolean;
  onToggle: () => void;
  addLog: (message: string, type: LogEntry['type']) => void;
  progress: ProgressState;
  onStartDownload: (companyId: number, startDate: string, endDate: string, invoiceType: string) => void;
}

function CompanyAccordion({ company, isExpanded, onToggle, addLog, progress, onStartDownload }: AccordionProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [invoiceType, setInvoiceType] = useState('BOTH');

  const formatDatePayload = (dateStr: string) => {
    if (!dateStr) return '';
    const [yyyy, mm, dd] = dateStr.split('-');
    return `${dd}/${mm}/${yyyy}`;
  };

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedStart = formatDatePayload(startDate);
    const formattedEnd = formatDatePayload(endDate);

    if (!formattedStart || !formattedEnd) {
      addLog(`[${company.name}] Lỗi: Cần chọn đầy đủ ngày bắt đầu và kết thúc.`, 'error');
      return;
    }

    onStartDownload(company.id, formattedStart, formattedEnd, invoiceType);
  };

  const isDownloading = progress.status === 'connecting' || progress.status === 'downloading';

  return (
    <div className="border border-border rounded-2xl overflow-hidden transition-all duration-200">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 bg-card hover:bg-bg-tertiary transition-colors duration-150 cursor-pointer text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent-default/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-accent-default" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-text-primary text-sm truncate">{company.name}</p>
            <p className="text-xs text-text-muted font-mono">MST: {company.taxCode}</p>
          </div>
        </div>
        <div className="shrink-0 ml-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-text-secondary transition-transform duration-200" />
          ) : (
            <ChevronRight className="w-5 h-5 text-text-secondary transition-transform duration-200" />
          )}
        </div>
      </button>

      {/* Accordion Body */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out bg-card ${
          isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-5 pb-5 pt-2 border-t border-border">
          {/* Company Info Card */}
          {(company.address || company.representative || company.phone || company.status) && (
            <div className="bg-bg-primary/40 border border-border rounded-xl p-3 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              {company.address && (
                <div className="flex gap-2 col-span-full">
                  <MapPin className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" />
                  <span className="text-text-primary">{company.address}</span>
                </div>
              )}
              {company.representative && (
                <div className="flex gap-2">
                  <User className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" />
                  <span className="text-text-primary">{company.representative}</span>
                </div>
              )}
              {company.phone && (
                <div className="flex gap-2">
                  <PhoneCall className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" />
                  <span className="text-text-primary">{company.phone}</span>
                </div>
              )}
              {company.status && (
                <div className="flex gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-emerald-400 font-medium">{company.status}</span>
                </div>
              )}
            </div>
          )}

          {/* Progress bar */}
          {progress.status !== 'idle' && (
            <div className="mb-4">
              <ProgressBar state={progress} />
            </div>
          )}

          <form onSubmit={handleDownload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Từ ngày</label>
                <input
                  type="date"
                  required
                  lang="en-GB"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isDownloading}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent disabled:opacity-50 relative"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Đến ngày</label>
                <input
                  type="date"
                  required
                  lang="en-GB"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isDownloading}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent disabled:opacity-50 relative"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Loại hóa đơn</label>
                <select
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value)}
                  disabled={isDownloading}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent disabled:opacity-50 cursor-pointer"
                >
                  <option value="SELL">Hóa đơn Bán ra</option>
                  <option value="BUY">Hóa đơn Mua vào</option>
                  <option value="BOTH">Cả hai loại</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isDownloading}
              className="w-full bg-gradient-to-r from-accent-default to-accent-hover-default hover:from-accent-hover-default hover:to-accent-hover-default disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-accent-default/20 flex items-center justify-center space-x-2 cursor-pointer"
            >
              {isDownloading ? (
                <span className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang tải...</span>
                </span>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Tải Hóa Đơn</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function InvoiceDownloader() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);
  const [progressMap, setProgressMap] = useState<Record<number, ProgressState>>({});
  const abortRef = useRef<Record<number, AbortController>>({});
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      time: new Date().toLocaleTimeString(),
      message: 'Sẵn sàng nhận lệnh tải...',
      type: 'system',
    },
  ]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      const el = logContainerRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
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

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString(),
        message,
        type,
      },
    ]);
  };

  const clearLogs = () => {
    setLogs([
      {
        time: new Date().toLocaleTimeString(),
        message: 'Bảng Log đã được làm sạch.',
        type: 'system',
      },
    ]);
  };

  const toggleAccordion = (companyId: number) => {
    setExpandedCompanyId((prev) => (prev === companyId ? null : companyId));
  };

  // Handle SSE download
  const startDownload = async (companyId: number, startDate: string, endDate: string, invoiceType: string) => {
    // Abort previous download for this company if any
    if (abortRef.current[companyId]) {
      abortRef.current[companyId].abort();
    }

    const abortController = new AbortController();
    abortRef.current[companyId] = abortController;

    const token = localStorage.getItem('token');
    const baseUrl = API_BASE_URL || '';

    // Construct SSE URL with query params and token
    const url = `${baseUrl}/api/invoices/download/stream?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&companyId=${companyId}&invoiceType=${invoiceType}&token=${encodeURIComponent(token || '')}`;

    setProgressMap((prev) => ({
      ...prev,
      [companyId]: { status: 'connecting', total: 0, current: 0 },
    }));

    addLog(`[${companies.find(c => c.id === companyId)?.name}] Bắt đầu tải hoá đơn...`, 'info');

    try {
      const response = await fetch(url, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6).trim();
          } else if (line === '' && currentEvent && currentData) {
            // Process event
            try {
              const data = JSON.parse(currentData);

              switch (currentEvent) {
                case 'log':
                  addLog(`[SSE] ${data.message}`, data.type || 'info');
                  break;

                case 'total':
                  setProgressMap((prev) => ({
                    ...prev,
                    [companyId]: {
                      status: 'downloading',
                      total: data.total,
                      current: 0,
                    },
                  }));
                  addLog(`[SSE] Tổng cộng ${data.total} hoá đơn cần tải.`, 'info');
                  break;

                case 'progress':
                  setProgressMap((prev) => {
                    const existing = prev[companyId];
                    return {
                      ...prev,
                      [companyId]: {
                        ...existing,
                        status: 'downloading',
                        current: data.current,
                        total: data.total,
                      },
                    };
                  });
                  break;

                case 'done':
                  setProgressMap((prev) => ({
                    ...prev,
                    [companyId]: {
                      status: 'done',
                      total: data.successCount,
                      current: data.successCount,
                      message: data.message,
                    },
                  }));
                  addLog(`[SSE] Hoàn thành: ${data.message}`, data.errorCount > 0 ? 'warning' : 'info');
                  break;

                case 'error':
                  setProgressMap((prev) => ({
                    ...prev,
                    [companyId]: {
                      status: 'error',
                      total: 0,
                      current: 0,
                      message: data.message,
                    },
                  }));
                  addLog(`[SSE] Lỗi: ${data.message}`, 'error');
                  break;
              }
            } catch (parseErr) {
              // ignore parse errors for incomplete chunks
            }

            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        addLog(`[${companies.find(c => c.id === companyId)?.name}] Đã huỷ tải.`, 'warning');
        return;
      }
      setProgressMap((prev) => ({
        ...prev,
        [companyId]: { status: 'error', total: 0, current: 0, message: err.message },
      }));
      addLog(`[SSE] Lỗi kết nối: ${err.message}`, 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Company Accordion List */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold text-accent-default flex items-center">
          <Sliders className="w-5 h-5 mr-2" /> Danh Sách Doanh Nghiệp
        </h2>

        {companiesLoading ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <Loader2 className="w-6 h-6 mr-3 animate-spin" />
            Đang tải danh sách doanh nghiệp...
          </div>
        ) : companies.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center text-text-muted">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-text-secondary">Chưa có doanh nghiệp nào</p>
            <p className="text-sm mt-1">Vui lòng vào mục Quản trị &gt; Doanh nghiệp để thêm</p>
          </div>
        ) : (
          companies.map((company) => (
            <CompanyAccordion
              key={company.id}
              company={company}
              isExpanded={expandedCompanyId === company.id}
              onToggle={() => toggleAccordion(company.id)}
              addLog={addLog}
              progress={progressMap[company.id] || { status: 'idle', total: 0, current: 0 }}
              onStartDownload={startDownload}
            />
          ))
        )}
      </div>

      {/* Log Console Card */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xl flex flex-col h-[420px] lg:h-[480px]">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-lg font-semibold text-log-cyan flex items-center">
            <Terminal className="w-5 h-5 mr-2" /> Tiến Trình Tải
          </h2>
          <button onClick={clearLogs} className="text-xs text-text-muted hover:text-text-secondary flex items-center space-x-1 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa log</span>
          </button>
        </div>
        <div
          ref={logContainerRef}
          onScroll={handleLogScroll}
          className="flex-1 bg-black border border-border rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-1.5 select-text"
        >
          {logs.map((log, idx) => {
            let color = 'text-success-default';
            let icon = '•';
            if (log.type === 'error') { color = 'text-red-400'; icon = '✖'; }
            else if (log.type === 'warning') { color = 'text-yellow-400'; icon = '⚠'; }
            else if (log.type === 'system') { color = 'text-text-muted'; icon = '■'; }
            else if (log.type === 'info') icon = '›';

            return (
              <div
                key={idx}
                className={`leading-relaxed ${color} animate-fade-in`}
                style={{ animationDelay: `${idx === logs.length - 1 ? 0 : 0}ms` }}
              >
                <span className="opacity-50 mr-1.5">{icon}</span>
                <span className="opacity-40 mr-1.5">[{log.time}]</span>
                {log.message}
              </div>
            );
          })}
        </div>
      </div>

      {/* Fade-in animation for log entries */}
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
