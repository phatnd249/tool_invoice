import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { FileDown, FileArchive, FileSpreadsheet, ShieldAlert, X, FileText, Eye, Loader2, ChevronLeft, ChevronRight, RotateCw, List, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { API_BASE_URL } from '../config';
import CompanyAutocomplete from '@/components/CompanyAutocomplete';

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
  feeAmount?: number;
  discountAmount?: number;
  currency?: string;
  exchangeRate?: number;
  paymentMethod?: string | null;
  totalAmountInWords?: string | null;
  pdfPath?: string | null;
  xmlPath?: string | null;
  zipPath?: string | null;
  invoiceStatus?: number | null;
  processStatus?: number | null;
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
  startDate?: string | null;
  endDate?: string | null;
  totalInvoices?: number | null;
}

interface Company {
  id: number;
  taxCode: string;
  name: string;
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

function getInvoiceStatusLabel(inv: Invoice): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } | null {
  if (inv.invoiceStatus !== undefined && inv.invoiceStatus !== null) {
    switch (inv.invoiceStatus) {
      case 1: return { label: 'Hoá đơn mới', variant: 'default' };
      case 2: return { label: 'Thay thế', variant: 'secondary' };
      case 3: return { label: 'Điều chỉnh', variant: 'outline' };
      case 4: return { label: 'Đã bị thay thế', variant: 'outline' };
      case 5: return { label: 'Đã bị điều chỉnh', variant: 'outline' };
      case 6: return { label: 'Đã huỷ', variant: 'destructive' };
    }
  }
  return null;
}

const PAGE_SIZES = [10, 20, 50, 100];

export default function InvoiceHistory() {
  const [subTab, setSubTab] = useState<'invoices' | 'logs'>('invoices');

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [histories, setHistories] = useState<DownloadHistory[]>([]);

  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchText, setSearchText] = useState('');

  // Sort state
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [companyFilter, setCompanyFilter] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingModule7, setExportingModule7] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedHistory, setSelectedHistory] = useState<DownloadHistory | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);

  // ── Fetch ──

  const fetchInvoices = useCallback(async (p: number, s: number, q: string, type: string, companyTaxCode: string, sf: string, sd: 'asc' | 'desc') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), size: String(s), ...(q && { search: q }), ...(type && { type }) });
      if (sf) params.set('sortBy', sf);
      params.set('sortDir', sd);
      if (companyTaxCode && type) {
        params.set(type === 'SELL' ? 'sellerTaxCode' : 'buyerTaxCode', companyTaxCode);
      }
      const response = await axios.get<PaginatedResponse<Invoice>>(`${API_BASE_URL}/api/invoices?${params}`);
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

  const fetchHistories = useCallback(async (p: number, s: number, q: string, status: string, sf: string, sd: 'asc' | 'desc') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), size: String(s), ...(q && { search: q }), ...(status && { status }) });
      if (sf) params.set('sortBy', sf);
      params.set('sortDir', sd);
      const response = await axios.get<PaginatedResponse<DownloadHistory>>(`${API_BASE_URL}/api/invoices/download-history?${params}`);
      setHistories(response.data.data);
      setTotal(response.data.total);
      setTotalPages(response.data.totalPages);
    } catch (err) {
      console.error('Error fetching histories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch companies ──

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await axios.get<Company[]>(`${API_BASE_URL}/api/companies`);
      setCompanies(res.data);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    if (subTab === 'invoices') fetchInvoices(page, size, searchText, filterType, companyFilter, sortField, sortDir);
    else fetchHistories(page, size, searchText, filterStatus, sortField, sortDir);
  }, [page, size, subTab, filterType, filterStatus, companyFilter, sortField, sortDir]); // eslint-disable-line

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPage(0), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchText]);

  useEffect(() => {
    setPage(0);
    setCompanyFilter('');
  }, [filterType, filterStatus]); // eslint-disable-line

  useEffect(() => { setPage(0); }, [sortField, sortDir]);

  // ── Sort handler ──

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3 inline text-primary" />
      : <ArrowDown className="ml-1 h-3 w-3 inline text-primary" />;
  };

  // ── Handlers ──

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(invoices.map(i => i.id));
    else setSelectedIds([]);
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) setSelectedIds(prev => [...prev, id]);
    else setSelectedIds(prev => prev.filter(item => item !== id));
  };

  const exportSelected = async () => {
    if (selectedIds.length === 0 || exporting) return;
    setExporting(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/invoices/export`, { invoiceIds: selectedIds }, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `BaoCao_HoaDon_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting:', err);
      toast.error('Xuất Excel thất bại.');
    } finally { setExporting(false); }
  };

  const exportModule7 = async () => {
    if (selectedIds.length === 0 || exportingModule7) return;
    setExportingModule7(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/invoices/export-module7`, { invoiceIds: selectedIds }, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `BaoCao_TongHop_M7_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting M7:', err);
      toast.error('Xuất Báo Cáo Module 7 thất bại.');
    } finally { setExportingModule7(false); }
  };

  const downloadPdf = async (invoiceId: string) => {
    downloadFile(invoiceId, 'pdf');
  };

  const downloadFile = async (invoiceId: string, type: 'xml' | 'zip' | 'pdf') => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/invoices/${invoiceId}/${type}`, { responseType: 'blob' });
      const ext = type;
      const contentType = type === 'xml' ? 'application/xml' : type === 'zip' ? 'application/zip' : 'application/pdf';
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      const cd = response.headers['content-disposition'];
      let filename = `invoice_${invoiceId.slice(0, 8)}.${ext}`;
      if (cd) { const m = cd.match(/filename="?([^"]+)"?/); if (m?.[1]) filename = m[1]; }
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try { const json = JSON.parse(text); toast.error(json.error || `Không thể tải file ${type.toUpperCase()}.`); }
        catch { toast.error(`Không thể tải file ${type.toUpperCase()}.`); }
      } else {
        toast.error(err.response?.data?.error || `Không thể tải file ${type.toUpperCase()}.`);
      }
    }
  };

  const openPreview = async (invoiceId: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/invoices/${invoiceId}/preview?t=${Date.now()}`, { responseType: 'text' });
      const newWindow = window.open('', '_blank');
      if (newWindow) { newWindow.document.write(response.data); newWindow.document.close(); }
      else { toast.error('Trình duyệt đã chặn tab mới. Vui lòng cho phép popup.'); }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Không thể tải bản xem trước.');
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS': return <Badge className="bg-green-500/10 text-green-600 border-green-300 hover:bg-green-500/10">Thành công</Badge>;
      case 'PARTIAL': return <Badge variant="destructive">Có HĐ lỗi</Badge>;
      case 'FAILED': return <Badge variant="destructive">Thất bại</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const invoiceTypeBadge = (type: string) => {
    switch (type) {
      case 'SELL': return <Badge>Bán ra</Badge>;
      case 'BUY': return <Badge variant="secondary">Mua vào</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as any)}>
        <TabsList>
          <TabsTrigger value="invoices">Hóa Đơn Đã Lưu</TabsTrigger>
          <TabsTrigger value="logs">Nhật Ký Tải Hệ Thống</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters - Row 1: type/status, search, actions */}
      <Card className="overflow-visible">
        <CardContent className="p-4 md:p-6 space-y-3 overflow-visible">
          <div className="flex flex-wrap items-center gap-3">
            {subTab === 'invoices' ? (
              <Select value={filterType} onValueChange={v => setFilterType(v ?? '')}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tất cả hóa đơn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tất cả hóa đơn</SelectItem>
                  <SelectItem value="SELL">Bán ra (SELL)</SelectItem>
                  <SelectItem value="BUY">Mua vào (BUY)</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? '')}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tất cả trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tất cả trạng thái</SelectItem>
                  <SelectItem value="SUCCESS">Thành công</SelectItem>
                  <SelectItem value="PARTIAL">Một phần</SelectItem>
                  <SelectItem value="FAILED">Thất bại</SelectItem>
                </SelectContent>
              </Select>
            )}

            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="pl-9"
                placeholder={subTab === 'invoices' ? 'Số HĐ, tên doanh nghiệp...' : 'Tìm theo MST, người tải...'}
              />
            </div>

            <Button variant="outline" size="icon" onClick={() => {
              if (subTab === 'invoices') fetchInvoices(page, size, searchText, filterType, companyFilter, sortField, sortDir);
              else fetchHistories(page, size, searchText, filterStatus, sortField, sortDir);
            }}>
              <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            {subTab === 'invoices' && (
              <>
                <Button onClick={exportSelected} disabled={selectedIds.length === 0 || exporting} className="gap-1.5">
                  <FileSpreadsheet className="h-4 w-4" />
                  {exporting ? 'Đang xuất...' : `Xuất Excel (${selectedIds.length})`}
                </Button>
                <Button onClick={exportModule7} disabled={selectedIds.length === 0 || exportingModule7} variant="secondary" className="gap-1.5">
                  <FileSpreadsheet className="h-4 w-4" />
                  {exportingModule7 ? 'Đang xuất M7...' : `Báo Cáo M7 (${selectedIds.length})`}
                </Button>
              </>
            )}
          </div>

          {/* Filters - Row 2: company autocomplete */}
          {subTab === 'invoices' && filterType && (
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">
                {filterType === 'SELL' ? 'Công ty bán:' : 'Công ty mua:'}
              </Label>
              <div className="w-[360px]">
                <CompanyAutocomplete
                  companies={companies}
                  value={companyFilter}
                  onChange={v => setCompanyFilter(v)}
                  placeholder={filterType === 'SELL' ? 'Nhập tên hoặc MST công ty bán...' : 'Nhập tên hoặc MST công ty mua...'}
                />
              </div>
              {companyFilter && (
                <Button variant="ghost" size="sm" onClick={() => setCompanyFilter('')} className="h-8 text-xs gap-1">
                  <X className="h-3 w-3" />
                  Bỏ lọc
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {subTab === 'invoices' ? (
        <Card>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <input type="checkbox" checked={invoices.length > 0 && selectedIds.length === invoices.length} onChange={handleSelectAll} className="rounded" />
                  </TableHead>
                  <TableHead className="w-10 text-center">STT</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('templateSymbol')}>
                    <span className="inline-flex items-center">Mẫu số{renderSortIcon('templateSymbol')}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('invoiceSymbol')}>
                    <span className="inline-flex items-center">KH HĐ{renderSortIcon('invoiceSymbol')}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('invoiceNumber')}>
                    <span className="inline-flex items-center">Số HĐ{renderSortIcon('invoiceNumber')}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('invoiceDate')}>
                    <span className="inline-flex items-center">Ngày{renderSortIcon('invoiceDate')}</span>
                  </TableHead>
                  {filterType !== 'SELL' && (
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('sellerTaxCode')}>
                      <span className="inline-flex items-center">MST bán{renderSortIcon('sellerTaxCode')}</span>
                    </TableHead>
                  )}
                  {filterType !== 'SELL' && (
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('sellerName')}>
                      <span className="inline-flex items-center">Tên người bán{renderSortIcon('sellerName')}</span>
                    </TableHead>
                  )}
                  {filterType !== 'BUY' && (
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('buyerTaxCode')}>
                      <span className="inline-flex items-center">MST mua{renderSortIcon('buyerTaxCode')}</span>
                    </TableHead>
                  )}
                  {filterType !== 'BUY' && (
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort('buyerName')}>
                      <span className="inline-flex items-center">Tên người mua{renderSortIcon('buyerName')}</span>
                    </TableHead>
                  )}
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('totalBeforeTax')}>
                    <span className="inline-flex items-center justify-end">Tiền{renderSortIcon('totalBeforeTax')}</span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('taxAmount')}>
                    <span className="inline-flex items-center justify-end">Thuế{renderSortIcon('taxAmount')}</span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort('totalAmount')}>
                    <span className="inline-flex items-center justify-end">Tổng{renderSortIcon('totalAmount')}</span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort('invoiceStatus')}>
                    <span className="inline-flex items-center justify-center">Trạng thái{renderSortIcon('invoiceStatus')}</span>
                  </TableHead>
                  <TableHead className="text-center">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={20} className="text-center py-12 text-muted-foreground"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></TableCell></TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={20} className="text-center py-8 text-muted-foreground">Không có hóa đơn nào.</TableCell></TableRow>
                ) : (
                  invoices.map((inv, idx) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-center">
                        <input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={(e) => handleSelectOne(inv.id, e.target.checked)} className="rounded" />
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{idx + 1 + page * size}</TableCell>
                      <TableCell className="font-mono text-xs">{inv.templateSymbol || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{inv.invoiceSymbol || '—'}</TableCell>
                      <TableCell className="font-mono font-semibold text-xs">{formatInvoiceNumber(inv.invoiceNumber)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(inv.invoiceDate)}</TableCell>
                      {filterType !== 'SELL' && (
                        <TableCell className="font-mono text-xs">{inv.sellerTaxCode}</TableCell>
                      )}
                      {filterType !== 'SELL' && (
                        <TableCell className="max-w-[120px] truncate text-xs" title={inv.sellerName}>{inv.sellerName}</TableCell>
                      )}
                      {filterType !== 'BUY' && (
                        <TableCell className="font-mono text-xs">{inv.buyerTaxCode}</TableCell>
                      )}
                      {filterType !== 'BUY' && (
                        <TableCell className="max-w-[120px] truncate text-xs" title={inv.buyerName}>{inv.buyerName}</TableCell>
                      )}
                      <TableCell className="text-right text-xs">{formatNumber(inv.totalBeforeTax)}</TableCell>
                      <TableCell className="text-right text-xs">{formatNumber(inv.taxAmount)}</TableCell>
                      <TableCell className="text-right font-bold text-xs">{formatNumber(inv.totalAmount)}</TableCell>
                      <TableCell className="text-center">
                        {getInvoiceStatusLabel(inv) ? (
                          <Badge variant={getInvoiceStatusLabel(inv)!.variant}>{getInvoiceStatusLabel(inv)!.label}</Badge>
                        ) : <Badge variant="outline">—</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailInvoice(inv)} title="Chi tiết">
                            <List className="h-3.5 w-3.5" />
                          </Button>
                          {inv.zipPath ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPreview(inv.id)} title="Xem trước">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          ) : <Eye className="h-3.5 w-3.5 opacity-30 mx-1" />}
                          {inv.xmlPath ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadFile(inv.id, 'xml')} title="Tải XML">
                              <FileDown className="h-3.5 w-3.5" />
                            </Button>
                          ) : <FileDown className="h-3.5 w-3.5 opacity-30 mx-1" />}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => downloadPdf(inv.id)} title="Tải PDF" disabled={!inv.zipPath}>
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                          {inv.zipPath && inv.zipPath !== 'VIRTUAL_HTML' ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500 hover:text-amber-600" onClick={() => downloadFile(inv.id, 'zip')} title="Tải ZIP">
                              <FileArchive className="h-3.5 w-3.5" />
                            </Button>
                          ) : <FileArchive className="h-3.5 w-3.5 opacity-30 mx-1" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationBar page={page} totalPages={totalPages} size={size} total={total} onPageChange={setPage} onSizeChange={(s) => { setSize(s); setPage(0); }} />
        </Card>
      ) : (
        <Card>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('downloadDate')}>
                    <span className="inline-flex items-center">Thời Gian{renderSortIcon('downloadDate')}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('taxCode')}>
                    <span className="inline-flex items-center">Doanh Nghiệp{renderSortIcon('taxCode')}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none">
                    <span className="inline-flex items-center">Khoảng Thời Gian</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('invoiceType')}>
                    <span className="inline-flex items-center">Loại Quét{renderSortIcon('invoiceType')}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort('username')}>
                    <span className="inline-flex items-center">Người Quét{renderSortIcon('username')}</span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort('status')}>
                    <span className="inline-flex items-center justify-center">Trạng Thái{renderSortIcon('status')}</span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort('countDownloaded')}>
                    <span className="inline-flex items-center justify-center">Đã Tải{renderSortIcon('countDownloaded')}</span>
                  </TableHead>
                  <TableHead className="text-center">
                    <span className="inline-flex items-center justify-center">Tổng HĐ</span>
                  </TableHead>
                  <TableHead className="text-center">Nhật Ký</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && histories.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-12"><Loader2 className="mx-auto h-8 w-8 animate-spin" /></TableCell></TableRow>
                ) : histories.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Không tìm thấy lịch sử tải nào.</TableCell></TableRow>
                ) : (
                  histories.map(h => {
                    const matchedCompany = companies.find(c => c.taxCode === h.taxCode);
                    const companyDisplay = matchedCompany ? `${matchedCompany.name} (${h.taxCode})` : h.taxCode;
                    return (
                      <TableRow key={h.id}>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(h.downloadDate).toLocaleString('vi-VN')}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs" title={companyDisplay}>{companyDisplay}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {h.startDate && h.endDate
                            ? `${new Date(h.startDate).toLocaleDateString('vi-VN')} → ${new Date(h.endDate).toLocaleDateString('vi-VN')}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">{h.invoiceType === 'SELL' ? 'Bán ra' : h.invoiceType === 'BUY' ? 'Mua vào' : h.invoiceType}</TableCell>
                        <TableCell><Badge variant="secondary">{h.username || 'Cron'}</Badge></TableCell>
                        <TableCell className="text-center">{statusBadge(h.status)}</TableCell>
                        <TableCell className="text-center font-bold">{h.countDownloaded}</TableCell>
                        <TableCell className="text-center">{h.totalInvoices ?? '—'}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="icon" onClick={() => setSelectedHistory(h)}><FileText className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationBar page={page} totalPages={totalPages} size={size} total={total} onPageChange={setPage} onSizeChange={(s) => { setSize(s); setPage(0); }} />
        </Card>
      )}

      {/* Invoice Detail Dialog */}
      <Dialog open={!!detailInvoice} onOpenChange={(open) => !open && setDetailInvoice(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <List className="h-5 w-5" />
              Chi Tiết Hàng Hóa — HĐ {detailInvoice ? formatInvoiceNumber(detailInvoice.invoiceNumber) : ''}
            </DialogTitle>
          </DialogHeader>
          {detailInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs bg-muted/30 rounded-lg p-4">
                <div><span className="text-muted-foreground">Ngày lập:</span> <span className="font-semibold">{new Date(detailInvoice.invoiceDate).toLocaleDateString('vi-VN')}</span></div>
                <div><span className="text-muted-foreground">Loại:</span> {invoiceTypeBadge(detailInvoice.type)}</div>
                <div className="truncate"><span className="text-muted-foreground">Bên bán:</span> {detailInvoice.sellerName}</div>
                <div className="truncate"><span className="text-muted-foreground">Bên mua:</span> {detailInvoice.buyerName}</div>
              </div>

              {detailInvoice.items && detailInvoice.items.length > 0 ? (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">STT</TableHead>
                          <TableHead>Tên hàng hóa</TableHead>
                          <TableHead className="w-16 text-center">ĐVT</TableHead>
                          <TableHead className="w-20 text-right">SL</TableHead>
                          <TableHead className="w-28 text-right">Đơn giá</TableHead>
                          <TableHead className="w-28 text-right">Thành tiền</TableHead>
                          <TableHead className="w-18 text-center">Thuế suất</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailInvoice.items.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="text-center text-muted-foreground">{item.lineNumber || '-'}</TableCell>
                            <TableCell className="max-w-[200px] lg:max-w-[300px] truncate" title={item.name}>{item.name}</TableCell>
                            <TableCell className="text-center">{item.unit || '-'}</TableCell>
                            <TableCell className="text-right">{item.quantity != null ? Number(item.quantity).toLocaleString('vi-VN') : '-'}</TableCell>
                            <TableCell className="text-right">{item.price != null ? Number(item.price).toLocaleString('vi-VN') : '-'}</TableCell>
                            <TableCell className="text-right font-semibold">{Number(item.amount).toLocaleString('vi-VN')}</TableCell>
                            <TableCell className="text-center"><Badge variant="outline">{item.taxRate || '0%'}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile card list */}
                  <div className="sm:hidden space-y-2">
                    {detailInvoice.items.map(item => (
                      <div key={item.id} className="rounded-lg border bg-card p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-sm leading-tight flex-1">{item.name}</span>
                          <Badge variant="outline" className="shrink-0 text-[10px]">{item.taxRate || '0%'}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {item.lineNumber && <div><span className="font-medium text-foreground">STT:</span> {item.lineNumber}</div>}
                          {item.unit && <div><span className="font-medium text-foreground">ĐVT:</span> {item.unit}</div>}
                          {item.quantity != null && <div><span className="font-medium text-foreground">SL:</span> {Number(item.quantity).toLocaleString('vi-VN')}</div>}
                          {item.price != null && <div><span className="font-medium text-foreground">Đơn giá:</span> {Number(item.price).toLocaleString('vi-VN')}</div>}
                        </div>
                        <div className="pt-1.5 border-t text-right text-sm font-bold">
                          Thành tiền: {Number(item.amount).toLocaleString('vi-VN')}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Không có dữ liệu hàng hóa.</p>
                </div>
              )}

              {/* Tổng cộng */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Tiền chưa thuế</p>
                  <p className="text-base font-bold mt-1">{formatNumber(detailInvoice.totalBeforeTax)}</p>
                  <p className="text-[10px] text-muted-foreground">Tổng cộng thành tiền</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Chiết khấu</p>
                  <p className="text-base font-bold mt-1 text-amber-600">{detailInvoice.discountAmount != null ? formatNumber(detailInvoice.discountAmount) : '—'}</p>
                  <p className="text-[10px] text-muted-foreground">Chiết khấu thương mại</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Phí</p>
                  <p className="text-base font-bold mt-1 text-orange-600">{detailInvoice.feeAmount != null ? formatNumber(detailInvoice.feeAmount) : '—'}</p>
                  <p className="text-[10px] text-muted-foreground">Tổng tiền phí</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Tiền thuế</p>
                  <p className="text-base font-bold mt-1 text-blue-600">{formatNumber(detailInvoice.taxAmount)}</p>
                  <p className="text-[10px] text-muted-foreground">Tổng cộng tiền thuế</p>
                </div>
                <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 col-span-2 sm:col-span-3 lg:col-span-1">
                  <p className="text-xs text-primary font-semibold uppercase tracking-wide">Tổng thanh toán</p>
                  <p className="text-lg font-bold mt-1 text-primary">{formatNumber(detailInvoice.totalAmount)}</p>
                  <p className="text-[10px] text-muted-foreground">Tiền thanh toán bằng số</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedHistory} onOpenChange={(open) => !open && setSelectedHistory(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Chi Tiết Nhật Ký Quét Hóa Đơn
            </DialogTitle>
          </DialogHeader>
          {selectedHistory && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Thời gian</p>
                  <p className="font-bold text-sm">{new Date(selectedHistory.downloadDate).toLocaleTimeString('vi-VN')}</p>
                  <p className="text-xs text-muted-foreground">{new Date(selectedHistory.downloadDate).toLocaleDateString('vi-VN')}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">MST</p>
                  <p className="font-bold text-sm select-all">{selectedHistory.taxCode}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Người Quét</p>
                  <p className="font-bold text-sm">{selectedHistory.username || 'Hệ thống (Cron)'}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Thành Công</p>
                  <p className="font-bold text-lg text-green-600">{selectedHistory.countDownloaded} <span className="text-xs font-normal text-muted-foreground">HĐ</span></p>
                </div>
              </div>

              <div className="rounded-lg border">
                <div className="px-4 py-3 border-b bg-muted/30">
                  <p className="text-xs font-semibold uppercase tracking-wide">Lịch sử chi tiết</p>
                </div>
                <div className="p-4 max-h-[350px] overflow-y-auto">
                  {selectedHistory.log ? (
                    <ul className="space-y-2">
                      {selectedHistory.log.split('\n').filter(l => l.trim()).map((line, idx) => {
                        const isError = line.toLowerCase().includes('lỗi') || line.toLowerCase().includes('thất bại') || line.toLowerCase().includes('error');
                        const isBuy = line.includes('[BUY]');
                        const typeTag = isBuy ? 'Mua vào' : (line.includes('[SELL]') ? 'Bán ra' : 'Hệ thống');
                        return (
                          <li key={idx} className={`p-3 rounded-lg border flex items-start gap-3 ${isError ? 'bg-destructive/5 border-destructive/20' : 'bg-muted/30'}`}>
                            <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${isError ? 'bg-destructive' : 'bg-green-500'}`} />
                            <div className="flex-1">
                              <Badge variant="outline" className="text-[10px] mb-1">{typeTag}</Badge>
                              <p className={`text-sm ${isError ? 'text-destructive font-medium' : 'text-foreground'}`}>
                                {line.replace(/\[(BUY|SELL)\]\s*/, '')}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="flex flex-col items-center py-10 text-center text-green-600">
                      <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <p className="font-semibold">Không ghi nhận lỗi nào!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Pagination ──
function PaginationBar({ page, totalPages, size, total, onPageChange, onSizeChange }: {
  page: number; totalPages: number; size: number; total: number;
  onPageChange: (p: number) => void; onSizeChange: (s: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="hidden sm:inline">Tổng:</span>
        <span className="font-semibold text-foreground">{total}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs">Số dòng:</span>
        <Select value={String(size)} onValueChange={(v) => onSizeChange(Number(v))}>
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(page - 1)} disabled={page <= 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs whitespace-nowrap px-1">
          Trang <span className="font-semibold">{totalPages > 0 ? page + 1 : 0}</span> / <span className="font-semibold">{totalPages}</span>
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
