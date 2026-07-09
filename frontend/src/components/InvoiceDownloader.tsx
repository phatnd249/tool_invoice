import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Play, Sliders, Terminal, Trash2, ChevronDown, ChevronRight, Building2,
  MapPin, Phone, User, CheckCircle2,
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

// ── Accordion Item ─────────────────────────────────────────────
interface AccordionProps {
  company: Company;
  isExpanded: boolean;
  onToggle: () => void;
  addLog: (message: string, type: LogEntry['type']) => void;
}

function CompanyAccordion({ company, isExpanded, onToggle, addLog }: AccordionProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [invoiceType, setInvoiceType] = useState('BOTH');
  const [loading, setLoading] = useState(false);

  const formatDatePayload = (dateStr: string) => {
    if (!dateStr) return '';
    const [yyyy, mm, dd] = dateStr.split('-');
    return `${dd}/${mm}/${yyyy}`;
  };

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const formattedStart = formatDatePayload(startDate);
    const formattedEnd = formatDatePayload(endDate);

    if (!formattedStart || !formattedEnd) {
      addLog(`[${company.name}] Lỗi: Cần chọn đầy đủ ngày bắt đầu và kết thúc.`, 'error');
      return;
    }

    setLoading(true);
    addLog(`[${company.name}] Khởi chạy luồng tải hóa đơn từ ${formattedStart} đến ${formattedEnd}...`, 'info');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/invoices/download`, {
        companyId: company.id,
        startDate: formattedStart,
        endDate: formattedEnd,
        invoiceType,
        saveToDb: true,
      });

      if (response.status === 200) {
        addLog(`[${company.name}] Hoàn tất! ${response.data.message || ''}`, 'info');
        if (response.data.errors && response.data.errors.length > 0) {
          response.data.errors.forEach((err: string) => addLog(`[${company.name}] Ngoại lệ: ${err}`, 'warning'));
        }
      } else {
        addLog(`[${company.name}] Lỗi API: ${response.data.error || 'Unknown Error'}`, 'error');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.details || err.message;
      addLog(`[${company.name}] Lỗi tải hoá đơn: ${errMsg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

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
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[520px] opacity-100' : 'max-h-0 opacity-0'
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
                  <Phone className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" />
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
          <form onSubmit={handleDownload} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Từ ngày</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Đến ngày</label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Loại hoá đơn</label>
                <select
                  value={invoiceType}
                  onChange={(e) => setInvoiceType(e.target.value)}
                  className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                >
                  <option value="SELL">Hóa đơn Bán ra</option>
                  <option value="BUY">Hóa đơn Mua vào</option>
                  <option value="BOTH">Cả hai loại</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-accent-default to-accent-hover-default hover:from-accent-hover-default hover:to-accent-hover-default disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-accent-default/20 flex items-center justify-center space-x-2 cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
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
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      time: new Date().toLocaleTimeString(),
      message: 'Sẵn sàng nhận lệnh tải...',
      type: 'system',
    },
  ]);

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Company Accordion List */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold text-accent-default flex items-center">
          <Sliders className="w-5 h-5 mr-2" /> Danh Sách Doanh Nghiệp
        </h2>

        {companiesLoading ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <svg className="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
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
            />
          ))
        )}
      </div>

      {/* Log Console Card */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xl flex flex-col h-[420px] lg:h-auto">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-lg font-semibold text-log-cyan flex items-center">
            <Terminal className="w-5 h-5 mr-2" /> Tiến Trình Tải
          </h2>
          <button onClick={clearLogs} className="text-xs text-text-muted hover:text-text-secondary flex items-center space-x-1 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa log</span>
          </button>
        </div>
        <div className="flex-1 bg-black border border-border rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-2 select-text">
          {logs.map((log, idx) => {
            let color = 'text-success-default';
            if (log.type === 'error') color = 'text-red-400';
            if (log.type === 'warning') color = 'text-yellow-400';
            if (log.type === 'system') color = 'text-text-muted';
            return (
              <div key={idx} className={`leading-relaxed ${color}`}>
                [{log.time}] {log.message}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
