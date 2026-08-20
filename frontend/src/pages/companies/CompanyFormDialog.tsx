import { useState, useEffect, type FormEvent } from 'react'
import { toast } from 'sonner'
import { companiesApi } from '@/api/companies'
import { getErrorMessage } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

const LOGIN_MODE_ITEMS = [
  { label: 'Tự động (Gemini AI giải captcha)', value: 'AUTO' },
  { label: 'Thủ công (tự nhập captcha)', value: 'MANUAL' },
]

interface CompanyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  editCompany: Company | null
}

export function CompanyFormDialog({ open, onOpenChange, onSaved, editCompany }: CompanyFormDialogProps) {
  const isEdit = !!editCompany
  const [form, setForm] = useState({
    taxCode: '',
    name: '',
    lookupPassword: '',
    loginMode: 'AUTO' as string,
    ckey: '',
    cvalue: '',
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (editCompany) {
      setForm({
        taxCode: editCompany.taxCode,
        name: editCompany.name,
        lookupPassword: editCompany.lookupPassword,
        loginMode: editCompany.loginMode,
        ckey: '',
        cvalue: '',
      })
    } else {
      setForm({ taxCode: '', name: '', lookupPassword: '', loginMode: 'AUTO', ckey: '', cvalue: '' })
    }
  }, [editCompany, open])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!isEdit && !form.taxCode.trim()) {
      toast.error('Mã số thuế là bắt buộc')
      return
    }
    if (!isEdit && !form.lookupPassword.trim()) {
      toast.error('Mật khẩu tra cứu là bắt buộc')
      return
    }
    if (!isEdit && form.loginMode === 'MANUAL' && (!form.ckey.trim() || !form.cvalue.trim())) {
      toast.error('Vui lòng nhập đầy đủ thông tin Captcha cho chế độ thủ công')
      return
    }

    setLoading(true)
    try {
      if (isEdit) {
        await companiesApi.update(editCompany.id, {
          name: form.name || undefined,
          lookupPassword: form.lookupPassword || undefined,
          loginMode: form.loginMode || undefined,
        })
        toast.success('Cập nhật doanh nghiệp thành công')
      } else {
        await companiesApi.create({
          taxCode: form.taxCode,
          lookupPassword: form.lookupPassword,
          name: form.name || undefined,
          loginMode: form.loginMode,
          ckey: form.loginMode === 'MANUAL' ? form.ckey : undefined,
          cvalue: form.loginMode === 'MANUAL' ? form.cvalue : undefined,
        })
        toast.success('Thêm doanh nghiệp thành công')
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Chỉnh sửa doanh nghiệp' : 'Thêm doanh nghiệp mới'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Cập nhật thông tin doanh nghiệp. Mã số thuế không thể thay đổi.'
              : 'Nhập thông tin doanh nghiệp. Hệ thống sẽ tự động đăng nhập vào Tổng cục Thuế để lấy token.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="taxCode">Mã số thuế</Label>
            <Input
              id="taxCode"
              value={form.taxCode}
              onChange={(e) => setForm((p) => ({ ...p, taxCode: e.target.value }))}
              disabled={isEdit}
              placeholder="VD: 0312345678"
              required={!isEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Tên doanh nghiệp</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Để trống để tự động lấy từ GDT"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lookupPassword">Mật khẩu tra cứu</Label>
            <Input
              id="lookupPassword"
              type="password"
              value={form.lookupPassword}
              onChange={(e) => setForm((p) => ({ ...p, lookupPassword: e.target.value }))}
              placeholder="Mật khẩu đăng nhập GDT"
              required={!isEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loginMode">Chế độ đăng nhập</Label>
            <Select
              items={LOGIN_MODE_ITEMS}
              value={form.loginMode}
              onValueChange={(v) => setForm((p) => ({ ...p, loginMode: v ?? 'AUTO' }))}
            >
              <SelectTrigger id="loginMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOGIN_MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && form.loginMode === 'MANUAL' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="ckey">Captcha Key (ckey)</Label>
                <Input
                  id="ckey"
                  value={form.ckey}
                  onChange={(e) => setForm((p) => ({ ...p, ckey: e.target.value }))}
                  placeholder="Nhập captcha key từ GDT"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvalue">Captcha Value (cvalue)</Label>
                <Input
                  id="cvalue"
                  value={form.cvalue}
                  onChange={(e) => setForm((p) => ({ ...p, cvalue: e.target.value }))}
                  placeholder="Nhập mã captcha"
                />
              </div>
            </>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button">Huỷ</Button>} />
            <LoadingButton type="submit" loading={loading}>
              {isEdit ? 'Lưu thay đổi' : 'Thêm doanh nghiệp'}
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
