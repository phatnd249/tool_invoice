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

const WEEKDAYS = [
  { value: 0, label: 'CN' },
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
];

export default function SchedulePanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [invoiceType, setInvoiceType] = useState<'BUY' | 'SELL'>('SELL');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Schedule timing state
  const [repeatMode, setRepeatMode] = useState<'weekly' | 'monthly' | 'quarterly' | 'custom'>('weekly');
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [weekday, setWeekday] = useState(1);      // 0=CN, 1=T2... (for weekly)
  const [monthDay, setMonthDay] = useState(1);    // 1-28 (for monthly/quarterly)
  const [customCron, setCustomCron] = useState('0 9 * * *');
  const [dateRangeDays, setDateRangeDays] = useState(7);
  const [showDateRange, setShowDateRange] = useState(false);

  // Validate hour/minute
  const hour = Math.max(0, Math.min(23, scheduleHour));
  const minute = Math.max(0, Math.min(59, scheduleMinute));
  const day = Math.max(1, Math.min(28, monthDay));

  // Compute cron from preset
  const cronExpression = (() => {
    switch (repeatMode) {
      case 'weekly':
        return `${minute} ${hour} * * ${weekday}`;
      case 'monthly':
        return `${minute} ${hour} ${day} * *`;
      case 'quarterly':
        return `${minute} ${hour} ${day} 1,4,7,10 *`;
      case 'custom':
        return customCron;
    }
  })();

  const fetchData = async () => {
    setLoading(true);
    try {
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
        repeatMode,
        dateRangeDays: repeatMode === 'custom' && showDateRange ? dateRangeDays : null,
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
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xl space-y-6">
        <h2 className="text-lg font-semibold text-accent-default flex items-center">
          <Calendar className="w-5 h-5 mr-2" /> Thiết Lập Lịch Tự Động
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">Doanh Nghiệp</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
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

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-text-secondary">Chu Kỳ Tự Động Tải</label>

            {/* Repeat mode presets */}
            <div className="grid grid-cols-4 gap-2">
              {([
                { value: 'weekly' as const, label: 'Hàng tuần' },
                { value: 'monthly' as const, label: 'Hàng tháng' },
                { value: 'quarterly' as const, label: 'Hàng quý' },
                { value: 'custom' as const, label: 'Tuỳ chỉnh' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRepeatMode(opt.value)}
                  className={`py-2 px-1 rounded-xl border text-xs font-medium transition cursor-pointer ${
                    repeatMode === opt.value
                      ? 'bg-accent-default/20 border-accent-default text-accent-default'
                      : 'bg-bg-primary border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Time + day/weekday pickers (hidden for custom) */}
            {repeatMode !== 'custom' && (
              <div className="space-y-3 bg-bg-primary/30 rounded-xl p-3">
                {/* Time inputs */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-12 shrink-0">Giờ</span>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={scheduleHour}
                    onChange={(e) => setScheduleHour(Number(e.target.value))}
                    className="w-16 bg-bg-primary border border-border rounded-lg px-2 py-2 text-sm text-text-primary text-center focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-text-muted text-sm">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    step={15}
                    value={scheduleMinute}
                    onChange={(e) => setScheduleMinute(Number(e.target.value))}
                    className="w-16 bg-bg-primary border border-border rounded-lg px-2 py-2 text-sm text-text-primary text-center focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-text-muted">
                    (giờ:phút, 24h)
                  </span>
                </div>

                {/* Weekday picker (weekly only) */}
                {repeatMode === 'weekly' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-12 shrink-0">Thứ</span>
                    <div className="flex gap-1">
                      {WEEKDAYS.map(w => (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => setWeekday(w.value)}
                          className={`w-9 h-9 rounded-lg text-xs font-medium transition cursor-pointer ${
                            weekday === w.value
                              ? 'bg-accent-default text-white'
                              : 'bg-bg-primary text-text-secondary hover:text-text-primary border border-border'
                          }`}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Month day picker (monthly + quarterly) */}
                {(repeatMode === 'monthly' || repeatMode === 'quarterly') && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary w-12 shrink-0">Ngày</span>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={monthDay}
                      onChange={(e) => setMonthDay(Number(e.target.value))}
                      className="w-20 bg-bg-primary border border-border rounded-lg px-2 py-2 text-sm text-text-primary text-center focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-text-muted">hàng tháng</span>
                  </div>
                )}
              </div>
            )}

            {/* Custom cron input */}
            {repeatMode === 'custom' && (
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent font-mono"
                    placeholder="0 9 * * *"
                  />
                  <span className="block text-xxs text-text-muted mt-1">
                    Định dạng: phút giờ ngày tháng thứ.{' '}
                    <a href="https://crontab.guru" target="_blank" rel="noopener noreferrer" className="text-accent-default hover:text-accent-default underline">
                      Tham khảo crontab.guru
                    </a>
                  </span>
                </div>

                {/* Date range toggle for custom mode */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDateRange}
                    onChange={(e) => setShowDateRange(e.target.checked)}
                    className="w-4 h-4 rounded bg-bg-primary border-border text-accent-default focus:ring-accent-default"
                  />
                  <span className="text-xs text-text-secondary">Giới hạn thời gian tải</span>
                </label>
                {showDateRange && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary">Tải dữ liệu trong</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={dateRangeDays}
                      onChange={(e) => setDateRangeDays(Number(e.target.value))}
                      className="w-20 bg-bg-primary border border-border rounded-lg px-2 py-2 text-sm text-text-primary text-center focus:outline-none focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-text-muted">ngày qua</span>
                  </div>
                )}
              </div>
            )}

            {/* Computed cron preview (hidden by default, shown only on hover/focus) */}
            <details className="text-xxs text-text-muted group">
              <summary className="cursor-pointer hover:text-text-secondary transition">Xem cron expression</summary>
              <div className="mt-1 bg-bg-primary/50 rounded-lg px-3 py-2 font-mono">
                <span className="text-log-cyan">{cronExpression}</span>
              </div>
            </details>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">Loại hoá đơn</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setInvoiceType('SELL')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                  invoiceType === 'SELL'
                    ? 'bg-accent-default/20 border-accent-default text-accent-default'
                    : 'bg-bg-primary border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                Bán ra
              </button>
              <button
                type="button"
                onClick={() => setInvoiceType('BUY')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                  invoiceType === 'BUY'
                    ? 'bg-accent-default/20 border-accent-default text-accent-default'
                    : 'bg-bg-primary border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                Mua vào
              </button>
              <button
                type="button"
                onClick={() => setInvoiceType('BOTH' as any)}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                  invoiceType === ('BOTH' as any)
                    ? 'bg-accent-default/20 border-accent-default text-accent-default'
                    : 'bg-bg-primary border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                Cả hai
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full bg-gradient-to-r from-accent-default to-accent-hover-default hover:from-accent-hover-default hover:to-accent-hover-default disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-accent-default/20 flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>Thêm Lịch Mới</span>
          </button>
        </form>
      </div>

      {/* Schedules List Card */}
      <div className="lg:col-span-2 bg-card p-6 rounded-2xl border border-border shadow-xl flex flex-col">
        <h2 className="text-lg font-semibold text-accent-default flex items-center mb-4">
          <Calendar className="w-5 h-5 mr-2" /> Danh Sách Lịch Tải Định Kỳ ({schedules.length})
        </h2>
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-bg-primary/50 border-b border-border text-text-secondary font-semibold uppercase text-xs">
              <tr>
                <th className="p-3">Doanh nghiệp (MST)</th>
                <th className="p-3">Chu kỳ (Cron)</th>
                <th className="p-3">Loại HĐ</th>
                <th className="p-3">Lần chạy cuối</th>
                <th className="p-3 text-center">Trạng thái</th>
                <th className="p-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-text-muted">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-muted">
                    Đang tải danh sách lịch biểu...
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-muted">
                    Chưa thiết lập lịch tải tự động nào.
                  </td>
                </tr>
              ) : (
                schedules.map((sch) => (
                  <tr key={sch.id} className="hover:bg-bg-primary/30 transition-all border-b border-border/30">
                    <td className="p-3 font-medium">
                      <div>{sch.company?.name || 'Doanh nghiệp'}</div>
                      <div className="text-xs text-text-muted">{sch.company?.taxCode || ''}</div>
                    </td>
                    <td className="p-3 font-mono text-log-cyan">{sch.cronExpression}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                          sch.invoiceType === 'SELL'
                            ? 'bg-accent-light-default text-accent-default'
                            : 'bg-amber-900/50 text-amber-300'
                        }`}
                      >
                        {sch.invoiceType === 'SELL' ? 'Bán ra' : 'Mua vào'}
                      </span>
                    </td>
                    <td className="p-3 text-text-secondary">
                      {sch.lastRun ? new Date(sch.lastRun).toLocaleString('vi-VN') : 'Chưa chạy'}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleToggleActive(sch.id, sch.isActive)}
                        className="transition text-text-secondary hover:text-text-primary"
                        title={sch.isActive ? 'Nhấp để Tạm dừng' : 'Nhấp để Kích hoạt'}
                      >
                        {sch.isActive ? (
                          <ToggleRight className="w-8 h-8 text-accent-default cursor-pointer" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-text-muted cursor-pointer" />
                        )}
                      </button>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleDelete(sch.id)}
                        className="text-red-400 hover:text-red-300 p-1.5 hover:bg-bg-tertiary rounded-lg transition"
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
