import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { Users, Shield, Key, UserCheck, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const cards = [
  {
    label: 'Users',
    description: 'Manage user accounts and permissions',
    icon: Users,
    to: '/users',
    permission: 'user:read',
  },
  {
    label: 'Roles',
    description: 'Define roles and assign permissions',
    icon: Shield,
    to: '/roles',
    permission: 'role:read',
  },
  {
    label: 'Permissions',
    description: 'View and manage system permissions',
    icon: Key,
    to: '/permissions',
    permission: 'permission:read',
  },
  {
    label: 'My Profile',
    description: 'View and edit your profile',
    icon: UserCheck,
    to: '/profile',
    permission: null,
  },
]

export function DashboardPage() {
  const { user, hasPermission } = useAuth()

  const visibleCards = cards.filter(
    (c) => !c.permission || hasPermission(c.permission),
  )

  return (
    <Layout title="Dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Welcome back, {user?.fullName.split(' ')[0]}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Here is an overview of what you can manage.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleCards.map(({ label, description, icon: Icon, to }) => (
            <Link key={to} to={to} className="group block">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="rounded-lg bg-primary/10 p-3 text-primary shrink-0">
                    <Icon className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {description}
                    </p>
                    <p className="mt-1 text-xs font-medium text-primary/70 group-hover:text-primary transition-colors inline-flex items-center gap-0.5">
                      Manage
                      <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your roles</CardTitle>
            <CardDescription>
              Roles assigned to your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {user?.roles.length ? (
                user.roles.map((r) => (
                  <Badge key={r.id} variant="secondary">
                    {r.name}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No roles assigned.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
