# Kế hoạch triển khai: Preview hoá đơn (HTML) từ file ZIP

## 1. Vấn đề

Khi xem lịch sử hoá đơn đã tải về, người dùng chỉ thấy thông tin dạng text (số hoá đơn, ngày, số tiền...). Muốn xem giao diện trực quan của hoá đơn, người dùng phải tải file ZIP về, giải nén thủ công và mở file HTML.

## 2. Mục tiêu

Thêm chức năng **preview hoá đơn** ngay trong giao diện web:
- Backend: Endpoint API trả về nội dung file HTML được giải nén từ file ZIP của hoá đơn
- File HTML được giải nén một lần và cache vào thư mục `backend/public/preview/` để lần sau load nhanh
- Frontend: Hiển thị HTML trong iframe hoặc modal

## 3. Phân tích kỹ thuật

### Cấu trúc file ZIP hoá đơn

File ZIP từ GDT chứa:
- `{mst}-{shdon}.xml` — dữ liệu XML
- `{mst}-{shdon}-pdf.html` — file HTML thể hiện hoá đơn (dùng để in/gửi email)
- Có thể có thêm file PDF, CSS hoặc ảnh

File HTML là bản trình bày trực quan của hoá đơn (giống như giao diện in). Đây là file cần dùng để preview.

### Dữ liệu hiện có

- `Invoice.zipPath` — đường dẫn file ZIP gốc trong DB
- `Invoice.xmlPath` — đường dẫn file XML đã giải nén
- `ParserService.extractAndParseZip()` — đã có sẵn logic giải nén ZIP

## 4. Các file cần tạo/sửa

### 4.1. `backend/src/services/preview.service.ts` — Service mới

- [ ] Tạo class `PreviewService`
- [ ] Phương thức `getPreviewHtml(invoiceId: string): Promise<string | null>`
  - Query invoice từ DB bằng ID
  - Kiểm tra zipPath có tồn tại không
  - Nếu đã có file HTML cache trong `backend/public/preview/{invoiceId}.html` → return luôn
  - Nếu chưa: giải nén ZIP, tìm file `.html`, copy vào thư mục cache
  - Return nội dung HTML
- [ ] Phương thức `extractHtmlFromZip(zipPath: string): string | null`
  - Dùng `adm-zip` để đọc entries
  - Tìm entry kết thúc bằng `.html`
  - Return nội dung text

### 4.2. `backend/src/controllers/invoice.controller.ts` — Endpoint mới

- [ ] Thêm method `previewInvoice(req, res)`:
  ```
  GET /api/invoices/:id/preview
  ```
  - Lấy `id` từ params
  - Gọi `PreviewService.getPreviewHtml(id)`
  - Nếu không tìm thấy → 404
  - Trả về HTML với Content-Type: text/html; charset=utf-8
- [ ] Thêm method `previewInvoiceByZipPath(req, res)` (tuỳ chọn):
  ```
  GET /api/invoices/preview-by-path?zipPath=...
  ```
  - Preview trực tiếp từ đường dẫn ZIP (cho trường hợp chưa lưu DB)

### 4.3. `backend/src/routes/invoice.routes.ts` — Route mới

- [ ] Thêm route:
  ```typescript
  router.get('/:id/preview', InvoiceController.previewInvoice);
  ```

### 4.4. Cache file HTML

- [ ] Tạo thư mục cache: `backend/public/preview/` (đã có trong `.gitignore` vì nằm trong `backend/public/`)
- [ ] File cache được đặt tên: `preview/{invoiceId}.html`
- [ ] Khi ZIP bị xoá hoặc invoice không còn → xoá cache tương ứng

### 4.5. Xử lý đường dẫn tương đối trong HTML

File HTML của GDT thường chứa:
- Link tới CSS (inline hoặc external)
- Link tới ảnh (logo công ty...)

Các phương án:
1. **Phương án A (khuyên dùng):** Inject CSS inline và base64 hoá ảnh → file HTML độc lập. Phức tạp, tuỳ vào cấu trúc file.
2. **Phương án B (đơn giản):** Trả về nguyên bản file HTML. Nếu có link CSS external thì trình duyệt sẽ tự tải. Hạn chế: ảnh local hoặc CSS trong ZIP không hiển thị được.
3. **Phương án C:** Giải nén toàn bộ ZIP vào thư mục cache (giữ nguyên cấu trúc thư mục con), sau đó serve static. Ưu: giữ được ảnh và CSS. Nhược: tốn dung lượng.

**Khuyến nghị:** Chọn phương án B trước (đơn giản), nâng cấp lên C sau này nếu cần thiết. File HTML của GDT thường có CSS inline sẵn nên hiển thị tốt.

## 5. Luồng xử lý

```
User click "Preview" trên invoice
       │
       ▼
Frontend gọi GET /api/invoices/:id/preview
       │
       ▼
InvoiceController.previewInvoice()
  └─ PreviewService.getPreviewHtml(invoiceId)
       ├─ Query invoice từ DB
       ├─ zipPath có tồn tại? → Không → 404
       ├─ Cache file tồn tại? → Có → return cache
       ├─ Không: giải nén ZIP, tìm .html
       │    ├─ Tìm thấy? → Lưu cache → return HTML
       │    └─ Không tìm thấy? → 404
       └─ Return HTML với Content-Type: text/html
       │
       ▼
Frontend render HTML trong iframe sandbox hoặc modal
```

## 6. Ưu tiên thực hiện

| Thứ tự | Mục | File |
|--------|-----|------|
| 1 | Tạo `PreviewService` | `backend/src/services/preview.service.ts` |
| 2 | Thêm endpoint preview trong controller | `backend/src/controllers/invoice.controller.ts` |
| 3 | Thêm route | `backend/src/routes/invoice.routes.ts` |
| 4 | Gom cache (tự động qua thư mục) | Tích hợp sẵn trong service |
| 5 | Frontend: hiển thị HTML trong modal/iframe | Frontend (chưa xác định file) |

## 7. Ghi chú

- File ZIP có thể nặng → cần timeout phù hợp cho API
- Preview chỉ hoạt động với invoice đã tải ZIP thành công (`zipPath` không null)
- File HTML từ GDT thường có kích thước 10-50KB, không quá lớn
- Cache theo `invoiceId` → khi ZIP thay đổi (tải lại) cần invalidate cache
- Bảo mật: HTML từ GDT có thể chứa script? Cần dùng iframe sandbox hoặc sanitize HTML nếu cần. Hiện tại file từ GDT là HTML tĩnh, không chứa JS nguy hiểm.
