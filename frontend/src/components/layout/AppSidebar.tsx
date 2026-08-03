import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Shield,
  Key,
  User,
  LogOut,
  ChevronRight,
  Building2,
  FileText,
  ListTodo,
  List,
  Clock,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/apiClient'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const navGroups = [
  {
    label: 'Tổng quan',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: null },
      { to: '/profile', icon: User, label: 'Hồ sơ', permission: null },
    ],
  },
  {
    label: 'Hoá đơn',
    items: [
      { to: '/invoices', icon: FileText, label: 'Tải hoá đơn', permission: 'invoice:read' },
      { to: '/invoices/list', icon: List, label: 'Hoá đơn đã tải', permission: 'invoice:read' },
      { to: '/invoices/tasks', icon: ListTodo, label: 'Lịch sử tải', permission: 'invoice:read' },
      { to: '/schedules', icon: Clock, label: 'Lịch tải tự động', permission: 'invoice:download' },
    ],
  },
  {
    label: 'Quản trị',
    items: [
      { to: '/companies', icon: Building2, label: 'Doanh nghiệp', permission: 'company:read' },
      { to: '/users', icon: Users, label: 'Người dùng', permission: 'user:read' },
      { to: '/roles', icon: Shield, label: 'Vai trò', permission: 'role:read' },
      { to: '/permissions', icon: Key, label: 'Quyền hạn', permission: 'permission:read' },
    ],
  },
]

export function AppSidebar() {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const initials = user?.fullName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?'

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<div className="flex items-center gap-2" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                HĐ
              </div>
              <span className="truncate font-semibold">Invoice Pro</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items
                  .filter(({ permission }) => !permission || hasPermission(permission))
                  .map(({ to, icon: Icon, label }) => (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton isActive={location.pathname === to} render={<NavLink to={to} />}>
                        <Icon className="size-4" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {/* User menu */}
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton size="lg">
                    <Avatar size="sm">
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{user?.fullName}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                    </div>
                    <ChevronRight className="ml-auto size-4" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="mr-2 size-4" />
                  Hồ sơ
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 size-4" />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
