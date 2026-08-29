import { useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Download, CalendarIcon, RotateCcw, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { useDownloadTask } from '@/hooks/useDownloadTask'
import { invoicesApi } from '@/api/invoices'
import { getErrorMessage } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DownloadProgress } from './DownloadProgress'
import OverwriteConfirmDialog, {
  type OverwriteMode,
} from '@/components/OverwriteConfirmDialog'
import type { Company } from '@/types'

const INVOICE_TYPE_ITEMS = [
  { label: 'Cả hai (mua vào & bán ra)', value: 'BOTH' },
  { label: 'Mua vào', value: 'BUY' },
  { label: 'Bán ra', value: 'SELL' },
]

interface InvoiceDownloadFormProps {
  company: Company
  onDownloaded?: (result: any) => void
}

export function InvoiceDownloadForm({
  company,
}: InvoiceDownloadFormProps) {
  const today = new Date()
  const lastMonth = new Date(Date.now() - 30 * 86400000)

  const [dateRange, setDateRange] = useState<DateRange>({
    from: lastMonth,
    to: today,
  })
  const [invoiceType, setInvoiceType] = useState('BOTH')
  const [loading, setLoading] = useState(false)

  // Overwrite dialog
  const [showOverwriteDialog, setShowOverwriteDialog] =
    useState(false)
  const [existingCount, setExistingCount] = useState(0)
  const [isChecking, setIsChecking] = useState(false)

  const {
    status,
    progress,
    processed,
    total,
    currentInvoiceType,
    logs,
    result,
    errorMessage,
    startDownload,
    cancelDownload,
    reset,
    overallProgress,
    currentDate,
    dayIndex,
    totalDays,
  } = useDownloadTask(company.id)

  // Watch for done results
  if (status === 'done' && result) {
    // Only call onDownloaded once (onDownloaded will be called via the effect in parent)
  }

  const tokenExpired = company.tokenExpiredAt
    ? new Date(company.tokenExpiredAt) < new Date()
    : true

  const getDisabledReason = (): string | null => {
    if (!dateRange.from || !dateRange.to) return 'Vui lòng chọn khoảng thời gian'
    if (!company.token && company.loginMode === 'MANUAL')
      return 'Doanh nghiệp chưa được đăng nhập.'
    if (tokenExpired && company.loginMode === 'MANUAL')
      return 'Token đã hết hạn. Vui lòng đăng nhập thủ công trước.'
    return null
  }

  const disabledReason = getDisabledReason()

  const TokenBadge = () => {
    if (!company.token)
      return <Badge variant="secondary">Chưa đăng nhập</Badge>
    if (tokenExpired && company.loginMode === 'MANUAL')
      return <Badge variant="destructive">Token hết hạn</Badge>
    if (tokenExpired)
      return (
        <Badge
          variant="secondary"
          className="bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
        >
          Sẽ tự động refresh
        </Badge>
      )
    return (
      <Badge
        variant="outline"
        className="border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
      >
        Token sẵn sàng
      </Badge>
    )
  }

  const handleDownload = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Vui lòng chọn khoảng thời gian')
      return
    }

    setIsChecking(true)
    try {
      const { data } = await invoicesApi.checkExisting({
        companyId: company.id,
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        invoiceType,
      })

      if (data.hasExisting) {
        setExistingCount(data.count)
        setShowOverwriteDialog(true)
      } else {
        doStartDownload()
      }
    } catch {
      // API lỗi → vẫn cho tải bình thường
      doStartDownload()
    } finally {
      setIsChecking(false)
    }
  }

  const doStartDownload = async (overwriteMode?: string) => {
    if (!dateRange.from || !dateRange.to) return

    setLoading(true)
    try {
      await startDownload({
        companyId: company.id,
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        invoiceType,
        overwriteMode,
      })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleOverwriteConfirm = (mode: OverwriteMode) => {
    setShowOverwriteDialog(false)
    if (mode === 'SKIP') {
      toast.info('Đã bỏ qua tải hoá đơn.')
      return
    }
    doStartDownload(mode)
  }

  const handleReset = () => {
    reset()
    setLoading(false)
  }

  // ── Render: Active task (running / connecting / done / error) ──────────
  const isActive =
    status === 'connecting' ||
    status === 'running' ||
    status === 'done' ||
    status === 'error' ||
    status === 'cancelled'

  if (isActive) {
    return (
      <div className="space-y-3">
        <DownloadProgress
          status={status}
          progress={progress}
          overallProgress={overallProgress}
          processed={processed}
          total={total}
          currentInvoiceType={currentInvoiceType}
          currentDate={currentDate}
          dayIndex={dayIndex}
          totalDays={totalDays}
          startDate={dateRange.from?.toISOString() ?? null}
          endDate={dateRange.to?.toISOString() ?? null}
          logs={logs}
          result={result}
          errorMessage={errorMessage}
        />

        {/* Cancel button: chỉ hiện khi đang chạy */}
        {status === 'running' && (
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={cancelDownload}
          >
            <X className="size-4" />
            Huỷ tải
          </Button>
        )}

        {/* Reset button: hiện khi done / error / cancelled */}
        {(status === 'done' || status === 'error' || status === 'cancelled') && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleReset}
          >
            <RotateCcw className="size-4" />
            Tải lại
          </Button>
        )}
      </div>
    )
  }

  // ── Render: Idle form ──────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Trạng thái token:</span>
        <TokenBadge />
      </div>

      {/* Date range picker */}
      <div className="space-y-1.5">
        <Label className="text-xs">Khoảng thời gian</Label>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 size-4" />
                {dateRange.from && dateRange.to
                  ? `${format(dateRange.from, 'dd/MM/yyyy')} → ${format(dateRange.to, 'dd/MM/yyyy')}`
                  : 'Chọn khoảng thời gian'}
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              defaultMonth={dateRange.from || today}
              required={true}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Invoice type */}
      <div className="space-y-1.5">
        <Label className="text-xs">Loại hoá đơn</Label>
        <Select
          items={INVOICE_TYPE_ITEMS}
          value={invoiceType}
          onValueChange={(v) => setInvoiceType(v ?? 'BOTH')}
        >
          <SelectTrigger className="w-full">
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

      {/* Download button */}
      {disabledReason && (
        <p className="text-xs text-destructive">{disabledReason}</p>
      )}
      <LoadingButton
        onClick={handleDownload}
        loading={loading}
        disabled={!!disabledReason}
        className="w-full"
      >
        <Download className="size-4" />
        {loading || isChecking ? 'Đang tạo task...' : 'Tải hoá đơn'}
      </LoadingButton>

      <OverwriteConfirmDialog
        open={showOverwriteDialog}
        onOpenChange={setShowOverwriteDialog}
        companyName={company.name}
        startDate={
          dateRange.from
            ? format(dateRange.from, 'dd/MM/yyyy')
            : ''
        }
        endDate={
          dateRange.to
            ? format(dateRange.to, 'dd/MM/yyyy')
            : ''
        }
        existingCount={existingCount}
        onConfirm={handleOverwriteConfirm}
      />
    </div>
  )
}
