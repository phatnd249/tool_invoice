import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { KeyRound, MailCheck } from 'lucide-react'
import { authApi } from '@/api/auth'
import { getErrorMessage } from '@/lib/apiClient'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await authApi.forgotPassword(email)
      toast.success(data.message)
      setSent(true)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/50 p-4">
        <div className="w-full max-w-sm text-center">
          <div className="space-y-4">
            <MailCheck className="mx-auto size-14 text-green-500" />
            <h1 className="text-2xl font-bold text-foreground">Đã gửi email</h1>
            <p className="text-sm text-muted-foreground">
              Nếu email tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu đến{' '}
              <span className="font-medium text-foreground">{email}</span>. Vui lòng kiểm tra hộp
              thư đến (bao gồm cả thư rác).
            </p>
            <Link
              to="/login"
              className="inline-block text-sm font-medium text-primary hover:underline"
            >
              Quay lại đăng nhập
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-3">
            <KeyRound className="size-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Quên mật khẩu?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập email của bạn để nhận liên kết đặt lại mật khẩu
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Đặt lại mật khẩu</CardTitle>
            <CardDescription>Chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu đến email của bạn</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Địa chỉ email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <LoadingButton type="submit" loading={loading} className="w-full">
                Gửi liên kết đặt lại mật khẩu
              </LoadingButton>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </div>
  )
}