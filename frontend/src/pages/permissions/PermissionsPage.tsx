import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
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
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Permission } from '@/types'

// ─── Permission Form Dialog ───────────────────────────────────────────────────

interface PermFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  editPerm: Permission | null
}

function PermFormDialog({ open, onOpenChange, onSaved, editPerm }: PermFormProps) {
  const isEdit = !!editPerm
  const [form, setForm] = useState({ name: '', description: '', group: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (editPerm) {
      setForm({ name: editPerm.name, description: editPerm.description ?? '', group: editPerm.group })
    } else {
      setForm({ name: '', description: '', group: '' })
    }
  }, [editPerm, open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (isEdit) {
        await permissionsApi.update(editPerm.id, { description: form.description, group: form.group })
        toast.success('Permission updated successfully')
      } else {
        await permissionsApi.create({ name: form.name, description: form.description, group: form.group })
        toast.success('Permission created successfully')
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Permission' : 'Create Permission'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the permission description and group.' : 'Add a new permission to the system.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="permName">Name</Label>
            <Input id="permName" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="resource:action (e.g. post:create)" disabled={isEdit} required={!isEdit} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="permGroup">Group / Resource</Label>
            <Input id="permGroup" value={form.group} onChange={(e) => setForm((p) => ({ ...p, group: e.target.value }))} placeholder="e.g. post, comment" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="permDesc">Description</Label>
            <Input id="permDesc" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <LoadingButton type="submit" loading={loading}>
              {isEdit ? 'Save changes' : 'Create'}
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
  perm: Permission | null
  onDeleted: () => void
}

function DeletePermDialog({ open, onOpenChange, perm, onDeleted }: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!perm) return
    setDeleting(true)
    try {
      await permissionsApi.delete(perm.id)
      toast.success('Permission deleted successfully')
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
          <DialogTitle>Delete Permission</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong className="font-mono">{perm?.name}</strong>?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <LoadingButton variant="destructive" onClick={handleDelete} loading={deleting}>
            Delete
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PermissionsPage() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('permission:create')
  const canEdit = hasPermission('permission:update')
  const canDelete = hasPermission('permission:delete')

  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editPerm, setEditPerm] = useState<Permission | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Permission | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const fetchPermissions = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await permissionsApi.getAll()
      setPermissions(data)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPermissions() }, [fetchPermissions])

  const groups = [...new Set(permissions.map((p) => p.group))].sort()

  return (
    <Layout title="Permissions">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{permissions.length} permission(s) total</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={fetchPermissions}><RefreshCw className="size-4" /></Button>
            {canCreate && (
              <Button size="sm" onClick={() => { setEditPerm(null); setModalOpen(true) }}>
                <Plus className="size-4" /> Add permission
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Skeleton className="h-6 w-48" />
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <Card key={group}>
                <CardHeader className="py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{group}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {permissions.filter((p) => p.group === group).length} permission(s)
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableBody>
                      {permissions.filter((p) => p.group === group).map((perm) => (
                        <TableRow key={perm.id}>
                          <TableCell>
                            <p className="font-mono font-medium text-foreground text-xs">{perm.name}</p>
                            {perm.description && <p className="text-xs text-muted-foreground mt-0.5">{perm.description}</p>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <Button variant="ghost" size="icon-xs" onClick={() => { setEditPerm(perm); setModalOpen(true) }} title="Edit">
                                  <Pencil className="size-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="icon-xs" onClick={() => { setDeleteTarget(perm); setDeleteDialogOpen(true) }} title="Delete">
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <PermFormDialog open={modalOpen} onOpenChange={setModalOpen} onSaved={fetchPermissions} editPerm={editPerm} />
      <DeletePermDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} perm={deleteTarget} onDeleted={fetchPermissions} />
    </Layout>
  )
}
