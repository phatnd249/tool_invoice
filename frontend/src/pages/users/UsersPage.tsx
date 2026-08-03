import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, ToggleLeft, ToggleRight, RefreshCw, Building2 } from 'lucide-react'
import { usersApi } from '@/api/users'
import { rolesApi } from '@/api/roles'
import { getErrorMessage } from '@/lib/apiClient'
import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserCompaniesDialog } from './UserCompaniesDialog'
import type { User, Role } from '@/types'

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'INACTIVE', label: 'Không hoạt động' },
  { value: 'BANNED', label: 'Đã khoá' },
]

function statusBadge(status: string) {
  if (status === 'ACTIVE') return <Badge variant="default">Hoạt động</Badge>
  if (status === 'BANNED') return <Badge variant="destructive">Đã khoá</Badge>
  return <Badge variant="secondary">Không hoạt động</Badge>
}

// ─── User Form Dialog ─────────────────────────────────────────────────────────

interface UserFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  editUser: User | null
  roles: Role[]
}

function UserFormDialog({ open, onOpenChange, onSaved, editUser, roles }: UserFormProps) {
  const isEdit = !!editUser
  const [form, setForm] = useState({ fullName: '', email: '', password: '', status: 'ACTIVE', roleIds: [] as string[] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (editUser) {
      setForm({
        fullName: editUser.fullName,
        email: editUser.email,
        password: '',
        status: editUser.status,
        roleIds: editUser.roles.map((r) => r.id),
      })
    } else {
      setForm({ fullName: '', email: '', password: '', status: 'ACTIVE', roleIds: [] })
    }
  }, [editUser, open])

  const toggleRole = (roleId: string) =>
    setForm((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId) ? prev.roleIds.filter((id) => id !== roleId) : [...prev.roleIds, roleId],
    }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isEdit && !form.password) { toast.error('Vui lòng nhập mật khẩu'); return }
    if (form.roleIds.length === 0) { toast.error('Phải gán ít nhất một vai trò'); return }
    setLoading(true)
    try {
      if (isEdit) {
        await usersApi.update(editUser.id, { fullName: form.fullName, email: form.email, status: form.status, roleIds: form.roleIds })
        toast.success('Đã cập nhật người dùng')
      } else {
        await usersApi.create({ fullName: form.fullName, email: form.email, password: form.password, roleIds: form.roleIds })
        toast.success('Đã tạo người dùng')
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Chỉnh sửa người dùng' : 'Tạo người dùng'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Cập nhật thông tin và vai trò của người dùng.' : 'Tạo tài khoản người dùng mới.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Họ và tên</Label>
            <Input id="fullName" value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Địa chỉ email</Label>
            <Input id="email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
          </div>
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input id="password" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="Tối thiểu 8 ký tự" required />
            </div>
          )}
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="status">Trạng thái</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v ?? 'ACTIVE' }))}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['ACTIVE', 'INACTIVE', 'BANNED'].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Vai trò</Label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={form.roleIds.includes(role.id)} onCheckedChange={() => toggleRole(role.id)} />
                  <span className="font-medium">{role.name}</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Huỷ
            </DialogClose>
            <LoadingButton type="submit" loading={loading}>
              {isEdit ? 'Lưu thay đổi' : 'Tạo người dùng'}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
  onDeleted: () => void
}

function DeleteUserDialog({ open, onOpenChange, user, onDeleted }: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!user) return
    setDeleting(true)
    try {
      await usersApi.delete(user.id)
      toast.success('Đã xoá người dùng')
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Xoá người dùng</DialogTitle>
          <DialogDescription>
            Bạn có chắc muốn xoá <strong>{user?.fullName}</strong> không? Hành động này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Huỷ
          </DialogClose>
          <LoadingButton variant="destructive" onClick={handleDelete} loading={deleting}>
            Xoá
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function UsersPage() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('user:create')
  const canEdit = hasPermission('user:update')
  const canDelete = hasPermission('user:delete')

  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const LIMIT = 10

  const [modalOpen, setModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const [companiesTarget, setCompaniesTarget] = useState<User | null>(null)
  const [companiesDialogOpen, setCompaniesDialogOpen] = useState(false)
  const hasCompanyScope = hasPermission('company:scope')

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await usersApi.getAll({ page, limit: LIMIT, search: search || undefined, status: statusFilter || undefined })
      setUsers(data.data)
      setTotalPages(data.totalPages)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    rolesApi.getAll().then(({ data }) => setRoles(data)).catch(() => {})
  }, [])

  const handleToggleStatus = async (user: User) => {
    try {
      await usersApi.toggleStatus(user.id)
      toast.success(user.status === 'ACTIVE' ? 'Đã vô hiệu hoá người dùng' : 'Đã kích hoạt người dùng')
      fetchUsers()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <Layout title="Người dùng">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Tìm theo tên hoặc email…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? ''); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Tất cả trạng thái" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" size="icon" onClick={fetchUsers}><RefreshCw className="size-4" /></Button>
            {canCreate && (
              <Button size="sm" onClick={() => { setEditUser(null); setModalOpen(true) }}>
                <Plus className="size-4" /> Thêm người dùng
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Người dùng</TableHead>
                <TableHead className="hidden sm:table-cell">Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="hidden md:table-cell">Đăng nhập cuối</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center">
                    <div className="flex justify-center gap-4">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    Không tìm thấy người dùng
                  </TableCell>
                </TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {u.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{u.fullName}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.slice(0, 2).map((r) => <Badge key={r.id} variant="outline">{r.name}</Badge>)}
                      {u.roles.length > 2 && <Badge variant="secondary">+{u.roles.length - 2}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(u.status)}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('vi-VN') : 'Chưa từng'
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="icon-xs" onClick={() => { setEditUser(u); setModalOpen(true) }} title="Edit">
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon-xs" onClick={() => handleToggleStatus(u)} title={u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}>
                            {u.status === 'ACTIVE' ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}
                          </Button>
                        </>
                      )}
                      {hasCompanyScope && (
                        <Button variant="ghost" size="icon-xs" onClick={() => { setCompaniesTarget(u); setCompaniesDialogOpen(true) }} title="Gán công ty">
                          <Building2 className="size-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon-xs" onClick={() => { setDeleteTarget(u); setDeleteDialogOpen(true) }} title="Delete">
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!loading && users.length > 0 && (
            <div className="border-t px-4 py-3">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => (
                      <span key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && (
                          <PaginationItem><PaginationEllipsis /></PaginationItem>
                        )}
                        <PaginationItem>
                          <PaginationLink isActive={p === page} onClick={() => setPage(p)}>
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      </span>
                    ))}
                  <PaginationItem>
                    <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </div>

      <UserFormDialog open={modalOpen} onOpenChange={setModalOpen} onSaved={fetchUsers} editUser={editUser} roles={roles} />
      <DeleteUserDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} user={deleteTarget} onDeleted={fetchUsers} />
      {companiesTarget && (
        <UserCompaniesDialog
          open={companiesDialogOpen}
          onOpenChange={setCompaniesDialogOpen}
          userId={companiesTarget.id}
          userName={companiesTarget.fullName}
          onSaved={fetchUsers}
        />
      )}
    </Layout>
  )
}
