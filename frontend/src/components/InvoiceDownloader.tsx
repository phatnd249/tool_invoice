import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Play, Sliders, Terminal, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface Company {
  id: number;
  taxCode: string;
  name: string;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'error' | 'warning' | 'system';
}

export default function InvoiceDownloader() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companiesLoading, setCompaniesLoading] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [invoiceType, setInvoiceType] = useState('BOTH');
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      time: new Date().toLocaleTimeString(),
      message: 'Sẵn sàng nhận lệnh tải...',
      type: 'system',
    },
  ]);
  const [loading, setLoading] = useState(false);

  // Fetch registered companies on mount
  const fetchCompanies = async () => {
    setCompaniesLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/companies`);
      setCompanies(res.data);
      if (res.data.length > 0) {
        setSelectedCompanyId(String(res.data[0].id));
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setCompaniesLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const addLog = (message: string, type: 'info' | 'error' | 'warning' | 'system' = 'info') => {
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

  const formatDatePayload = (dateStr: string) => {
    if (!dateStr) return '';
    const [yyyy, mm, dd] = dateStr.split('-');
    return `${dd}/${mm}/${yyyy}`;
  };

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!selectedCompanyId) {
      addLog('Lỗi: Bạn cần cấu hình và chọn một Doanh nghiệp trước khi tải.', 'error');
      return;
    }

    const formattedStart = formatDatePayload(startDate);
    const formattedEnd = formatDatePayload(endDate);

    if (!formattedStart || !formattedEnd) {
      addLog('Lỗi: Cần chọn đầy đủ ngày bắt đầu và kết thúc.', 'error');
      return;
    }

    const activeCompany = companies.find(c => String(c.id) === selectedCompanyId);
    setLoading(true);
    addLog(`Khởi chạy luồng tải hóa đơn cho [${activeCompany?.name}] từ ${formattedStart} đến ${formattedEnd}...`, 'info');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/invoices/download`, {
        companyId: Number(selectedCompanyId),
        startDate: formattedStart,
        endDate: formattedEnd,
        invoiceType,
        saveToDb: true,
      });

      if (response.status === 200) {
        addLog(`Hoàn tất tải hóa đơn! ${response.data.message || ''}`, 'info');
        if (response.data.errors && response.data.errors.length > 0) {
          response.data.errors.forEach((err: string) => addLog(`Ngoại lệ: ${err}`, 'warning'));
        }
      } else {
        addLog(`Lỗi API: ${response.data.error || 'Unknown Error'}`, 'error');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.response?.data?.details || err.message;
      addLog(`Lỗi tải hoá đơn: ${errMsg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Configuration Form Card */}
      <div className="lg:col-span-2 bg-card p-6 rounded-2xl border border-border shadow-xl space-y-6">
        <h2 className="text-lg font-semibold text-accent-default flex items-center">
          <Sliders className="w-5 h-5 mr-2" /> Tham Số Tải Hoá Đơn
        </h2>
        <form onSubmit={handleDownload} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">Doanh Nghiệp (MST)</label>
            <div className="relative">
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                disabled={companiesLoading || companies.length === 0}
                className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent cursor-pointer disabled:opacity-50"
              >
                {companies.length === 0 ? (
                  <option value="">(Chưa cấu hình doanh nghiệp nào - Vui lòng vào Cấu Hình)</option>
                ) : (
                  companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.taxCode})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Từ ngày</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-input border border-border rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Đến ngày</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-input border border-border rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Loại hoá đơn</label>
              <select
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value)}
                className="w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="SELL">Hóa đơn Bán ra</option>
                <option value="BUY">Hóa đơn Mua vào</option>
                <option value="BOTH">Cả hai loại</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || companies.length === 0}
            className="w-full bg-gradient-to-r from-accent-default to-accent-hover-default hover:from-accent-hover-default hover:to-accent-hover-default disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-accent-default/20 flex items-center justify-center space-x-2 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Đang tải hóa đơn...</span>
              </span>
            ) : (
              <>
                <Play className="w-5 h-5" />
                <span>Bắt Đầu Tải Hóa Đơn</span>
              </>
            )}
          </button>
        </form>
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
