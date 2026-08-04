import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Schedule, CreateScheduleData, UpdateScheduleData } from '@/api/schedules'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CreateScheduleData | UpdateScheduleData) => void | Promise<void>
  initial?: Schedule | null
}

// ─── Item definitions for Select ─────────────────────────────────────────────

const REPEAT_MODE_ITEMS = [
  { label: 'Một lần', value: 'once' },
  { label: 'Hàng ngày', value: 'daily' },
  { label: 'Hàng tuần', value: 'weekly' },
  { label: 'Hàng tháng', value: 'monthly' },
  { label: 'Hàng quý', value: 'quarterly' },
]

const CRON_PRESETS = [
  { label: '0h mỗi ngày', value: '0 0 * * *' },
  { label: '0h thứ 2 hàng tuần', value: '0 0 * * 1' },
  { label: '0h ngày 1 hàng tháng', value: '0 0 1 * *' },
  { label: '8h mỗi ngày', value: '0 8 * * *' },
  { label: '20h mỗi ngày', value: '0 20 * * *' },
  { label: 'Tùy chỉnh', value: '__custom__' },
]

const INVOICE_TYPE_ITEMS = [
  { label: 'Bán ra', value: 'SELL' },
  { label: 'Mua vào', value: 'BUY' },
  { label: 'Cả hai', value: 'BOTH' },
]

const OVERWRITE_MODE_ITEMS = [
  { label: 'Bỏ qua nếu đã tồn tại', value: 'SKIP' },
  { label: 'Ghi đè', value: 'OVERWRITE' },
  { label: 'Tạo phiên bản mới', value: 'NEW_VERSION' },
]

export function ScheduleFormDialog({ open, onOpenChange, onSubmit, initial }: Props) {
  const isEdit = !!initial

  const [name, setName] = useState('')
  const [repeatMode, setRepeatMode] = useState('weekly')
  const [cronPreset, setCronPreset] = useState(CRON_PRESETS[0].value)
  const [cronCustom, setCronCustom] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [dateRangeDays, setDateRangeDays] = useState('')
  const [invoiceType, setInvoiceType] = useState('SELL')
  const [overwriteMode, setOverwriteMode] = useState('SKIP')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return

    if (initial) {
      setName(initial.name || '')
      setRepeatMode(initial.repeatMode)
      if (initial.repeatMode === 'once') {
        if (initial.scheduledAt) {
          // Convert to datetime-local format
          const d = new Date(initial.scheduledAt)
          setScheduledAt(d.toISOString().slice(0, 16))
        }
      } else {
        const preset = CRON_PRESETS.find((p) => p.value === initial.cronExpression)
        if (preset) {
          setCronPreset(preset.value)
          setCronCustom('')
        } else {
          setCronPreset('__custom__')
          setCronCustom(initial.cronExpression || '')
        }
      }
      setDateRangeDays(initial.dateRangeDays ? String(initial.dateRangeDays) : '')
      setInvoiceType(initial.invoiceType)
      setOverwriteMode(initial.overwriteMode)
    } else {
      // Reset form
      setName('')
      setRepeatMode('weekly')
      setCronPreset(CRON_PRESETS[0].value)
      setCronCustom('')
      setScheduledAt('')
      setDateRangeDays('')
      setInvoiceType('SELL')
      setOverwriteMode('SKIP')
    }
  }, [open, initial])

  const handleSubmit = async () => {
    if (repeatMode === 'once' && !scheduledAt) return
    if (repeatMode !== 'once') {
      const cron = cronPreset === '__custom__' ? cronCustom : cronPreset
      if (!cron) return
    }

    setSubmitting(true)
    try {
      const cronExpr = repeatMode === 'once'
        ? ''
        : (cronPreset === '__custom__' ? cronCustom : cronPreset)

      const payload: CreateScheduleData = {
        name: name || undefined,
        repeatMode,
        cronExpression: cronExpr,
        scheduledAt: repeatMode === 'once' ? new Date(scheduledAt).toISOString() : undefined,
        dateRangeDays: dateRangeDays ? parseInt(dateRangeDays) : undefined,
        invoiceType,
        overwriteMode,
      }
      await onSubmit(payload)
    } finally {
      setSubmitting(false)
    }
  }

  const isValid = repeatMode === 'once'
    ? !!scheduledAt
    : !!(cronPreset === '__custom__' ? cronCustom : cronPreset)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Sửa lịch' : 'Tạo lịch mới'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Tên lịch</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Tải hoá đơn hàng tuần"
            />
          </div>

          {/* Repeat mode */}
          <div className="space-y-1.5">
            <Label>Loại lặp</Label>
            <Select
              items={REPEAT_MODE_ITEMS}
              value={repeatMode}
              onValueChange={(v) => v && setRepeatMode(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPEAT_MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Once: date picker */}
          {repeatMode === 'once' && (
            <div className="space-y-1.5">
              <Label>Thời gian chạy</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          )}

          {/* Recurring: cron */}
          {repeatMode !== 'once' && (
            <div className="space-y-1.5">
              <Label>Lịch chạy</Label>
              <Select
                items={CRON_PRESETS}
                value={cronPreset}
                onValueChange={(v) => v && setCronPreset(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cronPreset === '__custom__' && (
                <Input
                  className="mt-2 font-mono"
                  value={cronCustom}
                  onChange={(e) => setCronCustom(e.target.value)}
                  placeholder="0 0 * * *"
                />
              )}
            </div>
          )}

          {/* Date range days */}
          <div className="space-y-1.5">
            <Label>Số ngày tải (tùy chọn)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={dateRangeDays}
              onChange={(e) => setDateRangeDays(e.target.value)}
              placeholder="Để trống để tự động theo loại lặp"
            />
            <p className="text-xs text-muted-foreground">
              Số ngày lùi về quá khứ để tải. Bỏ trống để tự động (tuần=7 ngày, tháng=tháng trước...)
            </p>
          </div>

          {/* Invoice type */}
          <div className="space-y-1.5">
            <Label>Loại hoá đơn</Label>
            <Select
              items={INVOICE_TYPE_ITEMS}
              value={invoiceType}
              onValueChange={(v) => v && setInvoiceType(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_TYPE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Overwrite mode */}
          <div className="space-y-1.5">
            <Label>Chế độ ghi đè</Label>
            <Select
              items={OVERWRITE_MODE_ITEMS}
              value={overwriteMode}
              onValueChange={(v) => v && setOverwriteMode(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVERWRITE_MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo lịch'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
