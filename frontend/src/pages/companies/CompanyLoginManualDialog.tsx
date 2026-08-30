import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { toast } from 'sonner'
import { RefreshCw, ImageIcon } from 'lucide-react'
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
  const [captcha, setCaptcha] = useState<{ ckey: string; captchaImage: string } | null>(null)
  const [cvalue, setCvalue] = useState('')
  const [loadingCaptcha, setLoadingCaptcha] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // ─── Tải captcha mới từ GDT ─────────────────────────────────────────────
  const loadCaptcha = useCallback(async () => {
    if (!company) return
    setLoadingCaptcha(true)
    setCvalue('')
    try {
      const { data } = await companiesApi.getLoginManualCaptcha(company.id)
      setCaptcha(data)
    } catch (err) {
      setCaptcha(null)
      toast.error(getErrorMessage(err))
    } finally {
      setLoadingCaptcha(false)
    }
  }, [company])

  // Khi mở dialog → tự động tải captcha để user nhìn và giải
  useEffect(() => {
    if (open && company) {
      setCaptcha(null)
      setCvalue('')
      loadCaptcha()
    }
  }, [open, company, loadCaptcha])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!company || !captcha) return
    if (!cvalue.trim()) {
      toast.error('Vui lòng nhập mã captcha hiển thị')
      return
    }

    setSubmitting(true)
    try {
      await companiesApi.loginManual(company.id, {
        ckey: captcha.ckey,
        cvalue: cvalue.trim(),
      })
      toast.success(`Đăng nhập thủ công thành công cho ${company.name}`)
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
      // Captcha có thể đã bị tiêu hao/hết hạn → tải captcha mới cho lần thử sau
      loadCaptcha()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đăng nhập thủ công</DialogTitle>
          <DialogDescription>
            Nhập chính xác mã captcha hiển thị bên dưới để đăng nhập vào GDT cho doanh nghiệp{' '}
            <strong>{company?.name}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Mã captcha</Label>
            <div className="flex items-center gap-3">
              <div className="flex h-12 min-w-[150px] flex-1 items-center justify-center rounded-lg border bg-muted/40">
                {loadingCaptcha ? (
                  <RefreshCw className="size-5 animate-spin text-muted-foreground" />
                ) : captcha ? (
                  <img
                    src={captcha.captchaImage}
                    alt="Captcha GDT"
                    className="h-9 w-auto rounded object-contain"
                  />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ImageIcon className="size-4" />
                    Không tải được
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="icon"
                type="button"
                onClick={loadCaptcha}
                disabled={loadingCaptcha}
                title="Tạo captcha mới"
              >
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-cvalue">Nhập mã captcha</Label>
            <Input
              id="manual-cvalue"
              value={cvalue}
              onChange={(e) => setCvalue(e.target.value)}
              placeholder="Nhập mã captcha hiển thị"
              autoComplete="off"
              disabled={loadingCaptcha || !captcha}
              required
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button">Huỷ</Button>} />
            <LoadingButton
              type="submit"
              loading={submitting}
              disabled={loadingCaptcha || !captcha}
            >
              Đăng nhập
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}