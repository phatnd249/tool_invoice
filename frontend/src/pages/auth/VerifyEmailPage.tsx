import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { authApi } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/apiClient'
import { Card, CardContent } from '@/components/ui/card'

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'resend'>('loading')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (!token) { setStatus('resend'); return }
    authApi
      .verifyEmail(token)
      .then(({ data }) => { setMessage(data.message); setStatus('success') })
      .catch((err) => { setMessage(getErrorMessage(err)); setStatus('error') })
  }, [token])

  const handleResend = async () => {
    if (!email) { toast.error('Please enter your email'); return }
    setResending(true)
    try {
      const { data } = await authApi.resendVerification(email)
      toast.success(data.message)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-sm text-center">
        {status === 'loading' && (
          <div className="space-y-3">
            <Loader2 className="mx-auto size-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Verifying your email…</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <CheckCircle className="mx-auto size-14 text-green-500" />
            <h1 className="text-2xl font-bold text-foreground">Email verified!</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Link to="/login">
              <Button className="mx-auto">Go to sign in</Button>
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <XCircle className="mx-auto size-14 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">Verification failed</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button variant="outline" onClick={() => setStatus('resend')}>
              Resend verification email
            </Button>
          </div>
        )}

        {status === 'resend' && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h1 className="text-xl font-bold text-foreground">Resend verification</h1>
              <div className="text-left space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <LoadingButton onClick={handleResend} loading={resending} className="w-full">
                Send verification email
              </LoadingButton>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
