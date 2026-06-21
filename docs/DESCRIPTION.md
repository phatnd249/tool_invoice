Miêu tả phần mềm tải và quản lý hoá đơn: 

- Sử dụng Reactjs để xây dựng một web app, sau đó dùng Electronjs để đóng gói thành một chương trình máy tính portable, người dùng giải nén và sử dụng
- Web app sử dụng layout dashboard, màn hình chia ra 2 phần chính: bên trái là sidebar, hiển thị các chức năng của chương trình; bên phải là giao diện chính
- Giao diện chương trình có 2 phần chính: phần đầu là các input để người dùng cung cấp thông tin đăng nhập, khoảng thời gian và loại hoá đơn cần tải; phần thứ hai là log, nó in ra thông báo, kết quả hoặc lỗi trong khi tải hoá đơn
- Bắt đầu sử dụng, người dùng được yêu cầu nhập thông tin để tải hoá đơn: tên công ty, mã số thuế, mật khẩu tra cứu, thời gian bắt đầu, thời gian kết thúc, loại hoá đơn, phương thức đăng nhập, sau đó nhấn nút tải hoá đơn
- Khi người dùng cung cấp thông tin và nhấn nút tải hoá đơn, chương trình sử dụng tài khoản tra cứu mà người dùng cung cấp để đăng nhập vào web hoá đơn điện tử (HDDT)
- Vì web HDDT yêu cầu giải captcha khi đăng nhập, do đó cung cấp 2 cách đăng nhập: cách đầu tiên là bypass captcha bằng token, cách thứ hai là sử dụng AI để giải captcha (vì captcha hiện tại là chữ viết hoa và số, nên có thể copy hình và nhờ AI giải)
- Khi đăng nhập thành công, lưu token vào bộ nhớ tạm, rồi sử dụng token để tải hoá đơn/bảng kê về máy tính
- Khi tải hoá đơn về máy tính, người dùng quy định thư mục lưu hoá đơn, nếu không thì chương trình sẽ sử dụng đường dẫn mặc định
- Khi tải xong thì có thông báo để người dùng biết
- Người dùng cũng có thể đặt lịch tải hoá đơn tự động, để sử dụng chức năng này, người dùng chọn mục “Hẹn giờ”, và nhập thông tin như bước tải hoá đơn ở trên. Lưu ý, nếu dùng chức năng hẹn giờ, người dùng phải treo máy và chương trình, chương trình không có chức năng tự khởi động
- Để lưu hoá đơn vào cơ sở dữ liệu, người dùng có 2 lựa chọn: yêu cầu lưu vào cơ sở dữ liệu ngay khi tải hoá đơn xong hoặc vào lịch sử tải hoá đơn để chọn những hoá đơn cần lưu vào cơ sở dữ liệu
- Hoá đơn mà người dùng tải về có 2 định dạng PDF và XML, do đó hệ thống cần trích xuất dữ liệu từ 2 file này, sau đó mới lưu dữ liệu được
- Chưa quyết định được nên dùng backend hay kết nối database trực tiếp từ phần mềm
- Chức năng cuối cùng, người dùng có thể chọn các hoá đơn đã tải trong lịch sử tải hoá đơn và yêu cầu phần mềm xuất báo cáo tổng dưới dạng file XLSX

