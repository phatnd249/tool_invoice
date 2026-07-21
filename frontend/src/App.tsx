import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useTheme } from './context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import InvoiceDownloader from './components/InvoiceDownloader';
import InvoiceHistory from './components/InvoiceHistory';
import SchedulePanel from './components/SchedulePanel';
import ConfigPanel from './components/ConfigPanel';
import CompanyManager from './components/CompanyManager';
import UserManagement from './components/UserManagement';
import FeedbackManager from './components/FeedbackManager';
import Login from './components/Login';
import TaxLookup from './components/TaxLookup';
import { API_BASE_URL } from './config';

type Tab = 'download' | 'history' | 'schedules' | 'companies' | 'config' | 'users' | 'feedbacks' | 'tax-lookup';

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

  // Feedback states
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackContent, setFeedbackContent] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

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

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackContent.trim()) {
      setFeedbackError('Vui lòng nhập nội dung góp ý.');
      return;
    }

    setSubmittingFeedback(true);
    setFeedbackError('');
    setFeedbackSuccess(false);

    try {
      await axios.post(`${API_BASE_URL}/api/feedbacks`, {
        content: feedbackContent.trim(),
      });
      setFeedbackSuccess(true);
      toast.success('Cảm ơn đóng góp của bạn!');
      setFeedbackContent('');
      setTimeout(() => {
        setFeedbackModalOpen(false);
        setFeedbackSuccess(false);
      }, 1500);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Không thể gửi ý kiến góp ý lúc này.';
      setFeedbackError(msg);
      toast.error(msg);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'download': return 'Tải Hoá Đơn Mới';
      case 'history': return 'Lịch Sử Hoá Đơn Đã Tải';
      case 'schedules': return 'Lập Lịch Tải Định Kỳ';
      case 'companies': return 'Quản Lý Doanh Nghiệp';
      case 'config': return 'Cấu Hình API Key';
      case 'users': return 'Quản Lý Thành Viên';
      case 'feedbacks': return 'Ý Kiến Đóng Góp';
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
      label: 'QUẢN TRỊ',
      adminOnly: true,
      items: [
        { id: 'companies' as Tab, label: 'Doanh Nghiệp', icon: Building2 },
        { id: 'users' as Tab, label: 'Thành Viên', icon: Users },
        { id: 'feedbacks' as Tab, label: 'Ý Kiến', icon: MessageSquare },
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
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <Toaster richColors />

        {/* Shadcn Sidebar */}
        <Sidebar>
          <SidebarHeader className="h-16 border-b px-4 py-4 flex flex-row items-center gap-3">
            <FileText className="h-6 w-6 text-primary shrink-0" />
            <span className="text-lg font-bold">Invoice Pro</span>
          </SidebarHeader>

          <SidebarContent className="p-2">
            {sidebarGroups.map(group => {
              const visibleItems = group.adminOnly && !isAdmin ? [] : group.items;
              if (visibleItems.length === 0) return null;
              return (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {visibleItems.map(item => (
                        <SidebarMenuItem key={item.id}>
                          <SidebarMenuButton
                            isActive={activeTab === item.id}
                            onClick={() => setActiveTab(item.id)}
                            tooltip={item.label}
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarContent>

          <SidebarFooter className="border-t p-2 space-y-2">
            <div className="flex items-center gap-3 px-3 py-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {user.username.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="text-sm font-medium truncate">{user.username}</p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  {user.role === 'ADMIN' ? 'Admin' : 'Staff'}
                </Badge>
              </div>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleLogout()}
                  tooltip="Đăng Xuất"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Đăng Xuất</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0">
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
                onClick={() => {
                  setFeedbackModalOpen(true);
                  setFeedbackContent('');
                  setFeedbackError('');
                  setFeedbackSuccess(false);
                }}
                className="gap-1.5"
              >
                <MessageSquare className="h-4 w-4" />
                Góp ý
              </Button>
            </div>
          </header>

          {/* Content View */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-8">
            {activeTab === 'download' && <InvoiceDownloader />}
            {activeTab === 'history' && <InvoiceHistory />}
            {activeTab === 'schedules' && <SchedulePanel />}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'feedbacks' && <FeedbackManager />}
            {activeTab === 'companies' && <CompanyManager />}
            {activeTab === 'config' && <ConfigPanel />}
            {activeTab === 'tax-lookup' && <TaxLookup />}
          </div>
        </main>

        {/* Feedback Submission Dialog */}
        <Dialog open={feedbackModalOpen} onOpenChange={setFeedbackModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Gửi Ý Kiến Đóng Góp
              </DialogTitle>
              <DialogDescription>
                Đóng góp ý kiến của bạn để cải thiện ứng dụng.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSendFeedback}>
              <div className="space-y-4 py-2">
                {feedbackError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-lg">
                    {feedbackError}
                  </div>
                )}
                {feedbackSuccess && (
                  <div className="bg-green-500/10 border border-green-500/20 text-green-600 text-sm px-4 py-3 rounded-lg">
                    Cảm ơn đóng góp của bạn. Ý kiến đã được gửi thành công!
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nội dung góp ý</label>
                  <textarea
                    required
                    rows={4}
                    value={feedbackContent}
                    onChange={(e) => setFeedbackContent(e.target.value)}
                    placeholder="Nhập ý kiến đóng góp, phản hồi hoặc báo lỗi của bạn tại đây..."
                    className="w-full bg-background border border-input rounded-lg px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFeedbackModalOpen(false)}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={submittingFeedback}
                >
                  {submittingFeedback ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang gửi...
                    </>
                  ) : (
                    'Gửi Đóng Góp'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </SidebarProvider>
  );
}
