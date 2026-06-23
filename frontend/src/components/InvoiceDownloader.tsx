import React, { useState } from 'react';
import axios from 'axios';
import { Play, Sliders, Terminal, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'error' | 'warning' | 'system';
}

export default function InvoiceDownloader() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [invoiceType, setInvoiceType] = useState('SELL');
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      time: new Date().toLocaleTimeString(),
      message: 'Sẵn sàng nhận lệnh tải...',
      type: 'system',
    },
  ]);
  const [loading, setLoading] = useState(false);

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

    const formattedStart = formatDatePayload(startDate);
    const formattedEnd = formatDatePayload(endDate);

    if (!formattedStart || !formattedEnd) {
      addLog('Lỗi: Cần chọn đầy đủ ngày bắt đầu và kết thúc.', 'error');
      return;
    }

    setLoading(true);
    addLog(`Khởi chạy luồng tải hóa đơn từ ${formattedStart} đến ${formattedEnd}...`, 'info');

    const payload: any = {
      startDate: formattedStart,
      endDate: formattedEnd,
      invoiceType,
      saveToDb: true,
    };

    if (token.trim()) {
      payload.token = token.trim();
      addLog('Sử dụng token xác thực có sẵn được cung cấp.', 'info');
    } else if (username.trim() && password.trim()) {
      payload.username = username.trim();
      payload.password = password.trim();
      addLog(`Sử dụng tài khoản MST: ${username.trim()}. Sẽ tự động đăng nhập và giải captcha qua Gemini AI...`, 'info');
    } else {
      addLog('Lỗi: Bạn cần điền Token hoặc Cặp tài khoản/mật khẩu để xác thực.', 'error');
      setLoading(false);
      return;
    }

    try {
      // Connect to the local backend dynamically
      const response = await axios.post(`${API_BASE_URL}/api/invoices/download`, payload);
      
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
      addLog(`Lỗi kết nối server: ${errMsg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Configuration Form Card */}
      <div className="lg:col-span-2 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
        <h2 className="text-lg font-semibold text-indigo-400 flex items-center">
          <Sliders className="w-5 h-5 mr-2" /> Cấu Hình Tải Hoá Đơn
        </h2>
        <form onSubmit={handleDownload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Mã Số Thuế (MST)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Nhập MST doanh nghiệp"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Mật khẩu tra cứu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Nhập mật khẩu trang thuế"
              />
            </div>
          </div>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs font-medium uppercase">
              <span className="bg-slate-950 px-2 text-slate-500">Hoặc sử dụng Token có sẵn</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">GDT Authorization Token</label>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Dán JWT Bearer Token tại đây (nếu không dùng mật khẩu)"
            ></textarea>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Từ ngày</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Đến ngày</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Loại hoá đơn</label>
              <select
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="SELL">Hóa đơn Bán ra</option>
                <option value="BUY">Hóa đơn Mua vào</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
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
      <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col h-[420px] lg:h-auto">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-lg font-semibold text-cyan-400 flex items-center">
            <Terminal className="w-5 h-5 mr-2" /> Tiến Trình Tải
          </h2>
          <button onClick={clearLogs} className="text-xs text-slate-500 hover:text-slate-350 flex items-center space-x-1">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa log</span>
          </button>
        </div>
        <div className="flex-1 bg-black border border-slate-900 rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-2 select-text">
          {logs.map((log, idx) => {
            let color = 'text-emerald-400';
            if (log.type === 'error') color = 'text-red-400';
            if (log.type === 'warning') color = 'text-yellow-400';
            if (log.type === 'system') color = 'text-slate-500';
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
