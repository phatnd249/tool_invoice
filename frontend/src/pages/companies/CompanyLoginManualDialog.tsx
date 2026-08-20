import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { companiesApi } from '@/api/companies'
import { getErrorMessage } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

interface CompanyLoginManualDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  company: Company | null
  onSuccess: () => void
}

export function CompanyLoginManualDialog({
  open,
  onOpenChange,
  company,
  onSuccess,
}: CompanyLoginManualDialogProps) {
  const [ckey, setCkey] = useState('')
  const [cvalue, setCvalue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ckey.trim() || !cvalue.trim()) {
      toast.error('Vui lòng nhập đầy đủ ckey và cvalue')
      return
    }
    if (!company) return

    setLoading(true)
    try {
      await companiesApi.loginManual(company.id, { ckey, cvalue })
      toast.success(`Đăng nhập thủ công thành công cho ${company.name}`)
      onSuccess()
      onOpenChange(false)
      setCkey('')
      setCvalue('')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đăng nhập thủ công</DialogTitle>
          <DialogDescription>
            Nhập thông tin captcha để đăng nhập vào GDT cho doanh nghiệp{' '}
            <strong>{company?.name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="manual-ckey">Captcha Key (ckey)</Label>
            <Input
              id="manual-ckey"
              value={ckey}
              onChange={(e) => setCkey(e.target.value)}
              placeholder="Lấy từ GDT captcha API"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-cvalue">Captcha Value (cvalue)</Label>
            <Input
              id="manual-cvalue"
              value={cvalue}
              onChange={(e) => setCvalue(e.target.value)}
              placeholder="Nhập mã captcha hiển thị"
              required
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button">Huỷ</Button>} />
            <LoadingButton type="submit" loading={loading}>
              Đăng nhập
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
