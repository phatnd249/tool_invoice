import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  RefreshCw,
  CloudDownload,
  Keyboard,
  CheckCircle2,
  XCircle,
  Building2,
} from 'lucide-react'
import { companiesApi } from '@/api/companies'
import { getErrorMessage } from '@/lib/apiClient'
import { useAuth } from '@/contexts/AuthContext'
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
import { Skeleton } from '@/components/ui/skeleton'
import { CompanyFormDialog } from './CompanyFormDialog'
import { CompanyDeleteDialog } from './CompanyDeleteDialog'
import { CompanyLoginManualDialog } from './CompanyLoginManualDialog'
import type { Company } from '@/types'

const LOGIN_MODE_OPTIONS = [
  { value: '', label: 'Tất cả chế độ' },
  { value: 'AUTO', label: 'Tự động' },
  { value: 'MANUAL', label: 'Thủ công' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoginModeBadge({ mode }: { mode: string }) {
  if (mode === 'AUTO') return <Badge variant="default">Tự động</Badge>
  return <Badge variant="secondary">Thủ công</Badge>
}

function TokenStatus({ company }: { company: Company }) {
  if (!company.token) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
        <XCircle className="size-3.5 text-muted-foreground" />
        Chưa đăng nhập
      </span>
    )
  }

  const isExpired = company.tokenExpiredAt
    ? new Date(company.tokenExpiredAt) < new Date()
    : true

  if (isExpired) {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" />
        Hết hạn
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
      <CheckCircle2 className="size-3" />
      {new Date(company.tokenExpiredAt!).toLocaleDateString('vi-VN')}
    </Badge>
  )
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell colSpan={6} className="py-12 text-center">
        <div className="flex justify-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CompaniesPage() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('company:create')
  const canUpdate = hasPermission('company:update')
  const canDelete = hasPermission('company:delete')
  const canLogin = hasPermission('company:login')

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [loginModeFilter, setLoginModeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const LIMIT = 10

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [editCompany, setEditCompany] = useState<Company | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [manualLoginTarget, setManualLoginTarget] = useState<Company | null>(null)
  const [manualLoginOpen, setManualLoginOpen] = useState(false)

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await companiesApi.getAll({
        page,
        limit: LIMIT,
        search: search || undefined,
        loginMode: loginModeFilter || undefined,
      })
      setCompanies(data.data)
      setTotalPages(data.totalPages)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, search, loginModeFilter])

  useEffect(() => { fetchCompanies() }, [fetchCompanies])

  const handleRefreshToken = async (company: Company) => {
    try {
      await companiesApi.refreshToken(company.id)
      toast.success(`Làm mới token thành công cho ${company.name}`)
      fetchCompanies()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const handleSyncInfo = async (company: Company) => {
    try {
      await companiesApi.syncInfo(company.id)
      toast.success(`Đồng bộ thông tin thành công cho ${company.name}`)
      fetchCompanies()
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  return (
    <Layout title="Quản lý doanh nghiệp">
      <div className="space-y-4">
        {/* ── Toolbar ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Tìm theo MST hoặc tên DN…"
                className="pl-9"
              />
            </div>
            <Select
              items={LOGIN_MODE_OPTIONS}
              value={loginModeFilter}
              onValueChange={(v) => { setLoginModeFilter(v ?? ''); setPage(1) }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOGIN_MODE_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" size="icon" onClick={fetchCompanies} title="Làm mới">
              <RefreshCw className="size-4" />
            </Button>
            {canCreate && (
              <Button
                size="sm"
                onClick={() => { setEditCompany(null); setFormOpen(true) }}
              >
                <Plus className="size-4" /> Thêm doanh nghiệp
              </Button>
            )}
          </div>
        </div>

        {/* ── Table ───────────────────────────────────────────────────── */}
        <div className="rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doanh nghiệp</TableHead>
                <TableHead className="hidden sm:table-cell">Chế độ ĐN</TableHead>
                <TableHead>Token</TableHead>
                <TableHead className="hidden md:table-cell">Số lượt tải</TableHead>
                <TableHead className="hidden lg:table-cell">Ngày tạo</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <SkeletonRow />
              ) : companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Building2 className="size-10 stroke-[1.25]" />
                      <div>
                        <p className="font-medium">Chưa có doanh nghiệp nào</p>
                        <p className="text-sm">
                          {search || loginModeFilter
                            ? 'Không tìm thấy kết quả phù hợp.'
                            : 'Nhấn "Thêm doanh nghiệp" để bắt đầu.'}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Building2 className="size-4" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.taxCode}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <LoginModeBadge mode={c.loginMode} />
                    </TableCell>
                    <TableCell>
                      <TokenStatus company={c} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell tabular-nums">
                      {c.downloadCount.toLocaleString('vi-VN')}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canLogin && c.loginMode === 'AUTO' && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleRefreshToken(c)}
                            title="Làm mới token"
                          >
                            <RefreshCw className="size-4" />
                          </Button>
                        )}
                        {canLogin && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => { setManualLoginTarget(c); setManualLoginOpen(true) }}
                            title="Đăng nhập thủ công"
                          >
                            <Keyboard className="size-4" />
                          </Button>
                        )}
                        {canUpdate && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleSyncInfo(c)}
                              title="Đồng bộ thông tin từ masothue.com"
                            >
                              <CloudDownload className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => { setEditCompany(c); setFormOpen(true) }}
                              title="Chỉnh sửa"
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => { setDeleteTarget(c); setDeleteOpen(true) }}
                            title="Xoá"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* ── Pagination ─────────────────────────────────────────────── */}
          {!loading && companies.length > 0 && (
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
          )}
        </div>
      </div>

      <CompanyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={fetchCompanies}
        editCompany={editCompany}
      />
      <CompanyDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        company={deleteTarget}
        onDeleted={fetchCompanies}
      />
      <CompanyLoginManualDialog
        open={manualLoginOpen}
        onOpenChange={setManualLoginOpen}
        company={manualLoginTarget}
        onSuccess={fetchCompanies}
      />
    </Layout>
  )
}
