# Thêm chức năng tải đồng thời cả 2 loại hoá đơn (Bán ra + Mua vào)

## Hiện trạng

Người dùng chỉ chọn được **1 loại** hoá đơn trong dropdown: "Bán ra" hoặc "Mua vào". Muốn tải cả 2 phải chạy 2 lần.

## Mục tiêu

Thêm lựa chọn thứ 3 trong dropdown frontend: **"Cả hai loại"** (BOTH). Khi chọn BOTH, backend sẽ query và tải đồng thời cả BUY và SELL trong cùng 1 lần gọi API.

## Các bước thực hiện

### Bước 1: Cập nhật frontend `InvoiceDownloader.tsx`

Thêm option vào dropdown:

```tsx
<select value={invoiceType} ...>
  <option value="SELL">Hóa đơn Bán ra</option>
  <option value="BUY">Hóa đơn Mua vào</option>
  <option value="BOTH">Cả hai loại</option>
</select>
```

Thay đổi duy nhất: thêm 1 dòng `<option value="BOTH">Cả hai loại</option>`.

### Bước 2: Cập nhật backend `invoice.controller.ts`

Trong hàm `downloadInvoices()`, xử lý logic `BOTH`:

Hiện tại:
```ts
const type = invoiceType === 'BUY' ? 'BUY' : 'SELL';
// ... query type
// ... download type
```

Sửa thành:
```ts
const types: Array<'BUY' | 'SELL'> = invoiceType === 'BOTH' 
  ? ['BUY', 'SELL'] 
  : [invoiceType === 'BUY' ? 'BUY' : 'SELL'];

let totalSuccessCount = 0;
const allErrors: string[] = [];

for (const type of types) {
  console.log(`[InvoiceController] Processing ${type} invoices...`);
  
  // ── Query invoices ── (logic hiện tại, wrap trong loop)
  const allQueryInvoices: any[] = [];
  // ... query + retry logic cho từng type ...
  
  // ── Download Excel ──
  // ... downloadExcelReport cho từng type ...
  
  // ── Download ZIPs ── (giữ nguyên processWithRateLimit)
  // ... download logic ...
  
  totalSuccessCount += successCount;
  allErrors.push(...errors);
}

// ── Response ──
res.json({
  message: `Download completed: ${totalSuccessCount} invoices downloaded`,
  successCount: totalSuccessCount,
  errors: allErrors,
});
```

**Chi tiết:** Wrap toàn bộ logic từ `const allQueryInvoices: any[] = [];` đến `successCount` trong 1 vòng `for (const type of types)`. Không thay đổi logic bên trong, chỉ bọc lại và tổng hợp kết quả.

**Lưu ý quan trọng:** `dbCompany` và token refresh cần được share giữa 2 lần chạy (không refresh lại token nếu đã có). Token đã lấy từ lần BUY có thể dùng cho SELL luôn.

### Bước 3: Kiểm tra

- Chọn "Cả hai loại" → tải cả BUY và SELL
- Log hiển thị rõ từng loại: `[InvoiceController] Processing BUY invoices...`
- Response tổng hợp số lượng từ cả 2 loại

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `frontend/src/components/InvoiceDownloader.tsx` | **Thêm** option `BOTH` vào dropdown |
| `backend/src/controllers/invoice.controller.ts` | **Sửa** — wrap query + download trong vòng `for (const type of types)` |
