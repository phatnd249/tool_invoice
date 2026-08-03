import { type ReactNode } from 'react'
import { AppSidebar } from './AppSidebar'
import {
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbPage } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

interface LayoutProps {
  children: ReactNode
  title?: string
}

export function Layout({ children, title }: LayoutProps) {
  const { setTheme, effectiveTheme } = useTheme()
  const ThemeIcon = effectiveTheme === 'dark' ? Moon : Sun

  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Breadcrumb className="flex-1">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{title ?? 'Dashboard'}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Theme toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="icon">
                <ThemeIcon className="size-4" />
                <span className="sr-only">Đổi giao diện</span>
              </Button>
            } />
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={() => setTheme('light')}>
                <Sun className="mr-2 size-4" />
                Sáng
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('dark')}>
                <Moon className="mr-2 size-4" />
                Tối
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('system')}>
                <Monitor className="mr-2 size-4" />
                Hệ thống
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 sm:p-6 min-w-0">{children}</main>
      </SidebarInset>
    </>
  )
}
