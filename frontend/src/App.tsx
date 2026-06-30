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
} from 'lucide-react';
import InvoiceDownloader from './components/InvoiceDownloader';
import InvoiceHistory from './components/InvoiceHistory';
import SchedulePanel from './components/SchedulePanel';
import ConfigPanel from './components/ConfigPanel';
import UserManagement from './components/UserManagement';
import Login from './components/Login';

type Tab = 'download' | 'history' | 'schedules' | 'config' | 'users';

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
    }
  };

  // If not authenticated, render login page
  if (!token || !user) {
    return <Login onLoginSuccess={handleLoginSuccess} errorMessage={authError} />;
  }

  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="bg-slate-900 text-slate-100 min-h-screen flex w-full">
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
                onClick={() => setActiveTab('config')}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer ${
                  activeTab === 'config'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Settings className={`w-5 h-5 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
                {!sidebarCollapsed && <span>Cấu Hình</span>}
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
      <main className="flex-1 flex flex-col min-w-0">
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
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="text-xs text-slate-400 font-medium">Hệ thống đang hoạt động</span>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'download' && <InvoiceDownloader />}
          {activeTab === 'history' && <InvoiceHistory />}
          {activeTab === 'schedules' && <SchedulePanel />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'config' && <ConfigPanel />}
        </div>
      </main>
    </div>
  );
}
