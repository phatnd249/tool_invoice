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
- Cập nhật Model `Invoice` với các thông tin chi tiết.
- Tạo thêm Model `InvoiceItem` lưu trữ chi tiết dòng hóa đơn.

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
Để người dùng dễ dàng kiểm thử toàn bộ chức năng mà không cần dùng cURL, ta thiết kế một trang Dashboard Demo tĩnh tại `backend/public/index.html` được phục vụ qua Express Static files.

---

## 6. Kế hoạch xây dựng Giao diện người dùng Desktop (ReactJS + ElectronJS)
Chuyển đổi sản phẩm từ bản chạy thử nghiệm trên trình duyệt sang ứng dụng Desktop hoàn chỉnh có thể giải nén và chạy ngay (Portable):

### Bước 1: Khởi tạo dự án Frontend React
- Sử dụng Vite để khởi tạo dự án React + TypeScript tại thư mục `frontend/`.
- Cấu hình TailwindCSS và FontAwesome cho React.

### Bước 2: Tích hợp ElectronJS (Main Process & Preload)
- Xây dựng file khởi tạo cửa sổ ứng dụng Electron `main.ts` (quản lý kích thước cửa sổ, vòng đời app).
- Xây dựng file `preload.ts` để thiết lập cầu nối liên lạc IPC (Inter-Process Communication) an toàn giữa React và Node.js.
- Cấu hình quy trình khởi động đồng thời (Concurrently) cho Backend và Frontend trong lúc phát triển.

### Bước 3: Phát triển các React Component
- Chuyển giao diện tĩnh từ `index.html` sang React:
  - **`DashboardLayout`:** Layout chia sidebar và main content.
  - **`InvoiceDownloader`:** Màn hình cấu hình tải hóa đơn + Ghi nhận log trực quan thông qua State.
  - **`InvoiceHistory`:** Bảng hiển thị danh sách hóa đơn, checkbox chọn nhiều để gọi API xuất Excel, tải file XML/ZIP.
  - **`SchedulePanel`:** Màn hình lập lịch hẹn giờ tự động tải hóa đơn định kỳ.

### Bước 4: Đóng gói Ứng dụng (Packaging)
- Cấu hình `electron-builder` để đóng gói toàn bộ dự án (React Frontend + Node.js Backend + SQLite + Prisma) thành một tệp tin Portable duy nhất, người dùng chỉ cần giải nén là sử dụng được ngay.

---

## 7. Danh sách công việc (TODO List)

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
- [x] 14. Tạo file `backend/public/index.html` với đầy đủ cấu trúc UI và CSS (Đã có tính năng thu gọn Sidebar).
- [x] 15. Triển khai JS gọi API `/api/invoices/download` hiển thị Log/Loading trực quan.
- [x] 16. Triển khai JS gọi API `/api/invoices` đổ dữ liệu vào bảng danh sách (Đã sửa lỗi hiển thị file bị thiếu).
- [x] 17. Triển khai JS gọi API `/api/invoices/export` để tải file Excel tổng hợp (Đã sửa lỗi công thức Excel).
- [x] 18. Hỗ trợ tải file XML/ZIP của hoá đơn về trình duyệt người dùng.

### Giai đoạn 4: Xây dựng Frontend Desktop bằng ReactJS & ElectronJS (Đang hoàn thiện)
- [x] 19. Khởi tạo cấu trúc thư mục `frontend/` bằng Vite (React + TypeScript).
- [x] 20. Cấu hình TailwindCSS và tích hợp bộ icon FontAwesome/Lucide React.
- [x] 21. Cài đặt và cấu hình ElectronJS (Main process & Preload script).
- [x] 22. Phát triển các React Component cho giao diện Dashboard (Tải hóa đơn, Lịch sử, Đặt lịch hẹn giờ).
- [x] 23. Tích hợp Axios kết nối React với Backend API cục bộ.
- [x] 24. Cấu hình quy trình chạy đồng thời (Concurrently) cho môi trường dev.
- [x] 25. Cấu hình đóng gói ứng dụng Portable bằng `electron-builder`.
- [x] 26. Thiết lập quy trình tối ưu hóa dung lượng ứng dụng (dưới 150MB).

### Giai đoạn 5: Chuyển đổi sang Local Web App và Đóng gói Standalone (Kế hoạch mới)
- [ ] 27. Cấu hình Backend (Express) để phục vụ (serve) thư mục build React tĩnh (`frontend/dist`).
- [ ] 28. Tích hợp thư viện `open` để tự động kích hoạt Trình duyệt mặc định khi chạy Backend.
- [ ] 29. Thiết lập cơ chế tự sao chép database mẫu (`dev.db`) và khởi tạo thư mục `invoices` trong thư mục Home/Documents của người dùng khi ứng dụng CLI khởi chạy.
- [ ] 30. Cài đặt và cấu hình `@vercel/pkg` hoặc Single Executable Applications (SEA) để đóng gói Backend thành 1 file nhị phân chạy độc lập (`.exe` trên Windows, `.bin` trên Linux).
- [ ] 31. Tạo script build tự động nén toàn bộ luồng (Vite build -> Node build -> Đóng gói nhị phân) ra thư mục `dist-executable`.

---

## 8. Kế hoạch Tối ưu hóa Dung lượng Đóng gói Electron
Để giảm dung lượng ứng dụng sau khi đóng gói từ 1.4 GB xuống dưới mức ~150MB, ta sẽ thực hiện 4 bước tối ưu hóa sau:

### Bước 1: Sử dụng Esbuild để bundle Backend
Thay vì copy toàn bộ thư mục `backend/node_modules` khổng lồ vào trong gói cài đặt, ta sẽ:
* Cài đặt `esbuild` ở backend.
* Biên dịch toàn bộ code TypeScript backend và các dependency dạng pure JS thành một file bundle duy nhất tại `backend/dist/server.js`.
* Nhờ đó, ta hoàn toàn có thể loại bỏ `node_modules` của backend khi đóng gói, chỉ giữ lại các module dạng native binary (như Sharp, Prisma Query Engine).

### Bước 2: Tối ưu và lọc bỏ các Prisma Engine dư thừa
Mặc định Prisma tải về nhiều tệp thực thi engine phục vụ cho việc migration, CLI, định dạng schema. Trong môi trường production, ta chỉ cần giữ lại duy nhất tệp nhị phân `query-engine` chạy cho hệ điều hành đích:
* Xóa các tệp: `schema-engine`, `introspection-engine`, `migration-engine` trong node_modules.
* Chỉ copy file query engine phù hợp với hệ điều hành đích (ví dụ: `query-engine-debian-openssl...` cho Linux, `query-engine-windows...` cho Windows).

### Bước 3: Chỉ cài đặt Production Dependencies cho Sharp
* Thư viện xử lý ảnh `sharp` sử dụng native C++ binary nên khó bundle hoàn toàn bằng esbuild.
* Ta sẽ cấu hình đóng gói chỉ giữ lại thư mục `sharp` đã được tối ưu hóa cho nền tảng đích.

### Bước 4: Tự động hóa quy trình qua Scripts
* Viết script Node.js hoặc Bash tự động dọn dẹp tài nguyên thừa (Prisma Engine, Dev-dependencies) trước khi chạy `electron-builder` nhằm đảm bảo dung lượng file đóng gói luôn ở mức tối ưu nhất.

---

## 9. Kế hoạch Chuyển đổi sang Local Web Utility (Node.js Standalone Executable)
Nhằm giảm thiểu dung lượng ứng dụng tải xuống xuống mức tối thiểu (dưới 40MB) và đơn giản hóa kiến trúc phân phối phần mềm, ta sẽ thay thế Electron bằng mô hình Local Web Utility.

### Bước 1: Tích hợp Giao diện React vào Express Backend
* Chạy `npm run build` trên Frontend React để tạo các tệp HTML/CSS/JS tĩnh tại `frontend/dist`.
* Trong file `backend/src/server.ts`, cấu hình Express để phục vụ (serve) các file tĩnh này như giao diện chính:
  ```typescript
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  // Redirect mọi route không khớp API về trang index.html để hỗ trợ SPA routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
  ```

### Bước 2: Tự động Mở Trình duyệt mặc định khi chạy ứng dụng
* Cài đặt thư viện `open` ở backend.
* Khi khởi động Express thành công và phát hiện môi trường Production, tự động gọi trình duyệt mở đường dẫn:
  ```typescript
  import open from 'open';
  open(`http://localhost:${PORT}`);
  ```

### Bước 3: Xử lý Tự động Dò tìm Cổng và Khởi tạo Thư mục làm việc
* Tích hợp cơ chế tự động dò tìm cổng rỗi (bắt đầu từ 3000) giống như đã làm bên Electron.
* Khi khởi chạy file nhị phân độc lập, tự động phát hiện đường dẫn dữ liệu người dùng (`Documents/InvoiceDownloader`) và sao chép cơ sở dữ liệu SQLite trống (`dev.db`) và cấu hình thư mục lưu trữ hóa đơn nếu chưa tồn tại.

### Bước 4: Đóng gói thành tệp thực thi duy nhất bằng `@vercel/pkg`
* Cài đặt `pkg` ở backend.
* Cấu hình file `package.json` của backend để bao gồm các tệp asset cần thiết (cơ sở dữ liệu mẫu, giao diện React tĩnh).
* Biên dịch ứng dụng thành tệp nhị phân độc lập tùy chọn nền tảng (ví dụ: `tool-invoice-linux`, `tool-invoice-win.exe`). Người dùng chỉ cần đúp click để chạy.


