import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, RefreshCw, Shield } from 'lucide-react'
import { rolesApi } from '@/api/roles'
import { permissionsApi } from '@/api/permissions'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import type { Role, Permission } from '@/types'

// ─── Role Form Dialog ─────────────────────────────────────────────────────────

interface RoleFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  editRole: Role | null
  permissions: Permission[]
}

function RoleFormDialog({ open, onOpenChange, onSaved, editRole, permissions }: RoleFormProps) {
  const isEdit = !!editRole
  const [form, setForm] = useState({ name: '', description: '', permissionIds: [] as string[] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (editRole) {
      setForm({ name: editRole.name, description: editRole.description ?? '', permissionIds: editRole.permissions.map((p) => p.id) })
    } else {
      setForm({ name: '', description: '', permissionIds: [] })
    }
  }, [editRole, open])

  const togglePerm = (id: string) =>
    setForm((prev) => ({ ...prev, permissionIds: prev.permissionIds.includes(id) ? prev.permissionIds.filter((p) => p !== id) : [...prev.permissionIds, id] }))

  const toggleGroup = (_group: string, groupPerms: Permission[]) => {
    const ids = groupPerms.map((p) => p.id)
    const allSelected = ids.every((id) => form.permissionIds.includes(id))
    setForm((prev) => ({ ...prev, permissionIds: allSelected ? prev.permissionIds.filter((id) => !ids.includes(id)) : [...new Set([...prev.permissionIds, ...ids])] }))
  }

  const groups = [...new Set(permissions.map((p) => p.group))].sort()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEdit) {
        await rolesApi.update(editRole.id, { name: form.name, description: form.description, permissionIds: form.permissionIds })
        toast.success('Đã cập nhật vai trò')
      } else {
        await rolesApi.create({ name: form.name, description: form.description, permissionIds: form.permissionIds })
        toast.success('Đã tạo vai trò')
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
          <DialogTitle>{isEdit ? 'Chỉnh sửa vai trò' : 'Tạo vai trò'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Cập nhật tên, mô tả và quyền của vai trò.' : 'Tạo vai trò mới với các quyền cụ thể.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roleName">Tên vai trò</Label>
            <Input id="roleName" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. EDITOR" required disabled={editRole?.isSystem} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="roleDesc">Mô tả</Label>
            <Input id="roleDesc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Mô tả (tuỳ chọn)" />
          </div>

          <div className="space-y-2">
            <Label>Quyền hạn</Label>
            <div className="border rounded-lg overflow-y-auto max-h-64 divide-y">
              {groups.map((group) => {
                const groupPerms = permissions.filter((p) => p.group === group)
                const allSelected = groupPerms.every((p) => form.permissionIds.includes(p.id))
                return (
                  <div key={group} className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Checkbox id={`group-${group}`} checked={allSelected} onCheckedChange={() => toggleGroup(group, groupPerms)} />
                      <Label htmlFor={`group-${group}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer">
                        {group}
                      </Label>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 pl-5">
                      {groupPerms.map((p) => (
                        <label key={p.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <Checkbox checked={form.permissionIds.includes(p.id)} onCheckedChange={() => togglePerm(p.id)} />
                          <span className="text-muted-foreground">{p.name.split(':')[1]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">Đã chọn {form.permissionIds.length} quyền</p>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Huỷ
            </DialogClose>
            <LoadingButton type="submit" loading={loading}>
              {isEdit ? 'Lưu thay đổi' : 'Tạo vai trò'}
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
  role: Role | null
  onDeleted: () => void
}

function DeleteRoleDialog({ open, onOpenChange, role, onDeleted }: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!role) return
    setDeleting(true)
    try {
      await rolesApi.delete(role.id)
      toast.success('Đã xoá vai trò')
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
          <DialogTitle>Xoá vai trò</DialogTitle>
          <DialogDescription>
            Bạn có chắc muốn xoá vai trò <strong>{role?.name}</strong> không?
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

export function RolesPage() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('role:create')
  const canEdit = hasPermission('role:update')
  const canDelete = hasPermission('role:delete')

  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      const [rolesRes, permsRes] = await Promise.all([rolesApi.getAll(), permissionsApi.getAll()])
      setRoles(rolesRes.data)
      setPermissions(permsRes.data)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  return (
    <Layout title="Vai trò">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Tổng cộng {roles.length} vai trò</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={fetchRoles}><RefreshCw className="size-4" /></Button>
            {canCreate && (
              <Button size="sm" onClick={() => { setEditRole(null); setModalOpen(true) }}>
                <Plus className="size-4" /> Thêm vai trò
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          {loading ? (
            <div className="py-16 flex justify-center gap-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vai trò</TableHead>
                  <TableHead className="hidden sm:table-cell">Quyền hạn</TableHead>
                  <TableHead className="hidden md:table-cell">Người dùng</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Shield className="size-4 text-primary shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">{role.name}</p>
                          {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                        </div>
                        {role.isSystem && <Badge variant="outline">Hệ thống</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {role.permissions.slice(0, 3).map((p) => <Badge key={p.id} variant="secondary">{p.name}</Badge>)}
                        {role.permissions.length > 3 && <Badge variant="secondary">+{role.permissions.length - 3}</Badge>}
                        {role.permissions.length === 0 && <span className="text-muted-foreground text-xs">Không có</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{role.userCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && !role.isSystem && (
                          <Button variant="ghost" size="icon-xs" onClick={() => { setEditRole(role); setModalOpen(true) }} title="Edit">
                            <Pencil className="size-4" />
                          </Button>
                        )}
                        {canDelete && !role.isSystem && (
                          <Button variant="ghost" size="icon-xs" onClick={() => { setDeleteTarget(role); setDeleteDialogOpen(true) }} title="Delete">
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                        {role.isSystem && <span className="text-xs text-muted-foreground px-2">Được bảo vệ</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <RoleFormDialog open={modalOpen} onOpenChange={setModalOpen} onSaved={fetchRoles} editRole={editRole} permissions={permissions} />
      <DeleteRoleDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} role={deleteTarget} onDeleted={fetchRoles} />
    </Layout>
  )
}
