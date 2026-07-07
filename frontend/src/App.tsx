import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  FileText,
  CloudDownload,
  History,
  CalendarDays,
  Menu,
  Key,
  Building2,
  Users,
  LogOut,
  MessageSquare,
  Search,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from './context/ThemeContext';
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

          // Only logout on actual auth errors (JWT expired / missing / insufficient permissions).
          // Errors from third-party services (GDT login, captcha) should NOT trigger logout.
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
      setFeedbackContent('');
      setTimeout(() => {
        setFeedbackModalOpen(false);
        setFeedbackSuccess(false);
      }, 1500);
    } catch (err: any) {
      setFeedbackError(err.response?.data?.error || 'Không thể gửi ý kiến góp ý lúc này.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'download':
        return 'Tải Hoá Đơn Mới';
      case 'history':
        return 'Lịch Sử Hoá Đơn Đã Tải';
      case 'schedules':
        return 'Lập Lịch Tải Định Kỳ';
      case 'companies':
        return 'Quản Lý Doanh Nghiệp';
      case 'config':
        return 'Cấu Hình API Key';
      case 'users':
        return 'Quản Lý Thành Viên';
      case 'feedbacks':
        return 'Ý Kiến Đóng Góp';
      case 'tax-lookup':
        return 'Tra Cứu Mã Số Thuế';
    }
  };

  // If not authenticated, render login page
  if (!token || !user) {
    return <Login onLoginSuccess={handleLoginSuccess} errorMessage={authError} />;
  }

  const isAdmin = user.role === 'ADMIN';

  // Sidebar navigation structure with groups
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
    <div className="bg-bg-primary text-text-primary min-h-screen flex w-full relative">
      {/* Sidebar */}
      <aside
        className={`${sidebarCollapsed ? 'w-20' : 'w-64'
          } h-screen sticky top-0 overflow-y-auto bg-sidebar border-r border-border flex flex-col justify-between shrink-0 transition-all duration-300`}
      >
        <div>
          <div className="h-16 flex items-center px-6 border-b border-white/10 bg-sidebar">
            <FileText className="text-sidebar-brand text-2xl w-8 h-8 mr-3 animate-pulse" />
            {!sidebarCollapsed && (
              <span className="text-lg font-bold text-white transition duration-200">
                Invoice Pro
              </span>
            )}
          </div>
                    <nav className="p-4 space-y-2">
            {sidebarGroups.map(group => {
              // Hide entire group if admin-only and user is not admin
              const visibleItems = group.adminOnly && !isAdmin ? [] : group.items;
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.label} className="mb-2">
                  {!sidebarCollapsed && (
                    <p className="text-[10px] font-bold text-sidebar-text-muted uppercase tracking-widest px-3 mb-2 mt-2">
                      {group.label}
                    </p>
                  )}
                  {visibleItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer mb-1 ${
                        activeTab === item.id
                          ? 'bg-white/20 text-white shadow-md'
                          : 'text-sidebar-text-muted hover:bg-white/10 hover:text-sidebar-text'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>


        </div>

        {/* User Info and Logout Section */}
        <div className="border-t border-white/10 p-4 space-y-2">
          {!sidebarCollapsed && (
            <div className="flex items-center space-x-3 px-3 py-2 bg-white/10 rounded-xl mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-white text-sm">
                {user.username.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-white truncate">{user.username}</p>
                <p className="text-[10px] text-blue-200 font-medium tracking-wide uppercase mt-0.5">
                  {user.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={() => handleLogout()}
            className="w-full flex items-center px-4 py-3 text-sm font-medium text-red-300 hover:bg-white/10 hover:text-red-200 rounded-xl transition-colors duration-200 cursor-pointer"
          >
            <LogOut className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
            {!sidebarCollapsed && <span>Đăng Xuất</span>}
          </button>

          {!sidebarCollapsed && (
            <div className="text-[10px] text-sidebar-text-muted text-center pt-2">
              v1.0.0 &copy; 2026 Invoice Pro
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 font-sans">
        {/* Header */}
        <header className="h-16 border-b border-border bg-header-bg backdrop-blur-sm flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-text-secondary hover:text-text-primary focus:outline-none transition duration-150 p-2 hover:bg-bg-tertiary rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-text-primary">{getPageTitle()}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleTheme}
              className="text-text-secondary hover:text-text-primary p-2 hover:bg-bg-tertiary rounded-lg transition-all duration-200 cursor-pointer"
              title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => {
                setFeedbackModalOpen(true);
                setFeedbackContent('');
                setFeedbackError('');
                setFeedbackSuccess(false);
              }}
              className="text-xs font-semibold text-accent-default hover:text-accent-default bg-accent-hover-default/10 hover:bg-accent-hover-default/20 border border-accent-default/20 px-3.5 py-1.5 rounded-xl cursor-pointer transition-all duration-150"
            >
              Góp ý
            </button>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-success-default animate-ping"></span>
              <span className="text-xs text-text-secondary font-medium">Hệ thống đang hoạt động</span>
            </div>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 overflow-y-auto p-8">
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

      {/* Feedback Submission Modal */}
      {feedbackModalOpen && (
        <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 bg-bg-secondary/80 border-b border-border">
              <h2 className="text-md font-bold text-text-primary flex items-center space-x-2">
                <MessageSquare className="w-5 h-5 text-accent-default" />
                <span>Gửi Ý Kiến Đóng Góp</span>
              </h2>
              <button
                onClick={() => setFeedbackModalOpen(false)}
                className="text-text-secondary hover:text-text-primary p-1 hover:bg-bg-tertiary rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendFeedback} className="p-6 space-y-4">
              {feedbackError && (
                <div className="bg-error-bg border border-error-border text-danger text-sm px-4 py-3 rounded-xl">
                  {feedbackError}
                </div>
              )}
              {feedbackSuccess && (
                <div className="bg-success-bg border border-success-border text-success text-sm px-4 py-3 rounded-xl">
                  Cảm ơn đóng góp của bạn. Ý kiến đã được gửi thành công!
                </div>
              )}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-text-secondary">Nội dung góp ý của bạn</label>
                <textarea
                  required
                  rows={4}
                  value={feedbackContent}
                  onChange={(e) => setFeedbackContent(e.target.value)}
                  placeholder="Nhập ý kiến đóng góp, phản hồi hoặc báo lỗi của bạn tại đây..."
                  className="w-full bg-input border border-border rounded-2xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors duration-150 resize-none leading-relaxed"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFeedbackModalOpen(false)}
                  className="bg-bg-tertiary hover:bg-bg-tertiary text-text-secondary px-4 py-2 rounded-xl transition duration-150 cursor-pointer text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="bg-gradient-to-r from-accent-default to-accent-hover-default hover:from-accent-hover-default hover:to-accent-hover-default text-white px-4 py-2 rounded-xl transition duration-150 cursor-pointer text-xs font-semibold shadow-lg shadow-accent-default/10 flex items-center justify-center space-x-1.5"
                >
                  {submittingFeedback ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Đang gửi...</span>
                    </>
                  ) : (
                    <span>Gửi Đóng Góp</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
