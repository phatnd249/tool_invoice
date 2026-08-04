import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { companiesApi } from '@/api/companies'
import { usersApi } from '@/api/users'
import { getErrorMessage } from '@/lib/apiClient'
import type { Company } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userName: string
  onSaved: () => void
}

export function UserCompaniesDialog({ open, onOpenChange, userId, userName, onSaved }: Props) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const fetch = async () => {
      setLoading(true)
      try {
        const [{ data: allCompanies }, { data: userCompanies }] = await Promise.all([
          companiesApi.getAll({ page: 1, limit: 200, sortBy: 'name', sortOrder: 'asc' }),
          usersApi.getUserCompanies(userId),
        ])
        setCompanies(allCompanies.data)
        setSelected(new Set(userCompanies.map((c: Company) => c.id)))
      } catch (err) {
        toast.error(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [open, userId])

  const filtered = companies.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.taxCode.includes(search),
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(filtered.map((c) => c.id)))
  const clearAll = () => setSelected(new Set())

  const handleSave = async () => {
    setSaving(true)
    try {
      await usersApi.assignCompanies(userId, Array.from(selected))
      toast.success(`Đã cập nhật danh sách công ty cho ${userName}`)
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gán công ty cho người dùng</DialogTitle>
          <DialogDescription>
            Chọn các công ty mà <strong>{userName}</strong> được phép truy cập.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc MST..."
            className="pl-9"
          />
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Chọn tất cả
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll}>
            Bỏ chọn tất cả
          </Button>
          <span className="ml-auto text-sm text-muted-foreground self-center">
            {selected.size} đã chọn
          </span>
        </div>

        {/* Company list */}
        <div className="flex-1 overflow-y-auto border rounded-md -mx-1 px-1">
          {loading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Không tìm thấy công ty
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((company) => (
                <label
                  key={company.id}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.has(company.id)}
                    onCheckedChange={() => toggle(company.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{company.name}</p>
                    <p className="text-xs text-muted-foreground">{company.taxCode}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : `Lưu (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
