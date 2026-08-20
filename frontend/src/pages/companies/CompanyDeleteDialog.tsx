import { useState } from 'react'
import { toast } from 'sonner'
import { companiesApi } from '@/api/companies'
import { getErrorMessage } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import type { Company } from '@/types'

interface CompanyDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  company: Company | null
  onDeleted: () => void
}

export function CompanyDeleteDialog({ open, onOpenChange, company, onDeleted }: CompanyDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!company) return
    setDeleting(true)
    try {
      await companiesApi.delete(company.id)
      toast.success('Xoá doanh nghiệp thành công')
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Xoá doanh nghiệp</DialogTitle>
          <DialogDescription>
            Bạn có chắc chắn muốn xoá doanh nghiệp <strong>{company?.name}</strong> (MST: {company?.taxCode})?
            Hành động này không thể hoàn tác.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Huỷ</Button>} />
          <LoadingButton variant="destructive" onClick={handleDelete} loading={deleting}>
            Xoá
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
