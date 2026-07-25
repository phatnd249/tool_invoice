import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  FileText,
  CloudDownload,
  History,
  CalendarDays,
  Key,
  Building2,
  Users,
  LogOut,
  MessageSquare,
  Search,
  Sun,
  Moon,
  Loader2,
  ChevronsUpDown,

  WifiOff,
  RefreshCw,
  WifiHigh,
} from 'lucide-react';
import { useTheme } from './context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent as ShadcnSidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import InvoiceDownloader from './components/InvoiceDownloader';
import InvoiceHistory from './components/InvoiceHistory';
import SchedulePanel from './components/SchedulePanel';
import ConfigPanel from './components/ConfigPanel';
import CompanyManager from './components/CompanyManager';
import UserManagement from './components/UserManagement';
import FeedbackManager from './components/FeedbackManager';
import FeedbackPage from './components/FeedbackPage';
import Login from './components/Login';
import TaxLookup from './components/TaxLookup';
import { API_BASE_URL } from './config';

type Tab = 'download' | 'history' | 'schedules' | 'companies' | 'config' | 'users' | 'feedbacks' | 'feedback' | 'tax-lookup';

interface User {
  id: number;
  username: string;
  role: string;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<Tab>('download');

  const [authError, setAuthError] = useState('');

    // GDT Health state (global trên navbar)
  const [gdtStatus, setGdtStatus] = useState<{
    overall: 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';
    summary: string;
  }>({ overall: 'unknown', summary: 'Đang kiểm tra...' });

  const checkGdtHealth = useCallback(async (force = false) => {
    setGdtStatus(prev => ({ ...prev, overall: 'checking' }));
    try {
      const params: Record<string, string> = {};
      if (force) params.force = 'true';
      const res = await axios.get(`${API_BASE_URL}/api/gdt/health`, { params });
      const data = res.data;
      setGdtStatus({ overall: data.overall, summary: data.summary });
    } catch (err: any) {
      const msg = err.response?.data?.summary || err.message || 'Không thể kết nối GDT';
      setGdtStatus({ overall: 'unknown', summary: msg });
    }
  }, []);

  // Health check khi app mount (chỉ 1 lần, không auto refresh)
  useEffect(() => {
    checkGdtHealth(false);
  }, [checkGdtHealth]);

  // Configure Axios token
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }

  // Intercept authentication failures
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const status = error.response.status;
          const errMsg = error.response.data?.error || '';

          const isRealAuthError =
            (status === 401 || status === 403) &&
            (errMsg.includes('Yêu cầu xác thực') ||
             errMsg.includes('không có quyền') ||
             errMsg.includes('hết hạn') ||
             errMsg.includes('Phiên'));

          if (isRealAuthError) {
            handleLogout(errMsg || 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  const handleLoginSuccess = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setAuthError('');
    setActiveTab('download');
  };

  const handleLogout = (errorMessage = '') => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setAuthError(errorMessage);
  };



  const getPageTitle = () => {
    switch (activeTab) {
      case 'download': return 'Tải Hoá Đơn Mới';
      case 'history': return 'Lịch Sử Hoá Đơn Đã Tải';
      case 'schedules': return 'Lập Lịch Tải Định Kỳ';
      case 'companies': return 'Quản Lý Doanh Nghiệp';
      case 'config': return 'Cấu Hình API Key';
      case 'users': return 'Quản Lý Thành Viên';
      case 'feedbacks': return 'Quản Lý Ý Kiến Đóng Góp';
      case 'feedback': return 'Góp Ý';
      case 'tax-lookup': return 'Tra Cứu Mã Số Thuế';
    }
  };

  // If not authenticated, render login page
  if (!token || !user) {
    return <Login onLoginSuccess={handleLoginSuccess} errorMessage={authError} />;
  }

  const isAdmin = user.role === 'ADMIN';

  const sidebarGroups = [
    {
      label: 'HOÁ ĐƠN',
      items: [
        { id: 'download' as Tab, label: 'Tải Hoá Đơn', icon: CloudDownload },
        { id: 'history' as Tab, label: 'Lịch Sử', icon: History },
        { id: 'schedules' as Tab, label: 'Đặt Lịch', icon: CalendarDays },
        { id: 'tax-lookup' as Tab, label: 'Tra Cứu MST', icon: Search },
      ],
    },
    {
      label: 'TIỆN ÍCH',
      items: [
        { id: 'feedback' as Tab, label: 'Góp Ý', icon: MessageSquare },
      ],
    },
    {
      label: 'QUẢN TRỊ',
      adminOnly: true,
      items: [
        { id: 'companies' as Tab, label: 'Doanh Nghiệp', icon: Building2 },
        { id: 'users' as Tab, label: 'Thành Viên', icon: Users },
        { id: 'feedbacks' as Tab, label: 'Quản Lý Ý Kiến', icon: MessageSquare },
      ],
    },
    {
      label: 'HỆ THỐNG',
      adminOnly: true,
      items: [
        { id: 'config' as Tab, label: 'API Key', icon: Key },
      ],
    },
  ];

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background text-foreground">
          <Toaster richColors />

          {/* Shadcn App Sidebar */}
          <Sidebar collapsible="icon">
            <SidebarHeader className="h-16 border-b border-sidebar-border py-2 flex justify-center">
              <div className="flex items-center gap-3 px-3 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center overflow-hidden transition-all duration-200">
                <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/95 text-primary-foreground shadow-sm shadow-primary/20 shrink-0">
                  <FileText className="h-4 w-4 shrink-0" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden animate-in fade-in duration-200">
                  <span className="truncate font-semibold text-foreground">Invoice Pro</span>
                  <span className="truncate text-xs text-muted-foreground">Invoice Management</span>
                </div>
              </div>
            </SidebarHeader>

            <ShadcnSidebarContent>
              {sidebarGroups.map(group => {
                const visibleItems = group.adminOnly && !isAdmin ? [] : group.items;
                if (visibleItems.length === 0) return null;
                return (
                  <SidebarGroup key={group.label}>
                    <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                      {group.label}
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        {visibleItems.map(item => (
                          <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                              isActive={activeTab === item.id}
                              tooltip={item.label}
                              onClick={() => setActiveTab(item.id)}
                            >
                              <item.icon className="h-4 w-4 shrink-0" />
                              <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                );
              })}
            </ShadcnSidebarContent>

            <SidebarFooter className="border-t border-sidebar-border p-2">
              <SidebarMenu>
                <SidebarMenuItem>
                  <Popover>
                    <PopoverTrigger
                      render={
                        <SidebarMenuButton
                          size="lg"
                          className="w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground flex items-center gap-3 p-2 rounded-lg transition-colors duration-200"
                        >
                          <Avatar className="h-8 w-8 rounded-lg shrink-0 border border-border/40">
                            <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-medium text-xs">
                              {user.username.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                            <span className="truncate font-semibold">{user.username}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {user.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}
                            </span>
                          </div>
                          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50 group-data-[collapsible=icon]:hidden" />
                        </SidebarMenuButton>
                      }
                    />
                    <PopoverContent
                      className="w-56 rounded-lg p-2 shadow-lg border border-border/50 bg-popover text-popover-foreground"
                      side="right"
                      align="end"
                      sideOffset={8}
                    >
                      <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                        <Avatar className="h-8 w-8 rounded-lg border border-border/40">
                          <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-medium text-xs">
                            {user.username.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                          <span className="truncate font-semibold">{user.username}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {user.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}
                          </span>
                        </div>
                      </div>
                      <Separator className="my-1.5" />
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer text-sm font-medium h-9 px-2 rounded-md"
                        onClick={() => handleLogout()}
                      >
                        <LogOut className="mr-2 h-4 w-4 shrink-0" />
                        Đăng Xuất
                      </Button>
                    </PopoverContent>
                  </Popover>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>

          {/* Main Content Area */}
          <SidebarInset className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <header className="h-16 border-b bg-background/80 backdrop-blur-sm flex items-center justify-between px-4 lg:px-8 shrink-0">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <h1 className="text-lg font-bold">{getPageTitle()}</h1>
              </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('feedback')}
              className="gap-1.5"
            >
              <MessageSquare className="h-4 w-4" />
              Góp ý
            </Button>
            {/* GDT Health Indicator */}
            <GdtHealthBadge
              status={gdtStatus.overall}
              summary={gdtStatus.summary}
              onRefresh={() => checkGdtHealth(true)}
            />
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {activeTab === 'download' && <InvoiceDownloader />}
          {activeTab === 'history' && <InvoiceHistory />}
          {activeTab === 'schedules' && <SchedulePanel />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'feedbacks' && <FeedbackManager />}
          {activeTab === 'feedback' && <FeedbackPage />}
          {activeTab === 'companies' && <CompanyManager />}
          {activeTab === 'config' && <ConfigPanel />}
          {activeTab === 'tax-lookup' && <TaxLookup />}
        </div>
      </SidebarInset>


    </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}

// ─── GDT Health Badge Component ────────────────────────────────
// Chỉ hiển thị chấm tròn màu sắc, hover/popover mới hiện chi tiết.
//   🟢 Xanh lá — API GDT hoạt động
//   🟡 Vàng    — Đang kiểm tra health
//   🔴 Đỏ      — API GDT không hoạt động
function GdtHealthBadge({
  status,
  summary,
  onRefresh,
}: {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';
  summary: string;
  onRefresh: () => void;
}) {
  // Màu sắc & hiệu ứng cho chấm tròn
  let dotColor = 'bg-gray-400';
  let animate = false;
  let popoverTitle = 'Hệ thống API GDT';
  let popoverDesc = '';
  let iconColor = '';
  let bgColor = '';

  switch (status) {
    case 'checking':
      dotColor = 'bg-yellow-500';
      animate = true;
      popoverDesc = 'Đang kiểm tra kết nối đến hệ thống API GDT...';
      iconColor = 'text-yellow-600 dark:text-yellow-400';
      bgColor = 'bg-yellow-100 dark:bg-yellow-900/30';
      break;
    case 'healthy':
      dotColor = 'bg-green-500';
      popoverDesc = 'Hệ thống API GDT đang hoạt động tốt.';
      iconColor = 'text-green-600 dark:text-green-400';
      bgColor = 'bg-green-100 dark:bg-green-900/30';
      break;
    case 'degraded':
      dotColor = 'bg-red-500';
      animate = true;
      popoverDesc = 'Một số API GDT đang gặp vấn đề, có thể ảnh hưởng đến việc tải hoá đơn.';
      iconColor = 'text-red-600 dark:text-red-400';
      bgColor = 'bg-red-100 dark:bg-red-900/30';
      break;
    case 'unhealthy':
      dotColor = 'bg-red-500';
      animate = true;
      popoverDesc = 'Hệ thống API GDT không hoạt động. Không thể tải hoá đơn ngay lúc này.';
      iconColor = 'text-red-600 dark:text-red-400';
      bgColor = 'bg-red-100 dark:bg-red-900/30';
      break;
    case 'unknown':
    default:
      dotColor = 'bg-red-500';
      animate = true;
      popoverDesc = 'Không thể xác định trạng thái hệ thống API GDT.';
      iconColor = 'text-red-600 dark:text-red-400';
      bgColor = 'bg-red-100 dark:bg-red-900/30';
      break;
  }

  const Icon = status === 'checking' ? Loader2 : status === 'healthy' ? WifiHigh : WifiOff;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-muted/60 transition-colors cursor-pointer group"
            title="Nhấn để xem chi tiết trạng thái API GDT"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${dotColor} ${animate ? 'animate-pulse' : ''}`}
            />
            <RefreshCw
              className="w-3 h-3 ml-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
            />
          </button>
        }
      />
      <PopoverContent className="w-72 p-3 text-sm" side="bottom" align="end">
        <div className="flex items-start gap-3">
          <div className={`p-1.5 rounded-full ${bgColor}`}>
            {status === 'checking' ? (
              <Loader2 className={`w-4 h-4 animate-spin ${iconColor}`} />
            ) : (
              <Icon className={`w-4 h-4 ${iconColor}`} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{popoverTitle}</p>
            {status === 'checking' ? (
              <div className="flex items-center gap-2 mt-1">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Đang kiểm tra...</span>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {popoverDesc}
                </p>
                {summary && (
                  <p className="text-xs text-muted-foreground/70 mt-0.5 italic">
                    {summary}
                  </p>
                )}
              </>
            )}
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={onRefresh}
              >
                <RefreshCw className="w-3 h-3" />
                Kiểm tra lại
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
