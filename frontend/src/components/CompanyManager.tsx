import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Building2,
  Plus,
  Trash2,
  RefreshCw,
  Lock,
  Edit2,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Search,
  CloudDownload,
  Loader2,
} from 'lucide-react';
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
  lookupPassword: string;
  token?: string | null;
  tokenExpiredAt?: string | null;
  loginMode: 'AUTO' | 'MANUAL';
  downloadCount?: number;
  createdAt: string;
  address?: string | null;
  taxAddress?: string | null;
  representative?: string | null;
  phone?: string | null;
  activeDate?: string | null;
  managedBy?: string | null;
  companyType?: string | null;
  status?: string | null;
  lastSyncedAt?: string | null;
}

export default function CompanyManager() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  // Add Company
  const [newTaxCode, setNewTaxCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newLoginMode, setNewLoginMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [newCaptchaSvg, setNewCaptchaSvg] = useState('');
  const [newCaptchaKey, setNewCaptchaKey] = useState('');
  const [newCaptchaValue, setNewCaptchaValue] = useState('');
  const [newCaptchaLoading, setNewCaptchaLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [refreshingMap, setRefreshingMap] = useState<Record<number, boolean>>({});
  const [syncingMap, setSyncingMap] = useState<Record<number, boolean>>({});
  const [syncConfirmCompany, setSyncConfirmCompany] = useState<{ id: number; name: string; taxCode: string } | null>(null);

  // Edit
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editLoginMode, setEditLoginMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Re-login captcha
  const [reloginCompany, setReloginCompany] = useState<Company | null>(null);
  const [reloginCaptchaSvg, setReloginCaptchaSvg] = useState('');
  const [reloginCaptchaKey, setReloginCaptchaKey] = useState('');
  const [reloginCaptchaValue, setReloginCaptchaValue] = useState('');
  const [reloginCaptchaLoading, setReloginCaptchaLoading] = useState(false);
  const [reloginLoading, setReloginLoading] = useState(false);
  const [reloginError, setReloginError] = useState('');

  // Filters
  const [searchText, setSearchText] = useState('');
  const [filterLoginMode, setFilterLoginMode] = useState<'ALL' | 'AUTO' | 'MANUAL'>('ALL');
  const [filterTokenStatus, setFilterTokenStatus] = useState<'ALL' | 'VALID' | 'EXPIRED'>('ALL');

  const fetchCompanies = async () => {
    setCompaniesLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/companies`);
      setCompanies(res.data);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    } finally {
      setCompaniesLoading(false);
    }
  };

  const fetchNewCaptcha = async () => {
    setNewCaptchaLoading(true);
    setNewCaptchaValue('');
    try {
      const res = await axios.get(`${API_BASE_URL}/api/auth/captcha`);
      if (res.data?.key && res.data?.content) {
        setNewCaptchaKey(res.data.key);
        setNewCaptchaSvg(res.data.content);
      }
    } catch (err) {
      console.error('Failed to fetch captcha:', err);
    } finally {
      setNewCaptchaLoading(false);
    }
  };

  const fetchReloginCaptcha = async () => {
    setReloginCaptchaLoading(true);
    setReloginCaptchaValue('');
    try {
      const res = await axios.get(`${API_BASE_URL}/api/auth/captcha`);
      if (res.data?.key && res.data?.content) {
        setReloginCaptchaKey(res.data.key);
        setReloginCaptchaSvg(res.data.content);
      }
    } catch (err) {
      console.error('Failed to fetch captcha:', err);
    } finally {
      setReloginCaptchaLoading(false);
    }
  };

  useEffect(() => { fetchCompanies(); }, []);

  useEffect(() => {
    if (newLoginMode === 'MANUAL') fetchNewCaptcha();
  }, [newLoginMode]);

  const filteredCompanies = useMemo(() => {
    return companies.filter(c => {
      const keyword = searchText.toLowerCase().trim();
      if (keyword) {
        if (!c.taxCode.toLowerCase().includes(keyword) && !c.name.toLowerCase().includes(keyword)) return false;
      }
      if (filterLoginMode !== 'ALL' && c.loginMode !== filterLoginMode) return false;
      if (filterTokenStatus === 'VALID') {
        if (!c.tokenExpiredAt || new Date(c.tokenExpiredAt) < new Date()) return false;
      } else if (filterTokenStatus === 'EXPIRED') {
        if (!c.tokenExpiredAt || new Date(c.tokenExpiredAt) >= new Date()) return false;
      }
      return true;
    });
  }, [companies, searchText, filterLoginMode, filterTokenStatus]);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);
    setAddError('');
    setAddSuccess('');

    try {
      const payload: any = {
        taxCode: newTaxCode.trim(),
        name: newName.trim() || newTaxCode.trim(),
        lookupPassword: newPassword,
        loginMode: newLoginMode,
      };
      if (newLoginMode === 'MANUAL') {
        payload.ckey = newCaptchaKey;
        payload.cvalue = newCaptchaValue.trim();
      }

      const res = await axios.post(`${API_BASE_URL}/api/companies`, payload);
      toast.success('Thêm doanh nghiệp và xác thực thành công!');
      setNewTaxCode('');
      setNewName('');
      setNewPassword('');
      setNewLoginMode('AUTO');
      setNewCaptchaValue('');
      await fetchCompanies();
      setIsAddModalOpen(false);
      if (res.data?.id) {
        setSyncConfirmCompany({
          id: res.data.id,
          name: res.data.name || payload.taxCode,
          taxCode: payload.taxCode,
        });
      }
    } catch (err: any) {
      const details = err.response?.data?.details || err.response?.data?.error || err.message;
      setAddError(`Xác thực thất bại: ${details}`);
      if (newLoginMode === 'MANUAL') fetchNewCaptcha();
    } finally {
      setAddLoading(false);
    }
  };

  const handleAutoRefreshToken = async (id: number) => {
    setRefreshingMap(prev => ({ ...prev, [id]: true }));
    try {
      await axios.post(`${API_BASE_URL}/api/companies/${id}/refresh`);
      toast.success('Làm mới token thành công!');
      await fetchCompanies();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Làm mới token thất bại');
    } finally {
      setRefreshingMap(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleSyncInfo = async (id: number) => {
    setSyncingMap(prev => ({ ...prev, [id]: true }));
    try {
      await axios.put(`${API_BASE_URL}/api/companies/${id}/sync-info`);
      toast.success('Cập nhật thông tin thành công!');
      await fetchCompanies();
    } catch (err: any) {
      toast.error(err.response?.data?.details || err.response?.data?.error || err.message);
    } finally {
      setSyncingMap(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDeleteCompany = async (id: number, name: string) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/companies/${id}`);
      toast.success(`Đã xóa doanh nghiệp "${name}"`);
      await fetchCompanies();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Không thể xóa doanh nghiệp');
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setEditLoading(true);
    setEditError('');
    try {
      await axios.put(`${API_BASE_URL}/api/companies/${editingCompany.id}`, {
        name: editName.trim(),
        lookupPassword: editPassword,
        loginMode: editLoginMode,
      });
      toast.success('Cập nhật thành công!');
      setEditingCompany(null);
      await fetchCompanies();
    } catch (err: any) {
      setEditError(err.response?.data?.error || err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleReloginManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reloginCompany) return;
    setReloginLoading(true);
    setReloginError('');
    try {
      await axios.post(`${API_BASE_URL}/api/companies/${reloginCompany.id}/login-manual`, {
        ckey: reloginCaptchaKey,
        cvalue: reloginCaptchaValue.trim(),
      });
      toast.success('Đăng nhập lại thành công!');
      setReloginCompany(null);
      await fetchCompanies();
    } catch (err: any) {
      setReloginError(err.response?.data?.details || err.response?.data?.error || err.message);
      fetchReloginCaptcha();
    } finally {
      setReloginLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6" />
            <div>
              <CardTitle>
                Danh Sách Doanh Nghiệp ({filteredCompanies.length}/{companies.length})
              </CardTitle>
              <CardDescription>Quản lý danh sách doanh nghiệp đã kết nối với hệ thống</CardDescription>
            </div>
          </div>
          <Button
            onClick={() => { setIsAddModalOpen(true); setAddError(''); setAddSuccess(''); if (newLoginMode === 'MANUAL') fetchNewCaptcha(); }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Thêm Doanh Nghiệp
          </Button>
        </CardHeader>
        <CardContent>
          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Tìm theo MST hoặc tên..."
                className="pl-9 text-xs"
              />
            </div>
            <Select value={filterLoginMode} onValueChange={(v: any) => setFilterLoginMode(v)}>
              <SelectTrigger className="w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả chế độ</SelectItem>
                <SelectItem value="AUTO">Tự động</SelectItem>
                <SelectItem value="MANUAL">Thủ công</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTokenStatus} onValueChange={(v: any) => setFilterTokenStatus(v)}>
              <SelectTrigger className="w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả token</SelectItem>
                <SelectItem value="VALID">Còn hiệu lực</SelectItem>
                <SelectItem value="EXPIRED">Hết hiệu lực</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã Số Thuế</TableHead>
                  <TableHead>Tên Doanh Nghiệp</TableHead>
                  <TableHead className="max-w-[180px]">Địa chỉ</TableHead>
                  <TableHead>Chế Độ</TableHead>
                  <TableHead>Tình trạng</TableHead>
                  <TableHead className="text-right">Số Lần Tải</TableHead>
                  <TableHead>Ngày Tạo</TableHead>
                  <TableHead className="text-center">Thao Tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companiesLoading && companies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Đang tải danh sách...</TableCell>
                  </TableRow>
                ) : companies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Chưa có doanh nghiệp nào.</TableCell>
                  </TableRow>
                ) : filteredCompanies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Không tìm thấy doanh nghiệp phù hợp.</TableCell>
                  </TableRow>
                ) : (
                  filteredCompanies.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-semibold select-all">{c.taxCode}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={c.name}>{c.name}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground" title={c.address || c.taxAddress || ''}>
                        {c.address || c.taxAddress || <span className="italic">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.loginMode === 'AUTO' ? 'default' : 'secondary'}>
                          {c.loginMode === 'AUTO' ? 'Tự động' : 'Thủ công'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.status ? 'default' : 'outline'} className={c.status ? 'bg-green-500/10 text-green-600 border-green-300' : ''}>
                          {c.status || 'Chưa đồng bộ'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">{c.downloadCount || 0}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          {c.loginMode === 'AUTO' ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleAutoRefreshToken(c.id)} disabled={refreshingMap[c.id]} title="Gia hạn token">
                              <RefreshCw className={`h-3.5 w-3.5 ${refreshingMap[c.id] ? 'animate-spin' : ''}`} />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setReloginCompany(c); setReloginError(''); fetchReloginCaptcha(); }} title="Đăng nhập thủ công">
                              <Lock className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSyncInfo(c.id)} disabled={syncingMap[c.id]} title="Đồng bộ thông tin">
                            <CloudDownload className={`h-3.5 w-3.5 ${syncingMap[c.id] ? 'animate-pulse' : ''}`} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCompany(c); setEditName(c.name); setEditPassword(c.lookupPassword); setEditLoginMode(c.loginMode); setEditError(''); }} title="Sửa">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteCompany(c.id, c.name)} title="Xóa">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingCompany} onOpenChange={(open) => !open && setEditingCompany(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Chỉnh Sửa Doanh Nghiệp
            </DialogTitle>
            {editingCompany && (
              <DialogDescription>
                MST: <span className="font-mono font-semibold">{editingCompany.taxCode}</span>
              </DialogDescription>
            )}
          </DialogHeader>

          {editingCompany && (editingCompany.address || editingCompany.representative || editingCompany.phone) && (
            <div className="bg-muted/30 border rounded-lg p-4 space-y-1.5 text-xs">
              <p className="font-semibold text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Thông tin doanh nghiệp
                {editingCompany.lastSyncedAt && (
                  <span className="text-muted-foreground font-normal ml-auto">
                    Đồng bộ: {new Date(editingCompany.lastSyncedAt).toLocaleString('vi-VN')}
                  </span>
                )}
              </p>
              {editingCompany.address && <DetailRow label="Địa chỉ" value={editingCompany.address} />}
              {editingCompany.taxAddress && editingCompany.taxAddress !== editingCompany.address && <DetailRow label="Địa chỉ thuế" value={editingCompany.taxAddress} />}
              {editingCompany.representative && <DetailRow label="Đại diện" value={editingCompany.representative} />}
              {editingCompany.phone && <DetailRow label="Điện thoại" value={editingCompany.phone} />}
              {editingCompany.status && <DetailRow label="Tình trạng" value={editingCompany.status} />}
              {editingCompany.companyType && <DetailRow label="Loại hình" value={editingCompany.companyType} />}
              {editingCompany.activeDate && <DetailRow label="Ngày HĐ" value={editingCompany.activeDate} />}
              {editingCompany.managedBy && <DetailRow label="QL bởi" value={editingCompany.managedBy} />}
            </div>
          )}

          {editError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{editError}</span>
            </div>
          )}

          <form onSubmit={handleUpdateCompany} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Tên Gọi Nhớ</Label>
              <Input id="edit-name" type="text" required value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">Mật Khẩu Tra Cứu</Label>
              <Input id="edit-password" type="password" required value={editPassword} onChange={e => setEditPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Chế Độ Đăng Nhập</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant={editLoginMode === 'AUTO' ? 'default' : 'outline'} onClick={() => setEditLoginMode('AUTO')}>Tự động</Button>
                <Button type="button" variant={editLoginMode === 'MANUAL' ? 'default' : 'outline'} onClick={() => setEditLoginMode('MANUAL')}>Thủ công</Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingCompany(null)}>Hủy</Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Cập Nhật
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Re-login Manual Captcha Dialog */}
      <Dialog open={!!reloginCompany} onOpenChange={(open) => !open && setReloginCompany(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              Đăng Nhập Lại Doanh Nghiệp
            </DialogTitle>
            {reloginCompany && (
              <DialogDescription>
                Cập nhật phiên token cho <strong>{reloginCompany.name}</strong> ({reloginCompany.taxCode})
              </DialogDescription>
            )}
          </DialogHeader>

          {reloginError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="break-all">{reloginError}</span>
            </div>
          )}

          <form onSubmit={handleReloginManualSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Giải Captcha Tổng cục Thuế</Label>
              <div className="flex items-center gap-2">
                <div className="h-10 bg-white rounded-lg flex items-center justify-center p-1 flex-1 overflow-hidden">
                  {reloginCaptchaLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center svg-captcha-wrapper" dangerouslySetInnerHTML={{ __html: reloginCaptchaSvg }} />
                  )}
                </div>
                <Button type="button" variant="outline" size="icon" onClick={fetchReloginCaptcha} disabled={reloginCaptchaLoading}>
                  <RefreshCw className={`h-4 w-4 ${reloginCaptchaLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="relogin-captcha">Mã xác thực Captcha</Label>
              <Input id="relogin-captcha" type="text" required maxLength={6} value={reloginCaptchaValue} onChange={e => setReloginCaptchaValue(e.target.value)} placeholder="Nhập 6 ký tự captcha..." className="text-center tracking-widest uppercase font-semibold" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReloginCompany(null)}>Đóng</Button>
              <Button type="submit" disabled={reloginLoading}>
                {reloginLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Xác thực
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Company Dialog */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Thêm Doanh Nghiệp Mới
            </DialogTitle>
            <DialogDescription>
              Kết nối và lấy token kiểm thử lần đầu từ hoadondientu.gdt.gov.vn
            </DialogDescription>
          </DialogHeader>

          {addError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="break-all">{addError}</span>
            </div>
          )}
          {addSuccess && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-600 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{addSuccess}</span>
            </div>
          )}

          <form onSubmit={handleAddCompany} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-taxcode">Mã Số Thuế (MST)</Label>
              <Input id="add-taxcode" type="text" required value={newTaxCode} onChange={e => setNewTaxCode(e.target.value)} placeholder="Nhập mã số thuế..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-password">Mật khẩu tra cứu</Label>
              <div className="relative">
                <Input id="add-password" type={showAddPassword ? 'text' : 'password'} required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mật khẩu trang hoadondientu..." className="pr-10" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" onClick={() => setShowAddPassword(!showAddPassword)}>
                  {showAddPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Chế độ đăng nhập</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" variant={newLoginMode === 'AUTO' ? 'default' : 'outline'} onClick={() => setNewLoginMode('AUTO')}>Tự động (Gemini)</Button>
                <Button type="button" variant={newLoginMode === 'MANUAL' ? 'default' : 'outline'} onClick={() => setNewLoginMode('MANUAL')}>Thủ công</Button>
              </div>
            </div>

            {newLoginMode === 'MANUAL' && (
              <div className="bg-muted/30 border rounded-lg p-4 space-y-3">
                <Label>Xác thực mã Captcha GDT</Label>
                <div className="flex items-center gap-2">
                  <div className="h-10 bg-white rounded-lg flex items-center justify-center p-1 flex-1 overflow-hidden">
                    {newCaptchaLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center svg-captcha-wrapper" dangerouslySetInnerHTML={{ __html: newCaptchaSvg }} />
                    )}
                  </div>
                  <Button type="button" variant="outline" size="icon" onClick={fetchNewCaptcha} disabled={newCaptchaLoading}>
                    <RefreshCw className={`h-4 w-4 ${newCaptchaLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <Input type="text" required maxLength={6} value={newCaptchaValue} onChange={e => setNewCaptchaValue(e.target.value)} placeholder="Nhập mã captcha..." className="text-center tracking-widest uppercase" />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>Hủy</Button>
              <Button type="submit" disabled={addLoading}>
                {addLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Lưu & Kết Nối
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sync Confirmation Dialog */}
      <Dialog open={!!syncConfirmCompany} onOpenChange={(open) => !open && setSyncConfirmCompany(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudDownload className="h-5 w-5" />
              Đồng bộ thông tin
            </DialogTitle>
            <DialogDescription>
              Tự động điền dữ liệu doanh nghiệp từ masothue.com
            </DialogDescription>
          </DialogHeader>
          {syncConfirmCompany && (
            <div className="py-4 text-center">
              <p className="text-sm leading-relaxed">
                Bạn có muốn hệ thống tự động tải thông tin chi tiết như <strong>tên đầy đủ, địa chỉ, người đại diện...</strong> của mã số thuế <strong className="text-primary">{syncConfirmCompany.taxCode}</strong> từ masothue.com không?
              </p>
            </div>
          )}
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setSyncConfirmCompany(null)} className="flex-1">Không, bỏ qua</Button>
            <Button
              onClick={() => { if (syncConfirmCompany) { handleSyncInfo(syncConfirmCompany.id); } setSyncConfirmCompany(null); }}
              className="flex-1"
            >
              Đồng ý cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        .svg-captcha-wrapper svg {
          width: 100% !important;
          height: 100% !important;
          max-height: 32px !important;
        }
      `}</style>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0 w-20">{label}:</span>
      <span>{value}</span>
    </div>
  );
}
