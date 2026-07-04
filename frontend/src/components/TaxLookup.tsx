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
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl shadow-slate-950/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2">
              <Search className="w-6 h-6 text-indigo-400" />
              Tra Cứu Mã Số Thuế
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Tra cứu thông tin doanh nghiệp nhanh chóng và chính xác từ masothue.com
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex w-full md:w-auto relative group">
            <input
              type="text"
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
              placeholder="Nhập mã số thuế..."
              className="w-full md:w-80 bg-slate-950 border border-slate-800 rounded-l-2xl px-5 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            <button
              type="submit"
              disabled={loading || !taxCode.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-r-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px]"
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
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-rose-300 text-sm">{error}</div>
        </div>
      )}

      {/* Result Display */}
      {taxInfo && (
        <div className="bg-white rounded-3xl overflow-hidden shadow-2xl shadow-black/20 text-slate-800">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-lg font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              {taxInfo.name}
            </h3>
          </div>
          
          <div className="divide-y divide-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-slate-50/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-slate-700 flex items-center gap-3">
                <Hash className="w-4 h-4 text-slate-400" />
                Mã số thuế
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-slate-600 font-medium">{taxInfo.taxCode}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-slate-50/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-slate-700 flex items-center gap-3">
                <MapPin className="w-4 h-4 text-slate-400" />
                Địa chỉ Thuế
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-slate-600">{taxInfo.taxAddress}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-slate-50/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-slate-700 flex items-center gap-3">
                <MapPin className="w-4 h-4 text-slate-400" />
                Địa chỉ
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-slate-600">{taxInfo.address}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-slate-50/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-slate-700 flex items-center gap-3">
                <Info className="w-4 h-4 text-slate-400" />
                Tình trạng
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-slate-600">{taxInfo.status}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-slate-50/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-slate-700 flex items-start gap-3">
                <User className="w-4 h-4 text-slate-400 mt-1" />
                Người đại diện
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-slate-600">
                <div className="font-medium text-slate-800">{taxInfo.representative}</div>
                {taxInfo.representativeExtra && (
                  <div className="text-sm mt-1 text-slate-500 italic">
                    Ngoài ra, {taxInfo.representative} còn đại diện các doanh nghiệp, đơn vị:
                    <ul className="list-disc ml-5 mt-1 text-indigo-600/80 not-italic">
                      <li>{taxInfo.representativeExtra}</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-slate-50/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-slate-700 flex items-center gap-3">
                <Phone className="w-4 h-4 text-slate-400" />
                Điện thoại
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-slate-600 flex items-center gap-3">
                <span className="font-medium">{taxInfo.phone}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-slate-50/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-slate-700 flex items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-400" />
                Ngày hoạt động
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-slate-600">{taxInfo.activeDate}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-slate-50/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-slate-700 flex items-center gap-3">
                <Users className="w-4 h-4 text-slate-400" />
                Quản lý bởi
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-slate-600">{taxInfo.managedBy}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 hover:bg-slate-50/50 transition-colors">
              <div className="p-4 md:p-5 font-semibold text-slate-700 flex items-center gap-3">
                <Building className="w-4 h-4 text-slate-400" />
                Loại hình DN
              </div>
              <div className="p-4 md:p-5 md:col-span-3 text-slate-600">{taxInfo.type}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
