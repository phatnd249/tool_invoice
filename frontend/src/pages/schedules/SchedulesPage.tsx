import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Clock, Calendar, ToggleLeft, ToggleRight } from 'lucide-react'
import { schedulesApi } from '@/api/schedules'
import type { Schedule, CreateScheduleData, UpdateScheduleData } from '@/api/schedules'
import { getErrorMessage } from '@/lib/apiClient'
import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScheduleFormDialog } from './ScheduleFormDialog'
import { ScheduleDeleteDialog } from './ScheduleDeleteDialog'
import { AssignCompaniesDialog } from './AssignCompaniesDialog'
// ─── Helpers ────────────────────────────────────────────────────────────────

const REPEAT_LABELS: Record<string, string> = {
  once: 'Một lần',
  daily: 'Hàng ngày',
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng',
  quarterly: 'Hàng quý',
}

const REPEAT_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  daily: 'default',
  weekly: 'default',
  monthly: 'secondary',
  quarterly: 'secondary',
  once: 'outline',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function SchedulesPage() {
  const { hasPermission } = useAuth()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)

  // Dialogs
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [deleting, setDeleting] = useState<Schedule | null>(null)
  const [assigning, setAssigning] = useState<Schedule | null>(null)

  const canModify = hasPermission('invoice:download')

  const fetch = useCallback(async () => {
    try {
      const { data } = await schedulesApi.getAll()
      setSchedules(data)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleCreate = async (dto: CreateScheduleData | UpdateScheduleData) => {
    try {
      await schedulesApi.create(dto as CreateScheduleData)
      toast.success('Đã tạo lịch')
      setFormOpen(false)
      fetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleUpdate = async (dto: CreateScheduleData | UpdateScheduleData) => {
    if (!editing) return
    try {
      await schedulesApi.update(editing.id, dto as UpdateScheduleData)
      toast.success('Đã cập nhật lịch')
      setEditing(null)
      fetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleToggle = async (schedule: Schedule) => {
    try {
      const { data } = await schedulesApi.toggle(schedule.id)
      setSchedules((prev) => prev.map((s) => (s.id === data.id ? data : s)))
      toast.success(data.isActive ? 'Đã bật lịch' : 'Đã tắt lịch')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await schedulesApi.remove(deleting.id)
      toast.success('Đã xoá lịch')
      setDeleting(null)
      fetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleAssign = async (companyIds: string[]) => {
    if (!assigning) return
    try {
      await schedulesApi.updateCompanies(assigning.id, companyIds)
      toast.success(`Đã gán ${companyIds.length} công ty`)
      setAssigning(null)
      fetch()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <Layout title="Lịch tải tự động">
      <div className="space-y-4 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Thiết lập lịch tải hoá đơn tự động cho nhiều doanh nghiệp
          </p>
          {canModify && (
            <Button onClick={() => setFormOpen(true)} size="sm">
              <Plus className="mr-1.5 size-4" />
              Tạo lịch mới
            </Button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[140px] w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && schedules.length === 0 && (
          <div className="py-20 text-center text-muted-foreground">
            <Clock className="size-12 mx-auto mb-4 stroke-[1.25]" />
            <p className="font-medium">Chưa có lịch tải nào</p>
            <p className="text-sm mt-1">
              Tạo lịch để tự động tải hoá đơn định kỳ.
            </p>
          </div>
        )}

        {/* Schedule cards */}
        {schedules.map((s) => (
          <Card key={s.id} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row">
                {/* Left: info */}
                <div className="flex-1 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-base">
                      {s.name || 'Lịch không tên'}
                    </span>
                    <Badge variant={REPEAT_VARIANTS[s.repeatMode] ?? 'secondary'}>
                      {REPEAT_LABELS[s.repeatMode] ?? s.repeatMode}
                    </Badge>
                    {s.dateRangeDays ? (
                      <Badge variant="outline">{s.dateRangeDays} ngày qua</Badge>
                    ) : null}
                    <Badge variant="outline">
                      {s.invoiceType === 'BOTH'
                        ? 'Bán + Mua'
                        : s.invoiceType === 'SELL'
                          ? 'Bán ra'
                          : 'Mua vào'}
                    </Badge>
                  </div>

                  {s.repeatMode === 'once' ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="size-3.5" />
                      Chạy lúc: {formatDateTime(s.scheduledAt)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-mono">
                      <Clock className="size-3.5" />
                      Cron: {s.cronExpression || '—'}
                    </div>
                  )}

                  <div className="text-sm text-muted-foreground">
                    {s.companies.length === 0 ? (
                      <span className="text-amber-500">Chưa gán công ty</span>
                    ) : (
                      <span>
                        <strong>{s.companies.length}</strong> công ty:{' '}
                        {s.companies.map((sc) => sc.company.name).join(', ')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      Lần chạy cuối: {formatDateTime(s.lastRun)}
                    </span>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex sm:flex-col items-center justify-between sm:justify-center gap-2 p-4 sm:border-l border-t sm:border-t-0 bg-muted/30 min-w-[100px]">
                  {canModify && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={s.isActive ? 'Tắt lịch' : 'Bật lịch'}
                        onClick={() => handleToggle(s)}
                      >
                        {s.isActive ? (
                          <ToggleRight className="size-5 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="size-5 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Gán công ty"
                        onClick={() => setAssigning(s)}
                      >
                        <Plus className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Sửa lịch"
                        onClick={() => setEditing(s)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Xoá lịch"
                        onClick={() => setDeleting(s)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Dialogs */}
        <ScheduleFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          onSubmit={handleCreate}
        />

        {editing && (
          <ScheduleFormDialog
            open={!!editing}
            onOpenChange={(v) => { if (!v) setEditing(null) }}
            onSubmit={handleUpdate}
            initial={editing}
          />
        )}

        <ScheduleDeleteDialog
          open={!!deleting}
          onOpenChange={(v) => { if (!v) setDeleting(null) }}
          onConfirm={handleDelete}
          name={deleting?.name || undefined}
        />

        {assigning && (
          <AssignCompaniesDialog
            open={!!assigning}
            onOpenChange={(v) => { if (!v) setAssigning(null) }}
            selectedIds={assigning.companies.map((sc) => sc.companyId)}
            onSave={handleAssign}
          />
        )}
      </div>
    </Layout>
  )
}
