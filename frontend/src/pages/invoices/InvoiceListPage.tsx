import React, { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  Search,
  RefreshCw,
  List,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  Eye,
  X,
} from 'lucide-react'
import { invoicesApi } from '@/api/invoices'
import { companiesApi } from '@/api/companies'
import { getErrorMessage } from '@/lib/apiClient'
import { Layout } from '@/components/layout/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import type { Invoice, Company } from '@/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_ITEMS = [
  { label: 'Bán ra', value: 'SELL' },
  { label: 'Mua vào', value: 'BUY' },
]

const PAGE_SIZES = [10, 20, 50, 100]

const PROCESS_STATUS_MAP: Record<number, string> = {
  0: 'K', 1: 'K', 2: 'K', 3: 'K', 4: 'K', 5: 'C', 6: 'K', 7: 'K', 8: 'M',
}

const PROCESS_STATUS_LABEL: Record<number, string> = {
  0: 'Cục Thuế đã nhận',
  1: 'Đang tiến hành kiểm tra điều kiện cấp mã',
  2: 'CQT từ chối hóa đơn theo từng lần phát sinh',
  3: 'Hóa đơn đủ điều kiện cấp mã',
  4: 'Hóa đơn không đủ điều kiện cấp mã',
  5: 'Đã cấp mã hóa đơn',
  6: 'Cục Thuế đã nhận không mã',
  7: 'Đã kiểm tra định kỳ HĐĐT không có mã',
  8: 'Cục Thuế đã nhận hóa đơn có mã khởi tạo từ máy tính tiền',
}

const INVOICE_STATUS_MAP: Record<number, string> = {
  1: '', 2: 'TT', 3: 'DC', 4: 'BTT', 5: 'BDC', 6: 'HUY',
}

const INVOICE_STATUS_LABEL: Record<number, string> = {
  1: 'Hóa đơn mới',
  2: 'Hóa đơn thay thế',
  3: 'Hóa đơn điều chỉnh',
  4: 'Hóa đơn đã bị thay thế',
  5: 'Hóa đơn đã bị điều chỉnh',
  6: 'Hóa đơn đã bị hủy',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('vi-VN').format(value)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

function getStatusDisplay(invoice: Invoice): string {
  const p = invoice.processStatus != null ? PROCESS_STATUS_MAP[invoice.processStatus] : null
  const s = invoice.invoiceStatus != null ? INVOICE_STATUS_MAP[invoice.invoiceStatus] : null
  if (!p && !s) return '—'
  if (p && s) return `${p}-${s}`
  return p || s || '—'
}

function getStatusTooltip(invoice: Invoice): string {
  const parts: string[] = []
  if (invoice.processStatus != null) {
    parts.push(`KQKT: ${PROCESS_STATUS_LABEL[invoice.processStatus] ?? invoice.processStatus}`)
  }
  if (invoice.invoiceStatus != null) {
    parts.push(`Trạng thái: ${INVOICE_STATUS_LABEL[invoice.invoiceStatus] ?? invoice.invoiceStatus}`)
  }
  return parts.length > 0 ? parts.join('\n') : 'Không có thông tin'
}

function getStatusVariant(invoice: Invoice): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (invoice.invoiceStatus === 6) return 'destructive'
  if (invoice.processStatus === 5) return 'default'
  if (invoice.processStatus != null) return 'secondary'
  return 'outline'
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ invoice }: { invoice: Invoice }) {
  const display = getStatusDisplay(invoice)
  const tooltip = getStatusTooltip(invoice)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={getStatusVariant(invoice)} className="cursor-default">
          {display}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className="whitespace-pre-line max-w-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

// ─── Download Status Badge ─────────────────────────────────────────────────

function DownloadStatusBadge({ invoice }: { invoice: Invoice }) {
  if (!invoice.downloadStatus) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="cursor-default border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
            Chờ tải
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Chưa tải file ZIP/XML</TooltipContent>
      </Tooltip>
    )
  }

  if (invoice.downloadStatus === 'PARSED') {
    return (
      <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
        Đã tải
      </Badge>
    )
  }

  if (invoice.downloadStatus === 'ERROR') {
    const errMsg = invoice.errorMessage || 'Lỗi không xác định'
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="destructive" className="cursor-default">
            Lỗi tải
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap">
          {errMsg}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Badge variant="secondary">{invoice.downloadStatus}</Badge>
  )
}

// ─── Sort Icon ───────────────────────────────────────────────────────────────

function SortIcon({ field, currentField, order }: { field: string; currentField: string; order: 'asc' | 'desc' }) {
  if (currentField !== field) return <ArrowUpDown className="ml-1 size-3 inline opacity-40" />
  return order === 'asc'
    ? <ArrowUp className="ml-1 size-3 inline text-primary" />
    : <ArrowDown className="ml-1 size-3 inline text-primary" />
}

// ─── Detail Dialog ───────────────────────────────────────────────────────────

function InvoiceDetailDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!invoice) return null

  const typeLabel = invoice.type === 'SELL' ? 'Bán ra' : 'Mua vào'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <List className="size-5" />
            Chi tiết hoá đơn — {invoice.invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta info */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm bg-muted/30 rounded-lg p-4">
            <div>
              <span className="text-muted-foreground">Ngày lập:</span>{' '}
              <span className="font-semibold">{formatDate(invoice.invoiceDate)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Loại:</span>{' '}
              <Badge variant={invoice.type === 'SELL' ? 'default' : 'secondary'}>
                {typeLabel}
              </Badge>
            </div>
            <div className="truncate">
              <span className="text-muted-foreground">Bên bán:</span> {invoice.sellerName}
            </div>
            <div className="truncate">
              <span className="text-muted-foreground">Bên mua:</span> {invoice.buyerName ?? '—'}
            </div>
            <div>
              <span className="text-muted-foreground">MST bán:</span>{' '}
              <span className="font-mono text-xs">{invoice.sellerTaxCode}</span>
            </div>
            <div>
              <span className="text-muted-foreground">MST mua:</span>{' '}
              <span className="font-mono text-xs">{invoice.buyerTaxCode ?? '—'}</span>
            </div>
          </div>

          {/* Items */}
          {invoice.items && invoice.items.length > 0 ? (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">STT</TableHead>
                      <TableHead>Tên hàng hóa</TableHead>
                      <TableHead className="w-16 text-center">ĐVT</TableHead>
                      <TableHead className="w-20 text-right">SL</TableHead>
                      <TableHead className="w-28 text-right">Đơn giá</TableHead>
                      <TableHead className="w-28 text-right">Thành tiền</TableHead>
                      <TableHead className="w-18 text-center">Thuế suất</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-center text-muted-foreground">
                          {item.lineNumber ?? '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] lg:max-w-[300px] truncate" title={item.name}>
                          {item.name}
                        </TableCell>
                        <TableCell className="text-center">{item.unit ?? '-'}</TableCell>
                        <TableCell className="text-right">
                          {item.quantity != null ? item.quantity.toLocaleString('vi-VN') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.price != null ? item.price.toLocaleString('vi-VN') : '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {item.amount.toLocaleString('vi-VN')}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{item.taxRate ?? '0%'}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card list */}
              <div className="sm:hidden space-y-2">
                {invoice.items.map((item) => (
                  <div key={item.id} className="rounded-lg border bg-card p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-sm flex-1">{item.name}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {item.taxRate ?? '0%'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {item.lineNumber && <div>STT: {item.lineNumber}</div>}
                      {item.unit && <div>ĐVT: {item.unit}</div>}
                      {item.quantity != null && <div>SL: {item.quantity.toLocaleString('vi-VN')}</div>}
                      {item.price != null && <div>Đơn giá: {item.price.toLocaleString('vi-VN')}</div>}
                    </div>
                    <div className="pt-1.5 border-t text-right text-sm font-bold">
                      Thành tiền: {item.amount.toLocaleString('vi-VN')}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="size-12 mx-auto mb-3 opacity-30" />
              <p>Không có dữ liệu hàng hóa.</p>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                Tiền chưa thuế
              </p>
              <p className="text-base font-bold mt-1">{formatCurrency(invoice.totalBeforeTax)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                Tiền thuế
              </p>
              <p className="text-base font-bold mt-1 text-blue-600">{formatCurrency(invoice.taxAmount)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                Tổng thanh toán
              </p>
              <p className="text-base font-bold mt-1 text-primary">{formatCurrency(invoice.totalAmount)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                Mẫu số / KH
              </p>
              <p className="text-sm font-mono mt-1">
                {invoice.templateSymbol} / {invoice.invoiceSymbol}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                Trạng thái
              </p>
              <div className="mt-1">
                <StatusBadge invoice={invoice} />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Skeleton Row ────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-12 text-center">
        <div className="flex justify-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const SORTABLE_COLUMNS = [
  'invoiceNumber', 'invoiceDate', 'templateSymbol', 'invoiceSymbol',
  'sellerTaxCode', 'sellerName', 'buyerTaxCode', 'buyerName',
  'totalBeforeTax', 'taxAmount', 'totalAmount', 'invoiceStatus',
  'downloadStatus',
]

export function InvoiceListPage() {
  // Data
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)

  // Pagination
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Filters
  const [filterType, setFilterType] = useState('SELL')
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')

  // Sort
  const [sortBy, setSortBy] = useState('invoiceDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Detail dialog
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Preview
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  // Debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // ── Fetch invoices ──

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await invoicesApi.getAll({
        page,
        limit,
        search: search || undefined,
        type: filterType,
        companyId: companyFilter || undefined,
        sortBy,
        sortOrder,
      })
      setInvoices(data.data)
      setTotal(data.total)
      setTotalPages(data.totalPages)
      setSelectedIds([])
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, filterType, companyFilter, sortBy, sortOrder])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  // ── Fetch companies ──

  useEffect(() => {
    companiesApi.getAll({ page: 1, limit: 200, sortBy: 'name', sortOrder: 'asc' })
      .then(({ data }) => setCompanies(data.data))
      .catch(() => {})
  }, [])

  // ── Debounced search ──

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setPage(1), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  // ── Reset page on filter change ──

  useEffect(() => { setPage(1); setCompanyFilter('') }, [filterType])

  // ── Sort handler ──

  const handleSort = (field: string) => {
    if (!SORTABLE_COLUMNS.includes(field)) return
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  // ── Preview ──

  const handlePreview = async (invoiceId: string) => {
    setPreviewingId(invoiceId)
    try {
      const html = await invoicesApi.preview(invoiceId)
      const newWindow = window.open('', '_blank')
      if (newWindow) {
        newWindow.document.write(html)
        newWindow.document.close()
      } else {
        toast.error('Trình duyệt đã chặn popup. Vui lòng cho phép mở tab mới.')
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPreviewingId(null)
    }
  }

  // ── Selection ──

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? invoices.map((i) => i.id) : [])
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length

  // ── Visible columns ──

  const showSellerCols = filterType !== 'SELL'
  const showBuyerCols = filterType !== 'BUY'

  const companyItems = [
    { label: 'Tất cả công ty', value: '' },
    ...companies.map((c) => ({ label: `${c.name} (${c.taxCode})`, value: c.id })),
  ]

  return (
    <Layout title="Hoá đơn đã tải">
      <div className="space-y-4">
        {/* ── Filters row 1 ── */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            items={TYPE_ITEMS}
            value={filterType}
            onValueChange={(v) => setFilterType(v ?? 'SELL')}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Số HĐ, tên doanh nghiệp..."
              className="pl-9"
            />
          </div>

          <Button variant="outline" size="icon" onClick={fetchInvoices} title="Làm mới">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* ── Filters row 2: company ── */}
        <div className="flex items-center gap-3">
          <Select
            items={companyItems}
            value={companyFilter}
            onValueChange={(v) => { setCompanyFilter(v ?? ''); setPage(1) }}
          >
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {companyItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {companyFilter && (
            <Button variant="ghost" size="sm" onClick={() => { setCompanyFilter(''); setPage(1) }} className="gap-1 text-xs">
              <X className="size-3" /> Bỏ lọc
            </Button>
          )}
        </div>

        {/* ── Selected count ── */}
        {selectedIds.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Đã chọn {selectedIds.length} hoá đơn
          </p>
        )}

        {/* ── Table ── */}
        <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">
                  <Checkbox checked={allSelected} onCheckedChange={(v) => handleSelectAll(!!v)} />
                </TableHead>
                <TableHead className="w-10 text-center">STT</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('templateSymbol')}>
                  Mẫu số <SortIcon field="templateSymbol" currentField={sortBy} order={sortOrder} />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('invoiceSymbol')}>
                  KH HĐ <SortIcon field="invoiceSymbol" currentField={sortBy} order={sortOrder} />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('invoiceNumber')}>
                  Số HĐ <SortIcon field="invoiceNumber" currentField={sortBy} order={sortOrder} />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort('invoiceDate')}>
                  Ngày <SortIcon field="invoiceDate" currentField={sortBy} order={sortOrder} />
                </TableHead>
                {showSellerCols && (
                  <>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('sellerTaxCode')}>
                      MST bán <SortIcon field="sellerTaxCode" currentField={sortBy} order={sortOrder} />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hidden md:table-cell" onClick={() => handleSort('sellerName')}>
                      Tên người bán <SortIcon field="sellerName" currentField={sortBy} order={sortOrder} />
                    </TableHead>
                  </>
                )}
                {showBuyerCols && (
                  <>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('buyerTaxCode')}>
                      MST mua <SortIcon field="buyerTaxCode" currentField={sortBy} order={sortOrder} />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hidden md:table-cell" onClick={() => handleSort('buyerName')}>
                      Tên người mua <SortIcon field="buyerName" currentField={sortBy} order={sortOrder} />
                    </TableHead>
                  </>
                )}
                <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort('totalBeforeTax')}>
                  Tiền <SortIcon field="totalBeforeTax" currentField={sortBy} order={sortOrder} />
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right hidden md:table-cell" onClick={() => handleSort('taxAmount')}>
                  Thuế <SortIcon field="taxAmount" currentField={sortBy} order={sortOrder} />
                </TableHead>
                <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort('totalAmount')}>
                  Tổng <SortIcon field="totalAmount" currentField={sortBy} order={sortOrder} />
                </TableHead>
                <TableHead className="cursor-pointer select-none text-center" onClick={() => handleSort('invoiceStatus')}>
                  TT <SortIcon field="invoiceStatus" currentField={sortBy} order={sortOrder} />
                </TableHead>
                <TableHead className="cursor-pointer select-none text-center" onClick={() => handleSort('downloadStatus')}>
                  Tải <SortIcon field="downloadStatus" currentField={sortBy} order={sortOrder} />
                </TableHead>
                <TableHead className="text-center w-16">H.động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRow cols={21} />
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={21} className="py-16 text-center text-muted-foreground">
                    <FileText className="size-10 mx-auto mb-3 stroke-[1.25]" />
                    <p className="font-medium">Không có hoá đơn nào</p>
                    <p className="text-sm mt-1">Thử đổi bộ lọc hoặc tải hoá đơn mới.</p>
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv, idx) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={selectedIds.includes(inv.id)}
                        onCheckedChange={(v) => handleSelectOne(inv.id, !!v)}
                      />
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {(page - 1) * limit + idx + 1}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{inv.templateSymbol}</TableCell>
                    <TableCell className="font-mono text-xs">{inv.invoiceSymbol}</TableCell>
                    <TableCell className="font-mono font-semibold text-xs">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{formatDate(inv.invoiceDate)}</TableCell>
                    {showSellerCols && (
                      <>
                        <TableCell className="font-mono text-xs">{inv.sellerTaxCode}</TableCell>
                        <TableCell className="hidden md:table-cell max-w-[120px] truncate text-xs" title={inv.sellerName}>
                          {inv.sellerName}
                        </TableCell>
                      </>
                    )}
                    {showBuyerCols && (
                      <>
                        <TableCell className="font-mono text-xs">{inv.buyerTaxCode ?? '—'}</TableCell>
                        <TableCell className="hidden md:table-cell max-w-[120px] truncate text-xs" title={inv.buyerName ?? ''}>
                          {inv.buyerName ?? '—'}
                        </TableCell>
                      </>
                    )}
                    <TableCell className="text-right text-xs">{formatCurrency(inv.totalBeforeTax)}</TableCell>
                    <TableCell className="text-right text-xs hidden md:table-cell">{formatCurrency(inv.taxAmount)}</TableCell>
                    <TableCell className="text-right font-bold text-xs">{formatCurrency(inv.totalAmount)}</TableCell>
                    <TableCell className="text-center">
                      <StatusBadge invoice={inv} />
                    </TableCell>
                    <TableCell className="text-center">
                      <DownloadStatusBadge invoice={inv} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => { setDetailInvoice(inv); setDetailOpen(true) }}
                          title="Chi tiết"
                        >
                          <List className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => handlePreview(inv.id)}
                          disabled={previewingId === inv.id}
                          title="Xem trước hoá đơn"
                        >
                          <Eye className={`size-3.5 ${previewingId === inv.id ? 'animate-pulse' : ''}`} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* ── Pagination ── */}
          {!loading && invoices.length > 0 && (
            <div className="border-t px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="hidden sm:inline">Tổng:</span>
                <span className="font-semibold text-foreground">{total.toLocaleString('vi-VN')}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-xs">Dòng:</span>
                <Select
                  items={PAGE_SIZES.map((s) => ({ label: String(s), value: String(s) }))}
                  value={String(limit)}
                  onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}
                >
                  <SelectTrigger className="w-20 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Pagination className="w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .map((p, idx, arr) => (
                      <React.Fragment key={p}>
                        {idx > 0 && arr[idx - 1] !== p - 1 && (
                          <PaginationItem><PaginationEllipsis /></PaginationItem>
                        )}
                        <PaginationItem>
                          <PaginationLink isActive={p === page} onClick={() => setPage(p)}>
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      </React.Fragment>
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

      <InvoiceDetailDialog invoice={detailInvoice} open={detailOpen} onOpenChange={setDetailOpen} />
    </Layout>
  )
}
