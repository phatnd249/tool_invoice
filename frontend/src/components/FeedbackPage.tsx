import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { API_BASE_URL } from '../config';

interface Feedback {
  id: number;
  content: string;
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
  createdAt: string;
}

const statusConfig: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive'; icon: React.ElementType }> = {
  PENDING: { label: 'Chờ xử lý', variant: 'secondary', icon: Clock },
  RESOLVED: { label: 'Đã giải quyết', variant: 'default', icon: CheckCircle2 },
  REJECTED: { label: 'Đã bỏ qua', variant: 'destructive', icon: XCircle },
};

export default function FeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Form state
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchMyFeedbacks = async () => {
    setFetching(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/feedbacks/my`);
      setFeedbacks(res.data);
    } catch (err: any) {
      console.error('Failed to fetch my feedbacks:', err);
      toast.error('Không thể tải danh sách góp ý.');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchMyFeedbacks();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error('Vui lòng nhập nội dung góp ý.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/feedbacks`, {
        content: trimmed,
      });

      // Thêm feedback mới lên đầu danh sách
      setFeedbacks(prev => [
        {
          id: res.data.id,
          content: res.data.content,
          status: 'PENDING',
          createdAt: res.data.createdAt,
        },
        ...prev,
      ]);
      setContent('');
      toast.success('Cảm ơn đóng góp của bạn!');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Không thể gửi ý kiến góp ý lúc này.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* ── Form gửi góp ý ── */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Gửi Ý Kiến Đóng Góp</CardTitle>
              <CardDescription>
                Chúng tôi luôn hoan nghênh mọi ý kiến đóng góp của bạn để cải thiện ứng dụng.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col space-y-2">
              <label className="text-sm font-medium" htmlFor="feedback-content">
                Nội dung góp ý
              </label>
              <textarea
                id="feedback-content"
                required
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Nhập ý kiến đóng góp, phản hồi hoặc báo lỗi của bạn tại đây..."
                className="w-full bg-background border border-input rounded-lg px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none leading-relaxed"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={submitting}
                className="gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Gửi Đóng Góp
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Lịch sử góp ý của tôi ── */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Lịch Sử Góp Ý Của Tôi</CardTitle>
              <CardDescription>
                Danh sách các ý kiến bạn đã gửi và tình trạng xử lý.
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMyFeedbacks}
            disabled={fetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
            Làm Mới
          </Button>
        </CardHeader>
        <CardContent>
          {fetching && feedbacks.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Đang tải lịch sử...
            </div>
          ) : feedbacks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Bạn chưa gửi góp ý nào.</p>
              <p className="text-sm mt-1">Hãy gửi ý kiến đóng góp ở form phía trên.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.map((fb, index) => {
                const StatusIcon = statusConfig[fb.status].icon;
                return (
                  <div key={fb.id}>
                    {index > 0 && <Separator className="mb-3" />}
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge
                            variant={statusConfig[fb.status].variant as any}
                            className="gap-1 px-2 py-0.5 text-xs"
                          >
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig[fb.status].label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(fb.createdAt).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {fb.content}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
