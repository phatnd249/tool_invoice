import { useState, useEffect } from 'react';
import axios from 'axios';
import { Key, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE_URL } from '../config';

export default function ConfigPanel() {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState({ text: '', type: '' });

  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/settings`);
      if (res.data && res.data.geminiApiKey) {
        setGeminiApiKey(res.data.geminiApiKey);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsMessage({ text: '', type: '' });
    try {
      await axios.post(`${API_BASE_URL}/api/settings`, { geminiApiKey });
      setSettingsMessage({ text: 'Lưu cấu hình Gemini API Key thành công!', type: 'success' });
    } catch (err: any) {
      setSettingsMessage({ text: err.response?.data?.error || 'Lưu cấu hình thất bại', type: 'error' });
    } finally {
      setSettingsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Cấu hình GEMINI API Key
          </CardTitle>
          <CardDescription>
            Gemini API Key được sử dụng toàn cục để tự động quét và giải mã hình ảnh Captcha từ Cổng thông tin Tổng cục Thuế đối với các doanh nghiệp được thiết lập ở chế độ <strong>Đăng nhập Tự động</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsMessage.text && (
            <div className={`p-3.5 rounded-lg border text-sm flex items-center gap-2 mb-4 ${
              settingsMessage.type === 'success'
                ? 'bg-green-500/10 border-green-500/20 text-green-600'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}>
              {settingsMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{settingsMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Input
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="Nhập Gemini API Key (AIzaSy...)"
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={settingsLoading}
            >
              {settingsLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Lưu API Key
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
