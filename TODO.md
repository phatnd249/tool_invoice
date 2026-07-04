# Xử lý Rate Limit HTTP 429 khi tải hoá đơn hàng loạt

## Vấn đề

Khi tải một lượng lớn hoá đơn (10+ invoices), server GDT (hoadondientu.gdt.gov.vn) trả về HTTP 429 (Too Many Requests) và 500 (Internal Server Error) sau một vài request đầu tiên. Nguyên nhân là không có cơ chế giới hạn tốc độ (rate limiting) và retry trong quá trình tải ZIP.

Hiện tại, vòng lặp `for (const inv of allQueryInvoices)` trong `invoice.controller.ts` gửi **tuần tự nhưng không có delay giữa các request**, dẫn đến GDT chặn sau khoảng 3-4 request.

```
Log: 10 invoices
  1-2: OK
  3:   500 (server overload)
  4:   429 (rate limit)
  5-9: 429 (rate limit)
```

## Giải pháp

### 1. Thêm delay giữa các request (Throttle)

Thêm hàm `delay(ms)` và gọi sau mỗi lần download ZIP thành công hoặc thất bại:

```ts
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

for (const inv of allQueryInvoices) {
  // ... tải ZIP ...
  await delay(1500); // 1.5 giây giữa mỗi request
}
```

### 2. Thêm retry với exponential backoff

Khi gặp 429 hoặc 500, không bỏ qua ngay mà **retry** với delay tăng dần:

```ts
async function downloadWithRetry(downloadFn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await downloadFn();
      return result;
    } catch (error) {
      if (attempt < maxRetries && isRetryable(error)) {
        const waitMs = Math.min(2000 * Math.pow(2, attempt - 1), 10000); // 2s, 4s, 8s
        await delay(waitMs);
        continue;
      }
      throw error;
    }
  }
}
```

### 3. Batch processing với sleep dài hơn giữa các batch

Thay vì xử lý 1-1, chia thành batch nhỏ (ví dụ: 5 invoices/batch), sau mỗi batch sleep lâu hơn (10 giây):

```ts
const BATCH_SIZE = 5;
const BATCH_DELAY = 10000; // 10 giây

for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
  const batch = invoices.slice(i, i + BATCH_SIZE);
  for (const inv of batch) {
    await downloadWithRetry(...);
    await delay(1500);
  }
  if (i + BATCH_SIZE < invoices.length) {
    await delay(BATCH_DELAY); // Nghỉ lâu giữa các batch
  }
}
```

---

## Kế hoạch triển khai

### Bước 1: Tạo `backend/src/utils/rate-limiter.ts`

File utility mới, chứa các hàm dùng chung:

```ts
// delay(ms) - sleep trong ms milliseconds
// isRetryableError(error) - kiểm tra lỗi có nên retry không (429, 500, ECONNRESET)
// downloadWithRetry(fn, maxRetries) - retry với exponential backoff
// processWithRateLimit(items, processor, options) - xử lý batch với delay
```

### Bước 2: Sửa `invoice.controller.ts`

- Import `delay` và `downloadWithRetry` từ `rate-limiter.ts`
- Thêm `await delay(1500)` sau mỗi lần tải ZIP (cả thành công lẫn thất bại)
- Wrap `downloaderService.downloadInvoiceZip()` trong `downloadWithRetry` với max 3 lần thử
- Báo cáo tiến độ: log mỗi 5 invoices (vd: "5/10 downloaded")

### Bước 3: Tuỳ chọn — cấu hình qua biến môi trường

Thêm vào `.env` (có giá trị mặc định trong code):

```env
# Rate limiting settings for invoice download
DOWNLOAD_DELAY_MS=1500
DOWNLOAD_BATCH_SIZE=5
DOWNLOAD_BATCH_DELAY_MS=10000
DOWNLOAD_MAX_RETRIES=3
```

### Bước 4: Kiểm tra

- Chạy tải 10+ invoices, không còn lỗi 429
- Retry hoạt động: nếu request lỗi 429 → delay 2s → thử lại → OK
- Log hiển thị rõ: `[Downloader] Retrying invoice 123 (attempt 2/3)...`

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `backend/src/utils/rate-limiter.ts` | **Tạo mới** — delay, retry, batch processing utilities |
| `backend/src/controllers/invoice.controller.ts` | **Sửa** — thêm delay + retry vào vòng download |
| `backend/.env` | **Sửa** — thêm biến cấu hình rate limit (optional) |
| `backend/.env.example` | **Sửa** — thêm biến mẫu |
