import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, UserPlus, Shield, Trash2, Lock, Unlock, Edit2, X, Check, CheckSquare, Square } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface UserCompany {
  companyId: number;
  company: {
    name: string;
    taxCode: string;
  };
}

interface User {
  id: number;
  username: string;
  role: 'ADMIN' | 'STAFF';
  isActive: boolean;
  createdAt: string;
  companies: UserCompany[];
}

interface Company {
  id: number;
  taxCode: string;
  name: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const [isActive, setIsActive] = useState(true);
  const [assignedCompanyIds, setAssignedCompanyIds] = useState<number[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, companiesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/users`),
        axios.get(`${API_BASE_URL}/api/companies`),
      ]);
      setUsers(usersRes.data);
      setCompanies(companiesRes.data);
    } catch (err) {
      console.error('Failed to load user management data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openAddModal = () => {
    setIsEditMode(false);
    setSelectedUserId(null);
    setUsername('');
    setPassword('');
    setRole('STAFF');
    setIsActive(true);
    setAssignedCompanyIds([]);
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setIsEditMode(true);
    setSelectedUserId(user.id);
    setUsername(user.username);
    setPassword(''); // Leave blank to keep existing
    setRole(user.role);
    setIsActive(user.isActive);
    setAssignedCompanyIds(user.companies.map(uc => uc.companyId));
    setFormError('');
    setFormSuccess('');
    setModalOpen(true);
  };

  const handleToggleCompany = (companyId: number) => {
    setAssignedCompanyIds(prev => 
      prev.includes(companyId) 
        ? prev.filter(id => id !== companyId) 
        : [...prev, companyId]
    );
  };

  const handleSelectAllCompanies = () => {
    if (assignedCompanyIds.length === companies.length) {
      setAssignedCompanyIds([]);
    } else {
      setAssignedCompanyIds(companies.map(c => c.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setFormError('Vui lòng nhập tên đăng nhập.');
      return;
    }
    if (!isEditMode && !password) {
      setFormError('Vui lòng nhập mật khẩu cho tài khoản mới.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setFormSuccess('');

    try {
      const payload = {
        username: username.trim(),
        role,
        isActive,
        companyIds: role === 'ADMIN' ? [] : assignedCompanyIds, // Admin doesn't need explicit assignments
        ...(password ? { password } : {}),
      };

      if (isEditMode && selectedUserId) {
        await axios.put(`${API_BASE_URL}/api/users/${selectedUserId}`, payload);
        setFormSuccess('Cập nhật tài khoản thành công!');
      } else {
        await axios.post(`${API_BASE_URL}/api/users`, payload);
        setFormSuccess('Tạo tài khoản mới thành công!');
      }

      await fetchData();
      setTimeout(() => {
        setModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Đã xảy ra lỗi khi lưu thông tin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    const nextActive = !user.isActive;
    try {
      await axios.put(`${API_BASE_URL}/api/users/${user.id}`, {
        isActive: nextActive,
      });
      setUsers(prev => 
        prev.map(u => u.id === user.id ? { ...u, isActive: nextActive } : u)
      );
    } catch (err: any) {
      alert(err.response?.data?.error || 'Không thể thay đổi trạng thái tài khoản.');
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${user.username}"?`)) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/users/${user.id}`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Không thể xóa tài khoản.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Quản Lý Thành Viên</h1>
            <p className="text-slate-400 text-xs mt-0.5">Thêm, sửa đổi quyền truy cập và quản lý tài khoản người dùng</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/10 flex items-center space-x-2 cursor-pointer text-sm"
        >
          <UserPlus className="w-4 h-4" />
          <span>Thêm Thành Viên</span>
        </button>
      </div>

      {/* Users List Grid */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Tên tài khoản</th>
                <th className="px-6 py-4">Vai trò</th>
                <th className="px-6 py-4">Trạng thái</th>
                <th className="px-6 py-4">Doanh nghiệp gán</th>
                <th className="px-6 py-4">Ngày tạo</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Đang tải danh sách thành viên...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    Chưa có thành viên nào được tạo.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-900/30 transition-colors duration-150">
                    <td className="px-6 py-4 font-semibold text-slate-200">{user.username}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'ADMIN' 
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      }`}>
                        {user.role === 'ADMIN' ? 'Quản trị (Admin)' : 'Nhân viên'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-all duration-150 ${
                          user.isActive 
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {user.isActive ? (
                          <>
                            <Unlock className="w-3 h-3" />
                            <span>Đang hoạt động</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" />
                            <span>Đã khóa</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 max-w-xs truncate">
                      {user.role === 'ADMIN' ? (
                        <span className="text-slate-500 text-xs italic">Toàn quyền truy cập</span>
                      ) : user.companies.length === 0 ? (
                        <span className="text-red-400/80 text-xs">Chưa gán doanh nghiệp</span>
                      ) : (
                        <span className="text-slate-300 text-xs">
                          {user.companies.map(c => `${c.company.name} (${c.company.taxCode})`).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20 rounded-xl transition-all duration-150 cursor-pointer"
                          title="Sửa thông tin"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-xl transition-all duration-150 cursor-pointer"
                          title="Xóa tài khoản"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Popup (Add/Edit) */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-5 bg-slate-950/80 border-b border-slate-800">
              <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <span>{isEditMode ? 'Cập Nhật Tài Khoản' : 'Thêm Thành Viên Mới'}</span>
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-100 p-1 bg-slate-850 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              {formError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl flex items-center space-x-2">
                  <Check className="w-4 h-4" />
                  <span>{formSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Tên đăng nhập</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="E.g. nhanvien01"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    {isEditMode ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}
                  </label>
                  <input
                    type="password"
                    required={!isEditMode}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isEditMode ? '••••••••' : 'Nhập mật khẩu'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Quyền hạn</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="STAFF">Nhân viên</option>
                    <option value="ADMIN">Quản trị viên</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Trạng thái tài khoản</label>
                  <select
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="true">Kích hoạt</option>
                    <option value="false">Tạm khóa</option>
                  </select>
                </div>
              </div>

              {/* Assign Companies Section (STAFF only) */}
              {role === 'STAFF' && (
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Gán quyền truy cập doanh nghiệp ({assignedCompanyIds.length}/{companies.length})
                    </label>
                    {companies.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSelectAllCompanies}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                      >
                        {assignedCompanyIds.length === companies.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                      </button>
                    )}
                  </div>

                  {companies.length === 0 ? (
                    <p className="text-slate-500 text-xs italic">Chưa có doanh nghiệp nào được cấu hình trong hệ thống.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80">
                      {companies.map((company) => {
                        const isChecked = assignedCompanyIds.includes(company.id);
                        return (
                          <div
                            key={company.id}
                            onClick={() => handleToggleCompany(company.id)}
                            className="flex items-center space-x-2.5 p-2.5 rounded-xl border border-slate-800/40 hover:border-slate-700/60 bg-slate-900/35 hover:bg-slate-900/60 cursor-pointer transition-all duration-150"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-indigo-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-650" />
                            )}
                            <div className="text-xs text-left truncate flex-1">
                              <div className="font-semibold text-slate-200 truncate">{company.name}</div>
                              <div className="text-slate-500 mt-0.5">{company.taxCode}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800/50">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 px-5 py-2.5 rounded-xl transition-all duration-150 cursor-pointer text-sm font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-5 py-2.5 rounded-xl transition-all duration-150 cursor-pointer text-sm font-semibold shadow-lg shadow-indigo-500/10 flex items-center justify-center space-x-2"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu Thay Đổi</span>
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
