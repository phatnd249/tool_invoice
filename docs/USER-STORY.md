# Khảo sát, Phân tích Nghiệp vụ & Bảng Câu chuyện Người dùng (User Story Map)

Tài liệu này trình bày kết quả khảo sát, phân tích nghiệp vụ và xây dựng bảng câu chuyện người dùng (User Stories) cho phần mềm tải và quản lý hoá đơn điện tử viết bằng ReactJS + ElectronJS.

---

## I. Khảo sát & Phân tích Nghiệp vụ

### 1. Mô hình kiến trúc & Đóng gói
- **Công nghệ chính:** ReactJS (Frontend/UI) + ElectronJS (Đóng gói ứng dụng desktop).
- **Hình thức phân phối:** Portable app (Giải nén là chạy, không cần cài đặt phức tạp).
- **Vấn đề cần quyết định:** Phương thức kết nối Cơ sở dữ liệu (Database).
  - *Phương án A:* Kết nối trực tiếp từ Electron app (Direct Connection) tới DB. Tiết kiệm chi phí vận hành backend nhưng kém bảo mật thông tin kết nối DB và khó nâng cấp đồng bộ.
  - *Phương án B:* Xây dựng Backend API trung gian để xử lý DB. Bảo mật tốt hơn, dễ kiểm soát tài nguyên nhưng tốn thêm chi phí và công sức xây dựng backend.
  - *Khuyến nghị:* Nên dùng Backend API nếu phần mềm được sử dụng bởi nhiều người dùng/nhiều máy khác nhau để đảm bảo tính an toàn dữ liệu và bảo mật thông tin đăng nhập DB.

### 2. Luồng nghiệp vụ chính
1. **Đăng nhập hệ thống Hóa đơn điện tử (HDDT) của Tổng cục Thuế:**
   - Hệ thống yêu cầu giải mã Captcha.
   - Giải pháp hỗ trợ:
     - **Bypass bằng Token:** Sử dụng token có sẵn để bỏ qua đăng nhập trực tiếp.
     - **Giải Captcha bằng AI:** Tự động chụp/lấy hình ảnh Captcha gửi qua API AI chuyên OCR để nhận diện ký tự (chữ hoa và số), sau đó tự điền và đăng nhập.
2. **Tải hoá đơn:**
   - Đầu vào: Tên công ty, Mã số thuế, Mật khẩu tra cứu, Khoảng thời gian (Từ ngày - Đến ngày), Loại hoá đơn, Phương thức đăng nhập, Thư mục lưu trữ.
   - Kết quả: Tải các file hoá đơn (định dạng **PDF** và **XML**) về thư mục chỉ định (hoặc mặc định).
3. **Trích xuất dữ liệu & Lưu trữ (DB):**
   - Đọc dữ liệu từ file XML/PDF thu thập được.
   - Lưu trữ thông tin hoá đơn vào DB theo 2 luồng: Tự động ngay sau khi tải, hoặc chọn lọc lưu từ Lịch sử tải.
4. **Hẹn giờ tải tự động:**
   - Thiết lập lịch biểu để ứng dụng tự động chạy tác vụ tải hóa đơn.
   - Ràng buộc: Máy tính và ứng dụng phải luôn bật (treo máy), không hỗ trợ tự khởi động cùng OS (do là bản Portable).
5. **Báo cáo:**
   - Cho phép chọn các hoá đơn trong Lịch sử tải để kết xuất báo cáo tổng hợp dạng **XLSX (Excel)**.

---

## II. Bảng Câu chuyện Người dùng (User Story Map)

Dưới đây là danh sách chi tiết các User Stories được phân loại theo các **Epic (Chủ đề lớn)** kèm theo các tiêu chí nghiệm thu (Acceptance Criteria - AC).

### Epic 1: Giao diện và Bố cục chung (UI/UX & Layout)
| ID | User Story (Mô tả chức năng) | Tiêu chí nghiệm thu (Acceptance Criteria - AC) | Độ ưu tiên |
| :--- | :--- | :--- | :--- |
| **US-01** | Là một người dùng, tôi muốn ứng dụng có giao diện Dashboard chia làm 2 phần (Sidebar bên trái và Vùng hiển thị bên phải) để dễ dàng chuyển đổi qua lại giữa các tính năng. | - Sidebar chứa các mục: Tải hoá đơn, Hẹn giờ, Lịch sử tải, Cấu hình hệ thống.<br>- Vùng hiển thị bên phải thay đổi nội dung tương ứng theo mục được chọn ở Sidebar. | High |
| **US-02** | Là một người dùng, tôi muốn giao diện chính hiển thị các ô nhập liệu ở phía trên và phần Log thông báo ở phía dưới để dễ dàng cấu hình và theo dõi tiến trình chạy. | - Vùng nhập liệu phía trên hiển thị đầy đủ các trường thông tin đầu vào.<br>- Vùng Log phía dưới hiển thị thời gian thực các bước xử lý (đang đăng nhập, giải captcha, đang tải hoá đơn, lỗi...). | High |

### Epic 2: Tải Hoá đơn Thủ công (Manual Download)
| ID | User Story (Mô tả chức năng) | Tiêu chí nghiệm thu (Acceptance Criteria - AC) | Độ ưu tiên |
| :--- | :--- | :--- | :--- |
| **US-03** | Là một người dùng, tôi muốn nhập thông tin tra cứu hóa đơn gồm MST, Tên công ty, Mật khẩu tra cứu, Khoảng thời gian, Loại hoá đơn và chọn phương thức đăng nhập để chuẩn bị cho việc tải hoá đơn. | - Cho phép nhập MST, Tên công ty, Mật khẩu.<br>- Lựa chọn Khoảng thời gian (Từ ngày - Đến ngày) qua bộ chọn lịch (Date Picker).<br>- Chọn loại hoá đơn (Mua vào / Bán ra).<br>- Chọn phương thức đăng nhập (Token hoặc Giải Captcha bằng AI). | High |
| **US-04** | Là một người dùng, tôi muốn chọn cấu hình thư mục lưu file hoá đơn để lưu trữ hóa đơn theo đúng cấu trúc thư mục mong muốn. | - Có nút "Chọn thư mục", khi bấm hiển thị hộp thoại chọn thư mục của OS.<br>- Nếu không chọn, hệ thống tự động lưu vào thư mục mặc định (ví dụ: `./downloads/invoices`). | Medium |
| **US-05** | Là một người dùng, tôi muốn hệ thống tự động đăng nhập vào trang HDDT bằng Token hoặc giải Captcha bằng AI để bỏ qua bước nhập captcha thủ công. | - Nếu chọn "Token": Sử dụng token đã lưu để gọi API trang HDDT.<br>- Nếu chọn "AI": Hệ thống tự động lấy ảnh captcha, gửi qua dịch vụ AI OCR để nhận diện chữ/số, điền vào form đăng nhập.<br>- Ghi nhận kết quả đăng nhập thành công vào Log. | High |
| **US-06** | Là một người dùng, tôi muốn hệ thống tải toàn bộ hoá đơn/bảng kê về máy tính ở định dạng PDF và XML và hiển thị thông báo khi hoàn tất. | - Tải thành công các file PDF và XML tương ứng với kết quả tra cứu.<br>- Lưu file vào đúng đường dẫn đã cấu hình.<br>- Hiển thị Popup/Toast thông báo: "Đã tải xong X hoá đơn". | High |

### Epic 3: Hẹn giờ Tải tự động (Scheduler)
| ID | User Story (Mô tả chức năng) | Tiêu chí nghiệm thu (Acceptance Criteria - AC) | Độ ưu tiên |
| :--- | :--- | :--- | :--- |
| **US-07** | Là một người dùng, tôi muốn cấu hình đặt lịch hẹn giờ tải hóa đơn (ở mục "Hẹn giờ") với các thông số cấu hình tương tự tải thủ công để hệ thống tự động thực hiện tải định kỳ. | - Cho phép cấu hình đầy đủ thông tin tra cứu như luồng tải thủ công.<br>- Cho phép thiết lập tần suất (mỗi X giờ, hàng ngày vào lúc Y giờ...).<br>- Hiển thị cảnh báo: "Yêu cầu không tắt ứng dụng và giữ máy tính hoạt động liên tục để lịch hẹn giờ hoạt động". | Medium |

### Epic 4: Trích xuất và Lưu trữ Dữ liệu (Data Extraction & Database)
| ID | User Story (Mô tả chức năng) | Tiêu chí nghiệm thu (Acceptance Criteria - AC) | Độ ưu tiên |
| :--- | :--- | :--- | :--- |
| **US-08** | Là một người dùng, tôi muốn hệ thống tự động phân tích và trích xuất dữ liệu từ các file PDF và XML đã tải về để chuẩn bị lưu trữ vào cơ sở dữ liệu. | - Đọc được thông tin từ file XML (Mã hoá đơn, Ngày lập, Người bán, Người mua, Tổng tiền, Thuế suất...).<br>- Trích xuất dữ liệu từ file PDF (phòng trường hợp file XML bị lỗi). | High |
| **US-09** | Là một người dùng, tôi muốn có lựa chọn tự động lưu dữ liệu hoá đơn vào DB ngay sau khi tải xong hoặc lưu thủ công từ Lịch sử tải. | - Có nút bật/tắt (Toggle) "Tự động lưu vào CSDL sau khi tải".<br>- Nếu bật, sau khi tải thành công từng hoá đơn, tiến hành trích xuất dữ liệu và thực hiện lưu vào DB.<br>- Nếu tắt, dữ liệu chỉ lưu trữ local tạm thời để người dùng duyệt lại ở màn hình Lịch sử. | High |

### Epic 5: Lịch sử tải & Xuất báo cáo (History & Reporting)
| ID | User Story (Mô tả chức năng) | Tiêu chí nghiệm thu (Acceptance Criteria - AC) | Độ ưu tiên |
| :--- | :--- | :--- | :--- |
| **US-10** | Là một người dùng, tôi muốn xem lại danh sách lịch sử các hoá đơn đã tải để dễ dàng kiểm tra và quản lý. | - Hiển thị danh sách hóa đơn dưới dạng bảng gồm: MST, Tên công ty, Ngày tải, Số hoá đơn, Tổng tiền, Trạng thái lưu DB.<br>- Có bộ lọc theo thời gian, MST, trạng thái. | Medium |
| **US-11** | Là một người dùng, tôi muốn chọn các hoá đơn cụ thể trong Lịch sử tải và bấm nút Lưu vào CSDL để chủ động quyết định dữ liệu nào được đưa vào hệ thống. | - Cho phép chọn nhiều dòng (checkbox) trên bảng Lịch sử.<br>- Nút "Lưu vào CSDL" hoạt động khi có ít nhất 1 hoá đơn được chọn.<br>- Cập nhật trạng thái "Đã lưu DB" trên giao diện sau khi lưu thành công. | Medium |
| **US-12** | Là một người dùng, tôi muốn chọn các hóa đơn trong Lịch sử và xuất ra file Excel (XLSX) tổng hợp để phục vụ công tác báo cáo, kế toán. | - Cho phép chọn các hoá đơn cần kết xuất.<br>- Xuất ra file Excel (.xlsx) chứa bảng tổng hợp thông tin hoá đơn (Số HĐ, Ngày lập, Người bán, Tổng tiền trước thuế, Tiền thuế, Tổng thanh toán...). | Medium |

---

## III. Các khuyến nghị & Điểm cần lưu ý thêm

1. **Bảo mật thông tin đăng nhập:** Các thông tin như MST, Mật khẩu tra cứu, Token nên được mã hóa trước khi lưu trữ cục bộ (ví dụ sử dụng thư viện `keytar` của Electron hoặc mã hóa AES đơn giản) để tránh lộ lọt thông tin khi người dùng dùng bản Portable.
2. **Xử lý ngoại lệ Captcha:** Vì AI giải captcha không phải lúc nào cũng đạt tỷ lệ chính xác 100%, chương trình cần hỗ trợ cơ chế tự động thử lại (Retry) tối đa 3-5 lần, nếu vẫn thất bại thì ghi lỗi rõ ràng vào phần Log và dừng lại để người dùng kiểm tra hoặc đổi sang phương thức nhập Token.
3. **Cơ chế lưu trữ tạm thời (Local Storage/SQLite):** Do chạy dưới dạng Electron App, nên tích hợp một DB cục bộ dung lượng nhẹ như **SQLite** hoặc **NeDB** để lưu trữ Lịch sử tải hoá đơn tạm thời trước khi người dùng đồng ý lưu lên Database chính (CSDL chung).
