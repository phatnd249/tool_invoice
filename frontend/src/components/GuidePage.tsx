import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  BookOpen,
  LogIn,
  CloudDownload,
  CalendarDays,
  Building2,
  Search,
  Key,
  AlertTriangle,
  FileText,
  Users,
  MessageSquare,
} from 'lucide-react';

const sections = [
  {
    id: 'intro',
    icon: BookOpen,
    title: 'Giới Thiệu',
    content:
      'Invoice Pro là công cụ hỗ trợ tải hoá đơn điện tử từ hệ thống hoá đơn điện tử của Tổng cục Thuế (GDT) một cách nhanh chóng và tự động. Phần mềm giúp doanh nghiệp quản lý, lưu trữ và tra cứu hoá đơn tập trung, thay thế việc tải thủ công từng hoá đơn trên cổng thông tin điện tử.',
  },
  {
    id: 'login',
    icon: LogIn,
    title: 'Đăng Nhập & Tài Khoản',
    content: [
      'Để sử dụng Invoice Pro, bạn cần có tài khoản do quản trị viên cấp.',
      'Có 2 phân quyền:',
      '• Quản trị viên (Admin): Toàn quyền quản lý doanh nghiệp, tài khoản người dùng, cấu hình API key, và tất cả tính năng khác.',
      '• Nhân viên (User): Có thể tải hoá đơn, xem lịch sử, đặt lịch tải định kỳ, góp ý và sử dụng các tiện ích.',
      'Sau khi đăng nhập thành công, hệ thống sẽ tự động duy trì phiên làm việc. Nếu phiên hết hạn, bạn sẽ được yêu cầu đăng nhập lại.',
    ],
  },
  {
    id: 'download',
    icon: CloudDownload,
    title: 'Tải Hoá Đơn Mới',
    content: [
      'Tại tab "Tải Hoá Đơn", bạn có thể tải hoá đơn bằng các cách sau:',
      '',
      '📥 Tải theo mã số thuế:',
      '• Chọn doanh nghiệp từ danh sách (hoặc gõ mã số thuế).',
      '• Chọn khoảng thời gian (từ ngày - đến ngày).',
      '• Nhấn "Tải Hoá Đơn" để bắt đầu.',
      '• Nếu hệ thống yêu cầu captcha, một hộp thoại sẽ hiện ra để bạn nhập mã captcha.',
      '• Quá trình tải có thể mất vài phút, vui lòng chờ cho đến khi hoàn tất.',
      '',
      '🔍 Tải theo số hoá đơn:',
      '• Nhập số hoá đơn cụ thể cần tải.',
      '• Hệ thống sẽ tìm và tải hoá đơn đó về.',
      '',
      '📄 Tải theo mã tra cứu:',
      '• Nhập mã tra cứu của hoá đơn (nếu có).',
      '',
      'Sau khi tải thành công, hoá đơn sẽ được lưu vào hệ thống và hiển thị trong tab "Lịch Sử".',
    ],
  },
  {
    id: 'history',
    icon: FileText,
    title: 'Lịch Sử Hoá Đơn',
    content: [
      'Tab "Lịch Sử" hiển thị tất cả hoá đơn đã tải về hệ thống.',
      'Bạn có thể:',
      '• Tìm kiếm hoá đơn theo số hoá đơn, mã số thuế, hoặc ngày tháng.',
      '• Xem chi tiết hoá đơn (thông tin người bán, người mua, hàng hoá, thuế).',
      '• Kiểm tra trạng thái chữ ký số của hoá đơn.',
      '• Xuất dữ liệu hoá đơn ra file Excel.',
    ],
  },
  {
    id: 'schedules',
    icon: CalendarDays,
    title: 'Đặt Lịch Tải Định Kỳ',
    content: [
      'Tính năng "Đặt Lịch" cho phép bạn tự động tải hoá đơn theo lịch trình định kỳ.',
      'Các bước tạo lịch:',
      '• Chọn doanh nghiệp cần tải hoá đơn định kỳ.',
      '• Chọn tần suất: Hàng ngày, Hàng tuần, Hàng tháng.',
      '• Chọn khung giờ thực hiện.',
      '• Nhấn "Tạo Lịch" để kích hoạt.',
      '',
      'Bạn có thể quản lý (sửa, xoá, bật/tắt) các lịch đã tạo trong danh sách bên dưới.',
      'Hệ thống sẽ tự động chạy đúng lịch và gửi thông báo kết quả.',
    ],
  },
  {
    id: 'companies',
    icon: Building2,
    title: 'Quản Lý Doanh Nghiệp',
    content: [
      'Quản trị viên có thể thêm, sửa, xoá thông tin doanh nghiệp.',
      'Mỗi doanh nghiệp cần có:',
      '• Mã số thuế (bắt buộc).',
      '• Tên doanh nghiệp.',
      '• Mật khẩu đăng nhập GDT (được mã hoá an toàn).',
      '• Email (tuỳ chọn, dùng để nhận thông báo).',
      '',
      'Thông tin doanh nghiệp được dùng để tải hoá đơn tự động qua API GDT.',
    ],
  },
  {
    id: 'tax-lookup',
    icon: Search,
    title: 'Tra Cứu Mã Số Thuế',
    content: [
      'Công cụ tra cứu mã số thuế giúp bạn kiểm tra thông tin doanh nghiệp nhanh chóng.',
      'Chỉ cần nhập mã số thuế, hệ thống sẽ tra cứu và hiển thị:',
      '• Tên doanh nghiệp (bằng tiếng Việt và tiếng Anh nếu có).',
      '• Địa chỉ trụ sở chính.',
      '• Ngày thành lập.',
      '• Trạng thái hoạt động.',
      '• Ngành nghề kinh doanh chính.',
    ],
  },
  {
    id: 'api-config',
    icon: Key,
    title: 'Cấu Hình API Key',
    content: [
      'Quản trị viên có thể cấu hình các API key cần thiết cho hệ thống:',
      '• API key tra cứu mã số thuế (nếu sử dụng dịch vụ bên thứ ba).',
      '• Các cấu hình khác liên quan đến tích hợp.',
    ],
  },
  {
    id: 'user-management',
    icon: Users,
    title: 'Quản Lý Thành Viên',
    content: [
      'Quản trị viên có thể quản lý tài khoản người dùng:',
      '• Thêm tài khoản mới (cung cấp tên đăng nhập, mật khẩu, phân quyền).',
      '• Sửa thông tin tài khoản (đặt lại mật khẩu, thay đổi quyền).',
      '• Vô hiệu hoá hoặc xoá tài khoản.',
    ],
  },
  {
    id: 'feedback',
    icon: MessageSquare,
    title: 'Góp Ý',
    content: [
      'Chúng tôi luôn hoan nghênh mọi ý kiến đóng góp từ người dùng.',
      'Bạn có thể gửi phản hồi qua tab "Góp Ý" với các thông tin:',
      '• Tiêu đề góp ý.',
      '• Nội dung chi tiết.',
      '• Đính kèm hình ảnh (tuỳ chọn) để minh hoạ.',
      'Các ý kiến sẽ được quản trị viên xem xét và phản hồi.',
    ],
  },
  {
    id: 'notes',
    icon: AlertTriangle,
    title: 'Lưu Ý Quan Trọng',
    content: [
      '⚠️ Captcha: Khi tải hoá đơn, hệ thống API GDT có thể yêu cầu nhập captcha. Vui lòng kiểm tra và nhập captcha kịp thời để quá trình tải không bị gián đoạn.',
      '⚠️ Phiên làm việc GDT: Mỗi doanh nghiệp cần có mật khẩu GDT hợp lệ. Mật khẩu được mã hoá và lưu trữ an toàn trong hệ thống.',
      '⚠️ Giới hạn tải: Hệ thống API GDT có thể có giới hạn về số lượng yêu cầu trong một khoảng thời gian. Vui lòng không tải quá nhiều hoá đơn cùng lúc.',
      '⚠️ Kết nối Internet: Tính năng tải hoá đơn và tra cứu mã số thuế yêu cầu kết nối Internet ổn định.',
      '⚠️ Phiên bản: Luôn cập nhật phiên bản mới nhất của phần mềm để có trải nghiệm tốt nhất. Xem tab "Changelog" để biết các thay đổi.',
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Hướng Dẫn Sử Dụng</h2>
          <p className="text-sm text-muted-foreground">
            Tổng quan các tính năng và cách sử dụng Invoice Pro
          </p>
        </div>
      </div>

      <Separator />

      {/* Nội dung từng mục */}
      <div className="space-y-6">
        {sections.map((section) => {
          const Icon = section.icon;
          const contents = Array.isArray(section.content) ? section.content : [section.content];

          return (
            <Card key={section.id} id={section.id} className="scroll-mt-20">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                </div>
                <CardDescription className="sr-only">
                  Hướng dẫn mục {section.title}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 text-sm text-muted-foreground leading-relaxed">
                  {contents.map((line, i) => (
                    line === '' ? <br key={i} /> : <p key={i}>{line}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
