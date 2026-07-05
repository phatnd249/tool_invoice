# Kế hoạch triển khai: Datatable paginate, search, filter cho trang lịch sử

## 1. Vấn đề

Khi số hoá đơn tải về tăng lên, trang lịch sử (cả tab "Hóa Đơn Đã Lưu" và "Nhật Ký Tải Hệ Thống") hiển thị **tất cả records cùng lúc**. Điều này gây khó khăn cho người dùng khi:
- Phải scroll quá nhiều
- Không có phân trang để điều hướng
- Search/filter hiện tại chỉ làm phía client (filter mảng đã tải), không scale được

## 2. Mục tiêu

Thêm datatable với các chức năng:
- **Server-side pagination** — mỗi lần chỉ tải 1 trang (vd 20 records)
- **Search** theo từ khoá (gửi lên server)
- **Filter** theo loại, trạng thái, thời gian
- **Sort** theo cột
- Áp dụng cho cả 2 tab: Hóa Đơn Đã Lưu (`/api/invoices`) và Nhật Ký (`/api/invoices/download-history`)

## 3. Phân tích

### 3.1. Backend — Sửa endpoint hiện tại

Hiện tại:
- `GET /api/invoices` — trả về tất cả, không phân trang
- `GET /api/invoices/download-history` — trả về tất cả, không phân trang

Cần thêm query parameters:
```
?page=0&size=20&search=keyword&type=SELL&status=SUCCESS&sortBy=downloadDate&sortDir=desc
```

Response format mới (PaginatedResponse):
```json
{
  "data": [...],
  "page": 0,
  "size": 20,
  "total": 531,
  "totalPages": 27
}
```

### 3.2. Frontend — Sửa component InvoiceHistory

Hiện tại:
- `fetchInvoices()` / `fetchHistories()` — tải tất cả, không phân trang
- `filteredInvoices` / `filteredHistories` — filter client-side
- Không có pagination UI

Cần thêm:
- State: `currentPage`, `pageSize`, `totalPages`, `total`
- Gửi `page`, `size`, `search`, `type`, `status` lên server
- UI: Nút prev/next + "Trang X / Y", dropdown chọn số dòng/trang
- Giữ nguyên search input hiện tại, nhưng search sẽ gọi lại API (debounce)

## 4. Các file cần sửa

### 4.1. Backend — `invoice.controller.ts`

#### `getInvoices` — thêm pagination

- [ ] Đọc query params: `page`, `size`, `search`, `type`, `sortBy`, `sortDir`
- [ ] Xây dựng `where` clause cho Prisma:
  - `search` → tìm theo `invoiceNumber`, `sellerName`, `sellerTaxCode`, `buyerName`, `buyerTaxCode`
  - `type` → filter theo `SELL`/`BUY`
  - `startDate`/`endDate` → filter theo ngày
- [ ] Dùng `prisma.invoice.findMany({ skip, take, where, orderBy })`
- [ ] Dùng `prisma.invoice.count({ where })` để lấy tổng số
- [ ] Trả về `{ data, page, size, total, totalPages }`

#### `getDownloadHistory` — thêm pagination

- [ ] Đọc query params: `page`, `size`, `search`, `status`, `sortBy`, `sortDir`
- [ ] Xây dựng `where` clause:
  - `search` → tìm theo `taxCode`, `username`
  - `status` → filter theo `SUCCESS`/`PARTIAL`/`FAILED`
  - `startDate`/`endDate` → filter theo ngày
- [ ] Dùng `prisma.downloadHistory.findMany({ skip, take, where, orderBy })`
- [ ] Dùng `prisma.downloadHistory.count({ where })`
- [ ] Trả về `{ data, page, size, total, totalPages }`

#### Giữ nguyên backward compatibility

- [ ] Nếu không có `page`/`size` → trả về tất cả (giữ hành vi cũ cho các client cũ)

### 4.2. Frontend — `InvoiceHistory.tsx`

#### State mới

```typescript
// Pagination state
const [page, setPage] = useState(0);
const [size, setSize] = useState(20);
const [total, setTotal] = useState(0);
const [totalPages, setTotalPages] = useState(0);

// Search/filter state (thay vì search client-side)
const [searchText, setSearchText] = useState('');
const [filterStatus, setFilterStatus] = useState(''); // cho tab logs
const [sortBy, setSortBy] = useState('downloadDate'); // mặc định
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
```

#### Sửa `fetchInvoices()` / `fetchHistories()`

```typescript
const fetchInvoices = async () => {
  setLoading(true);
  try {
    const params = new URLSearchParams({
      page: String(page),
      size: String(size),
      search: searchText,
      ...(filterType && { type: filterType }),
      sortBy: 'invoiceDate',
      sortDir: 'desc',
    });
    const response = await axios.get(`${API_BASE_URL}/api/invoices?${params}`);
    const { data, total: t, totalPages: tp } = response.data;
    setInvoices(data);
    setTotal(t);
    setTotalPages(tp);
    setSelectedIds([]);
  } catch (err) { ... }
  finally { setLoading(false); }
};
```

#### Pagination UI

- [ ] Thêm component phân trang dưới mỗi bảng:
  - Nút « Trang trước
  - Hiển thị: "Trang {page+1} / {totalPages}"
  - Nút Trang sau »
  - Dropdown chọn số dòng: 10, 20, 50, 100
  - Hiển thị: "Tổng: {total} records"

#### Filter cho tab logs

- [ ] Thêm dropdown filter theo trạng thái (SUCCESS / PARTIAL / FAILED) bên cạnh search input

#### Debounce search

- [ ] Dùng `useEffect` với `setTimeout` 300ms để tránh gọi API liên tục khi gõ

### 4.3. Frontend — kiểu dữ liệu mới

```typescript
interface PaginatedResponse<T> {
  data: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}
```

## 5. Luồng dữ liệu mới

```
User gõ search / chọn filter / chuyển trang
       │
       ▼ (debounce 300ms)
Gọi API với ?page=X&size=Y&search=...&type=...
       │
       ▼
Backend: Prisma findMany + count
       │
       ▼
Response: { data, page, size, total, totalPages }
       │
       ▼
Frontend: cập nhật table + pagination UI
```

## 6. Không thay đổi

- Các endpoint: giữ nguyên URL, chỉ thêm query params
- Các hành vi khác (download XML/ZIP, export Excel, preview) không ảnh hưởng
- Tab "Hóa Đơn Đã Lưu" cũng được hưởng lợi từ pagination

## 7. Ưu tiên thực hiện

| Thứ tự | Mục | Backend | Frontend |
|--------|-----|---------|----------|
| 1 | Sửa `getInvoices` — thêm pagination + search | `invoice.controller.ts` | — |
| 2 | Sửa `getDownloadHistory` — thêm pagination + search + filter status | `invoice.controller.ts` | — |
| 3 | Sửa `InvoiceHistory.tsx` — pagination state + fetch params | — | `InvoiceHistory.tsx` |
| 4 | Thêm Pagination UI (nút, dropdown size) | — | `InvoiceHistory.tsx` |
| 5 | Thêm filter status cho tab logs | — | `InvoiceHistory.tsx` |
| 6 | Debounce search + xử lý chuyển trang về 0 khi filter thay đổi | — | `InvoiceHistory.tsx` |
| 7 | Build & test | ✓ | ✓ |

## 8. Ghi chú

- **Backward compatibility:** Nếu request không có `page`/`size`, endpoint trả về tất cả (hành vi cũ)
- **Sort mặc định:** Theo `invoiceDate`/`downloadDate` giảm dần (mới nhất trước)
- **Giới hạn page size:** Tối đa 100 records/trang để tránh abuse
- **Sync selectedIds:** Khi chuyển trang, bỏ chọn tất cả (vì không còn visible)
