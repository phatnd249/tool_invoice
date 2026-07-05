import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { FileDown, FileArchive, FileSpreadsheet, ShieldAlert, X, FileText, Eye, Loader2, ChevronLeft, ChevronRight, RotateCw, Filter } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  type: 'SELL' | 'BUY';
  sellerName: string;
  sellerTaxCode: string;
  buyerName: string;
  buyerTaxCode: string;
  totalAmount: number;
  xmlPath?: string | null;
  zipPath?: string | null;
}

interface DownloadHistory {
  id: number;
  downloadDate: string;
  taxCode: string;
  invoiceType: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  log?: string | null;
  countDownloaded: number;
  username?: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZES = [10, 20, 50, 100];

function Pagination({
  page,
  totalPages,
  size,
  total,
  onPageChange,
  onSizeChange,
}: {
  page: number;
  totalPages: number;
  size: number;
  total: number;
  onPageChange: (p: number) => void;
  onSizeChange: (s: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-slate-950 border-t border-slate-800 text-sm">
      <div className="flex items-center gap-2 text-slate-400">
        <span className="hidden sm:inline">Tổng:</span>
        <span className="font-semibold text-slate-200">{total}</span>
        <span className="hidden sm:inline">records</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-slate-500 text-xs">Số dòng:</span>
        <select
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 0}
          className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-950 disabled:text-slate-700 text-slate-300 rounded-lg border border-slate-800 transition cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-slate-400 text-xs whitespace-nowrap px-1">
          Trang <span className="font-semibold text-slate-200">{totalPages > 0 ? page + 1 : 0}</span> / <span className="font-semibold text-slate-200">{totalPages}</span>
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-950 disabled:text-slate-700 text-slate-300 rounded-lg border border-slate-800 transition cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function InvoiceHistory() {
  const [subTab, setSubTab] = useState<'invoices' | 'logs'>('invoices');

  // Data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [histories, setHistories] = useState<DownloadHistory[]>([]);

  // Pagination state (server-side)
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchText, setSearchText] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modals
  const [selectedHistory, setSelectedHistory] = useState<DownloadHistory | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── Fetch functions ──

  const fetchInvoices = useCallback(async (p: number, s: number, q: string, type: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        size: String(s),
        ...(q && { search: q }),
        ...(type && { type }),
      });
      const response = await axios.get<PaginatedResponse<Invoice>>(
        `${API_BASE_URL}/api/invoices?${params}`
      );
      setInvoices(response.data.data);
      setTotal(response.data.total);
      setTotalPages(response.data.totalPages);
      setSelectedIds([]);
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistories = useCallback(async (p: number, s: number, q: string, status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        size: String(s),
        ...(q && { search: q }),
        ...(status && { status }),
      });
      const response = await axios.get<PaginatedResponse<DownloadHistory>>(
        `${API_BASE_URL}/api/invoices/download-history?${params}`
      );
      setHistories(response.data.data);
      setTotal(response.data.total);
      setTotalPages(response.data.totalPages);
    } catch (err) {
      console.error('Error fetching download history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Effects ──

  useEffect(() => {
    if (subTab === 'invoices') {
      fetchInvoices(page, size, searchText, filterType);
    } else {
      fetchHistories(page, size, searchText, filterStatus);
    }
  }, [page, size, subTab, filterType, filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search: reset to page 0 when search text changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      // The effect above will re-fetch due to page change
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchText]); // eslint-disable-line react-hooks/exhaustive-deps

  // When filter changes, reset to page 0
  useEffect(() => {
    setPage(0);
  }, [filterType, filterStatus]);

  // ── Handlers ──

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(invoices.map((i) => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const exportSelected = async () => {
    if (selectedIds.length === 0 || exporting) return;
    setExporting(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/invoices/export`,
        { invoiceIds: selectedIds },
        { responseType: 'blob' }
      );

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `BaoCao_HoaDon_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Error exporting invoices:', err);
      alert('Xuất Excel thất bại. Vui lòng kiểm tra lại backend.');
    } finally {
      setExporting(false);
    }
  };

  const openPreview = async (invoiceId: string) => {
    setPreviewInvoiceId(invoiceId);
    setPreviewLoading(true);
    setPreviewHtml(null);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/invoices/${invoiceId}/preview`, {
        responseType: 'text',
      });
      setPreviewHtml(response.data);
    } catch (err: any) {
      console.error('Error loading preview:', err);
      const msg = err.response?.data?.error || 'Không thể tải preview hóa đơn.';
      setPreviewHtml(`<div style="padding:40px;text-align:center;color:#999;">${msg}</div>`);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex space-x-2 border-b border-slate-800 pb-px">
        <button
          onClick={() => setSubTab('invoices')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 cursor-pointer ${subTab === 'invoices'
              ? 'border-indigo-500 text-slate-100 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
        >
          Hóa Đơn Đã Lưu
        </button>
        <button
          onClick={() => setSubTab('logs')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 cursor-pointer ${subTab === 'logs'
              ? 'border-indigo-500 text-slate-100 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
        >
          Nhật Ký Tải Hệ Thống (Audit Logs)
        </button>
      </div>

      {/* Filters & Actions Card */}
      <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {subTab === 'invoices' ? (
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">Tất cả hóa đơn</option>
              <option value="SELL">Bán ra (SELL)</option>
              <option value="BUY">Mua vào (BUY)</option>
            </select>
          ) : (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="SUCCESS">Thành công</option>
              <option value="PARTIAL">Một phần</option>
              <option value="FAILED">Thất bại</option>
            </select>
          )}

          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 w-64"
              placeholder={subTab === 'invoices' ? "Tìm theo số HĐ, tên..." : "Tìm theo MST, người tải..."}
            />
          </div>

          <button
            onClick={() => {
              if (subTab === 'invoices') {
                fetchInvoices(page, size, searchText, filterType);
              } else {
                fetchHistories(page, size, searchText, filterStatus);
              }
            }}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-750 transition cursor-pointer"
            title="Làm mới danh sách"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {subTab === 'invoices' && (
          <button
            onClick={exportSelected}
            disabled={selectedIds.length === 0 || exporting}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-650 text-white font-semibold py-2 px-5 rounded-xl transition-all duration-200 flex items-center space-x-2 shrink-0 cursor-pointer shadow-lg shadow-emerald-650/20"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>{exporting ? 'Đang xuất...' : `Xuất Báo Cáo Excel (${selectedIds.length})`}</span>
          </button>
        )}
      </div>

      {subTab === 'invoices' ? (
        /* ── Invoices Table ── */
        <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-800 text-slate-400 font-semibold uppercase text-xs">
                <tr>
                  <th className="p-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={invoices.length > 0 && selectedIds.length === invoices.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                    />
                  </th>
                  <th className="p-4">Số Hóa Đơn</th>
                  <th className="p-4">Ngày Lập</th>
                  <th className="p-4">Loại HĐ</th>
                  <th className="p-4">Bên Bán</th>
                  <th className="p-4">Bên Mua</th>
                  <th className="p-4 text-right">Tổng Thanh Toán</th>
                  <th className="p-4 text-center">Tải Tệp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-350">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        <span>Đang tải danh sách hóa đơn từ Database...</span>
                      </div>
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      Không có hóa đơn nào trong cơ sở dữ liệu.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => {
                    const dateStr = new Date(inv.invoiceDate).toLocaleDateString('vi-VN');
                    const formattedAmount = new Intl.NumberFormat('vi-VN', {
                      style: 'currency',
                      currency: 'VND',
                    }).format(inv.totalAmount);

                    return (
                      <tr key={inv.id} className="hover:bg-slate-900/30 transition-all border-b border-slate-800/30">
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(inv.id)}
                            onChange={(e) => handleSelectOne(inv.id, e.target.checked)}
                            className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900"
                          />
                        </td>
                        <td className="p-4 font-semibold text-slate-100">
                          {String(inv.invoiceNumber).padStart(8, '0')}
                        </td>
                        <td className="p-4 text-slate-400">{dateStr}</td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${inv.type === 'SELL' ? 'bg-indigo-900/50 text-indigo-300' : 'bg-amber-900/50 text-amber-300'
                              }`}
                          >
                            {inv.type === 'SELL' ? 'Bán ra' : 'Mua vào'}
                          </span>
                        </td>
                        <td className="p-4 max-w-[200px] truncate">
                          <div className="font-medium text-slate-200 truncate" title={inv.sellerName}>
                            {inv.sellerName}
                          </div>
                          <div className="text-xs text-slate-500">{inv.sellerTaxCode}</div>
                        </td>
                        <td className="p-4 max-w-[200px] truncate">
                          <div className="font-medium text-slate-200 truncate" title={inv.buyerName}>
                            {inv.buyerName}
                          </div>
                          <div className="text-xs text-slate-500">{inv.buyerTaxCode}</div>
                        </td>
                        <td className="p-4 text-right font-bold text-emerald-450">{formattedAmount}</td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                            {inv.zipPath ? (
                              <button
                                onClick={() => openPreview(inv.id)}
                                className="text-emerald-400 hover:text-emerald-300 transition duration-150 inline-flex p-1.5 hover:bg-slate-800 rounded-lg cursor-pointer"
                                title="Xem trước hóa đơn (HTML)"
                              >
                                <Eye className="w-5 h-5" />
                              </button>
                            ) : (
                              <span className="text-slate-700 inline-flex p-1.5 cursor-not-allowed" title="Không có file ZIP gốc để preview">
                                <Eye className="w-5 h-5 opacity-30" />
                              </span>
                            )}
                            {inv.xmlPath ? (
                              <a
                                href={`${API_BASE_URL}/api/invoices/${inv.id}/xml`}
                                download
                                className="text-indigo-400 hover:text-indigo-300 transition duration-150 inline-flex p-1.5 hover:bg-slate-800 rounded-lg cursor-pointer"
                                title="Tải file XML gốc"
                              >
                                <FileDown className="w-5 h-5" />
                              </a>
                            ) : (
                              <span className="text-slate-700 inline-flex p-1.5 cursor-not-allowed" title="Không có file XML gốc">
                                <FileDown className="w-5 h-5 opacity-30" />
                              </span>
                            )}
                            {inv.zipPath ? (
                              <a
                                href={`${API_BASE_URL}/api/invoices/${inv.id}/zip`}
                                download
                                className="text-amber-400 hover:text-amber-300 transition duration-150 inline-flex p-1.5 hover:bg-slate-800 rounded-lg cursor-pointer"
                                title="Tải tệp nén ZIP gốc"
                              >
                                <FileArchive className="w-5 h-5" />
                              </a>
                            ) : (
                              <span className="text-slate-700 inline-flex p-1.5 cursor-not-allowed" title="Không có file ZIP gốc">
                                <FileArchive className="w-5 h-5 opacity-30" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            size={size}
            total={total}
            onPageChange={setPage}
            onSizeChange={(s) => { setSize(s); setPage(0); }}
          />
        </div>
      ) : (
        /* ── Download History Table ── */
        <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-800 text-slate-400 font-semibold uppercase text-xs">
                <tr>
                  <th className="p-4">Thời Gian</th>
                  <th className="p-4">Doanh Nghiệp (MST)</th>
                  <th className="p-4">Loại Quét</th>
                  <th className="p-4">Người Quét</th>
                  <th className="p-4 text-center">Trạng Thái</th>
                  <th className="p-4 text-center">Số Lượng</th>
                  <th className="p-4 text-center">Nhật Ký</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-350">
                {loading && histories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        <span>Đang tải nhật ký từ Database...</span>
                      </div>
                    </td>
                  </tr>
                ) : histories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      Không tìm thấy lịch sử tải nào.
                    </td>
                  </tr>
                ) : (
                  histories.map((h) => {
                    const timeStr = new Date(h.downloadDate).toLocaleString('vi-VN');
                    return (
                      <tr key={h.id} className="hover:bg-slate-900/30 transition border-b border-slate-800/30">
                        <td className="p-4 text-slate-400">{timeStr}</td>
                        <td className="p-4 font-mono font-semibold text-slate-200 select-all">{h.taxCode}</td>
                        <td className="p-4 text-xs font-semibold text-slate-350">
                          {h.invoiceType === 'SELL' ? 'Bán ra (SELL)' : (h.invoiceType === 'BUY' ? 'Mua vào (BUY)' : h.invoiceType)}
                        </td>
                        <td className="p-4">
                          {h.username ? (
                            <span className="font-semibold text-slate-200 text-xs bg-slate-900 px-2.5 py-1 border border-slate-850 rounded-lg">
                              {h.username}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic text-xs">Hệ thống (Cron)</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${h.status === 'SUCCESS'
                              ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/20'
                              : (h.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-rose-500/10 text-rose-450 border-rose-500/20')
                            }`}>
                            {h.status === 'SUCCESS' ? 'Thành công' : (h.status === 'PARTIAL' ? 'Một phần' : 'Thất bại')}
                          </span>
                        </td>
                        <td className="p-4 text-center font-bold text-slate-100">{h.countDownloaded} HĐ</td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setSelectedHistory(h)}
                            className="p-1.5 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 rounded-lg cursor-pointer transition flex items-center justify-center mx-auto"
                            title="Xem nhật ký chi tiết"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            size={size}
            total={total}
            onPageChange={setPage}
            onSizeChange={(s) => { setSize(s); setPage(0); }}
          />
        </div>
      )}

      {/* Preview Invoice Modal */}
      {previewInvoiceId && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center px-6 py-5 bg-slate-950/80 border-b border-slate-800">
              <h2 className="text-md font-bold text-slate-200 flex items-center space-x-2">
                <Eye className="w-5 h-5 text-emerald-400" />
                <span>Xem Trước Hóa Đơn</span>
              </h2>
              <button
                onClick={() => { setPreviewInvoiceId(null); setPreviewHtml(null); }}
                className="text-slate-400 hover:text-slate-100 p-1 bg-slate-850 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-0 flex-1 overflow-hidden bg-white">
              {previewLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  <span className="ml-3 text-slate-500">Đang tải nội dung hóa đơn...</span>
                </div>
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full min-h-[70vh] border-0"
                  title="Preview Invoice"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-slate-500">
                  Không thể tải nội dung preview.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Log Detail Modal */}
      {selectedHistory && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center px-6 py-5 bg-slate-950/80 border-b border-slate-800">
              <h2 className="text-md font-bold text-slate-200 flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-indigo-400" />
                <span>Chi Tiết Nhật Ký Quét Hóa Đơn</span>
              </h2>
              <button
                onClick={() => setSelectedHistory(null)}
                className="text-slate-400 hover:text-slate-100 p-1 bg-slate-850 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-850 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">Thời gian quét:</span>
                  <span className="font-semibold text-slate-300">{new Date(selectedHistory.downloadDate).toLocaleString('vi-VN')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Mã số thuế doanh nghiệp:</span>
                  <span className="font-semibold text-slate-300 select-all">{selectedHistory.taxCode}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Người thực hiện:</span>
                  <span className="font-semibold text-slate-300">{selectedHistory.username || 'Hệ thống (Cron)'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Số lượng tải về:</span>
                  <span className="font-semibold text-emerald-450">{selectedHistory.countDownloaded} hóa đơn thành công</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-450 uppercase tracking-wide">Lịch sử chi tiết & Lỗi hệ thống:</span>
                <pre className="bg-slate-950 text-slate-400 border border-slate-850 p-4 rounded-2xl text-xs font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto leading-relaxed">
                  {selectedHistory.log || 'Không ghi nhận lỗi nào trong phiên tải này.'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
