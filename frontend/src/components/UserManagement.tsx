import { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, UserPlus, Shield, Trash2, Lock, Unlock, Edit2, X, Check, Loader2, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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

interface UserCompany {
  companyId: number;
  company: { name: string; taxCode: string };
}

interface User {
  id: number;
  username: string;
  role: 'ADMIN' | 'STAFF';
  isActive: boolean;
  createdAt: string;
  companies: UserCompany[];
}

interface Company {
  id: number;
  taxCode: string;
  name: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const [isActive, setIsActive] = useState(true);
  const [assignedCompanyIds, setAssignedCompanyIds] = useState<number[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, companiesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/users`),
        axios.get(`${API_BASE_URL}/api/companies`),
      ]);
      setUsers(usersRes.data);
      setCompanies(companiesRes.data);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openAddModal = () => {
    setIsEditMode(false);
    setSelectedUserId(null);
    setUsername('');
    setPassword('');
    setRole('STAFF');
    setIsActive(true);
    setAssignedCompanyIds([]);
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setIsEditMode(true);
    setSelectedUserId(user.id);
    setUsername(user.username);
    setPassword('');
    setRole(user.role);
    setIsActive(user.isActive);
    setAssignedCompanyIds(user.companies.map(uc => uc.companyId));
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const handleToggleCompany = (companyId: number) => {
    setAssignedCompanyIds(prev =>
      prev.includes(companyId) ? prev.filter(id => id !== companyId) : [...prev, companyId]
    );
  };

  const handleSelectAllCompanies = () => {
    if (assignedCompanyIds.length === companies.length) {
      setAssignedCompanyIds([]);
    } else {
      setAssignedCompanyIds(companies.map(c => c.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setFormError('Vui lòng nhập tên đăng nhập.'); return; }
    if (!isEditMode && !password) { setFormError('Vui lòng nhập mật khẩu cho tài khoản mới.'); return; }

    setSubmitting(true);
    setFormError('');
    setFormSuccess('');

    try {
      const payload: any = {
        username: username.trim(),
        role,
        isActive,
        companyIds: role === 'ADMIN' ? [] : assignedCompanyIds,
      };
      if (password) payload.password = password;

      if (isEditMode && selectedUserId) {
        await axios.put(`${API_BASE_URL}/api/users/${selectedUserId}`, payload);
        toast.success('Cập nhật tài khoản thành công!');
      } else {
        await axios.post(`${API_BASE_URL}/api/users`, payload);
        toast.success('Tạo tài khoản mới thành công!');
      }

      await fetchData();
      setModalOpen(false);
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Đã xảy ra lỗi khi lưu thông tin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      await axios.put(`${API_BASE_URL}/api/users/${user.id}`, { isActive: !user.isActive });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: !user.isActive } : u));
      toast.success(user.isActive ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Không thể thay đổi trạng thái tài khoản.');
    }
  };

  const handleDelete = async (user: User) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/users/${user.id}`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      toast.success(`Đã xóa tài khoản "${user.username}"`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Không thể xóa tài khoản.');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6" />
            <div>
              <CardTitle>Quản Lý Thành Viên</CardTitle>
              <CardDescription>Thêm, sửa đổi quyền truy cập và quản lý tài khoản người dùng</CardDescription>
            </div>
          </div>
          <Button onClick={openAddModal} className="gap-1.5">
            <UserPlus className="h-4 w-4" />
            Thêm Thành Viên
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên tài khoản</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="max-w-xs">Doanh nghiệp gán</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Đang tải danh sách thành viên...
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Chưa có thành viên nào được tạo.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                          {user.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={user.isActive ? 'text-green-600 border-green-300' : 'text-destructive border-destructive/30'}
                        >
                          {user.isActive ? (
                            <><Unlock className="w-3 h-3 mr-1" /> Đang hoạt động</>
                          ) : (
                            <><Lock className="w-3 h-3 mr-1" /> Đã khóa</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {user.role === 'ADMIN' ? (
                          <span className="italic">Toàn quyền truy cập</span>
                        ) : user.companies.length === 0 ? (
                          <span className="text-destructive/80">Chưa gán doanh nghiệp</span>
                        ) : (
                          user.companies.map(c => c.company.name).join(', ')
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal(user)} title="Sửa">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => handleToggleActive(user)}
                            title={user.isActive ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                          >
                            {user.isActive ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(user)} title="Xóa">
                            <Trash2 className="h-4 w-4" />
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

      {/* Add/Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {isEditMode ? 'Cập Nhật Tài Khoản' : 'Thêm Thành Viên Mới'}
            </DialogTitle>
            <DialogDescription>
              {isEditMode ? 'Chỉnh sửa thông tin tài khoản người dùng.' : 'Tạo tài khoản mới cho nhân viên.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-2">
              {formError && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-lg">{formError}</div>
              )}
              {formSuccess && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-600 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  {formSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="um-username">Tên đăng nhập</Label>
                  <Input id="um-username" type="text" required value={username} onChange={e => setUsername(e.target.value)} placeholder="nhanvien01" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="um-password">{isEditMode ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}</Label>
                  <Input id="um-password" type="password" required={!isEditMode} value={password} onChange={e => setPassword(e.target.value)} placeholder={isEditMode ? '••••••••' : 'Nhập mật khẩu'} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="um-role">Quyền hạn</Label>
                  <Select value={role} onValueChange={(v: any) => setRole(v)}>
                    <SelectTrigger id="um-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STAFF">Nhân viên</SelectItem>
                      <SelectItem value="ADMIN">Quản trị viên</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="um-active">Trạng thái tài khoản</Label>
                  <Select value={isActive ? 'true' : 'false'} onValueChange={v => setIsActive(v === 'true')}>
                    <SelectTrigger id="um-active">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Kích hoạt</SelectItem>
                      <SelectItem value="false">Tạm khóa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {role === 'STAFF' && (
                <div className="space-y-2 border-t pt-4">
                  <div className="flex justify-between items-center">
                    <Label className="font-bold uppercase tracking-wide text-xs">
                      Gán quyền truy cập doanh nghiệp ({assignedCompanyIds.length}/{companies.length})
                    </Label>
                    {companies.length > 0 && (
                      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={handleSelectAllCompanies}>
                        {assignedCompanyIds.length === companies.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                      </Button>
                    )}
                  </div>

                  {companies.length === 0 ? (
                    <p className="text-muted-foreground text-xs italic">Chưa có doanh nghiệp nào được cấu hình trong hệ thống.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto bg-muted/30 p-4 rounded-lg border">
                      {companies.map(company => {
                        const isChecked = assignedCompanyIds.includes(company.id);
                        return (
                          <div
                            key={company.id}
                            onClick={() => handleToggleCompany(company.id)}
                            className="flex items-center gap-2.5 p-2.5 rounded-lg border hover:border-primary/50 bg-background hover:bg-accent/5 cursor-pointer transition-all"
                          >
                            {isChecked ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                            <div className="text-xs min-w-0">
                              <div className="font-medium truncate">{company.name}</div>
                              <div className="text-muted-foreground">{company.taxCode}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Hủy</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Lưu Thay Đổi
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
