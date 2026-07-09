import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
  Building2, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Lock, 
  Edit2, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  X,
  Search,
  CloudDownload
} from 'lucide-react';
import { API_BASE_URL } from '../config';

interface Company {
  id: number;
  taxCode: string;
  name: string;
  lookupPassword: string;
  token?: string | null;
  tokenExpiredAt?: string | null;
  loginMode: 'AUTO' | 'MANUAL';
  downloadCount?: number;
  createdAt: string;
  // Fields from masothue sync
  address?: string | null;
  taxAddress?: string | null;
  representative?: string | null;
  phone?: string | null;
  activeDate?: string | null;
  managedBy?: string | null;
  companyType?: string | null;
  status?: string | null;
  lastSyncedAt?: string | null;
}

export default function CompanyManager() {
  // Companies List
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  // Add Company Form State
  const [newTaxCode, setNewTaxCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newLoginMode, setNewLoginMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [newCaptchaSvg, setNewCaptchaSvg] = useState('');
  const [newCaptchaKey, setNewCaptchaKey] = useState('');
  const [newCaptchaValue, setNewCaptchaValue] = useState('');
  const [newCaptchaLoading, setNewCaptchaLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  // Password Visibility
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [refreshingMap, setRefreshingMap] = useState<Record<number, boolean>>({});
  const [syncingMap, setSyncingMap] = useState<Record<number, boolean>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Edit Modal State
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editLoginMode, setEditLoginMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Re-login Captcha Modal State (for MANUAL mode companies)
  const [reloginCompany, setReloginCompany] = useState<Company | null>(null);
  const [reloginCaptchaSvg, setReloginCaptchaSvg] = useState('');
  const [reloginCaptchaKey, setReloginCaptchaKey] = useState('');
  const [reloginCaptchaValue, setReloginCaptchaValue] = useState('');
  const [reloginCaptchaLoading, setReloginCaptchaLoading] = useState(false);
  const [reloginLoading, setReloginLoading] = useState(false);
  const [reloginError, setReloginError] = useState('');

  // Search & Filter State
  const [searchText, setSearchText] = useState('');
  const [filterLoginMode, setFilterLoginMode] = useState<'ALL' | 'AUTO' | 'MANUAL'>('ALL');
  const [filterTokenStatus, setFilterTokenStatus] = useState<'ALL' | 'VALID' | 'EXPIRED'>('ALL');

  // Fetch Companies
  const fetchCompanies = async () => {
    setCompaniesLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/companies`);
      setCompanies(res.data);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    } finally {
      setCompaniesLoading(false);
    }
  };

  // Fetch GDT Captcha for Add Company
  const fetchNewCaptcha = async () => {
    setNewCaptchaLoading(true);
    setNewCaptchaValue('');
    try {
      const res = await axios.get(`${API_BASE_URL}/api/auth/captcha`);
      if (res.data && res.data.key && res.data.content) {
        setNewCaptchaKey(res.data.key);
        setNewCaptchaSvg(res.data.content);
      }
    } catch (err) {
      console.error('Failed to fetch captcha:', err);
    } finally {
      setNewCaptchaLoading(false);
    }
  };

  // Fetch GDT Captcha for Re-login Modal
  const fetchReloginCaptcha = async () => {
    setReloginCaptchaLoading(true);
    setReloginCaptchaValue('');
    try {
      const res = await axios.get(`${API_BASE_URL}/api/auth/captcha`);
      if (res.data && res.data.key && res.data.content) {
        setReloginCaptchaKey(res.data.key);
        setReloginCaptchaSvg(res.data.content);
      }
    } catch (err) {
      console.error('Failed to fetch captcha:', err);
    } finally {
      setReloginCaptchaLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (newLoginMode === 'MANUAL') {
      fetchNewCaptcha();
    }
  }, [newLoginMode]);

  // Filtered companies (client-side search & filter)
  const filteredCompanies = useMemo(() => {
    return companies.filter(c => {
      // Search by tax code or name (case-insensitive)
      const keyword = searchText.toLowerCase().trim();
      if (keyword) {
        const matchesTaxCode = c.taxCode.toLowerCase().includes(keyword);
        const matchesName = c.name.toLowerCase().includes(keyword);
        if (!matchesTaxCode && !matchesName) return false;
      }

      // Filter by login mode
      if (filterLoginMode !== 'ALL' && c.loginMode !== filterLoginMode) return false;

      // Filter by token status
      if (filterTokenStatus === 'VALID') {
        if (!c.tokenExpiredAt || new Date(c.tokenExpiredAt) < new Date()) return false;
      } else if (filterTokenStatus === 'EXPIRED') {
        if (!c.tokenExpiredAt) return false;
        if (new Date(c.tokenExpiredAt) >= new Date()) return false;
      }

      return true;
    });
  }, [companies, searchText, filterLoginMode, filterTokenStatus]);

  // Add Company
  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);
    setAddError('');
    setAddSuccess('');

    try {
      const payload: any = {
        taxCode: newTaxCode.trim(),
        name: newName.trim() || newTaxCode.trim(),
        lookupPassword: newPassword,
        loginMode: newLoginMode,
      };

      if (newLoginMode === 'MANUAL') {
        payload.ckey = newCaptchaKey;
        payload.cvalue = newCaptchaValue.trim();
      }

      await axios.post(`${API_BASE_URL}/api/companies`, payload);

      setAddSuccess('Thêm doanh nghiệp và xác thực thành công!');
      // Reset form
      setNewTaxCode('');
      setNewName('');
      setNewPassword('');
      setNewLoginMode('AUTO');
      setNewCaptchaValue('');
      fetchCompanies();
      setTimeout(() => {
        setIsAddModalOpen(false);
        setAddSuccess('');
      }, 1500);
    } catch (err: any) {
      const details = err.response?.data?.details || err.response?.data?.error || err.message;
      setAddError(`Xác thực thất bại: ${details}`);
      if (newLoginMode === 'MANUAL') {
        fetchNewCaptcha();
      }
    } finally {
      setAddLoading(false);
    }
  };

  // Auto-refresh company token
  const handleAutoRefreshToken = async (id: number) => {
    setRefreshingMap((prev) => ({ ...prev, [id]: true }));
    try {
      await axios.post(`${API_BASE_URL}/api/companies/${id}/refresh`);
      alert(`Làm mới token thành công!`);
      fetchCompanies();
    } catch (err: any) {
      alert(`Làm mới token thất bại: ${err.response?.data?.error || err.message}`);
    } finally {
      setRefreshingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Sync company info from masothue.com
  const handleSyncInfo = async (id: number, _name: string) => {
    setSyncingMap((prev) => ({ ...prev, [id]: true }));
    try {
      await axios.put(`${API_BASE_URL}/api/companies/${id}/sync-info`);
      fetchCompanies();
    } catch (err: any) {
      alert(`Cập nhật thông tin thất bại: ${err.response?.data?.details || err.response?.data?.error || err.message}`);
    } finally {
      setSyncingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Delete Company
  const handleDeleteCompany = async (id: number, name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa doanh nghiệp "${name}"? Các lịch tải định kỳ liên quan cũng sẽ bị xóa.`)) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/companies/${id}`);
      fetchCompanies();
    } catch (err: any) {
      alert(`Xóa doanh nghiệp thất bại: ${err.response?.data?.error || err.message}`);
    }
  };

  // Edit Modal Submission
  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setEditLoading(true);
    setEditError('');

    try {
      await axios.put(`${API_BASE_URL}/api/companies/${editingCompany.id}`, {
        name: editName.trim(),
        lookupPassword: editPassword,
        loginMode: editLoginMode
      });
      setEditingCompany(null);
      fetchCompanies();
    } catch (err: any) {
      setEditError(err.response?.data?.error || err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // Re-login Modal Submission
  const handleReloginManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reloginCompany) return;
    setReloginLoading(true);
    setReloginError('');

    try {
      await axios.post(`${API_BASE_URL}/api/companies/${reloginCompany.id}/login-manual`, {
        ckey: reloginCaptchaKey,
        cvalue: reloginCaptchaValue.trim()
      });
      setReloginCompany(null);
      fetchCompanies();
      alert('Đăng nhập lại và gia hạn token thủ công thành công!');
    } catch (err: any) {
      setReloginError(err.response?.data?.details || err.response?.data?.error || err.message);
      fetchReloginCaptcha();
    } finally {
      setReloginLoading(false);
    }
  };

  // Check token status expiration
  return (
    <div className="space-y-8">
      {/* Companies Table List (Full Width) */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-accent-default flex items-center">
            <Building2 className="w-5 h-5 mr-2" />
            Danh Sách ({filteredCompanies.length}/{companies.length})
          </h2>
          <button
            onClick={() => {
              setIsAddModalOpen(true);
              setAddError('');
              setAddSuccess('');
              if (newLoginMode === 'MANUAL') {
                fetchNewCaptcha();
              }
            }}
            className="bg-accent-default hover:bg-accent-hover-default text-white font-semibold py-2 px-4 rounded-xl transition duration-150 flex items-center justify-center space-x-2 text-xs shrink-0 cursor-pointer shadow-lg shadow-accent-default/20"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Doanh Nghiệp</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Tìm theo MST hoặc tên..."
              className="w-full bg-bg-primary border border-border rounded-xl pl-10 pr-4 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
          </div>
          <select
            value={filterLoginMode}
            onChange={(e) => setFilterLoginMode(e.target.value as any)}
            className="bg-bg-primary border border-border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="ALL">Tất cả chế độ</option>
            <option value="AUTO">Tự động</option>
            <option value="MANUAL">Thủ công</option>
          </select>
          <select
            value={filterTokenStatus}
            onChange={(e) => setFilterTokenStatus(e.target.value as any)}
            className="bg-bg-primary border border-border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="ALL">Tất cả token</option>
            <option value="VALID">Còn hiệu lực</option>
            <option value="EXPIRED">Hết hiệu lực</option>
          </select>
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-bg-primary/60 border-b border-border text-text-secondary font-semibold uppercase text-xxs tracking-wider">
                <tr>
                  <th className="p-3">Mã Số Thuế</th>
                  <th className="p-3">Tên Doanh Nghiệp</th>
                  <th className="p-3">Địa chỉ</th>
                  <th className="p-3">Chế Độ</th>
                  <th className="p-3">Tình trạng</th>
                  <th className="p-3">Số Lần Tải</th>
                  <th className="p-3">Ngày Tạo</th>
                  <th className="p-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-text-secondary">
                {companiesLoading && companies.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-text-muted">
                      Đang tải danh sách...
                    </td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-text-muted">
                      Chưa có doanh nghiệp nào được lưu cấu hình.
                    </td>
                  </tr>
                ) : filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-text-muted">
                      Không tìm thấy doanh nghiệp phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredCompanies.map((c) => {
                    const cDate = new Date(c.createdAt).toLocaleDateString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    });

                    return (
                      <tr key={c.id} className="hover:bg-bg-primary/30 transition">
                        <td className="p-3 font-semibold text-text-primary font-mono select-all">
                          {c.taxCode}
                        </td>
                        <td className="p-3 font-medium text-text-secondary max-w-[200px] truncate" title={c.name}>
                          {c.name}
                        </td>
                        <td className="p-3 max-w-[180px] truncate text-text-muted" title={c.address || c.taxAddress || ''}>
                          {c.address || c.taxAddress || <span className="italic">—</span>}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xxs font-medium ${
                            c.loginMode === 'AUTO' 
                              ? 'bg-accent-hover-default/10 text-accent-default border border-accent-default/20' 
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {c.loginMode === 'AUTO' ? 'Tự động' : 'Thủ công'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xxs font-medium ${
                            c.status
                              ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/30'
                              : 'bg-gray-700/30 text-gray-400 border border-gray-600/30'
                          }`}>
                            {c.status || 'Chưa đồng bộ'}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-accent-default font-mono">
                          {c.downloadCount || 0}
                        </td>
                        <td className="p-3 text-text-secondary">{cDate}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-center space-x-2">
                            
                            {/* Token Refresh action */}
                            {c.loginMode === 'AUTO' ? (
                              <button
                                onClick={() => handleAutoRefreshToken(c.id)}
                                disabled={refreshingMap[c.id]}
                                title="Tự động gia hạn token"
                                className="p-1.5 bg-bg-primary hover:bg-accent-default/20 border border-border hover:border-accent-default/40 text-text-secondary hover:text-accent-default rounded-lg cursor-pointer transition disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${refreshingMap[c.id] ? 'animate-spin text-accent-default' : ''}`} />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setReloginCompany(c);
                                  setReloginError('');
                                  fetchReloginCaptcha();
                                }}
                                title="Đăng nhập thủ công lại"
                                className="p-1.5 bg-bg-primary hover:bg-amber-600/20 border border-border hover:border-amber-500/40 text-text-secondary hover:text-amber-300 rounded-lg cursor-pointer transition"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Sync Info action */}
                            <button
                              onClick={() => handleSyncInfo(c.id, c.name)}
                              disabled={syncingMap[c.id]}
                              title="Cập nhật thông tin doanh nghiệp từ masothue.com"
                              className="p-1.5 bg-bg-primary hover:bg-blue-500/20 border border-border hover:border-blue-500/40 text-text-secondary hover:text-blue-400 rounded-lg cursor-pointer transition disabled:opacity-50"
                            >
                              <CloudDownload className={`w-3.5 h-3.5 ${syncingMap[c.id] ? 'animate-pulse text-blue-400' : ''}`} />
                            </button>

                            {/* Edit Action */}
                            <button
                              onClick={() => {
                                setEditingCompany(c);
                                setEditName(c.name);
                                setEditPassword(c.lookupPassword);
                                setEditLoginMode(c.loginMode);
                                setEditError('');
                              }}
                              title="Chỉnh sửa thông tin"
                              className="p-1.5 bg-bg-primary hover:bg-success-default/20 border border-border hover:border-success-default/40 text-text-secondary hover:text-success-default rounded-lg cursor-pointer transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Action */}
                            <button
                              onClick={() => handleDeleteCompany(c.id, c.name)}
                              title="Xóa cấu hình doanh nghiệp"
                              className="p-1.5 bg-bg-primary hover:bg-danger-default/20 border border-border hover:border-danger-default/40 text-text-secondary hover:text-danger-default rounded-lg cursor-pointer transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* MODAL: EDIT COMPANY */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 relative space-y-4">
            <button 
              onClick={() => setEditingCompany(null)}
              className="absolute right-4 top-4 text-text-muted hover:text-text-primary"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-md font-bold text-text-primary flex items-center">
              <Edit2 className="w-4 h-4 mr-2 text-accent-default" /> Chỉnh Sửa Thông Tin Doanh Nghiệp
            </h3>
            <p className="text-xxs text-text-secondary">
              MST: <span className="font-mono text-accent-default select-all">{editingCompany.taxCode}</span>
            </p>

            {/* Synced Company Info */}
            {(editingCompany.address || editingCompany.representative || editingCompany.phone || editingCompany.status) && (
              <div className="bg-bg-primary/50 border border-border rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-accent-default" />
                  Thông tin doanh nghiệp
                  {editingCompany.lastSyncedAt && (
                    <span className="text-xxs text-text-muted font-normal ml-auto">
                      Đồng bộ: {new Date(editingCompany.lastSyncedAt).toLocaleString('vi-VN')}
                    </span>
                  )}
                </h4>
                <div className="grid grid-cols-1 gap-1.5 text-xs">
                  {editingCompany.address && (
                    <div className="flex gap-2">
                      <span className="text-text-muted shrink-0 w-20">Địa chỉ:</span>
                      <span className="text-text-primary">{editingCompany.address}</span>
                    </div>
                  )}
                  {editingCompany.taxAddress && editingCompany.taxAddress !== editingCompany.address && (
                    <div className="flex gap-2">
                      <span className="text-text-muted shrink-0 w-20">Địa chỉ thuế:</span>
                      <span className="text-text-primary">{editingCompany.taxAddress}</span>
                    </div>
                  )}
                  {editingCompany.representative && (
                    <div className="flex gap-2">
                      <span className="text-text-muted shrink-0 w-20">Đại diện:</span>
                      <span className="text-text-primary">{editingCompany.representative}</span>
                    </div>
                  )}
                  {editingCompany.phone && (
                    <div className="flex gap-2">
                      <span className="text-text-muted shrink-0 w-20">Điện thoại:</span>
                      <span className="text-text-primary">{editingCompany.phone}</span>
                    </div>
                  )}
                  {editingCompany.status && (
                    <div className="flex gap-2">
                      <span className="text-text-muted shrink-0 w-20">Tình trạng:</span>
                      <span className="text-emerald-400 font-medium">{editingCompany.status}</span>
                    </div>
                  )}
                  {editingCompany.companyType && (
                    <div className="flex gap-2">
                      <span className="text-text-muted shrink-0 w-20">Loại hình:</span>
                      <span className="text-text-primary">{editingCompany.companyType}</span>
                    </div>
                  )}
                  {editingCompany.activeDate && (
                    <div className="flex gap-2">
                      <span className="text-text-muted shrink-0 w-20">Ngày HĐ:</span>
                      <span className="text-text-primary">{editingCompany.activeDate}</span>
                    </div>
                  )}
                  {editingCompany.managedBy && (
                    <div className="flex gap-2">
                      <span className="text-text-muted shrink-0 w-20">QL bởi:</span>
                      <span className="text-text-primary">{editingCompany.managedBy}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {editError && (
              <div className="p-3 bg-danger-light border border-danger-default/20 text-danger-default rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateCompany} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Tên Gọi Nhớ</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Mật Khẩu Tra Cứu</label>
                <input
                  type="password"
                  required
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Chế Độ Đăng Nhập</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditLoginMode('AUTO')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition cursor-pointer ${
                      editLoginMode === 'AUTO'
                        ? 'bg-accent-default/20 border-accent-default text-accent-default'
                        : 'bg-bg-primary border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Tự động
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditLoginMode('MANUAL')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition cursor-pointer ${
                      editLoginMode === 'MANUAL'
                        ? 'bg-accent-default/20 border-accent-default text-accent-default'
                        : 'bg-bg-primary border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Thủ công
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="flex-1 bg-bg-primary hover:bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary py-2 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 bg-accent-default hover:bg-accent-hover-default disabled:opacity-50 text-white py-2 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  {editLoading ? 'Đang cập nhật...' : 'Cập Nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RELOGIN MANUAL CAPTCHA */}
      {reloginCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 relative space-y-4">
            <button 
              onClick={() => setReloginCompany(null)}
              className="absolute right-4 top-4 text-text-muted hover:text-text-primary"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-md font-bold text-text-primary flex items-center">
              <Lock className="w-4 h-4 mr-2 text-amber-400" /> Đăng Nhập Lại Doanh Nghiệp
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Bạn đang thực hiện đăng nhập thủ công để cập nhật lại phiên (token) cho doanh nghiệp **{reloginCompany.name} ({reloginCompany.taxCode})**.
            </p>

            {reloginError && (
              <div className="p-3 bg-danger-light border border-danger-default/20 text-danger-default rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="break-all">{reloginError}</span>
              </div>
            )}

            <form onSubmit={handleReloginManualSubmit} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Giải Captcha Tổng cục Thuế</label>
                <div className="flex items-center space-x-2">
                  <div className="h-10 bg-white rounded-lg flex items-center justify-center p-1 flex-1 relative overflow-hidden">
                    {reloginCaptchaLoading ? (
                      <RefreshCw className="w-4 h-4 text-accent-default animate-spin" />
                    ) : (
                      <div 
                        className="w-full h-full flex items-center justify-center svg-captcha-wrapper"
                        dangerouslySetInnerHTML={{ __html: reloginCaptchaSvg }}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={fetchReloginCaptcha}
                    disabled={reloginCaptchaLoading}
                    className="h-10 w-10 bg-bg-primary hover:bg-bg-tertiary border border-border rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${reloginCaptchaLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Mã xác thực Captcha</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={reloginCaptchaValue}
                  onChange={(e) => setReloginCaptchaValue(e.target.value)}
                  placeholder="Nhập 6 ký tự captcha..."
                  className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-center text-sm font-semibold tracking-widest uppercase focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReloginCompany(null)}
                  className="flex-1 bg-bg-primary hover:bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary py-2 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={reloginLoading}
                  className="flex-1 bg-accent-default hover:bg-accent-hover-default disabled:opacity-50 text-white py-2 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  {reloginLoading ? 'Đang kết nối...' : 'Xác thực'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD COMPANY */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 relative space-y-4">
            <button 
              onClick={() => setIsAddModalOpen(false)}
              className="absolute right-4 top-4 text-text-muted hover:text-text-primary"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-md font-bold text-text-primary flex items-center">
              <Building2 className="w-5 h-5 mr-2 text-accent-default" /> Thêm Doanh Nghiệp Mới
            </h3>
            <p className="text-xs text-text-muted">
              Kết nối và lấy token kiểm thử lần đầu từ hoadondientu.gdt.gov.vn
            </p>

            {addError && (
              <div className="p-3.5 bg-danger-light border border-danger-default/20 text-danger-default rounded-xl text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="break-all">{addError}</span>
              </div>
            )}

            {addSuccess && (
              <div className="p-3.5 bg-success-light border border-success-default/20 text-success-default rounded-xl text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{addSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAddCompany} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Mã Số Thuế (MST)</label>
                <input
                  type="text"
                  required
                  value={newTaxCode}
                  onChange={(e) => setNewTaxCode(e.target.value)}
                  placeholder="Nhập mã số thuế..."
                  className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Mật khẩu tra cứu</label>
                <div className="relative">
                  <input
                    type={showAddPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mật khẩu trang hoadondientu..."
                    className="w-full bg-bg-primary border border-border rounded-xl pl-4 pr-10 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPassword(!showAddPassword)}
                    className="absolute right-3 top-3 text-text-muted hover:text-text-primary"
                  >
                    {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">Chế độ đăng nhập</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewLoginMode('AUTO')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition cursor-pointer ${
                      newLoginMode === 'AUTO'
                        ? 'bg-accent-default/20 border-accent-default text-accent-default'
                        : 'bg-bg-primary border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Tự động (Gemini)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewLoginMode('MANUAL')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition cursor-pointer ${
                      newLoginMode === 'MANUAL'
                        ? 'bg-accent-default/20 border-accent-default text-accent-default'
                        : 'bg-bg-primary border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Thủ công
                  </button>
                </div>
              </div>

              {newLoginMode === 'MANUAL' && (
                <div className="p-4 bg-bg-primary/60 rounded-2xl border border-border space-y-3">
                  <label className="block text-xs font-semibold text-text-secondary">Xác thực mã Captcha GDT</label>
                  <div className="flex items-center space-x-2">
                    <div className="h-10 bg-white rounded-lg flex items-center justify-center p-1 flex-1 relative overflow-hidden">
                      {newCaptchaLoading ? (
                        <RefreshCw className="w-4 h-4 text-accent-default animate-spin" />
                      ) : (
                        <div 
                          className="w-full h-full flex items-center justify-center svg-captcha-wrapper"
                          dangerouslySetInnerHTML={{ __html: newCaptchaSvg }}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={fetchNewCaptcha}
                      disabled={newCaptchaLoading}
                      className="h-10 w-10 bg-bg-primary hover:bg-bg-tertiary border border-border rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary transition disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${newCaptchaLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={newCaptchaValue}
                    onChange={(e) => setNewCaptchaValue(e.target.value)}
                    placeholder="Nhập mã captcha..."
                    className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-center text-xs font-semibold tracking-widest uppercase focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 bg-bg-primary hover:bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 bg-accent-default hover:bg-accent-hover-default disabled:opacity-50 text-white py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  {addLoading ? 'Đang kết nối...' : 'Lưu & Kết Nối'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Svg container fixes inside lists */}
      <style>{`
        .svg-captcha-wrapper svg {
          width: 100% !important;
          height: 100% !important;
          max-height: 32px !important;
        }
      `}</style>
    </div>
  );
}
