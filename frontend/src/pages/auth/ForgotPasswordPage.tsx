import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Mail } from 'lucide-react'
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
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground mb-3">
            <Mail className="size-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Quên mật khẩu?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập email của bạn và chúng tôi sẽ gửi liên kết đặt lại mật khẩu.
          </p>
        </div>

        {sent ? (
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                Nếu email đó đã được đăng ký, liên kết đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư của bạn.
              </p>
              <Link to="/login" className="text-sm font-medium text-primary hover:underline block">
                Quay lại đăng nhập
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Đặt lại mật khẩu</CardTitle>
              <CardDescription>Nhập email của bạn để nhận liên kết đặt lại</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Địa chỉ email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                </div>
                <LoadingButton type="submit" loading={loading} className="w-full">
                  Gửi liên kết đặt lại
                </LoadingButton>
              </form>
            </CardContent>
          </Card>
        )}

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </div>
  )
}
