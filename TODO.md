# Kế hoạch triển khai: Xử lý lỗi "Không tồn tại hồ sơ gốc của hóa đơn"

## 1. Vấn đề

Khi tải hoá đơn từ GDT, một số hoá đơn trả về HTTP 500 với message:
```
{"message":"Không tồn tại hồ sơ gốc của hóa đơn."}
```

Hiện tại lỗi này bị gộp chung vào `typeErrors` với message mơ hồ:
```
[SELL] Invoice 24555881: Failed to download ZIP.
```

Người dùng không phân biệt được đây là lỗi do **hoá đơn không còn tồn tại trên GDT** (bị thu hồi/xoá) hay lỗi kỹ thuật thật sự.

## 2. Mục tiêu

- Phát hiện response body chứa `"Không tồn tại hồ sơ gốc của hóa đơn"`
- Hiển thị message rõ ràng: `"Hoá đơn [số] không còn tồn tại trên hệ thống GDT (đã bị thu hồi/xoá)."`
- Ghi nhận đúng message này vào:
  - `typeErrors` (hiển thị trong tiến trình tải)
  - `DownloadHistory.log` (lịch sử tải)
- Các lỗi 500 khác (lỗi thật) vẫn giữ log chi tiết như cũ

## 3. Các file cần sửa

### 3.1. `backend/src/services/downloader.service.ts` — Phân loại lỗi GDT

- [ ] Tạo helper function `parseGdtErrorMessage(responseBody: string, shdon: string): string`
- [ ] Trong `downloadInvoiceZip`: sau khi log response body, parse message để trả về message thân thiện

```typescript
// Logic phát hiện
if (responseBody.includes('Không tồn tại hồ sơ gốc của hóa đơn')) {
  return `Hoá đơn ${shdon} không còn tồn tại trên hệ thống GDT (đã bị thu hồi/xoá).`;
}
// Các lỗi khác
return `GDT trả về lỗi (HTTP ${status}): ${parsedMessage}`;
```

- [ ] Thay đổi kiểu trả về của `downloadInvoiceZip` để phân biệt giữa "lỗi tạm thời" (có thể retry) và "lỗi vĩnh viễn" (hoá đơn không tồn tại). Hiện tại trả về `string | null`, nên đổi thành object:

```typescript
type DownloadResult = {
  success: true;
  zipPath: string;
} | {
  success: false;
  reason: 'NOT_FOUND' | 'TEMPORARY_ERROR' | 'INVALID_DATA';
  message: string;
};
```

Hoặc giữ nguyên đơn giản hơn: trả về `string | null` nhưng dùng message đã parse để `typeErrors` nhận được nội dung chính xác.

### 3.2. `backend/src/controllers/invoice.controller.ts` — Hiển thị message chính xác

- [ ] Ở vòng lặp xử lý từng invoice (`processWithRateLimit`), cập nhật `typeErrors` với message từ `downloadInvoiceZip` thay vì message cứng `"Failed to download ZIP."`

Hiện tại:
```typescript
if (!zipPath) {
  typeErrors.push(`[${type}] Invoice ${inv.shdon}: Failed to download ZIP.`);
}
```

Sửa thành:
```typescript
if (!zipPath) {
  typeErrors.push(`[${type}] Invoice ${inv.shdon}: Không thể tải ZIP từ GDT.`);
  // hoặc giữ nguyên message trả về từ downloader
}
```

### 3.3. `backend/src/services/downloader.service.ts` — Hàm `parseGdtErrorMessage`

- [ ] Thêm hằng số pattern matching:

```typescript
const GDT_INVOICE_NOT_FOUND_PATTERNS = [
  'Không tồn tại hồ sơ gốc của hóa đơn',
  'không tồn tại hồ sơ gốc',
  'Invoice not found',
  'No original record',
];
```

- [ ] Hàm parse:

```typescript
function formatGdtError(responseBody: string, shdon: string, status: number): string {
  const isNotFound = GDT_INVOICE_NOT_FOUND_PATTERNS.some(p =>
    responseBody.toLowerCase().includes(p.toLowerCase())
  );
  if (isNotFound) {
    return `Hoá đơn ${shdon} không còn tồn tại trên hệ thống GDT (đã bị thu hồi/xoá).`;
  }
  // Parse message từ JSON nếu có
  try {
    const parsed = JSON.parse(responseBody);
    return `GDT trả về lỗi (HTTP ${status}): ${parsed.message || responseBody.slice(0, 200)}`;
  } catch {
    return `GDT trả về lỗi (HTTP ${status}): ${responseBody.slice(0, 200)}`;
  }
}
```

## 4. Luồng dữ liệu mới

```
GDT response 500
       │
       ▼
downloader.service.ts
  - parse response body
  - log chi tiết (đã có)
  - trả về message thân thiện
       │
       ▼
invoice.controller.ts
  - typeErrors.push(message từ downloader)
       │
       ▼
DownloadHistory.log
  - lưu message đã parse
```

## 5. Ưu tiên

Cả 3 mục trong phần 3 đều cần thực hiện. Có thể làm theo thứ tự:
1. `parseGdtErrorMessage` + logic trong `downloadInvoiceZip` (trả về message)
2. Cập nhật controller để dùng message mới
3. Test với log thật

## 6. Ghi chú

- Chỉ parse response body, **không throw error** — vẫn để luồng xử lý tiếp tục với các invoice khác.
- Không thay đổi chữ ký hàm nếu không cần thiết, chỉ thay đổi message.
