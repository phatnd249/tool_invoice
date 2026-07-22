import { useState, useEffect } from 'react';
import axios from 'axios';
import { MessageSquare, Check, X, RefreshCw, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
      setFeedbacks(prev =>
        prev.map(f => (f.id === id ? { ...f, status } : f))
      );
    } catch (err: any) {
      alert(err.response?.data?.error || 'Không thể cập nhật trạng thái ý kiến góp ý.');
    } finally {
      setUpdatingId(null);
    }
  };

  const statusCounts = {
    PENDING: feedbacks.filter(f => f.status === 'PENDING').length,
    RESOLVED: feedbacks.filter(f => f.status === 'RESOLVED').length,
    REJECTED: feedbacks.filter(f => f.status === 'REJECTED').length,
  };

  const filteredFeedbacks = feedbacks.filter(f => f.status === activeSubTab);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6" />
            <div>
              <CardTitle>Ý Kiến Đóng Góp</CardTitle>
              <CardDescription>Xem đóng góp và phản hồi từ các thành viên trong hệ thống</CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFeedbacks}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Làm Mới
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as any)} className="mb-6">
            <TabsList>
              <TabsTrigger value="PENDING" className="gap-1.5">
                <Clock className="h-4 w-4" />
                Chưa xử lý ({statusCounts.PENDING})
              </TabsTrigger>
              <TabsTrigger value="RESOLVED" className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Đã giải quyết ({statusCounts.RESOLVED})
              </TabsTrigger>
              <TabsTrigger value="REJECTED" className="gap-1.5">
                <XCircle className="h-4 w-4" />
                Đã bỏ qua ({statusCounts.REJECTED})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Người góp ý</TableHead>
                  <TableHead className="w-[160px]">Thời gian</TableHead>
                  <TableHead>Nội dung góp ý</TableHead>
                  {activeSubTab === 'PENDING' && <TableHead className="w-[100px] text-center">Xác nhận</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && feedbacks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={activeSubTab === 'PENDING' ? 4 : 3} className="text-center py-12 text-muted-foreground">
                      Đang tải danh sách góp ý...
                    </TableCell>
                  </TableRow>
                ) : filteredFeedbacks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={activeSubTab === 'PENDING' ? 4 : 3} className="text-center py-12 text-muted-foreground">
                      Không có góp ý nào trong mục này.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFeedbacks.map((fb) => (
                    <TableRow key={fb.id}>
                      <TableCell>
                        <Badge variant="secondary">{fb.user.username}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(fb.createdAt).toLocaleString('vi-VN')}
                      </TableCell>
                      <TableCell className="leading-relaxed break-words max-w-lg">
                        {fb.content}
                      </TableCell>
                      {activeSubTab === 'PENDING' && (
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleUpdateStatus(fb.id, 'RESOLVED')}
                              disabled={updatingId === fb.id}
                              className="text-green-600 hover:text-green-700 hover:bg-green-100"
                              title="Xác nhận đã giải quyết"
                            >
                              {updatingId === fb.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleUpdateStatus(fb.id, 'REJECTED')}
                              disabled={updatingId === fb.id}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Bỏ qua góp ý"
                            >
                              {updatingId === fb.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
