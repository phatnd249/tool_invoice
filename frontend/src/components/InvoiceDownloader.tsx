import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Play, Terminal, Trash2, ChevronDown, ChevronRight, Building2,
  MapPin, PhoneCall, User, CheckCircle2, Loader2, XCircle, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/ui/date-range-picker';
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
  type: 'info' | 'error' | 'warning' | 'system';
}

interface ProgressState {
  status: 'idle' | 'connecting' | 'downloading' | 'done' | 'error';
  total: number;
  current: number;
  message?: string;
}

// ── Main Component ─────────────────────────────────────────────
export default function InvoiceDownloader() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);
  const [progressMap, setProgressMap] = useState<Record<number, ProgressState>>({});
  const abortRef = useRef<Record<number, AbortController>>({});
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: new Date().toLocaleTimeString(), message: 'Sẵn sàng nhận lệnh tải...', type: 'system' },
  ]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

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

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
  };

  const clearLogs = () => {
    setLogs([{ time: new Date().toLocaleTimeString(), message: 'Bảng Log đã được làm sạch.', type: 'system' }]);
  };

  const toggleAccordion = (companyId: number) => {
    setExpandedCompanyId(prev => (prev === companyId ? null : companyId));
  };

  const startDownload = async (companyId: number, startDate: string, endDate: string, invoiceType: string) => {
    if (abortRef.current[companyId]) {
      abortRef.current[companyId].abort();
    }

    const abortController = new AbortController();
    abortRef.current[companyId] = abortController;

    const token = localStorage.getItem('token');
    const baseUrl = API_BASE_URL || '';
    const url = `${baseUrl}/api/invoices/download/stream?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&companyId=${companyId}&invoiceType=${invoiceType}&token=${encodeURIComponent(token || '')}`;

    setProgressMap(prev => ({ ...prev, [companyId]: { status: 'connecting', total: 0, current: 0 } }));
    addLog(`[${companies.find(c => c.id === companyId)?.name}] Bắt đầu tải hoá đơn...`, 'info');

    try {
      const response = await fetch(url, { signal: abortController.signal });

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
          if (line.startsWith('event: ')) currentEvent = line.slice(7).trim();
          else if (line.startsWith('data: ')) currentData = line.slice(6).trim();
          else if (line === '' && currentEvent && currentData) {
            try {
              const data = JSON.parse(currentData);

              switch (currentEvent) {
                case 'log':
                  addLog(`[SSE] ${data.message}`, data.type || 'info');
                  break;
                case 'total':
                  setProgressMap(prev => ({ ...prev, [companyId]: { status: 'downloading', total: data.total, current: 0 } }));
                  addLog(`[SSE] Tổng cộng ${data.total} hoá đơn cần tải.`, 'info');
                  break;
                case 'progress':
                  setProgressMap(prev => {
                    const existing = prev[companyId];
                    return { ...prev, [companyId]: { ...existing, status: 'downloading', current: data.current, total: data.total } };
                  });
                  break;
                case 'excel_report':
                  try {
                    const byteCharacters = atob(data.data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = data.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    addLog('[SSE] Đã tự động tải xuống file Excel báo cáo tổng hợp.', 'info');
                  } catch (err) {
                    addLog(`[SSE] Lỗi tải file Excel: ${err}`, 'error');
                  }
                  break;
                case 'done':
                  setProgressMap(prev => ({ ...prev, [companyId]: { status: 'done', total: data.successCount, current: data.successCount, message: data.message } }));
                  addLog(`[SSE] Hoàn thành: ${data.message}`, data.errorCount > 0 ? 'warning' : 'info');
                  break;
                case 'error':
                  setProgressMap(prev => ({ ...prev, [companyId]: { status: 'error', total: 0, current: 0, message: data.message } }));
                  addLog(`[SSE] Lỗi: ${data.message}`, 'error');
                  break;
              }
            } catch { /* ignore parse errors */ }
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
      setProgressMap(prev => ({ ...prev, [companyId]: { status: 'error', total: 0, current: 0, message: err.message } }));
      addLog(`[SSE] Lỗi kết nối: ${err.message}`, 'error');
    }
  };

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
              onToggle={() => toggleAccordion(company.id)}
              addLog={addLog}
              progress={progressMap[company.id] || { status: 'idle', total: 0, current: 0 }}
              onStartDownload={startDownload}
            />
          ))
        )}
      </div>

      {/* Log Console */}
      <Card className="h-[420px] lg:h-[480px] flex flex-col">
        <CardHeader className="pb-3 shrink-0">
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
        <CardContent className="flex-1 p-4 pt-0">
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
  company, isExpanded, onToggle, addLog, progress, onStartDownload,
}: {
  company: Company;
  isExpanded: boolean;
  onToggle: () => void;
  addLog: (message: string, type: LogEntry['type']) => void;
  progress: ProgressState;
  onStartDownload: (companyId: number, startDate: string, endDate: string, invoiceType: string) => void;
}) {
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>();
  const [invoiceType, setInvoiceType] = useState('BOTH');

  const formatDatePayload = (d: Date | undefined) => {
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const handleDownload = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedStart = formatDatePayload(dateRange?.from);
    const formattedEnd = formatDatePayload(dateRange?.to);

    if (!formattedStart || !formattedEnd) {
      toast.error(`[${company.name}] Cần chọn đầy đủ ngày bắt đầu và kết thúc.`);
      return;
    }

    onStartDownload(company.id, formattedStart, formattedEnd, invoiceType);
  };

  const isDownloading = progress.status === 'connecting' || progress.status === 'downloading';
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

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
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{company.name}</p>
            <p className="text-xs text-muted-foreground font-mono">MST: {company.taxCode}</p>
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
                  <Select value={invoiceType} onValueChange={setInvoiceType} disabled={isDownloading}>
                    <SelectTrigger id={`type-${company.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SELL">Hóa đơn Bán ra</SelectItem>
                      <SelectItem value="BUY">Hóa đơn Mua vào</SelectItem>
                      <SelectItem value="BOTH">Cả hai loại</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isDownloading}
                className="w-full"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang tải...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Tải Hóa Đơn
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </>
      )}
    </Card>
  );
}
