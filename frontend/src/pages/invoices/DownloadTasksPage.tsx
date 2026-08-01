import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Eye, RefreshCw } from 'lucide-react'
import { invoicesApi } from '@/api/invoices'
import { getErrorMessage } from '@/lib/apiClient'
import { cn } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination'
import { DownloadProgress } from './DownloadProgress'
import type { DownloadTask } from '@/types'

const INVOICE_TYPE_LABELS: Record<string, string> = {
  BUY: 'Mua vào',
  SELL: 'Bán ra',
  BOTH: 'Cả hai',
}

const STATUS_OPTIONS = [
  { label: 'Tất cả', value: '' },
  { label: 'Đang chạy', value: 'RUNNING' },
  { label: 'Đang chờ', value: 'PENDING' },
  { label: 'Hoàn thành', value: 'DONE' },
  { label: 'Lỗi', value: 'ERROR' },
]

function TaskStatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    PENDING: 'secondary',
    RUNNING: 'default',
    DONE: 'outline',
    ERROR: 'destructive',
  }

  const labelMap: Record<string, string> = {
    PENDING: 'Đang chờ',
    RUNNING: 'Đang chạy',
    DONE: 'Hoàn thành',
    ERROR: 'Lỗi',
  }

  return (
    <Badge variant={variantMap[status] || 'secondary'}>
      {labelMap[status] || status}
    </Badge>
  )
}

export function DownloadTasksPage() {
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  // Detail dialog
  const [selectedTask, setSelectedTask] = useState<DownloadTask | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const { data } = await invoicesApi.getTasks({
        page,
        limit: 10,
        status: statusFilter || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
      setTasks(data.data)
      setTotalPages(data.totalPages)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter])

  // Auto-refresh when there are running tasks
  useEffect(() => {
    const hasRunning = tasks.some(
      (t) => t.status === 'RUNNING' || t.status === 'PENDING',
    )
    if (!hasRunning) return

    const interval = setInterval(fetchTasks, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

  const handleViewDetail = (task: DownloadTask) => {
    setSelectedTask(task)
    setDialogOpen(true)
  }

  return (
    <Layout title="Quản lý Task Tải Hoá Đơn">
      <div className="space-y-4 max-w-5xl">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Select
              items={STATUS_OPTIONS}
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v ?? '')
                setPage(1)
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="sm" onClick={fetchTasks}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>

        {/* ── Loading ───────────────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[52px] w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* ── Empty ─────────────────────────────────────────────────────── */}
        {!loading && tasks.length === 0 && (
          <div className="py-20 text-center text-muted-foreground">
            <p className="font-medium">Chưa có task nào</p>
            <p className="text-sm mt-1">
              Task tải hoá đơn sẽ xuất hiện ở đây khi bạn bắt đầu tải.
            </p>
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────────── */}
        {!loading && tasks.length > 0 && (
          <div className="rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doanh nghiệp</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Khoảng thời gian</TableHead>
                  <TableHead>Tiến độ</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Tạo lúc</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="font-medium text-sm">
                        {task.company?.name || '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {task.company?.taxCode || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {INVOICE_TYPE_LABELS[task.invoiceType] || task.invoiceType}
                    </TableCell>
                    <TableCell className="text-sm">
                      {task.dateStart} → {task.dateEnd}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 min-w-32">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full transition-all rounded-full',
                              task.status === 'ERROR'
                                ? 'bg-destructive'
                                : task.status === 'DONE'
                                  ? 'bg-green-500'
                                  : 'bg-primary',
                            )}
                            style={{
                              width: `${Math.max(task.progress, task.status === 'RUNNING' ? 5 : 0)}%`,
                            }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {task.processedInvoices}/{task.totalInvoices} ({task.progress}%)
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TaskStatusBadge status={task.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(task.createdAt), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewDetail(task)}
                      >
                        <Eye className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="border-t px-4 py-3">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => (
                      <span key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && (
                          <PaginationItem>
                            <PaginationEllipsis />
                          </PaginationItem>
                        )}
                        <PaginationItem>
                          <PaginationLink isActive={p === page} onClick={() => setPage(p)}>
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      </span>
                    ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Dialog ───────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết Task</DialogTitle>
          </DialogHeader>

          {selectedTask && (
            <div className="space-y-4">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Doanh nghiệp:</span>{' '}
                  {selectedTask.company?.name || '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">MST:</span>{' '}
                  {selectedTask.company?.taxCode || '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">Loại:</span>{' '}
                  {INVOICE_TYPE_LABELS[selectedTask.invoiceType] || selectedTask.invoiceType}
                </div>
                <div>
                  <span className="text-muted-foreground">Trạng thái:</span>{' '}
                  <TaskStatusBadge status={selectedTask.status} />
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Thời gian:</span>{' '}
                  {selectedTask.dateStart} → {selectedTask.dateEnd}
                </div>
              </div>

              {/* Progress */}
              <DownloadProgress
                status={
                  selectedTask.status === 'DONE' ? 'done' :
                  selectedTask.status === 'ERROR' ? 'error' :
                  selectedTask.status === 'RUNNING' ? 'running' : 'connecting'
                }
                progress={selectedTask.progress}
                processed={selectedTask.processedInvoices}
                total={selectedTask.totalInvoices}
                currentInvoiceType={selectedTask.status === 'DONE' || selectedTask.status === 'ERROR' ? '' : selectedTask.invoiceType}
                logs={selectedTask.logs || []}
                result={selectedTask.result}
                errorMessage={selectedTask.errorMessage}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
