# Kế hoạch chuyển đổi Script Python tải hoá đơn thành API Backend (Node.js/TypeScript)

Dựa trên việc phân tích mã nguồn `script.py`, dưới đây là kế hoạch khảo sát, điều chỉnh cơ sở dữ liệu và triển khai API cho Backend.

---

## 1. Khảo sát hoạt động của `script.py`
- **Xác thực:** Lấy MST từ JWT Token của Tổng cục Thuế (`TOKEN`).
- **Luồng tải hóa đơn:**
  1. Chia khoảng thời gian cần tải thành các chu kỳ nhỏ hơn hoặc bằng 28 ngày để tránh lỗi giới hạn thời gian tra cứu của Tổng cục Thuế.
  2. Gửi request đến API cổng HDDT: `https://hoadondientu.gdt.gov.vn/api/query/invoices/sold`. 
     - Lần 1: `size=1` để lấy tổng số hoá đơn (`total`).
     - Lần 2: `size={total}` để tải toàn bộ danh sách hóa đơn chi tiết.
  3. Gửi request tải file nén ZIP chứa hóa đơn điện tử dạng XML: `https://hoadondientu.gdt.gov.vn/api/query/invoices/export-xml`.
  4. Giải nén file ZIP, tìm file XML và phân tích (Parse) dữ liệu XML để lấy thông tin chi tiết hóa đơn (thông tin chung, người bán, người mua, tổng thanh toán và danh sách chi tiết từng mặt hàng hàng hóa/dịch vụ).
  5. Xuất báo cáo Excel chất lượng cao bằng `openpyxl`.

---

## 2. Kế hoạch điều chỉnh Schema Cơ sở dữ liệu (Prisma + SQLite)
Để lưu trữ đầy đủ các thông tin mà `script.py` trích xuất được (bao gồm chi tiết mặt hàng hàng hóa/dịch vụ), chúng ta cần cập nhật `schema.prisma`.

### 2.1. Cập nhật Model `Invoice`
Bổ sung các trường thông tin chi tiết:
- `templateSymbol` (Ký hiệu mẫu hóa đơn - `khmshdon`)
- `invoiceSymbol` (Ký hiệu hóa đơn - `khhdon`)
- `paymentMethod` (Hình thức thanh toán - `htttoan`)
- `currency` (Đơn vị tiền tệ - `dvtte`)
- `exchangeRate` (Tỷ giá - `tgia`)
- `taxAuthorityCode` (Mã cơ quan thuế - `mccqt`)
- `lookupCode` (Mã tra cứu - `matracuu`)
- `invoiceName` (Tên hóa đơn - `thdon`)
- `sellerAddress` (Địa chỉ người bán - `nban_dchi`)
- `sellerPhone` (Số điện thoại người bán - `nban_sdthoai`)
- `buyerAddress` (Địa chỉ người mua - `nmua_dchi`)
- `buyerCustomerId` (Mã khách hàng người mua - `nmua_mkhang`)
- `totalAmountInWords` (Tổng tiền bằng chữ - `tgtttbchu`)
- `zipPath` (Đường dẫn file ZIP gốc đã tải)

### 2.2. Tạo thêm Model `InvoiceItem`
Lưu trữ chi tiết các hàng hóa, dịch vụ trong từng hóa đơn:
- `id` (Khóa chính tự tăng)
- `invoiceId` (Khóa ngoại liên kết với `Invoice`, Cascade Delete)
- `lineNumber` (Số thứ tự dòng - `stt`)
- `name` (Tên hàng hóa, dịch vụ - `thhdvu`)
- `unit` (Đơn vị tính - `dvtinh`)
- `quantity` (Số lượng - `sluong`)
- `price` (Đơn giá - `dgia`)
- `amount` (Thành tiền chưa thuế - `thtien`)
- `taxRate` (Thuế suất - `tsuat`)

---

## 3. Kế hoạch triển khai API & Logic code trên Backend

### Bước 1: Cập nhật Cấu hình và Cài đặt Thư viện
- Cài đặt thêm các thư viện hỗ trợ:
  - `adm-zip` (để giải nén file ZIP hóa đơn).
  - `fast-xml-parser` (để phân tích cú pháp XML của hóa đơn sang đối tượng JS/TS).
  - `exceljs` hoặc `xlsx` (để tạo file Excel XLSX có định dạng đẹp mắt tương tự openpyxl).
  - `axios` (để gọi các API cổng HDDT của Tổng cục Thuế).

### Bước 2: Cập nhật Cấu trúc DB (Prisma Migration)
- Ghi đè file `prisma/schema.prisma` với thiết kế mới.
- Chạy lệnh `npx prisma migrate dev --name update_invoice_details` để cập nhật database SQLite.

### Bước 3: Phát triển Lớp Service
- **`downloader.service.ts`:**
  - Chuyển đổi logic tự động chia khoảng thời gian dưới 28 ngày.
  - Implement các HTTP Request bằng `axios` để lấy danh sách hóa đơn bán ra và tải file ZIP.
  - Hỗ trợ giải captcha bằng AI OCR (sẽ giả lập qua cấu hình hoặc tích hợp API bên thứ ba).
- **`parser.service.ts`:**
  - Dùng `adm-zip` để giải nén file ZIP.
  - Dùng `fast-xml-parser` để đọc dữ liệu XML, trích xuất tất cả các thông tin cần thiết của hóa đơn và các mặt hàng hàng hóa liên quan.
- **`excel.service.ts`:**
  - Sử dụng `exceljs` để xây dựng logic tạo báo cáo Excel chuyên nghiệp: có sheet Tổng quan, có sheet chi tiết cho từng hóa đơn, định dạng màu sắc (Theme xanh Navy như trong script Python) và công thức tính tổng tự động (`SUM`).

### Bước 4: Tạo Controller và Định nghĩa Route
- Tạo `invoice.controller.ts` để tiếp nhận tham số từ frontend: `startDate`, `endDate`, `token`, `saveToDb`, `invoiceType`.
- Định nghĩa route `POST /api/invoices/download` kích hoạt luồng tải hóa đơn, giải nén, parse XML và lưu DB.
- Định nghĩa route `GET /api/invoices` để lấy danh sách hóa đơn từ lịch sử.
- Định nghĩa route `POST /api/invoices/export` để tạo và tải về file Excel báo cáo.

---

## 4. Danh sách công việc cần duyệt (TODO List)

- [ ] 1. Điều chỉnh `schema.prisma` và chạy Prisma Migrate để cập nhật SQLite database.
- [ ] 2. Cài đặt các thư viện mới (`adm-zip`, `fast-xml-parser`, `exceljs`, `axios`).
- [ ] 3. Viết `parser.service.ts` để đọc và phân tích file XML hóa đơn.
- [ ] 4. Viết `downloader.service.ts` xử lý việc đăng nhập, gọi API Tổng cục Thuế và lưu trữ file ZIP.
- [ ] 5. Viết `excel.service.ts` xuất bản Excel báo cáo theo đúng giao diện đẹp của bản Python.
- [ ] 6. Tạo Controller & Route API để liên kết các dịch vụ trên thành RESTful API.
