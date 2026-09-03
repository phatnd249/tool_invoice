import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { KeyRound } from 'lucide-react'
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

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) { toast.error('Token đặt lại mật khẩu không hợp lệ'); return }
    if (form.password !== form.confirmPassword) { toast.error('Mật khẩu không khớp'); return }
    setLoading(true)
    try {
      const { data } = await authApi.resetPassword({ token, ...form })
      toast.success(data.message)
      navigate('/login')
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
            <KeyRound className="size-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Đặt mật khẩu mới</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Phải có ít nhất 8 ký tự bao gồm chữ cái và số.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Đặt lại mật khẩu</CardTitle>
            <CardDescription>Nhập mật khẩu mới của bạn bên dưới</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu mới</Label>
                <Input id="password" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
                <Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="••••••••" required />
              </div>
              <LoadingButton type="submit" loading={loading} className="w-full">
                Đặt lại mật khẩu
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
