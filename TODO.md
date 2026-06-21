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
`[Lấy Captcha GDT] ➔ [Convert SVG sang PNG] ➔ [Gemini AI OCR] ➔ [Đăng nhập GDT] ➔ [Trả về Token]`
- Cài đặt `@google/generative-ai` và `sharp`.
- Gọi Gemini 2.5 Flash thực hiện OCR.
- Xử lý cơ chế tự động thử lại (Retry) tối đa 3 lần.

---

## 5. Kế hoạch xây dựng Giao diện Demo HTML/TailwindCSS
Để người dùng dễ dàng kiểm thử toàn bộ chức năng mà không cần dùng cURL, ta thiết kế một trang Dashboard Demo tĩnh tại `backend/public/index.html` được phục vụ qua Express Static files:

### Bước 1: Cấu hình Static Files
- Khai báo middleware `app.use(express.static('public'))` trong `server.ts` để phục vụ thư mục `backend/public/`.

### Bước 2: Thiết kế giao diện HTML (index.html)
- Tích hợp **TailwindCSS (CDN)** và **FontAwesome (CDN)**.
- Xây dựng layout chia thành:
  - **Sidebar:** Điều hướng các mục.
  - **Màn hình Tải hóa đơn:** Form nhập các thông số (MST, Mật khẩu, Từ ngày, Đến ngày, Loại hóa đơn, Token thủ công), nút bấm chạy tác vụ và phần hiển thị Log thời gian thực.
  - **Màn hình Lịch sử:** Bảng hiển thị danh sách hóa đơn (Số HĐ, Ngày lập, Người bán, Người mua, Tổng thanh toán, Nút tải file XML về máy tính), tích hợp các checkbox trên mỗi dòng.
  - **Xuất Excel:** Chọn các dòng hóa đơn trên bảng và bấm nút "Xuất báo cáo tổng hợp" để tải file Excel `.xlsx` về máy.

### Bước 3: Triển khai JavaScript Client-side
- Fetch danh sách hóa đơn từ `GET /api/invoices` và cập nhật DOM động.
- Gửi yêu cầu download tới `POST /api/invoices/download` (hiển thị trạng thái loading/log).
- Gửi yêu cầu xuất Excel tới `POST /api/invoices/export` và nhận file dạng Blob để tải về trình duyệt.

---

## 6. Danh sách công việc (TODO List)

### Giai đoạn 1: Tải hóa đơn & Xuất báo cáo (Đã Hoàn Thành)
- [x] 1. Điều chỉnh `schema.prisma` và chạy Prisma Migrate để cập nhật SQLite database.
- [x] 2. Cài đặt các thư viện mới (`adm-zip`, `fast-xml-parser`, `exceljs`, `axios`).
- [x] 3. Viết `parser.service.ts` để đọc và phân tích file XML hóa đơn.
- [x] 4. Viết `downloader.service.ts` xử lý việc tải hóa đơn từ cổng HDDT.
- [x] 5. Viết `excel.service.ts` xuất bản Excel báo cáo.
- [x] 6. Tạo Controller & Route API để liên kết các dịch vụ trên thành RESTful API.

### Giai đoạn 2: Tự động Đăng nhập & Giải Captcha bằng Gemini (Đã Hoàn Thành)
- [x] 7. Cài đặt thư viện `@google/generative-ai` và `sharp`.
- [x] 8. Thiết lập biến môi trường `GEMINI_API_KEY` trong file `.env`.
- [x] 9. Viết `captcha.service.ts` hỗ trợ tải captcha, convert SVG sang PNG và tích hợp Gemini OCR.
- [x] 10. Viết `auth.service.ts` xử lý việc đăng nhập, gửi payload xác thực và thiết lập cơ chế tự động thử lại.
- [x] 11. Tạo `auth.controller.ts` và route `POST /api/auth/token`.
- [x] 12. Kiểm thử luồng tự động lấy token từ tài khoản/mật khẩu thực tế.

### Giai đoạn 3: Xây dựng Giao diện Demo HTML/TailwindCSS (Đã Hoàn Thành)
- [x] 13. Cấu hình Express Static Files phục vụ thư mục `public/`.
- [x] 14. Tạo file `backend/public/index.html` với đầy đủ cấu trúc UI và CSS.
- [x] 15. Triển khai JS gọi API `/api/invoices/download` hiển thị Log/Loading trực quan.
- [x] 16. Triển khai JS gọi API `/api/invoices` đổ dữ liệu vào bảng danh sách.
- [x] 17. Triển khai JS gọi API `/api/invoices/export` để tải file Excel tổng hợp các hoá đơn đã chọn.
- [x] 18. Hỗ trợ tải file XML của hoá đơn từ thư mục backend về trình duyệt người dùng.
