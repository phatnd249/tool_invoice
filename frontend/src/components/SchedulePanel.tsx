import { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Plus, Trash2, ToggleLeft, ToggleRight, Building2, X, Check } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface Company {
  id: number;
  taxCode: string;
  name: string;
}

interface ScheduleCompany {
  companyId: number;
  company: Company;
}

interface Schedule {
  id: number;
  name: string | null;
  cronExpression: string;
  repeatMode: string;
  scheduledAt: string | null;
  invoiceType: string;
  isActive: boolean;
  lastRun?: string | null;
  companies: ScheduleCompany[];
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
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [scheduleName, setScheduleName] = useState('');
  const [invoiceType, setInvoiceType] = useState<'BUY' | 'SELL' | 'BOTH'>('SELL');

  // Schedule timing state
  const [repeatMode, setRepeatMode] = useState<'weekly' | 'monthly' | 'quarterly' | 'custom' | 'once'>('weekly');
  const [scheduleHour, setScheduleHour] = useState(9);
  const [scheduleMinute, setScheduleMinute] = useState(0);
  const [weekday, setWeekday] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const [customCron, setCustomCron] = useState('0 9 * * *');
  const [onceDatetime, setOnceDatetime] = useState(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    return now.toISOString().slice(0, 16);
  });
  const [dateRangeDays, setDateRangeDays] = useState(7);
  const [showDateRange, setShowDateRange] = useState(false);

  // Modal state
  const [companyModalSchedule, setCompanyModalSchedule] = useState<Schedule | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<number[]>([]);
  const [savingCompanies, setSavingCompanies] = useState(false);

  const hour = Math.max(0, Math.min(23, scheduleHour));
  const minute = Math.max(0, Math.min(59, scheduleMinute));
  const day = Math.max(1, Math.min(28, monthDay));

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
      default:
        return '';
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
    setCreating(true);
    try {
      await axios.post(`${API_BASE_URL}/api/schedules`, {
        name: scheduleName.trim() || undefined,
        cronExpression,
        scheduledAt: repeatMode === 'once' ? new Date(onceDatetime).toISOString() : undefined,
        invoiceType,
        repeatMode,
        dateRangeDays: (repeatMode === 'custom' || repeatMode === 'once') && showDateRange ? dateRangeDays : null,
      });
      setScheduleName('');
      fetchData();
    } catch (err: any) {
      alert(`Thêm lịch thất bại: ${err.response?.data?.error || err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    try {
      const res = await axios.patch(`${API_BASE_URL}/api/schedules/${id}`, {
        isActive: !currentActive,
      });
      setSchedules((prev) =>
        prev.map((sch) => (sch.id === id ? res.data : sch))
      );
    } catch (err: any) {
      alert(`Thay đổi trạng thái thất bại: ${err.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa lịch này?')) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/schedules/${id}`);
      setSchedules((prev) => prev.filter((sch) => sch.id !== id));
    } catch (err: any) {
      alert(`Xóa lịch thất bại: ${err.message}`);
    }
  };

  // --- Company selection modal ---
  const openCompanyModal = (schedule: Schedule) => {
    setCompanyModalSchedule(schedule);
    setSelectedCompanyIds(schedule.companies.map(sc => sc.companyId));
  };

  const toggleCompanySelection = (id: number) => {
    setSelectedCompanyIds(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const saveCompanies = async () => {
    if (!companyModalSchedule) return;
    setSavingCompanies(true);
    try {
      const res = await axios.put(
        `${API_BASE_URL}/api/schedules/${companyModalSchedule.id}/companies`,
        { companyIds: selectedCompanyIds }
      );
      setSchedules((prev) =>
        prev.map((sch) => (sch.id === companyModalSchedule.id ? res.data : sch))
      );
      setCompanyModalSchedule(null);
    } catch (err: any) {
      alert(`Cập nhật doanh nghiệp thất bại: ${err.response?.data?.error || err.message}`);
    } finally {
      setSavingCompanies(false);
    }
  };

  const formatInvoiceType = (type: string) => {
    switch (type) {
      case 'SELL': return 'Bán ra';
      case 'BUY': return 'Mua vào';
      case 'BOTH': return 'Cả hai';
      default: return type;
    }
  };

  const formatRepeatMode = (mode: string) => {
    switch (mode) {
      case 'daily': return 'Hàng ngày';
      case 'weekly': return 'Hàng tuần';
      case 'monthly': return 'Hàng tháng';
      case 'quarterly': return 'Hàng quý';
      case 'custom': return 'Tuỳ chỉnh';
      case 'once': return 'Một lần';
      default: return mode;
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-8">
      {/* Create Schedule Form Card */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xl space-y-6 w-full xl:w-[420px] shrink-0">
        <h2 className="text-lg font-semibold text-accent-default flex items-center">
          <Calendar className="w-5 h-5 mr-2" /> Thiết Lập Lịch Tự Động
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          {/* Schedule name */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">Tên lịch (tuỳ chọn)</label>
            <input
              type="text"
              value={scheduleName}
              onChange={(e) => setScheduleName(e.target.value)}
              placeholder="VD: Lịch cuối tháng"
              className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-text-secondary">Chu Kỳ Tự Động Tải</label>

            {/* Repeat mode presets */}
            <div className="grid grid-cols-5 gap-2">
              {([
                { value: 'weekly' as const, label: 'Hàng tuần' },
                { value: 'monthly' as const, label: 'Hàng tháng' },
                { value: 'quarterly' as const, label: 'Hàng quý' },
                { value: 'once' as const, label: 'Một lần' },
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

            {/* Time + day/weekday pickers (hidden for custom & once) */}
            {repeatMode !== 'custom' && repeatMode !== 'once' && (
              <div className="space-y-3 bg-bg-primary/30 rounded-xl p-3">
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
                  <span className="text-xs text-text-muted">(giờ:phút, 24h)</span>
                </div>

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

            {/* Once mode: datetime picker */}
            {repeatMode === 'once' && (
              <div className="bg-bg-primary/30 rounded-xl p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary w-16 shrink-0">Thời điểm</span>
                  <input
                    type="datetime-local"
                    value={onceDatetime}
                    onChange={(e) => setOnceDatetime(e.target.value)}
                    className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
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

            {repeatMode !== 'once' && (
              <details className="text-xxs text-text-muted group">
                <summary className="cursor-pointer hover:text-text-secondary transition">Xem cron expression</summary>
                <div className="mt-1 bg-bg-primary/50 rounded-lg px-3 py-2 font-mono">
                  <span className="text-log-cyan">{cronExpression}</span>
                </div>
              </details>
            )}
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
                onClick={() => setInvoiceType('BOTH')}
                className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                  invoiceType === 'BOTH'
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
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xl flex flex-col flex-1 min-w-0">
        <h2 className="text-lg font-semibold text-accent-default flex items-center mb-4">
          <Calendar className="w-5 h-5 mr-2" /> Danh Sách Lịch Tải Định Kỳ ({schedules.length})
        </h2>
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-bg-primary/50 border-b border-border text-text-secondary font-semibold uppercase text-xs">
              <tr>
                <th className="p-3">Tên lịch</th>
                <th className="p-3">Doanh nghiệp</th>
                <th className="p-3">Chu kỳ</th>
                <th className="p-3">Loại HĐ</th>
                <th className="p-3">Lần chạy cuối</th>
                <th className="p-3 text-center">Trạng thái</th>
                <th className="p-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 text-text-muted">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-text-muted">
                    Đang tải danh sách lịch biểu...
                  </td>
                </tr>
              ) : schedules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-text-muted">
                    Chưa thiết lập lịch tải tự động nào.
                  </td>
                </tr>
              ) : (
                schedules.map((sch) => (
                  <tr key={sch.id} className="hover:bg-bg-primary/30 transition-all border-b border-border/30">
                    <td className="p-3 font-medium">
                      {sch.name || <span className="text-text-muted italic">—</span>}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => openCompanyModal(sch)}
                        className="flex items-center gap-1.5 group cursor-pointer"
                        title="Nhấp để xem/chọn doanh nghiệp"
                      >
                        <Building2 className="w-4 h-4 text-text-muted" />
                        {sch.companies.length === 0 ? (
                          <span className="text-xs text-accent-default group-hover:underline">
                            Chọn doanh nghiệp
                          </span>
                        ) : (
                          <span className="text-sm font-medium group-hover:text-accent-default transition">
                            {sch.companies.length} doanh nghiệp
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{formatRepeatMode(sch.repeatMode)}</div>
                      {sch.repeatMode !== 'once' ? (
                        <div className="text-xs font-mono text-log-cyan mt-0.5">{sch.cronExpression}</div>
                      ) : sch.scheduledAt ? (
                        <div className="text-xs text-text-muted mt-0.5">
                          {new Date(sch.scheduledAt).toLocaleString('vi-VN')}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${
                          sch.invoiceType === 'SELL'
                            ? 'bg-accent-light-default text-accent-default'
                            : sch.invoiceType === 'BUY'
                            ? 'bg-amber-900/50 text-amber-300'
                            : 'bg-emerald-900/50 text-emerald-300'
                        }`}
                      >
                        {formatInvoiceType(sch.invoiceType)}
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

      {/* Company Selection Modal */}
      {companyModalSchedule && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 bg-bg-secondary/80 border-b border-border">
              <h2 className="text-md font-bold text-text-primary flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-accent-default" />
                <span>Chọn Doanh Nghiệp</span>
              </h2>
              <button
                onClick={() => setCompanyModalSchedule(null)}
                className="text-text-secondary hover:text-text-primary p-1 hover:bg-bg-tertiary rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-text-secondary">
                  Lịch: <strong>{companyModalSchedule.name || '(không tên)'}</strong>
                </p>
                <span className="text-xs text-text-muted bg-bg-tertiary px-2.5 py-1 rounded-lg">
                  Đã chọn: <strong className="text-accent-default">{selectedCompanyIds.length}</strong> / {companies.length}
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1">
                {companies.length === 0 ? (
                  <p className="text-xs text-text-muted p-2">Chưa có doanh nghiệp nào.</p>
                ) : (
                  companies.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition text-sm ${
                        selectedCompanyIds.includes(c.id)
                          ? 'bg-accent-default/10 text-accent-default'
                          : 'hover:bg-bg-tertiary text-text-primary'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCompanyIds.includes(c.id)}
                        onChange={() => toggleCompanySelection(c.id)}
                        className="w-4 h-4 rounded bg-bg-primary border-border text-accent-default focus:ring-accent-default"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-text-muted">MST: {c.taxCode}</div>
                      </div>
                      {selectedCompanyIds.includes(c.id) && (
                        <Check className="w-4 h-4 shrink-0 text-accent-default" />
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-bg-secondary/40 border-t border-border">
              <button
                onClick={() => setCompanyModalSchedule(null)}
                className="bg-bg-tertiary hover:bg-bg-tertiary text-text-secondary px-4 py-2 rounded-xl transition duration-150 cursor-pointer text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={saveCompanies}
                disabled={savingCompanies}
                className="bg-gradient-to-r from-accent-default to-accent-hover-default hover:from-accent-hover-default hover:to-accent-hover-default disabled:opacity-50 text-white px-4 py-2 rounded-xl transition duration-150 cursor-pointer text-xs font-semibold shadow-lg shadow-accent-default/10 flex items-center gap-1.5"
              >
                {savingCompanies ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Lưu</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
