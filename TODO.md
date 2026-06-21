# Kế hoạch chuyển đổi Script Python tải hoá đơn thành API Backend (Node.js/TypeScript)

Dựa trên việc phân tích mã nguồn `script.py` và yêu cầu tích hợp giải captcha tự động bằng AI, dưới đây là kế hoạch chi tiết cho dự án.

---

## 1. Khảo sát hoạt động của `script.py`
- **Xác thực:** Lấy MST từ JWT Token của Tổng cục Thuế (`TOKEN`).
- **Luồng tải hóa đơn:**
  1. Chia khoảng thời gian cần tải thành các chu kỳ nhỏ hơn hoặc bằng 28 ngày để tránh lỗi giới hạn thời gian tra cứu của Tổng cục Thuế.
  2. Gửi request đến API cổng HDDT: `https://hoadondientu.gdt.gov.vn/api/query/invoices/sold`. 
  3. Gửi request tải file nén ZIP chứa hóa đơn điện tử dạng XML: `https://hoadondientu.gdt.gov.vn/api/query/invoices/export-xml`.
  4. Giải nén file ZIP, tìm file XML và phân tích (Parse) dữ liệu XML để lấy thông tin chi tiết hóa đơn.
  5. Xuất báo cáo Excel chất lượng cao.

---

## 2. Kế hoạch điều chỉnh Schema Cơ sở dữ liệu (Prisma + SQLite)
Để lưu trữ đầy đủ các thông tin hóa đơn và các mặt hàng hàng hóa/dịch vụ liên quan:
- Cập nhật Model `Invoice` với các thông tin chi tiết (Ký hiệu, mẫu, địa chỉ, HTTT, tổng tiền bằng chữ, mã tra cứu, mã CQ Thuế...).
- Tạo thêm Model `InvoiceItem` lưu trữ chi tiết dòng hóa đơn (Tên hàng hóa, ĐVT, Số lượng, Đơn giá, Thuế suất...).

---

## 3. Kế hoạch triển khai API & Logic code trên Backend

### Bước 1: Cấu hình và Cài đặt Thư viện
- Cài đặt thêm các thư viện hỗ trợ: `adm-zip`, `fast-xml-parser`, `exceljs`, `axios`.

### Bước 2: Cập nhật Cấu trúc DB (Prisma Migration)
- Ghi đè file `prisma/schema.prisma` và chạy Prisma migration.

### Bước 3: Phát triển Lớp Service
- **`downloader.service.ts`:** Xử lý chia chu kỳ thời gian và gọi API cổng HDDT tải ZIP.
- **`parser.service.ts`:** Giải nén ZIP và đọc XML bằng cơ chế tìm đệ quy `findKeyRecursive` của JS/TS.
- **`excel.service.ts`:** Xuất báo cáo đa trang có format và link động.

### Bước 4: Tạo Controller và Định nghĩa Route
- Viết `invoice.controller.ts` và định nghĩa các route GET/POST tương ứng.

---

## 4. Kế hoạch tự động giải Captcha và lấy Token qua Gemini AI

Quy trình đăng nhập Tổng cục Thuế yêu cầu vượt mã Captcha dạng hình ảnh (SVG chứa các ký tự chữ cái in hoa và số). Ta sẽ tự động hóa luồng này qua 5 bước:

```
[Lấy Captcha GDT] ➔ [Convert SVG sang PNG] ➔ [Gemini AI OCR] ➔ [Đăng nhập GDT] ➔ [Trả về Token]
```

### Bước 1: Cài đặt Thư viện Phụ trợ
- **`@google/generative-ai`:** Bộ SDK chính thức gọi API Gemini.
- **`sharp`:** Thư viện xử lý ảnh tốc độ cao để render mã nguồn SVG của Captcha thành ảnh định dạng PNG/JPEG.

### Bước 2: Xây dựng dịch vụ Giải Captcha (`captcha.service.ts`)
- **`getCaptcha()`:** Gửi request `GET https://hoadondientu.gdt.gov.vn/api/captcha` để nhận về JSON chứa `key` (captcha key) và `content` (chuỗi XML của file ảnh SVG).
- **`convertSvgToPng(svgContent: string): Promise<Buffer>`:** Sử dụng `sharp` để chuyển đổi chuỗi SVG sang định dạng ảnh PNG lưu trong bộ nhớ tạm (Buffer).
- **`solveCaptcha(imageBuffer: Buffer): Promise<string>`:** Gửi ảnh PNG dưới dạng Base64 qua API Gemini (sử dụng model `gemini-2.5-flash`) kèm prompt tối ưu: *"Extract the alphanumeric characters in this captcha image. Return only the captcha characters in uppercase, without any spaces, punctuation, or extra text."*

### Bước 3: Xây dựng dịch vụ Xác thực (`auth.service.ts`)
- **`loginAndGetToken(username, password): Promise<string>`:** 
  1. Gọi `getCaptcha()` lấy Key và nội dung SVG.
  2. Gọi `convertSvgToPng()` chuyển SVG thành ảnh PNG Buffer.
  3. Gửi ảnh sang Gemini API giải captcha lấy Text kết quả (`cvalue`).
  4. Gửi `POST https://hoadondientu.gdt.gov.vn/api/security-taxpayer/authenticate` với body chứa `username`, `password`, `cvalue`, và `ckey` để đăng nhập.
  5. **Cơ chế tự động thử lại (Retry):** Nếu API trả về lỗi sai mã captcha (hoặc lỗi kết nối), hệ thống sẽ tự động thử lại tối đa 3 lần với mã captcha mới trước khi báo lỗi về client.

### Bước 4: Tạo Router & Controller API
- Tạo `auth.controller.ts` và route `POST /api/auth/token`.
- Cho phép truyền tài khoản, mật khẩu để trả về Token mới nhất.
- Tích hợp trực tiếp luồng tự đăng nhập này vào API `/api/invoices/download` để nếu người dùng không truyền `token` mà truyền tài khoản/mật khẩu, backend vẫn có thể tự động lấy token và tải hoá đơn.

---

## 5. Danh sách công việc (TODO List)

### Giai đoạn 1: Tải hóa đơn & Xuất báo cáo (Đã Hoàn Thành)
- [x] 1. Điều chỉnh `schema.prisma` và chạy Prisma Migrate để cập nhật SQLite database.
- [x] 2. Cài đặt các thư viện mới (`adm-zip`, `fast-xml-parser`, `exceljs`, `axios`).
- [x] 3. Viết `parser.service.ts` để đọc và phân tích file XML hóa đơn (đã sửa lỗi đệ quy).
- [x] 4. Viết `downloader.service.ts` xử lý việc tải hóa đơn từ cổng HDDT.
- [x] 5. Viết `excel.service.ts` xuất bản Excel báo cáo (đã sửa lỗi trùng lặp sheet).
- [x] 6. Tạo Controller & Route API để liên kết các dịch vụ trên thành RESTful API.

### Giai đoạn 2: Tự động Đăng nhập & Giải Captcha bằng Gemini (Cần Triển Khai)
- [ ] 7. Cài đặt thư viện `@google/generative-ai` và `sharp`.
- [ ] 8. Thiết lập biến môi trường `GEMINI_API_KEY` trong file `.env`.
- [ ] 9. Viết `captcha.service.ts` hỗ trợ tải captcha, convert SVG sang PNG và tích hợp Gemini OCR.
- [ ] 10. Viết `auth.service.ts` xử lý việc đăng nhập, gửi payload xác thực và thiết lập cơ chế tự động thử lại (Retry).
- [ ] 11. Tạo `auth.controller.ts` và route `POST /api/auth/token`.
- [ ] 12. Kiểm thử luồng tự động lấy token từ tài khoản/mật khẩu thực tế.
