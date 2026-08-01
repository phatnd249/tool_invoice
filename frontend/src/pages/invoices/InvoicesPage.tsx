import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Search, Building2 } from 'lucide-react'
import { companiesApi } from '@/api/companies'
import { getErrorMessage } from '@/lib/apiClient'
import { Layout } from '@/components/layout/Layout'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CompanyAccordion } from './CompanyAccordion'
import type { Company } from '@/types'

export function InvoicesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await companiesApi.getAll({ page: 1, limit: 100, sortBy: 'name', sortOrder: 'asc' })
        setCompanies(data.data)
      } catch (err) {
        toast.error(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [])

  const filtered = companies.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.taxCode.includes(search),
  )

  return (
    <Layout title="Tải hoá đơn">
      <div className="space-y-4 max-w-5xl mx-auto">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc MST…"
            className="pl-9"
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="py-20 text-center text-muted-foreground">
            <Building2 className="size-12 mx-auto mb-4 stroke-[1.25]" />
            {search ? (
              <>
                <p className="font-medium">Không tìm thấy công ty</p>
                <p className="text-sm mt-1">Thử tìm với từ khoá khác.</p>
              </>
            ) : (
              <>
                <p className="font-medium">Chưa có doanh nghiệp nào</p>
                <p className="text-sm mt-1">
                  Vui lòng thêm doanh nghiệp trong mục "Quản lý doanh nghiệp".
                </p>
              </>
            )}
          </div>
        )}

        {/* Accordion list */}
        {filtered.map((company) => (
          <CompanyAccordion key={company.id} company={company} />
        ))}
      </div>
    </Layout>
  )
}
