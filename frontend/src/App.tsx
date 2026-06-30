import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  FileText,
  CloudDownload,
  History,
  CalendarDays,
  Menu,
  Settings,
  Users,
  LogOut,
  MessageSquare,
  X,
} from 'lucide-react';
import InvoiceDownloader from './components/InvoiceDownloader';
import InvoiceHistory from './components/InvoiceHistory';
import SchedulePanel from './components/SchedulePanel';
import ConfigPanel from './components/ConfigPanel';
import UserManagement from './components/UserManagement';
import FeedbackManager from './components/FeedbackManager';
import Login from './components/Login';
import { API_BASE_URL } from './config';

type Tab = 'download' | 'history' | 'schedules' | 'config' | 'users' | 'feedbacks';

interface User {
  id: number;
  username: string;
  role: string;
}

export default function App() {
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
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          const errMsg = error.response.data?.error || 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
          handleLogout(errMsg);
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
      case 'config':
        return 'Cấu Hình Hệ Thống';
      case 'users':
        return 'Quản Lý Thành Viên';
      case 'feedbacks':
        return 'Ý Kiến Đóng Góp';
    }
  };

  // If not authenticated, render login page
  if (!token || !user) {
    return <Login onLoginSuccess={handleLoginSuccess} errorMessage={authError} />;
  }

  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="bg-slate-900 text-slate-100 min-h-screen flex w-full relative">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } bg-slate-950 border-r border-slate-800 flex flex-col justify-between shrink-0 transition-all duration-300`}
      >
        <div>
          <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
            <FileText className="text-indigo-500 text-2xl w-8 h-8 mr-3 animate-pulse" />
            {!sidebarCollapsed && (
              <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent transition duration-200">
                Invoice Pro
              </span>
            )}
          </div>
          <nav className="p-4 space-y-2">
            <button
              onClick={() => setActiveTab('download')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer ${
                activeTab === 'download'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <CloudDownload className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!sidebarCollapsed && <span>Tải Hoá Đơn</span>}
            </button>
            
            <button
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <History className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!sidebarCollapsed && <span>Lịch Sử Hoá Đơn</span>}
            </button>

            <button
              onClick={() => setActiveTab('schedules')}
              className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer ${
                activeTab === 'schedules'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <CalendarDays className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!sidebarCollapsed && <span>Đặt Lịch Tải</span>}
            </button>

            {isAdmin && (
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer ${
                  activeTab === 'users'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Users className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
                {!sidebarCollapsed && <span>Quản Lý Thành Viên</span>}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setActiveTab('feedbacks')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer ${
                  activeTab === 'feedbacks'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <MessageSquare className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
                {!sidebarCollapsed && <span>Ý Kiến Đóng Góp</span>}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setActiveTab('config')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer ${
                  activeTab === 'config'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Settings className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
                {!sidebarCollapsed && <span>Cấu Hinh</span>}
              </button>
            )}
          </nav>
        </div>

        {/* User Info and Logout Section */}
        <div className="border-t border-slate-800/80 p-4 space-y-2">
          {!sidebarCollapsed && (
            <div className="flex items-center space-x-3 px-3 py-2 bg-slate-900/50 rounded-xl border border-slate-800/60 mb-1.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">
                {user.username.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-slate-200 truncate">{user.username}</p>
                <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase mt-0.5">
                  {user.role === 'ADMIN' ? 'Quản trị viên' : 'Nhân viên'}
                </p>
              </div>
            </div>
          )}
          
          <button
            onClick={() => handleLogout()}
            className="w-full flex items-center px-4 py-3 text-sm font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-xl transition-colors duration-200 cursor-pointer"
          >
            <LogOut className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
            {!sidebarCollapsed && <span>Đăng Xuất</span>}
          </button>

          {!sidebarCollapsed && (
            <div className="text-[10px] text-slate-600 text-center pt-2">
              v1.0.0 &copy; 2026 Invoice Pro
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 font-sans">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-950/50 backdrop-blur-sm flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-slate-400 hover:text-white focus:outline-none transition duration-150 p-2 hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-slate-100">{getPageTitle()}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => {
                setFeedbackModalOpen(true);
                setFeedbackContent('');
                setFeedbackError('');
                setFeedbackSuccess(false);
              }}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-3.5 py-1.5 rounded-xl cursor-pointer transition-all duration-150"
            >
              Góp ý
            </button>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-xs text-slate-400 font-medium">Hệ thống đang hoạt động</span>
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
          {activeTab === 'config' && <ConfigPanel />}
        </div>
      </main>

      {/* Feedback Submission Modal */}
      {feedbackModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-5 bg-slate-950/80 border-b border-slate-800">
              <h2 className="text-md font-bold text-slate-200 flex items-center space-x-2">
                <MessageSquare className="w-5 h-5 text-indigo-400" />
                <span>Gửi Ý Kiến Đóng Góp</span>
              </h2>
              <button
                onClick={() => setFeedbackModalOpen(false)}
                className="text-slate-400 hover:text-slate-100 p-1 bg-slate-850 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendFeedback} className="p-6 space-y-4">
              {feedbackError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                  {feedbackError}
                </div>
              )}
              {feedbackSuccess && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl">
                  Cảm ơn đóng góp của bạn. Ý kiến đã được gửi thành công!
                </div>
              )}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-450">Nội dung góp ý của bạn</label>
                <textarea
                  required
                  rows={4}
                  value={feedbackContent}
                  onChange={(e) => setFeedbackContent(e.target.value)}
                  placeholder="Nhập ý kiến đóng góp, phản hồi hoặc báo lỗi của bạn tại đây..."
                  className="w-full bg-slate-950 border border-slate-855 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder-slate-700 focus:outline-none focus:border-indigo-500 transition-colors duration-150 resize-none leading-relaxed"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFeedbackModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-755 text-slate-300 px-4 py-2 rounded-xl transition duration-150 cursor-pointer text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-4 py-2 rounded-xl transition duration-150 cursor-pointer text-xs font-semibold shadow-lg shadow-indigo-500/10 flex items-center justify-center space-x-1.5"
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
