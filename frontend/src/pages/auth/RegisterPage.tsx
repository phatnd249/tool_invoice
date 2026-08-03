import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
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

export function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      toast.error('Mật khẩu không khớp')
      return
    }
    setLoading(true)
    try {
      const { data } = await authApi.register(form)
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
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl mb-3">
            B
          </div>
          <h1 className="text-2xl font-bold text-foreground">Tạo tài khoản</h1>
          <p className="mt-1 text-sm text-muted-foreground">Bắt đầu miễn phí</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Đăng ký</CardTitle>
            <CardDescription>Điền thông tin của bạn để tạo tài khoản</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Họ và tên</Label>
                <Input id="fullName" type="text" value={form.fullName} onChange={set('fullName')} placeholder="John Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Địa chỉ email</Label>
                <Input id="email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input id="password" type="password" value={form.password} onChange={set('password')} placeholder="Tối thiểu 8 ký tự, chữ và số" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
                <Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Nhập lại mật khẩu" required />
              </div>
              <LoadingButton type="submit" loading={loading} className="w-full">
                <UserPlus className="size-4" />
                Tạo tài khoản
              </LoadingButton>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  )
}
