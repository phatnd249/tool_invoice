import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Camera, Lock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usersApi } from '@/api/users'
import { getErrorMessage } from '@/lib/apiClient'
import { Layout } from '@/components/layout/Layout'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

export function ProfilePage() {
  const { user, refreshUser } = useAuth()

  // Profile form
  const [profileForm, setProfileForm] = useState({ fullName: user?.fullName ?? '', avatar: user?.avatar ?? '' })
  const [savingProfile, setSavingProfile] = useState(false)

  // Password form
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [savingPw, setSavingPw] = useState(false)

  const setProfile = (field: keyof typeof profileForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setProfileForm((prev) => ({ ...prev, [field]: e.target.value }))

  const setPw = (field: keyof typeof pwForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPwForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    try {
      await usersApi.updateProfile({ fullName: profileForm.fullName, avatar: profileForm.avatar || undefined })
      await refreshUser()
      toast.success('Profile updated successfully')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) { toast.error('Passwords do not match'); return }
    setSavingPw(true)
    try {
      const { data } = await usersApi.changePassword(pwForm)
      toast.success(data.message)
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSavingPw(false)
    }
  }

  const initials = user?.fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() ?? '?'

  return (
    <Layout title="Profile">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Avatar & info */}
        <Card>
          <CardContent className="p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="relative shrink-0">
              <Avatar size="lg">
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
              <button className="absolute bottom-0 right-0 rounded-full bg-background border border-border shadow p-1.5 text-muted-foreground hover:text-primary transition-colors">
                <Camera className="size-3.5" />
              </button>
            </div>
            <div className="text-center sm:text-left flex-1">
              <h2 className="text-xl font-bold text-foreground">{user?.fullName}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <div className="mt-2 flex flex-wrap justify-center sm:justify-start gap-1.5">
                {user?.roles.map((r) => (
                  <Badge key={r.id} variant="outline">{r.name}</Badge>
                ))}
              </div>
            </div>
            <Badge variant={user?.status === 'ACTIVE' ? 'default' : user?.status === 'BANNED' ? 'destructive' : 'secondary'}>
              {user?.status}
            </Badge>
          </CardContent>
        </Card>

        {/* Edit profile */}
        <Card>
          <CardHeader>
            <CardTitle>Personal information</CardTitle>
            <CardDescription>Update your profile details</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" value={profileForm.fullName} onChange={setProfile('fullName')} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avatar">Avatar URL</Label>
                <Input id="avatar" value={profileForm.avatar} onChange={setProfile('avatar')} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" value={user?.email ?? ''} disabled />
              </div>
              <div className="flex justify-end">
                <LoadingButton type="submit" loading={savingProfile}>Save changes</LoadingButton>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Change password */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" />
              <div>
                <CardTitle>Change password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input id="currentPassword" type="password" value={pwForm.currentPassword} onChange={setPw('currentPassword')} required />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input id="newPassword" type="password" value={pwForm.newPassword} onChange={setPw('newPassword')} placeholder="Min 8 chars, letters & numbers" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input id="confirmPassword" type="password" value={pwForm.confirmPassword} onChange={setPw('confirmPassword')} required />
              </div>
              <div className="flex justify-end">
                <LoadingButton type="submit" loading={savingPw}>Update password</LoadingButton>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
