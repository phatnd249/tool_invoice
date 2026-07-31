import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { invoicesApi } from '@/api/invoices'
import { getErrorMessage } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
  const today = new Date().toISOString().slice(0, 10)
  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(lastMonth)
  const [endDate, setEndDate] = useState(today)
  const [invoiceType, setInvoiceType] = useState('BOTH')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DownloadResult | null>(null)

  // Kiểm tra token trạng thái
  const tokenExpired = company.tokenExpiredAt
    ? new Date(company.tokenExpiredAt) < new Date()
    : true
  const canDownload =
    !!company.token && !tokenExpired
      ? true
      : company.loginMode === 'AUTO'
        ? true // AUTO mode sẽ tự refresh
        : false // MANUAL mode + hết hạn → cần login lại

  const getDisabledReason = (): string | null => {
    if (!startDate || !endDate) return 'Vui lòng chọn khoảng thời gian'
    if (!company.token && company.loginMode === 'MANUAL')
      return 'Doanh nghiệp chưa được đăng nhập. Vui lòng đăng nhập thủ công.'
    if (tokenExpired && company.loginMode === 'MANUAL')
      return 'Token đã hết hạn. Vui lòng đăng nhập thủ công trước.'
    return null
  }

  const disabledReason = getDisabledReason()

  // Token status display
  const tokenLabel = !company.token
    ? 'Chưa đăng nhập'
    : tokenExpired
      ? company.loginMode === 'AUTO'
        ? 'Sẽ tự động refresh'
        : 'Cần đăng nhập lại'
      : 'Token sẵn sàng'

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
    if (!startDate || !endDate) {
      toast.error('Vui lòng chọn khoảng thời gian')
      return
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast.error('Ngày bắt đầu phải trước ngày kết thúc')
      return
    }

    setLoading(true)
    setResult(null)
    try {
      const { data } = await invoicesApi.download({
        companyId: company.id,
        startDate,
        endDate,
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

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`start-${company.id}`} className="text-xs">
            Từ ngày
          </Label>
          <Input
            id={`start-${company.id}`}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate || undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`end-${company.id}`} className="text-xs">
            Đến ngày
          </Label>
          <Input
            id={`end-${company.id}`}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || undefined}
          />
        </div>
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
                {r.type === 'BUY' ? '📥 Mua vào' : '📤 Bán ra'}
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

// Re-export for use in CompanyAccordion
export { INVOICE_TYPE_ITEMS }
