import { useState, useEffect } from 'react';
import axios from 'axios';
import { Key, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function ConfigPanel() {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState({ text: '', type: '' });

  // Fetch Settings
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

  // Save Settings
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
      {/* Global Gemini API Key Setting */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xl space-y-4">
        <h2 className="text-lg font-semibold text-accent-default flex items-center">
          <Key className="w-5 h-5 mr-2" /> Cấu hình GEMINI API Key
        </h2>
        <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
          Gemini API Key được sử dụng toàn cục để tự động quét và giải mã hình ảnh Captcha từ Cổng thông tin Tổng cục Thuế đối với các doanh nghiệp được thiết lập ở chế độ <strong>Đăng nhập Tự động</strong>.
        </p>

        {settingsMessage.text && (
          <div className={`p-3.5 rounded-xl border text-xs flex items-center space-x-2 ${
            settingsMessage.type === 'success' 
              ? 'bg-success-light border-success-default/20 text-success-default' 
              : 'bg-danger-light border-danger-default/20 text-danger-default'
          }`}>
            {settingsMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{settingsMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="password"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder="Nhập Gemini API Key (AIzaSy...)"
            className="flex-1 bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={settingsLoading}
            className="bg-accent-default hover:bg-accent-hover-default disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-xl transition duration-150 flex items-center justify-center space-x-2 shrink-0 cursor-pointer shadow-lg shadow-accent-default/20"
          >
            <Save className="w-4 h-4" />
            <span>Lưu API Key</span>
          </button>
        </form>
      </div>
    </div>
  );
}
