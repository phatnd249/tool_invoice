import { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface Company {
  id: number;
  taxCode: string;
  name: string;
}

interface Schedule {
  id: number;
  companyId: number;
  company: Company;
  cronExpression: string;
  invoiceType: 'BUY' | 'SELL';
  isActive: boolean;
  lastRun?: string | null;
}

export default function SchedulePanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [cronExpression, setCronExpression] = useState('0 9 * * *');
  const [invoiceType, setInvoiceType] = useState<'BUY' | 'SELL'>('SELL');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Connect to the local backend dynamically
      const [schedulesRes, companiesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/schedules`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE_URL}/api/companies`).catch(() => ({ data: [] })),
      ]);
      setSchedules(schedulesRes.data);
      setCompanies(companiesRes.data);
      if (companiesRes.data.length > 0) {
        setSelectedCompanyId(String(companiesRes.data[0].id));
      }
    } catch (err) {
      console.error('Error fetching schedules/companies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) {
      alert('Vui lòng chọn hoặc thêm một doanh nghiệp trước.');
      return;
    }
    setCreating(true);
    try {
      await axios.post(`${API_BASE_URL}/api/schedules`, {
        companyId: Number(selectedCompanyId),
        cronExpression,
        invoiceType,
      });
      fetchData();
    } catch (err: any) {
      alert(`Thêm lịch hẹn giờ thất bại: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    try {
      await axios.patch(`${API_BASE_URL}/api/schedules/${id}`, {
        isActive: !currentActive,
      });
      setSchedules((prev) =>
        prev.map((sch) => (sch.id === id ? { ...sch, isActive: !currentActive } : sch))
      );
    } catch (err: any) {
      alert(`Thay đổi trạng thái thất bại: ${err.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa lịch hẹn giờ này?')) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/schedules/${id}`);
      setSchedules((prev) => prev.filter((sch) => sch.id !== id));
    } catch (err: any) {
      alert(`Xóa lịch hẹn giờ thất bại: ${err.message}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Create Schedule Form Card */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
        <h2 className="text-lg font-semibold text-indigo-400 flex items-center">
          <Calendar className="w-5 h-5 mr-2" /> Thiết Lập Lịch Tự Động
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Doanh Nghiệp</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            >
              {companies.length === 0 ? (
                <option value="">Chưa có MST doanh nghiệp nào</option>
              ) : (
                companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.taxCode})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Cấu hình Cron (Cron Expression)</label>
            <input
              type="text"
              required
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              placeholder="e.g. 0 9 * * *"
            />
            <span className="block text-xxs text-slate-500 mt-1">
              Định dạng 5 ký tự (phút giờ ngày tháng thứ). &quot;0 9 * * *&quot; nghĩa là 9:00 sáng mỗi ngày.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Loại Hoá Đơn Tra Cứu</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setInvoiceType('SELL')}
                className={`py-2 px-4 rounded-xl border text-sm font-medium transition ${
                  invoiceType === 'SELL'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                Bán ra
              </button>
              <button
                type="button"
                onClick={() => setInvoiceType('BUY')}
                className={`py-2 px-4 rounded-xl border text-sm font-medium transition ${
                  invoiceType === 'BUY'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                Mua vào
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>Thêm Lịch Mới</span>
          </button>
        </form>
      </div>

      {/* Schedules List Card */}
      <div className="lg:col-span-2 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col">
        <h2 className="text-lg font-semibold text-indigo-400 flex items-center mb-4">
          <Calendar className="w-5 h-5 mr-2" /> Danh Sách Lịch Tải Định Kỳ ({schedules.length})
        </h2>
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-800 text-slate-400 font-semibold uppercase text-xs">
              <tr>
                <th className="p-3">Doanh nghiệp (MST)</th>
                <th className="p-3">Chu kỳ (Cron)</th>
                <th className="p-3">Loại HĐ</th>
                <th className="p-3">Lần chạy cuối</th>
                <th className="p-3 text-center">Trạng thái</th>
                <th className="p-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-slate-350">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Đang tải danh sách lịch biểu...
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Chưa thiết lập lịch tải tự động nào.
                  </td>
                </tr>
              ) : (
                schedules.map((sch) => (
                  <tr key={sch.id} className="hover:bg-slate-900/30 transition-all border-b border-slate-800/30">
                    <td className="p-3 font-medium">
                      <div>{sch.company?.name || 'Doanh nghiệp'}</div>
                      <div className="text-xs text-slate-500">{sch.company?.taxCode || ''}</div>
                    </td>
                    <td className="p-3 font-mono text-cyan-400">{sch.cronExpression}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                          sch.invoiceType === 'SELL'
                            ? 'bg-indigo-900/50 text-indigo-300'
                            : 'bg-amber-900/50 text-amber-300'
                        }`}
                      >
                        {sch.invoiceType === 'SELL' ? 'Bán ra' : 'Mua vào'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">
                      {sch.lastRun ? new Date(sch.lastRun).toLocaleString('vi-VN') : 'Chưa chạy'}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleActive(sch.id, sch.isActive)}
                        className="transition text-slate-400 hover:text-white"
                        title={sch.isActive ? 'Nhấp để Tạm dừng' : 'Nhấp để Kích hoạt'}
                      >
                        {sch.isActive ? (
                          <ToggleRight className="w-8 h-8 text-indigo-500 cursor-pointer" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-slate-650 cursor-pointer" />
                        )}
                      </button>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDelete(sch.id)}
                        className="text-red-400 hover:text-red-300 p-1.5 hover:bg-slate-850 rounded-lg transition"
                        title="Xóa lịch này"
                      >
                        <Trash2 className="w-4 h-4 cursor-pointer" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
