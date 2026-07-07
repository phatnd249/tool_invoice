import { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageSquare, Check, X, RefreshCw, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface Feedback {
  id: number;
  content: string;
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
  createdAt: string;
  user: {
    username: string;
  };
}

export default function FeedbackManager() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'PENDING' | 'RESOLVED' | 'REJECTED'>('PENDING');
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/feedbacks`);
      setFeedbacks(response.data);
    } catch (err) {
      console.error('Failed to fetch feedbacks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleUpdateStatus = async (id: number, status: 'RESOLVED' | 'REJECTED') => {
    setUpdatingId(id);
    try {
      await axios.put(`${API_BASE_URL}/api/feedbacks/${id}`, { status });
      // Update local state directly to move the item immediately
      setFeedbacks(prev =>
        prev.map(f => (f.id === id ? { ...f, status } : f))
      );
    } catch (err: any) {
      alert(err.response?.data?.error || 'Không thể cập nhật trạng thái ý kiến góp ý.');
    } finally {
      setUpdatingId(null);
    }
  };

  // Filter feedbacks for the active tab
  const filteredFeedbacks = feedbacks.filter(f => f.status === activeSubTab);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-2xl border border-border shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-accent-hover-default/10 rounded-2xl border border-accent-default/20 text-accent-default">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Ý Kiến Đóng Góp</h1>
            <p className="text-text-secondary text-xs mt-0.5">Xem đóng góp và phản hồi từ các thành viên trong hệ thống</p>
          </div>
        </div>
        <button
          onClick={fetchFeedbacks}
          disabled={loading}
          className="bg-bg-primary hover:bg-bg-tertiary text-text-secondary hover:text-text-primary border border-slate-750 px-4 py-2 rounded-xl transition duration-150 flex items-center space-x-2 text-xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm Mới</span>
        </button>
      </div>

      {/* Tabs list */}
      <div className="flex space-x-2 border-b border-border pb-px">
        <button
          onClick={() => setActiveSubTab('PENDING')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'PENDING'
              ? 'border-accent-default text-text-primary font-bold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Chưa xử lý ({feedbacks.filter(f => f.status === 'PENDING').length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('RESOLVED')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'RESOLVED'
              ? 'border-accent-default text-text-primary font-bold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Đã giải quyết ({feedbacks.filter(f => f.status === 'RESOLVED').length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('REJECTED')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 cursor-pointer flex items-center space-x-1.5 ${
            activeSubTab === 'REJECTED'
              ? 'border-accent-default text-text-primary font-bold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <XCircle className="w-4 h-4" />
          <span>Đã bỏ qua ({feedbacks.filter(f => f.status === 'REJECTED').length})</span>
        </button>
      </div>

      {/* Feedbacks Grid */}
      <div className="bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-primary/50 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-6 py-4">Người góp ý</th>
                <th className="px-6 py-4">Thời gian</th>
                <th className="px-6 py-4">Nội dung góp ý</th>
                {activeSubTab === 'PENDING' && <th className="px-6 py-4 text-center">Xác nhận</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-text-secondary">
              {loading && feedbacks.length === 0 ? (
                <tr>
                  <td colSpan={activeSubTab === 'PENDING' ? 4 : 3} className="text-center py-12 text-text-muted">
                    Đang tải danh sách góp ý...
                  </td>
                </tr>
              ) : filteredFeedbacks.length === 0 ? (
                <tr>
                  <td colSpan={activeSubTab === 'PENDING' ? 4 : 3} className="text-center py-12 text-text-muted">
                    Không có góp ý nào trong mục này.
                  </td>
                </tr>
              ) : (
                filteredFeedbacks.map((fb) => (
                  <tr key={fb.id} className="hover:bg-bg-primary/20 transition-all">
                    <td className="px-6 py-4 font-semibold text-text-primary">
                      <span className="bg-bg-primary border border-border px-2.5 py-1 rounded-lg text-xs">
                        {fb.user.username}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-text-secondary">
                      {new Date(fb.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-6 py-4 text-text-secondary leading-relaxed break-words max-w-lg">
                      {fb.content}
                    </td>
                    {activeSubTab === 'PENDING' && (
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center items-center space-x-2">
                          <button
                            onClick={() => handleUpdateStatus(fb.id, 'RESOLVED')}
                            disabled={updatingId === fb.id}
                            className="p-1.5 bg-success-light hover:bg-success-default text-success-default hover:text-text-primary border border-success-default/20 rounded-xl transition duration-150 cursor-pointer disabled:opacity-50"
                            title="Xác nhận Đã giải quyết"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(fb.id, 'REJECTED')}
                            disabled={updatingId === fb.id}
                            className="p-1.5 bg-danger-light hover:bg-danger-default text-danger-default hover:text-text-primary border border-danger-default/20 rounded-xl transition duration-150 cursor-pointer disabled:opacity-50"
                            title="Bỏ qua góp ý"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
