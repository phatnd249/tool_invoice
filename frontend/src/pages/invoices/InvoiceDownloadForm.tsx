import { useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Download, CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { invoicesApi } from '@/api/invoices'
import { getErrorMessage } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
import type { Company, DownloadResult } from '@/types'

const INVOICE_TYPE_ITEMS = [
  { label: 'Cả hai (mua vào & bán ra)', value: 'BOTH' },
  { label: 'Mua vào', value: 'BUY' },
  { label: 'Bán ra', value: 'SELL' },
]

interface InvoiceDownloadFormProps {
  company: Company
  onDownloaded: (result: DownloadResult) => void
}

export function InvoiceDownloadForm({ company, onDownloaded }: InvoiceDownloadFormProps) {
  const today = new Date()
  const lastMonth = new Date(Date.now() - 30 * 86400000)

  const [dateRange, setDateRange] = useState<DateRange>({
    from: lastMonth,
    to: today,
  })
  const [invoiceType, setInvoiceType] = useState('BOTH')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DownloadResult | null>(null)

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

    setLoading(true)
    setResult(null)
    try {
      const { data } = await invoicesApi.download({
        companyId: company.id,
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to, 'yyyy-MM-dd'),
        invoiceType,
      })
      setResult(data)
      onDownloaded(data)
      toast.success(
        `Đã tải thành công ${data.totalSaved} hoá đơn cho ${company.name}`,
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

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
              />
            }
          >
            <CalendarIcon className="mr-2 size-4" />
            {dateRange.from && dateRange.to
              ? `${format(dateRange.from, 'dd/MM/yyyy')} → ${format(dateRange.to, 'dd/MM/yyyy')}`
              : 'Chọn khoảng thời gian'}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              defaultMonth={dateRange.from || today}
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
        {loading ? 'Đang tải...' : 'Tải hoá đơn'}
      </LoadingButton>

      {/* Result summary */}
      {result && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
          {result.results.map((r) => (
            <div key={r.type} className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {r.type === 'BUY' ? 'Mua vào' : 'Bán ra'}
              </span>
              <span className="tabular-nums">
                {r.totalQueried} hoá đơn
                {r.created > 0 && (
                  <span className="text-green-600 dark:text-green-400">
                    {' '}
                    (+{r.created} mới)
                  </span>
                )}
                {r.updated > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    ({r.updated} cập nhật)
                  </span>
                )}
              </span>
            </div>
          ))}
          <Separator />
          <div className="flex items-center justify-between font-semibold">
            <span>Tổng</span>
            <span className="tabular-nums">{result.totalSaved} hoá đơn đã lưu</span>
          </div>
        </div>
      )}
    </div>
  )
}
