# Kế hoạch triển khai: Xử lý giới hạn 50 hoá đơn/lần request từ GDT

## 1. Vấn đề

API GDT giới hạn **tối đa 50 hoá đơn** trong một request query (`size <= 50`). Hiện tại code gọi:

```
size=531  → GDT trả về HTTP 500: "findInvoiceSold.size: phải nhỏ hơn hoặc bằng 50"
```

## 2. Nguyên nhân

Trong `DownloaderService.queryInvoicesInRange()`:

```typescript
// Bước 1: Query với size=1 để đếm tổng số
const urlCount = `...&size=1&search=...`;  // OK: count chỉ lấy 1 record

// Bước 2: Query với size=total để lấy tất cả records
const urlAll = `...&size=${total}&search=...`;  // LỖI: khi total > 50
```

## 3. Phân tích API GDT

Các tham số trên endpoint query:
- `size` — số lượng records trả về, tối đa **50**
- `page` — trang hiện tại (mặc định là 0? hay 1?)
- `sort` — thứ tự sắp xếp

**Cần kiểm tra:**
- [ ] GDT dùng page bắt đầu từ 0 hay 1?
- [ ] `page` mặc định là bao nhiêu nếu không truyền?
- [ ] Response có chứa tổng số trang (`totalPages`) không?

Dựa theo API REST thông thường:
- Request: `?size=50&page=0&search=...` → trang 0, 50 records
- Request: `?size=50&page=1&search=...` → trang 1, 50 records
- Response thường có: `{ "datas": [...], "total": 531, "page": 0, "size": 50 }`

## 4. Giải pháp

### 4.1. Sửa `queryInvoicesInRange()` — Phân trang (pagination)

Thay vì query 1 lần với `size=${total}`, thực hiện nhiều request với `size=50` và `page` tăng dần.

**Logic mới:**

```typescript
// Bước 1: Đếm tổng số (size=1) — giữ nguyên
const response = await axios.get(urlCount, ...);
const total = response.data?.total || 0;

// Bước 2: Lấy tất cả records qua nhiều trang
const PAGE_SIZE = 50;
const allRecords: any[] = [];

for (let page = 0; page < Math.ceil(total / PAGE_SIZE); page++) {
  const url = `${baseUrl}?sort=tdlap:desc&size=${PAGE_SIZE}&page=${page}&search=...`;
  const response = await axios.get(url, ...);
  const records = response.data?.datas || [];
  allRecords.push(...records);
  
  // Delay nhẹ giữa các trang để tránh rate limit
  if (page < Math.ceil(total / PAGE_SIZE) - 1) {
    await sleep(500); // 500ms giữa các trang
  }
}

return allRecords;
```

### 4.2. Thêm utility `sleep()`

```typescript
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
```

### 4.3. Xác nhận response structure (cần kiểm tra thực tế)

Cần kiểm tra response từ GDT có chứa thông tin page không:
- Nếu response có `page` và `size` → dùng luôn để loop
- Nếu không có → dùng `total` / `PAGE_SIZE` để tính số trang

**Ưu tiên:** Dùng `page` bắt đầu từ 0, tăng dần cho đến khi hết records hoặc gặp response rỗng.

## 5. Rủi ro và xử lý

| Rủi ro | Giải pháp |
|--------|-----------|
| `page` parameter không được GDT hỗ trợ | Thử với page=0, nếu response vẫn trả về tất cả records (ignoring page) thì cần giải pháp khác |
| Rate limit khi gọi nhiều request | Thêm `sleep(500)` giữa các trang, dùng `withRetry` |
| Total thay đổi giữa các request (có hoá đơn mới) | Lấy snapshot total từ đầu, ignore các thay đổi trong quá trình query |
| Một trang bị lỗi → mất dữ liệu | Retry từng trang riêng lẻ, log lỗi và tiếp tục các trang khác |

## 6. Các file cần sửa

### 6.1. `backend/src/services/downloader.service.ts` — Sửa `queryInvoicesInRange()`

- [ ] Thêm `sleep()` helper
- [ ] Sửa vòng lặp query: dùng `PAGE_SIZE = 50`, loop qua các trang
- [ ] Giữ nguyên logic log response và xử lý lỗi (đã có từ commit trước)
- [ ] Thêm log số trang đã query: `"[DownloaderService] Fetching page X/Y..."`

### 6.2. `backend/src/controllers/invoice.controller.ts` — Kiểm tra tác động

- [ ] `queryInvoicesInRange` trả về `Promise<any[]>` — giữ nguyên kiểu trả về, controller không cần sửa

## 7. Luồng dữ liệu mới

```
queryInvoicesInRange(start, end, token, type)
       │
       ▼
  Bước 1: Query count (size=1)
       │
       ▼
  total > 0 ?
       │
       ▼ YES
  for page = 0 to Math.ceil(total / 50) - 1:
       │
       ▼
    Query: size=50&page={page}
       │
       ▼
    Push records vào allRecords[]
       │
       ▼
    Sleep(500ms) nếu còn trang tiếp theo
       │
       ▼
  return allRecords
```

## 8. Ưu tiên

| Thứ tự | Mục | File |
|--------|-----|------|
| 1 | Thêm `sleep()` helper | `backend/src/services/downloader.service.ts` |
| 2 | Sửa `queryInvoicesInRange()` với pagination | `backend/src/services/downloader.service.ts` |
| 3 | Build và test với GDT thật | Terminal |

## 9. Ghi chú

- Giới hạn 50 là từ GDT, có thể thay đổi. Nên đặt `PAGE_SIZE = 50` và để comment để dễ điều chỉnh.
- Hiện tại code query count đã dùng `size=1` → không bị ảnh hưởng.
- `page` parameter mặc định GDT có thể là 0 hoặc 1. Cần kiểm tra thực tế. Nếu page=0 không hoạt động, thử page=1.
