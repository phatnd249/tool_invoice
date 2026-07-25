import { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Plus, Trash2, ToggleRight, ToggleLeft, Building2, Check, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
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

const REPEAT_OPTIONS = [
  { value: 'weekly' as const, label: 'Hàng tuần' },
  { value: 'monthly' as const, label: 'Hàng tháng' },
  { value: 'quarterly' as const, label: 'Hàng quý' },
  { value: 'once' as const, label: 'Một lần' },
  { value: 'custom' as const, label: 'Tuỳ chỉnh' },
];

const INVOICE_TYPE_OPTIONS = [
  { value: 'SELL', label: 'Bán ra' },
  { value: 'BUY', label: 'Mua vào' },
  { value: 'BOTH', label: 'Cả hai' },
];

export default function SchedulePanel() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [scheduleName, setScheduleName] = useState('');
  const [invoiceType, setInvoiceType] = useState<'BUY' | 'SELL' | 'BOTH'>('SELL');
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

  // Company selection modal
  const [companyModalSchedule, setCompanyModalSchedule] = useState<Schedule | null>(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<number[]>([]);
  const [savingCompanies, setSavingCompanies] = useState(false);
  const [companySearch, setCompanySearch] = useState('');

  const hour = Math.max(0, Math.min(23, scheduleHour));
  const minute = Math.max(0, Math.min(59, scheduleMinute));
  const day = Math.max(1, Math.min(28, monthDay));

  const cronExpression = (() => {
    switch (repeatMode) {
      case 'weekly': return `${minute} ${hour} * * ${weekday}`;
      case 'monthly': return `${minute} ${hour} ${day} * *`;
      case 'quarterly': return `${minute} ${hour} ${day} 1,4,7,10 *`;
      case 'custom': return customCron;
      default: return '';
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

  useEffect(() => { fetchData(); }, []);

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
      toast.success('Thêm lịch mới thành công!');
      setScheduleName('');
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    try {
      const res = await axios.patch(`${API_BASE_URL}/api/schedules/${id}`, { isActive: !currentActive });
      setSchedules(prev => prev.map(sch => (sch.id === id ? res.data : sch)));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/schedules/${id}`);
      toast.success('Đã xóa lịch');
      setSchedules(prev => prev.filter(sch => sch.id !== id));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openCompanyModal = (schedule: Schedule) => {
    setCompanyModalSchedule(schedule);
    setSelectedCompanyIds(schedule.companies.map(sc => sc.companyId));
    setCompanySearch('');
  };

  const toggleCompanySelection = (id: number) => {
    setSelectedCompanyIds(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const filteredCompanies = companies.filter(c =>
    !companySearch ||
    c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
    c.taxCode.toLowerCase().includes(companySearch.toLowerCase())
  );

  const saveCompanies = async () => {
    if (!companyModalSchedule) return;
    setSavingCompanies(true);
    try {
      const res = await axios.put(
        `${API_BASE_URL}/api/schedules/${companyModalSchedule.id}/companies`,
        { companyIds: selectedCompanyIds }
      );
      setSchedules(prev => prev.map(sch => (sch.id === companyModalSchedule.id ? res.data : sch)));
      toast.success('Cập nhật doanh nghiệp thành công!');
      setCompanyModalSchedule(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message);
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
      {/* Create Form */}
      <Card className="w-full xl:w-[420px] shrink-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Thiết Lập Lịch Tự Động
          </CardTitle>
          <CardDescription>Tạo lịch tải hóa đơn định kỳ của hệ thống</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sch-name">Tên lịch (tuỳ chọn)</Label>
              <Input id="sch-name" type="text" value={scheduleName} onChange={e => setScheduleName(e.target.value)} placeholder="VD: Lịch cuối tháng" />
            </div>

            <div className="space-y-3">
              <Label>Chu Kỳ Tự Động Tải</Label>
              <div className="grid grid-cols-5 gap-2">
                {REPEAT_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={repeatMode === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRepeatMode(opt.value)}
                    className="text-xs"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              {repeatMode !== 'custom' && repeatMode !== 'once' && (
                <div className="bg-muted/30 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-12 shrink-0">Giờ</span>
                    <Select value={String(scheduleHour)} onValueChange={v => setScheduleHour(Number(v))}>
                      <SelectTrigger className="w-20">
                        <SelectValue placeholder="Giờ" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">:</span>
                    <Select value={String(scheduleMinute)} onValueChange={v => setScheduleMinute(Number(v))}>
                      <SelectTrigger className="w-20">
                        <SelectValue placeholder="Phút" />
                      </SelectTrigger>
                      <SelectContent>
                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                          <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">(24h)</span>
                  </div>

                  {repeatMode === 'weekly' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12 shrink-0">Thứ</span>
                      <div className="flex gap-1">
                        {WEEKDAYS.map(w => (
                          <Button
                            key={w.value}
                            type="button"
                            variant={weekday === w.value ? 'default' : 'outline'}
                            size="sm"
                            className="w-9 h-9 p-0"
                            onClick={() => setWeekday(w.value)}
                          >
                            {w.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(repeatMode === 'monthly' || repeatMode === 'quarterly') && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12 shrink-0">Ngày</span>
                      <Input
                        type="number"
                        min={1}
                        max={28}
                        value={monthDay}
                        onChange={e => setMonthDay(Number(e.target.value))}
                        className="w-20 text-center"
                      />
                      <span className="text-xs text-muted-foreground">hàng tháng</span>
                    </div>
                  )}
                </div>
              )}

              {repeatMode === 'once' && (
                <div className="bg-muted/30 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">Thời điểm</span>
                    <Input
                      type="datetime-local"
                      value={onceDatetime}
                      onChange={e => setOnceDatetime(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                    <input type="checkbox" checked={showDateRange} onChange={e => setShowDateRange(e.target.checked)} className="rounded" />
                    Giới hạn thời gian tải
                  </label>
                  {showDateRange && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Tải dữ liệu trong</span>
                      <Input type="number" min={1} max={365} value={dateRangeDays} onChange={e => setDateRangeDays(Number(e.target.value))} className="w-20 text-center" />
                      <span className="text-xs text-muted-foreground">ngày qua</span>
                    </div>
                  )}
                </div>
              )}

              {repeatMode === 'custom' && (
                <div className="space-y-3">
                  <Input type="text" value={customCron} onChange={e => setCustomCron(e.target.value)} className="font-mono" placeholder="0 9 * * *" />
                  <p className="text-xs text-muted-foreground">
                    Định dạng: phút giờ ngày tháng thứ.{' '}
                    <a href="https://crontab.guru" target="_blank" rel="noopener noreferrer" className="text-primary underline">Tham khảo crontab.guru</a>
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                    <input type="checkbox" checked={showDateRange} onChange={e => setShowDateRange(e.target.checked)} className="rounded" />
                    Giới hạn thời gian tải
                  </label>
                  {showDateRange && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Tải dữ liệu trong</span>
                      <Input type="number" min={1} max={365} value={dateRangeDays} onChange={e => setDateRangeDays(Number(e.target.value))} className="w-20 text-center" />
                      <span className="text-xs text-muted-foreground">ngày qua</span>
                    </div>
                  )}
                </div>
              )}

              {repeatMode !== 'once' && (
                <details className="text-xs text-muted-foreground group">
                  <summary className="cursor-pointer hover:text-foreground transition">Xem cron expression</summary>
                  <div className="mt-1 bg-muted/50 rounded-lg px-3 py-2 font-mono text-primary">{
                    
                    cronExpression}</div>
                </details>
              )}
            </div>

            <div className="space-y-2">
              <Label>Loại hoá đơn</Label>
              <div className="grid grid-cols-3 gap-2">
                {INVOICE_TYPE_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={invoiceType === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInvoiceType(opt.value as any)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={creating} className="w-full">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-5 w-5" />}
              Thêm Lịch Mới
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Schedules List */}
      <Card className="flex-1 min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Danh Sách Lịch Tải Định Kỳ ({schedules.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên lịch</TableHead>
                  <TableHead>Doanh nghiệp</TableHead>
                  <TableHead>Chu kỳ</TableHead>
                  <TableHead>Loại HĐ</TableHead>
                  <TableHead>Lần chạy cuối</TableHead>
                  <TableHead className="text-center">Trạng thái</TableHead>
                  <TableHead className="text-center">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Đang tải...</TableCell>
                  </TableRow>
                ) : schedules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Chưa thiết lập lịch tải tự động nào.</TableCell>
                  </TableRow>
                ) : (
                  schedules.map(sch => (
                    <TableRow key={sch.id}>
                      <TableCell className="font-medium">
                        {sch.name || <span className="text-muted-foreground italic">—</span>}
                      </TableCell>
                      <TableCell>
                        <Button variant="link" size="sm" className="h-auto p-0 gap-1" onClick={() => openCompanyModal(sch)}>
                          <Building2 className="h-3 w-3" />
                          {sch.companies.length === 0 ? (
                            <span className="text-primary">Chọn doanh nghiệp</span>
                          ) : (
                            <span>{sch.companies.length} doanh nghiệp</span>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-xs">{formatRepeatMode(sch.repeatMode)}</div>
                        {sch.repeatMode !== 'once' ? (
                          <div className="text-xs font-mono text-primary mt-0.5">{sch.cronExpression}</div>
                        ) : sch.scheduledAt ? (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {new Date(sch.scheduledAt).toLocaleString('vi-VN')}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={sch.invoiceType === 'SELL' ? 'default' : sch.invoiceType === 'BUY' ? 'secondary' : 'outline'}>
                          {formatInvoiceType(sch.invoiceType)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {sch.lastRun ? new Date(sch.lastRun).toLocaleString('vi-VN') : 'Chưa chạy'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" onClick={() => handleToggleActive(sch.id, sch.isActive)}>
                          {sch.isActive ? <ToggleRight className="h-6 w-6 text-primary" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                        </Button>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(sch.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Company Selection Dialog */}
      <Dialog open={!!companyModalSchedule} onOpenChange={(open) => !open && setCompanyModalSchedule(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Chọn Doanh Nghiệp
            </DialogTitle>
            {companyModalSchedule && (
              <DialogDescription>
                Lịch: <strong>{companyModalSchedule.name || '(không tên)'}</strong>
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-lg">
              Đã chọn: <strong className="text-primary">{selectedCompanyIds.length}</strong> / {companies.length}
            </span>
          </div>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={companySearch}
              onChange={e => setCompanySearch(e.target.value)}
              placeholder="Tìm doanh nghiệp..."
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-1">
            {filteredCompanies.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4 text-center">
                {companySearch ? 'Không tìm thấy.' : 'Chưa có doanh nghiệp nào.'}
              </p>
            ) : (
              filteredCompanies.map(c => {
                const isSelected = selectedCompanyIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={() => toggleCompanySelection(c.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition text-sm ${
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCompanySelection(c.id)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">MST: {c.taxCode}</div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyModalSchedule(null)}>Hủy</Button>
            <Button onClick={saveCompanies} disabled={savingCompanies}>
              {savingCompanies ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
