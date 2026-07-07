import React, { useState } from 'react';
import axios from 'axios';
import { Search, Hash, MapPin, Info, User, Phone, Calendar, Users, Building, AlertCircle, Building2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface TaxInfo {
  name: string;
  taxCode: string;
  taxAddress: string;
  address: string;
  status: string;
  representative: string;
  representativeExtra: string | null;
  phone: string;
  activeDate: string;
  managedBy: string;
  type: string;
}

export default function TaxLookup() {
  const [taxCode, setTaxCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxInfo, setTaxInfo] = useState<TaxInfo | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taxCode.trim()) return;

    setLoading(true);
    setError(null);
    setTaxInfo(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/masothue/${taxCode.trim()}`);
      setTaxInfo(response.data);
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError('Không thể kết nối đến máy chủ. Vui lòng thử lại sau.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header & Search */}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-accent-default to-log-cyan bg-clip-text text-transparent flex items-center gap-2">
              <Search className="w-6 h-6 text-accent-default" />
              Tra Cứu Mã Số Thuế
            </h2>
            <p className="text-text-secondary text-sm mt-1">
              Tra cứu thông tin doanh nghiệp nhanh chóng và chính xác từ masothue.com
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex w-full md:w-auto relative group">
            <input
              type="text"
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              placeholder="Nhập mã số thuế..."
              className="w-full md:w-80 bg-card border border-border rounded-l-2xl px-5 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent-default transition-all"
            />
            <button
              type="submit"
              disabled={loading || !taxCode.trim()}
              className="bg-accent-default hover:bg-accent-hover-default text-white px-6 py-3 rounded-r-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Tìm kiếm'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-danger-light border border-danger-default/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-danger-default shrink-0 mt-0.5" />
          <div className="text-danger-default text-sm">{error}</div>
        </div>
      )}

      {/* Result Display */}
      {taxInfo && (
        <div className="bg-card rounded-3xl overflow-hidden shadow-2xl border border-border text-text-primary">
          <div className="p-6 border-b border-border bg-bg-primary/50">
            <h3 className="text-lg font-bold text-text-primary uppercase tracking-wide flex items-center gap-2">
              <Building2 className="w-5 h-5 text-accent-default" />
              {taxInfo.name}
            </h3>
          </div>
          
          <div className="divide-y divide-border">
            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-bg-primary/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-text-primary flex items-center gap-3">
                <Hash className="w-4 h-4 text-text-secondary" />
                Mã số thuế
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-text-secondary font-medium">{taxInfo.taxCode}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-bg-primary/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-text-primary flex items-center gap-3">
                <MapPin className="w-4 h-4 text-text-secondary" />
                Địa chỉ Thuế
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-text-secondary">{taxInfo.taxAddress}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-bg-primary/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-text-primary flex items-center gap-3">
                <MapPin className="w-4 h-4 text-text-secondary" />
                Địa chỉ
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-text-secondary">{taxInfo.address}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-bg-primary/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-text-primary flex items-center gap-3">
                <Info className="w-4 h-4 text-text-secondary" />
                Tình trạng
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-text-secondary">{taxInfo.status}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-bg-primary/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-text-primary flex items-start gap-3">
                <User className="w-4 h-4 text-text-secondary mt-1" />
                Người đại diện
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-text-secondary">
                <div className="font-medium text-text-primary">{taxInfo.representative}</div>
                {taxInfo.representativeExtra && (
                  <div className="text-sm mt-1 text-text-muted italic">
                    Ngoài ra, {taxInfo.representative} còn đại diện các doanh nghiệp, đơn vị:
                    <ul className="list-disc ml-5 mt-1 text-accent-default/80 not-italic">
                      <li>{taxInfo.representativeExtra}</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-bg-primary/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-text-primary flex items-center gap-3">
                <Phone className="w-4 h-4 text-text-secondary" />
                Điện thoại
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-text-secondary flex items-center gap-3">
                <span className="font-medium">{taxInfo.phone}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-bg-primary/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-text-primary flex items-center gap-3">
                <Calendar className="w-4 h-4 text-text-secondary" />
                Ngày hoạt động
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-text-secondary">{taxInfo.activeDate}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-bg-primary/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-text-primary flex items-center gap-3">
                <Users className="w-4 h-4 text-text-secondary" />
                Quản lý bởi
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-text-secondary">{taxInfo.managedBy}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-bg-primary/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-text-primary flex items-center gap-3">
                <Building className="w-4 h-4 text-text-secondary" />
                Loại hình DN
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-text-secondary">{taxInfo.type}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
