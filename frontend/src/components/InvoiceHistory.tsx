import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { FileDown, FileArchive, FileSpreadsheet, ShieldAlert, X, FileText, Eye, Loader2, ChevronLeft, ChevronRight, RotateCw, Filter, List } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface InvoiceItem {
  id: number;
  invoiceId: string;
  lineNumber?: string;
  name: string;
  unit?: string;
  quantity?: number;
  price?: number;
  amount: number;
  taxRate?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  type: 'SELL' | 'BUY';
  templateSymbol: string;
  invoiceSymbol: string;
  sellerName: string;
  sellerTaxCode: string;
  sellerAddress?: string | null;
  buyerName: string;
  buyerTaxCode: string;
  buyerAddress?: string | null;
  totalBeforeTax: number;
  taxAmount: number;
  totalAmount: number;
  currency?: string;
  exchangeRate?: number;
  paymentMethod?: string | null;
  totalAmountInWords?: string | null;
  pdfPath?: string | null;
  xmlPath?: string | null;
  zipPath?: string | null;
  items?: InvoiceItem[];
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

function formatInvoiceNumber(num: string): string {
  return String(num).padStart(8, '0');
}

function getInvoiceStatus(inv: Invoice): { label: string; color: string } {
  const hasZip = inv.zipPath && inv.zipPath !== 'VIRTUAL_HTML';
  const hasPdf = !!inv.pdfPath;
  const hasXml = !!inv.xmlPath;

  if (hasZip && hasPdf && hasXml) return { label: 'Đã tải đủ', color: 'bg-emerald-900/50 text-emerald-300' };
  if (hasPdf && hasXml) return { label: 'Thiếu ZIP', color: 'bg-amber-900/50 text-amber-300' };
  if (inv.zipPath === 'VIRTUAL_HTML') return { label: 'HTML online', color: 'bg-blue-900/50 text-blue-300' };
  if (hasPdf || hasXml || hasZip) return { label: 'Tải một phần', color: 'bg-amber-900/50 text-amber-300' };
  return { label: 'Chưa tải file', color: 'bg-gray-700/50 text-gray-400' };
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
    <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-card border-t border-border text-sm">
      <div className="flex items-center gap-2 text-text-secondary">
        <span className="hidden sm:inline">Tổng:</span>
        <span className="font-semibold text-text-primary">{total}</span>
        <span className="hidden sm:inline">records</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-text-muted text-xs">Số dòng:</span>
        <select
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          className="bg-bg-primary border border-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent cursor-pointer"
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
          className="p-1.5 bg-bg-primary hover:bg-bg-tertiary disabled:bg-card disabled:text-text-primary text-text-secondary rounded-lg border border-border transition cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-text-secondary text-xs whitespace-nowrap px-1">
          Trang <span className="font-semibold text-text-primary">{totalPages > 0 ? page + 1 : 0}</span> / <span className="font-semibold text-text-primary">{totalPages}</span>
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="p-1.5 bg-bg-primary hover:bg-bg-tertiary disabled:bg-card disabled:text-text-primary text-text-secondary rounded-lg border border-border transition cursor-pointer disabled:cursor-not-allowed"
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

  // Invoice Detail (items) Modal state
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);

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

  const downloadPdf = async (invoiceId: string) => {
    try {
      // 1. Fetch HTML
      const response = await axios.get(`${API_BASE_URL}/api/invoices/${invoiceId}/preview?t=${Date.now()}`, {
        responseType: 'text',
      });
      const htmlStr = response.data;

      // 2. Tạo một iframe ẩn để browser render toàn bộ CSS và font của hoá đơn gốc
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '800px';
      iframe.style.height = '1200px';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlStr);
        doc.close();
      }

      // Đợi 500ms để CSS và Font (nếu có) được browser áp dụng hoàn tất
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. Import html2pdf
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      const opt = {
        margin:       10,
        filename:     `invoice_${invoiceId.slice(0, 8)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // 4. Generate and save PDF from the iframe's body
      if (doc && doc.body) {
        // html2canvas only clones the target element (body). 
        // We must move all styles from <head> to <body> so they are applied in the PDF.
        const styles = doc.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach(style => doc.body.appendChild(style.cloneNode(true)));

        await html2pdf().set(opt).from(doc.body).save();
      }

      // 5. Cleanup
      document.body.removeChild(iframe);
    } catch (err: any) {
      console.error('Error downloading PDF:', err);
      const msg = err.response?.data?.error || 'Không thể tải file PDF.';
      alert(msg);
    }
  };

  const downloadFile = async (invoiceId: string, type: 'xml' | 'zip') => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/invoices/${invoiceId}/${type}`,
        { responseType: 'blob' }
      );

      const ext = type === 'xml' ? 'xml' : 'zip';
      const contentType = type === 'xml' ? 'application/xml' : 'application/zip';

      const blob = new Blob([response.data], { type: contentType });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `invoice_${invoiceId.slice(0, 8)}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error(`Error downloading ${type}:`, err);
      const msg = err.response?.data?.error || `Không thể tải file ${type}.`;
      alert(msg);
    }
  };

  const openPreview = async (invoiceId: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/invoices/${invoiceId}/preview?t=${Date.now()}`, {
        responseType: 'text',
      });
      const html = response.data;
      const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const newTab = window.open(blobUrl, '_blank');
      if (!newTab) {
        // Popup blocked — fallback to document.write
        const fallbackTab = window.open('', '_blank');
        if (fallbackTab) {
          fallbackTab.document.write(html);
          fallbackTab.document.close();
        } else {
          alert('Trình duyệt đã chặn popup. Vui lòng cho phép popup cho trang này hoặc dùng nút tải PDF thay thế.');
        }
      }
      // Revoke blob URL after enough time for the new tab to load
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err: any) {
      console.error('Error loading preview:', err);
      const msg = err.response?.data?.error || 'Không thể tải preview hóa đơn.';
      alert(msg);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex space-x-2 border-b border-border pb-px">
        <button
          onClick={() => setSubTab('invoices')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 cursor-pointer ${subTab === 'invoices'
              ? 'border-accent-default text-text-primary font-bold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
        >
          Hóa Đơn Đã Lưu
        </button>
        <button
          onClick={() => setSubTab('logs')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 cursor-pointer ${subTab === 'logs'
              ? 'border-accent-default text-text-primary font-bold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
        >
          Nhật Ký Tải Hệ Thống (Audit Logs)
        </button>
      </div>

      {/* Filters & Actions Card */}
      <div className="bg-card p-6 rounded-2xl border border-border shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          {subTab === 'invoices' ? (
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="">Tất cả hóa đơn</option>
              <option value="SELL">Bán ra (SELL)</option>
              <option value="BUY">Mua vào (BUY)</option>
            </select>
          ) : (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="SUCCESS">Thành công</option>
              <option value="PARTIAL">Một phần</option>
              <option value="FAILED">Thất bại</option>
            </select>
          )}

          <div className="relative">
            <Filter className="w-4 h-4 text-text-secondary absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="bg-bg-primary border border-border rounded-xl pl-10 pr-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent w-64"
              placeholder={subTab === 'invoices' ? "Số HĐ, tên doanh nghiệp..." : "Tìm theo MST, người tải..."}
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
            className="p-2 bg-bg-primary hover:bg-bg-tertiary text-text-secondary hover:text-text-primary rounded-xl border border-slate-750 transition cursor-pointer"
            title="Làm mới danh sách"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {subTab === 'invoices' && (
          <button
            onClick={exportSelected}
            disabled={selectedIds.length === 0 || exporting}
            className="bg-success-default hover:bg-success-default disabled:bg-bg-tertiary disabled:text-text-muted text-white font-semibold py-2 px-5 rounded-xl transition-all duration-200 flex items-center space-x-2 shrink-0 cursor-pointer shadow-lg shadow-success-default/20"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>{exporting ? 'Đang xuất...' : `Xuất Báo Cáo Excel (${selectedIds.length})`}</span>
          </button>
        )}
      </div>

      {subTab === 'invoices' ? (
        /* ── Invoices Table ── */
        <div className="bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-bg-primary/50 border-b border-border text-text-secondary font-semibold uppercase text-xs">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={invoices.length > 0 && selectedIds.length === invoices.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-border text-accent-default focus:ring-accent-default bg-bg-primary"
                    />
                  </th>
                  <th className="p-3 w-10 text-center">STT</th>
                  <th className="p-3">Ký hiệu mẫu số</th>
                  <th className="p-3">Ký hiệu HĐ</th>
                  <th className="p-3">Số HĐ</th>
                  <th className="p-3">Ngày lập</th>
                  {filterType !== 'SELL' && (
                    <>
                      <th className="p-3">MST người bán</th>
                      <th className="p-3">Tên người bán</th>
                    </>
                  )}
                  {filterType !== 'BUY' && (
                    <>
                      <th className="p-3">MST người mua</th>
                      <th className="p-3">Tên người mua</th>
                      <th className="p-3">Địa chỉ người mua</th>
                    </>
                  )}
                  <th className="p-3 text-right">Tiền trước thuế</th>
                  <th className="p-3 text-right">Tiền thuế</th>
                  <th className="p-3 text-right">Chiết khấu</th>
                  <th className="p-3 text-right">Phí</th>
                  <th className="p-3 text-right">Tổng thanh toán</th>
                  <th className="p-3 text-center">ĐVT</th>
                  <th className="p-3 text-right">Tỷ giá</th>
                  <th className="p-3 text-center">Trạng thái</th>
                  <th className="p-3 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 text-text-muted">
                {loading ? (
                  <tr>
                    <td colSpan={20} className="p-12 text-center text-text-muted">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Loader2 className="w-8 h-8 text-accent-default animate-spin" />
                        <span>Đang tải danh sách hóa đơn từ Database...</span>
                      </div>
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="p-8 text-center text-text-muted">
                      Không có hóa đơn nào trong cơ sở dữ liệu.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv, idx) => {
                    const status = getInvoiceStatus(inv);

                    return (
                      <tr key={inv.id} className="hover:bg-bg-primary/30 transition-all border-b border-border/30">
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(inv.id)}
                            onChange={(e) => handleSelectOne(inv.id, e.target.checked)}
                            className="w-4 h-4 rounded border-border text-accent-default focus:ring-accent-default bg-bg-primary"
                          />
                        </td>
                        <td className="p-3 text-center text-text-muted text-xs">
                          {idx + 1 + page * size}
                        </td>
                        <td className="p-3 font-mono text-xs text-text-secondary">
                          {inv.templateSymbol || '—'}
                        </td>
                        <td className="p-3 font-mono text-xs text-text-secondary">
                          {inv.invoiceSymbol || '—'}
                        </td>
                        <td className="p-3 font-semibold text-text-primary font-mono text-xs">
                          {formatInvoiceNumber(inv.invoiceNumber)}
                        </td>
                        <td className="p-3 text-text-secondary text-xs whitespace-nowrap">
                          {formatDate(inv.invoiceDate)}
                        </td>
                        {filterType !== 'SELL' && (
                          <>
                            <td className="p-3 font-mono text-xs">
                              {inv.sellerTaxCode}
                            </td>
                            <td className="p-3 max-w-[160px] truncate text-xs" title={inv.sellerName}>
                              <span className="font-medium text-text-primary">{inv.sellerName}</span>
                            </td>
                          </>
                        )}
                        {filterType !== 'BUY' && (
                          <>
                            <td className="p-3 font-mono text-xs">
                              {inv.buyerTaxCode}
                            </td>
                            <td className="p-3 max-w-[160px] truncate text-xs" title={inv.buyerName}>
                              <span className="font-medium text-text-primary">{inv.buyerName}</span>
                            </td>
                            <td className="p-3 max-w-[160px] truncate text-text-muted text-xs" title={inv.buyerAddress || ''}>
                              {inv.buyerAddress || '—'}
                            </td>
                          </>
                        )}
                        <td className="p-3 text-right text-xs">
                          {formatNumber(inv.totalBeforeTax)}
                        </td>
                        <td className="p-3 text-right text-xs">
                          {formatNumber(inv.taxAmount)}
                        </td>
                        <td className="p-3 text-right text-text-muted text-xs">—</td>
                        <td className="p-3 text-right text-text-muted text-xs">—</td>
                        <td className="p-3 text-right font-bold text-success-default text-xs">
                          {formatNumber(inv.totalAmount)}
                        </td>
                        <td className="p-3 text-center text-xs">
                          {inv.currency || 'VND'}
                        </td>
                        <td className="p-3 text-right text-xs">
                          {inv.exchangeRate && inv.exchangeRate !== 1 ? inv.exchangeRate : '—'}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => setDetailInvoice(inv)}
                              className="text-accent-default hover:text-accent-default transition duration-150 inline-flex p-1.5 hover:bg-bg-tertiary rounded-lg cursor-pointer"
                              title="Xem chi tiết sản phẩm"
                            >
                              <List className="w-4 h-4" />
                            </button>
                            {inv.zipPath ? (
                              <button
                                onClick={() => openPreview(inv.id)}
                                className="text-success-default hover:text-success-default transition duration-150 inline-flex p-1.5 hover:bg-bg-tertiary rounded-lg cursor-pointer"
                                title="Xem trước hóa đơn (HTML)"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-text-primary inline-flex p-1.5 cursor-not-allowed" title="Không có file ZIP gốc để preview">
                                <Eye className="w-4 h-4 opacity-30" />
                              </span>
                            )}
                            {inv.xmlPath ? (
                              <button
                                onClick={() => downloadFile(inv.id, 'xml')}
                                className="text-accent-default hover:text-accent-default transition duration-150 inline-flex p-1.5 hover:bg-bg-tertiary rounded-lg cursor-pointer"
                                title="Tải file XML gốc"
                              >
                                <FileDown className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-text-primary inline-flex p-1.5 cursor-not-allowed" title="Không có file XML gốc">
                                <FileDown className="w-4 h-4 opacity-30" />
                              </span>
                            )}
                            {inv.zipPath ? (
                              <button
                                onClick={() => downloadPdf(inv.id)}
                                className="text-danger-default hover:text-danger-default transition duration-150 inline-flex p-1.5 hover:bg-bg-tertiary rounded-lg cursor-pointer"
                                title="Tải bản thể hiện (PDF)"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-text-primary inline-flex p-1.5 cursor-not-allowed" title="Không có bản thể hiện PDF">
                                <FileText className="w-4 h-4 opacity-30" />
                              </span>
                            )}
                            {inv.zipPath === 'VIRTUAL_HTML' ? (
                              <span className="text-text-primary inline-flex p-1.5 cursor-not-allowed" title="Chỉ có bản thể hiện HTML, không có file ZIP gốc">
                                <FileArchive className="w-4 h-4 opacity-30" />
                              </span>
                            ) : inv.zipPath ? (
                              <button
                                onClick={() => downloadFile(inv.id, 'zip')}
                                className="text-amber-400 hover:text-amber-300 transition duration-150 inline-flex p-1.5 hover:bg-bg-tertiary rounded-lg cursor-pointer"
                                title="Tải tệp nén ZIP gốc"
                              >
                                <FileArchive className="w-4 h-4" />
                              </button>
                            ) : (
                              <span className="text-text-primary inline-flex p-1.5 cursor-not-allowed" title="Không có file ZIP gốc">
                                <FileArchive className="w-4 h-4 opacity-30" />
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
        <div className="bg-card rounded-2xl border border-border shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-bg-primary/50 border-b border-border text-text-secondary font-semibold uppercase text-xs">
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
              <tbody className="divide-y divide-border/50 text-text-muted">
                {loading && histories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-text-muted">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <Loader2 className="w-8 h-8 text-accent-default animate-spin" />
                        <span>Đang tải nhật ký từ Database...</span>
                      </div>
                    </td>
                  </tr>
                ) : histories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-text-muted">
                      Không tìm thấy lịch sử tải nào.
                    </td>
                  </tr>
                ) : (
                  histories.map((h) => {
                    const timeStr = new Date(h.downloadDate).toLocaleString('vi-VN');
                    return (
                      <tr key={h.id} className="hover:bg-bg-primary/30 transition border-b border-border/30">
                        <td className="p-4 text-text-secondary">{timeStr}</td>
                        <td className="p-4 font-mono font-semibold text-text-primary select-all">{h.taxCode}</td>
                        <td className="p-4 text-xs font-semibold text-text-muted">
                          {h.invoiceType === 'SELL' ? 'Bán ra (SELL)' : (h.invoiceType === 'BUY' ? 'Mua vào (BUY)' : h.invoiceType)}
                        </td>
                        <td className="p-4">
                          {h.username ? (
                            <span className="font-semibold text-text-primary text-xs bg-bg-primary px-2.5 py-1 border border-border rounded-lg">
                              {h.username}
                            </span>
                          ) : (
                            <span className="text-text-muted italic text-xs">Hệ thống (Cron)</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${h.status === 'SUCCESS'
                              ? 'bg-success-light text-success-default border-success-default/20'
                              : (h.status === 'PARTIAL' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-danger-light text-danger-default border-danger-default/20')
                            }`}>
                            {h.status === 'SUCCESS' ? 'Thành công' : (h.status === 'PARTIAL' ? 'Một phần' : 'Thất bại')}
                          </span>
                        </td>
                        <td className="p-4 text-center font-bold text-text-primary">{h.countDownloaded} HĐ</td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setSelectedHistory(h)}
                            className="p-1.5 bg-bg-primary border border-border hover:bg-bg-tertiary text-accent-default hover:text-accent-default rounded-lg cursor-pointer transition flex items-center justify-center mx-auto"
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

      {/* Invoice Detail (Items) Modal */}
      {detailInvoice && (
        <div className="fixed inset-0 bg-card/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-4xl bg-bg-primary border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center px-6 py-5 bg-card/80 border-b border-border">
              <h2 className="text-md font-bold text-text-primary flex items-center space-x-2">
                <List className="w-5 h-5 text-accent-default" />
                <span>Chi Tiết Hàng Hóa — HĐ {String(detailInvoice.invoiceNumber).padStart(8, '0')}</span>
              </h2>
              <button
                onClick={() => setDetailInvoice(null)}
                className="text-text-secondary hover:text-text-primary p-1 bg-bg-tertiary hover:bg-bg-tertiary rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Invoice summary */}
            <div className="px-6 py-4 bg-card/50 border-b border-border grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="text-text-muted">Ngày lập:</span>{' '}
                <span className="text-text-secondary font-semibold">{new Date(detailInvoice.invoiceDate).toLocaleDateString('vi-VN')}</span>
              </div>
              <div>
                <span className="text-text-muted">Loại:</span>{' '}
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${detailInvoice.type === 'SELL' ? 'bg-accent-light-default text-accent-default' : 'bg-amber-900/50 text-amber-300'}`}>
                  {detailInvoice.type === 'SELL' ? 'Bán ra' : 'Mua vào'}
                </span>
              </div>
              <div className="truncate">
                <span className="text-text-muted">Bên bán:</span>{' '}
                <span className="text-text-secondary font-semibold" title={detailInvoice.sellerName}>{detailInvoice.sellerName}</span>
              </div>
              <div className="truncate">
                <span className="text-text-muted">Bên mua:</span>{' '}
                <span className="text-text-secondary font-semibold" title={detailInvoice.buyerName}>{detailInvoice.buyerName}</span>
              </div>
            </div>

            {/* Items table */}
            <div className="flex-1 overflow-y-auto p-6">
              {detailInvoice.items && detailInvoice.items.length > 0 ? (
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-bg-primary/50 border-b border-border text-text-secondary font-semibold uppercase text-xs sticky top-0">
                    <tr>
                      <th className="p-3 w-12 text-center">STT</th>
                      <th className="p-3">Tên hàng hóa, dịch vụ</th>
                      <th className="p-3 w-16 text-center">ĐVT</th>
                      <th className="p-3 w-20 text-right">Số lượng</th>
                      <th className="p-3 w-28 text-right">Đơn giá</th>
                      <th className="p-3 w-28 text-right">Thành tiền</th>
                      <th className="p-3 w-18 text-center">Thuế suất</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50 text-text-muted">
                    {detailInvoice.items.map((item) => (
                      <tr key={item.id} className="hover:bg-bg-primary/30 transition">
                        <td className="p-3 text-center text-text-muted">{item.lineNumber || '-'}</td>
                        <td className="p-3 font-medium text-text-primary max-w-[300px]">
                          <span title={item.name}>{item.name}</span>
                        </td>
                        <td className="p-3 text-center text-text-secondary">{item.unit || '-'}</td>
                        <td className="p-3 text-right text-text-secondary">
                          {item.quantity != null ? Number(item.quantity).toLocaleString('vi-VN') : '-'}
                        </td>
                        <td className="p-3 text-right text-text-secondary">
                          {item.price != null ? Number(item.price).toLocaleString('vi-VN') : '-'}
                        </td>
                        <td className="p-3 text-right font-semibold text-success-default">
                          {Number(item.amount).toLocaleString('vi-VN')}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded text-xs font-mono bg-bg-primary text-text-secondary border border-border">
                            {item.taxRate || '0%'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-text-muted">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Không có dữ liệu hàng hóa cho hóa đơn này.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Log Detail Modal */}
      {selectedHistory && (
        <div className="fixed inset-0 bg-card/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl bg-bg-primary border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center px-6 py-5 bg-card/80 border-b border-border">
              <h2 className="text-md font-bold text-text-primary flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-accent-default" />
                <span>Chi Tiết Nhật Ký Quét Hóa Đơn</span>
              </h2>
              <button
                onClick={() => setSelectedHistory(null)}
                className="text-text-secondary hover:text-text-primary p-1 bg-bg-tertiary hover:bg-bg-tertiary rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-4 bg-card p-4 rounded-2xl border border-border text-xs">
                <div>
                  <span className="text-text-muted block mb-0.5">Thời gian quét:</span>
                  <span className="font-semibold text-text-secondary">{new Date(selectedHistory.downloadDate).toLocaleString('vi-VN')}</span>
                </div>
                <div>
                  <span className="text-text-muted block mb-0.5">Mã số thuế doanh nghiệp:</span>
                  <span className="font-semibold text-text-secondary select-all">{selectedHistory.taxCode}</span>
                </div>
                <div>
                  <span className="text-text-muted block mb-0.5">Người thực hiện:</span>
                  <span className="font-semibold text-text-secondary">{selectedHistory.username || 'Hệ thống (Cron)'}</span>
                </div>
                <div>
                  <span className="text-text-muted block mb-0.5">Số lượng tải về:</span>
                  <span className="font-semibold text-success-default">{selectedHistory.countDownloaded} hóa đơn thành công</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wide">Lịch sử chi tiết & Lỗi hệ thống:</span>
                <pre className="bg-card text-text-secondary border border-border p-4 rounded-2xl text-xs font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto leading-relaxed">
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
