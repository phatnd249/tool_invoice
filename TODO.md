# Tổ chức lại thư mục lưu trữ hoá đơn

## Hiện trạng

```
backend/invoices/<tên công ty>/
  └── <file>.zip, <file>.xml  (tất cả nằm lẫn lộn)
```

Không phân biệt loại hoá đơn (bán ra/mua vào), không gom theo tháng.

## Mục tiêu

```
backend/invoices/<tên công ty>/
  ├── hoa-don-ban-ra/
  │   ├── 2026-01/
  │   │   └── <MST>-<số hoá đơn>.zip
  │   │   └── <MST>-<số hoá đơn>.xml
  │   └── 2026-02/
  ├── hoa-don-mua-vao/
  │   ├── 2026-01/
  │   └── 2026-02/
```

## Phân tích

Hiện tại code đang:
1. Download ZIP vào `targetDir` (thư mục công ty)
2. Extract XML ra `targetDir`
3. Nếu chưa resolve company folder → tạo `baseDir/<tên công ty> - <MST>` và move file vào

Các điểm cần sửa:
- `targetDir` cần có thêm cấp `loại hoá đơn/tháng`
- File ZIP & XML cần đặt tên theo format `<MST>-<số hoá đơn>`
- `invoice.controller.ts`: cập nhật `targetDir`
- `downloader.service.ts`: cập nhật tên file ZIP
- `parser.service.ts`: không cần sửa (đã nhận `outputXmlDir` từ controller)

---

## Các bước thực hiện

### Bước 1: Thêm helper `resolveTargetDir()` trong `invoice.controller.ts`

```ts
/**
 * Resolve the target directory for saving invoice files:
 *   <baseDir>/<company>/<type-dir>/<YYYY-MM>/
 */
function resolveTargetDir(
  baseDir: string,
  companyName: string,
  type: 'BUY' | 'SELL',
  invoiceDate: Date,
): string {
  const cleanName = companyName.replace(/[\\/*?:"<>|]/g, '').trim();
  const typeDir = type === 'SELL' ? 'hoa-don-ban-ra' : 'hoa-don-mua-vao';
  const monthDir = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
  return path.join(baseDir, cleanName, typeDir, monthDir);
}
```

### Bước 2: Sửa logic download ZIP — dùng `resolveTargetDir`

Trong `invoice.controller.ts`, thay đổi:
- `targetDir` được tính lại trước mỗi lần download, dựa trên invoice date từ GDT
- Dùng `inv.tdlap` (ngày lập hoá đơn) để xác định tháng

### Bước 3: Sửa `downloader.service.ts` — đặt lại tên file

Hiện tại tên file ZIP là `<mhdon>.zip` hoặc `<nbmst>_...zip`. Cần đổi thành:

```ts
const zipFileName = `${nbmst}-${shdon}.zip`;
const xmlFileName = `${nbmst}-${shdon}.xml`;
```

Đồng nhất tên file ZIP và XML.

### Bước 4: Sửa `parser.service.ts` — đặt tên XML theo format mới

Tham số `outputXmlDir` đã được controller tính đúng, chỉ cần sửa tên file XML:

```ts
const targetXmlName = `${nbmst}-${shdon}.xml`;  // hoặc parse từ tên ZIP
```

Thực tế `extractAndParseZip` lấy `baseName` từ ZIP, nếu ZIP đã có tên đúng thì XML tự động đúng. Không cần sửa parser.

### Bước 5: Loại bỏ logic move file khi resolve company folder

Hiện tại có đoạn code move file từ `targetDir` cũ sang `newTargetDir` khi lần đầu parse được company name. Với cấu trúc mới, `targetDir` đã bao gồm đầy đủ `<company>/<type>/<month>` ngay từ đầu nên không cần move nữa.

### Bước 6: Cập nhật `saveBasicInvoiceFromGdt` (nếu dùng)

Hàm này lưu invoice metadata cơ bản, không liên quan đến thư mục — giữ nguyên.

### Bước 7: Kiểm tra

- Tải hoá đơn bán ra → file nằm trong `hoa-don-ban-ra/2026-07/`
- Tải hoá đơn mua vào → file nằm trong `hoa-don-mua-vao/2026-07/`
- Tải BOTH → 2 loại vào 2 thư mục riêng
- Tên file: `<MST>-<số>.zip` và `<MST>-<số>.xml`

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `invoice.controller.ts` | Thêm `resolveTargetDir()`, sửa logic `targetDir`, bỏ logic move file cũ |
| `downloader.service.ts` | Sửa tên file ZIP thành `<nbmst>-<shdon>.zip` |
| `parser.service.ts` | Không cần sửa (tên XML tự suy từ tên ZIP) |
