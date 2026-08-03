import { BookOpen, Building2, Download, Search, Clock, AlertTriangle } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const sections = [
  {
    value: 'companies',
    icon: Building2,
    title: 'Quản lý doanh nghiệp',
    content: (
      <div className="space-y-3 text-muted-foreground">
        <p>
          Trang <strong>Doanh nghiệp</strong> cho phép bạn thêm, sửa, xoá và quản lý danh sách
          doanh nghiệp cần tải hoá đơn từ hệ thống GDT (Tổng cục Thuế).
        </p>
        <ol className="list-decimal ml-5 space-y-2">
          <li>
            <strong>Thêm doanh nghiệp:</strong> Nhấn nút <em>"Thêm doanh nghiệp"</em>, nhập mã số
            thuế và các thông tin đăng nhập GDT (tên đăng nhập, mật khẩu). Hệ thống sẽ tự động
            tra cứu tên doanh nghiệp từ mã số thuế.
          </li>
          <li>
            <strong>Đăng nhập thủ công:</strong> Nếu quá trình tự động gặp lỗi captcha, bạn có thể
            chọn <em>"Đăng nhập thủ công"</em> để nhập trực tiếp mã captcha hiển thị trên trang GDT.
          </li>
          <li>
            <strong>Kiểm tra trạng thái:</strong> Mỗi doanh nghiệp có trạng thái xác thực —
            <span className="text-green-600 font-medium"> đã xác thực</span> (có thể tải hoá đơn)
            hoặc <span className="text-red-600 font-medium">chưa xác thực</span> (cần đăng nhập lại).
          </li>
        </ol>
      </div>
    ),
  },
  {
    value: 'download',
    icon: Download,
    title: 'Tải hoá đơn',
    content: (
      <div className="space-y-3 text-muted-foreground">
        <p>
          Trang <strong>Tải hoá đơn</strong> là nơi bạn thực hiện tải hoá đơn từ hệ thống GDT về máy.
        </p>
        <ol className="list-decimal ml-5 space-y-2">
          <li>
            <strong>Chọn doanh nghiệp:</strong> Sử dụng ô tìm kiếm để chọn một hoặc nhiều doanh
            nghiệp từ danh sách đã được xác thực.
          </li>
          <li>
            <strong>Chọn khoảng thời gian:</strong> Chọn ngày bắt đầu và ngày kết thúc. Hệ thống sẽ
            tải hoá đơn theo từng ngày trong khoảng thời gian này.
          </li>
          <li>
            <strong>Tuỳ chọn xử lý trùng lặp:</strong>
            <ul className="list-disc ml-5 mt-1">
              <li><strong>Bỏ qua:</strong> Không tải nếu hoá đơn đã tồn tại</li>
              <li><strong>Ghi đè:</strong> Tải lại và ghi đè file cũ</li>
              <li><strong>Phiên bản mới:</strong> Giữ file cũ và tạo bản sao mới</li>
            </ul>
          </li>
          <li>
            <strong>Bắt đầu tải:</strong> Nhấn nút <em>"Tải hoá đơn"</em>. Tiến trình tải sẽ được
            hiển thị theo thời gian thực (số lượng đã tải, đang tải, lỗi).
          </li>
        </ol>
      </div>
    ),
  },
  {
    value: 'view-invoices',
    icon: Search,
    title: 'Xem hoá đơn đã tải',
    content: (
      <div className="space-y-3 text-muted-foreground">
        <p>
          Trang <strong>Hoá đơn đã tải</strong> hiển thị toàn bộ hoá đơn đã được tải thành công từ
          hệ thống GDT.
        </p>
        <ol className="list-decimal ml-5 space-y-2">
          <li>
            <strong>Lọc và tìm kiếm:</strong> Bạn có thể lọc theo doanh nghiệp, khoảng thời gian,
            ký hiệu hoá đơn, hoặc số hoá đơn.
          </li>
          <li>
            <strong>Xem chi tiết:</strong> Nhấn vào một hoá đơn để xem trước nội dung (preview)
            dưới dạng PDF ngay trên trình duyệt.
          </li>
          <li>
            <strong>Tải xuống:</strong> Bạn có thể tải từng hoá đơn riêng lẻ (file PDF) hoặc tải
            hàng loạt dưới dạng file ZIP.
          </li>
          <li>
            <strong>Xuất Excel:</strong> Sử dụng nút <em>"Xuất Excel"</em> để xuất danh sách hoá đơn
            ra file XLSX phục vụ báo cáo.
          </li>
        </ol>
      </div>
    ),
  },
  {
    value: 'history',
    icon: Clock,
    title: 'Xem lịch sử tải',
    content: (
      <div className="space-y-3 text-muted-foreground">
        <p>
          Trang <strong>Lịch sử tải</strong> ghi lại tất cả các tác vụ tải hoá đơn đã thực hiện.
        </p>
        <ol className="list-decimal ml-5 space-y-2">
          <li>
            <strong>Danh sách tác vụ:</strong> Mỗi tác vụ hiển thị: thời gian tạo, doanh nghiệp,
            trạng thái (đang chạy, hoàn thành, huỷ, lỗi), số lượng hoá đơn đã tải/thành công/lỗi.
          </li>
          <li>
            <strong>Huỷ tác vụ:</strong> Với các tác vụ đang chạy, bạn có thể nhấn nút
            <em> "Huỷ"</em> để dừng quá trình tải.
          </li>
          <li>
            <strong>Xem chi tiết lỗi:</strong> Với các tác vụ có lỗi, bạn có thể xem chi tiết từng
            lỗi để biết nguyên nhân (VD: lỗi mạng, sai thông tin đăng nhập, v.v.).
          </li>
        </ol>
      </div>
    ),
  },
  {
    value: 'schedule',
    icon: Clock,
    title: 'Lịch tải tự động',
    content: (
      <div className="space-y-3 text-muted-foreground">
        <p>
          Trang <strong>Lịch tải tự động</strong> cho phép bạn thiết lập tải hoá đơn định kỳ theo
          lịch trình.
        </p>
        <ol className="list-decimal ml-5 space-y-2">
          <li>
            <strong>Tạo lịch:</strong> Nhấn <em>"Tạo lịch"</em>, đặt tên, chọn tần suất (hàng ngày,
            hàng tuần, hàng tháng) và thời gian thực hiện.
          </li>
          <li>
            <strong>Gán doanh nghiệp:</strong> Sau khi tạo lịch, bạn cần gán các doanh nghiệp sẽ
            được tải tự động theo lịch này.
          </li>
          <li>
            <strong>Bật/tắt:</strong> Bạn có thể bật hoặc tắt từng lịch mà không cần xoá.
          </li>
        </ol>
      </div>
    ),
  },
  {
    value: 'errors',
    icon: AlertTriangle,
    title: 'Xử lý lỗi khi tải hoá đơn',
    content: (
      <div className="space-y-3 text-muted-foreground">
        <p>Một số lỗi thường gặp và cách khắc phục:</p>
        <ul className="list-disc ml-5 space-y-3">
          <li>
            <strong>Lỗi xác thực (401):</strong> Thông tin đăng nhập GDT của doanh nghiệp không
            chính xác hoặc đã hết hạn. Vào trang <em>Doanh nghiệp</em>, chọn doanh nghiệp và thực
            hiện đăng nhập lại (tự động hoặc thủ công).
          </li>
          <li>
            <strong>Lỗi captcha:</strong> Hệ thống GDT yêu cầu xác thực captcha. Sử dụng chức năng
            <em> "Đăng nhập thủ công"</em> để tự nhập captcha.
          </li>
          <li>
            <strong>Lỗi 429 (Too Many Requests):</strong> Hệ thống GDT giới hạn tần suất yêu cầu.
            Hệ thống đã tự động thêm độ trễ giữa các yêu cầu. Nếu vẫn gặp lỗi, hãy thử thu hẹp
            khoảng thời gian tải hoặc chờ vài phút rồi thử lại.
          </li>
          <li>
            <strong>Lỗi mạng:</strong> Kiểm tra kết nối internet. Nếu lỗi vẫn tiếp diễn, vào trang
            <em> Lịch sử tải</em>, chọn tác vụ bị lỗi và nhấn <em>"Tải lại hoá đơn lỗi"</em>.
          </li>
          <li>
            <strong>Không tìm thấy hoá đơn:</strong> Khoảng thời gian đã chọn có thể không có hoá
            đơn nào. Thử chọn khoảng thời gian khác hoặc kiểm tra lại kỳ kê khai thuế của doanh nghiệp.
          </li>
        </ul>
      </div>
    ),
  },
]

export function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <BookOpen className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hướng dẫn sử dụng</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Tìm hiểu cách sử dụng hệ thống Invoice Pro để tải và quản lý hoá đơn điện tử
          </p>
        </div>
      </div>

      {/* Guide sections */}
      <Accordion className="space-y-3">
        {sections.map((section) => (
          <AccordionItem
            key={section.value}
            value={section.value}
            className="rounded-xl border bg-card px-5"
          >
            <AccordionTrigger className="hover:no-underline py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                  <section.icon className="size-4 text-muted-foreground" />
                </div>
                <span className="font-semibold text-base">{section.title}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-5 pt-1 text-sm leading-relaxed">
              {section.content}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
