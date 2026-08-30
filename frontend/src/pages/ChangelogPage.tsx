import { GitCommit } from 'lucide-react'

export interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: 'v1.6.0',
    date: '2026-08-30',
    changes: [
      'Bảo vệ vai trò SUPER_ADMIN: chỉ SUPER_ADMIN mới được sửa, xoá, đổi trạng thái hoặc gán quyền SUPER_ADMIN; chặn ADMIN tự nâng cấp quyền',
      'Đăng nhập thủ công GDT: hiển thị ảnh captcha ngay trong hộp thoại, hỗ trợ tạo captcha mới khi khó đọc',
      'Không còn hiển thị token thô của doanh nghiệp, thay bằng trạng thái đăng nhập (có token / hết hạn) để tăng bảo mật',
      'Nút “Tải lại HĐ lỗi” luôn hiển thị trên trang danh sách hoá đơn (vô hiệu hoá khi chưa chọn hoá đơn)',
      'Sửa lỗi lọc hoá đơn theo ngày: tính trọn cả ngày bắt đầu và kết thúc theo múi giờ Việt Nam',
      'Sửa lỗi hoá đơn không có file ZIP không còn là mục tải lại được khi GDT không trả chi tiết items',
      'Cập nhật hướng dẫn sử dụng cho luồng đăng nhập thủ công captcha của doanh nghiệp',
    ],
  },
  {
    version: 'v1.5.0',
    date: '2025-08-01',
    changes: [
      'Thêm chức năng hẹn giờ tải hoá đơn tự động (Schedules)',
      'Thêm khả năng huỷ tác vụ tải đang chạy',
      'Cải thiện quá trình tải: tải hoá đơn theo từng ngày trong khoảng thời gian',
      'Tự động delay giữa các yêu cầu để tránh lỗi 429 từ GDT',
      'Việt hoá giao diện: sidebar, trang đăng nhập, quên mật khẩu',
      'Thêm kiểm soát truy cập theo doanh nghiệp cho người dùng',
      'Dịch trang Roles và Users sang tiếng Việt',
      'Cập nhật logo thương hiệu nhất quán',
    ],
  },
  {
    version: 'v1.4.0',
    date: '2025-07-28',
    changes: [
      'Thêm xác nhận ghi đè / bỏ qua / phiên bản mới khi tải hoá đơn đã tồn tại',
      'Cải thiện cấu trúc thư mục lưu hoá đơn',
      'Tích hợp Gotenberg để xuất PDF từ HTML',
      'Thêm chức năng tải file ZIP hàng loạt',
      'Thêm Serve Static cho backend để phục vụ frontend',
    ],
  },
  {
    version: 'v1.3.0',
    date: '2025-07-15',
    changes: [
      'Thêm chức năng xuất danh sách hoá đơn ra Excel (XLSX)',
      'Thêm preview hoá đơn trực tiếp trên trình duyệt',
      'Thêm component Company Autocomplete để chọn doanh nghiệp nhanh',
      'Thêm bộ lọc theo ngày cho trang danh sách hoá đơn',
      'Thêm chức năng tải lại hoá đơn bị lỗi',
      'Sửa lỗi phân trang trong DataTable',
      'Cập nhật giao diện DataTable cho Download Tasks',
    ],
  },
  {
    version: 'v1.2.0',
    date: '2025-07-05',
    changes: [
      'Thêm quản lý doanh nghiệp: thêm/sửa/xoá, tra cứu mã số thuế tự động',
      'Đăng nhập GDT tự động qua Gemini AI giải captcha',
      'Đăng nhập thủ công khi captcha phức tạp',
      'Xem danh sách hoá đơn đã tải với bộ lọc và phân trang',
      'Theo dõi tiến trình tải theo thời gian thực (SSE)',
    ],
  },
  {
    version: 'v1.1.0',
    date: '2025-06-20',
    changes: [
      'Thêm hệ thống quản lý người dùng, vai trò và quyền hạn',
      'Xác thực JWT với Access Token và Refresh Token',
      'Giao diện sidebar với phân nhóm chức năng',
      'Trang Dashboard với thống kê tổng quan',
      'Trang hồ sơ người dùng',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2025-06-01',
    changes: [
      'Phiên bản đầu tiên',
      'Chức năng tải hoá đơn từ hệ thống GDT (Tổng cục Thuế)',
      'Giao diện cơ bản với React + shadcn/ui',
      'Backend NestJS + Prisma + SQLite',
    ],
  },
]

export function ChangelogPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <GitCommit className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Changelog</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Lịch sử thay đổi và cập nhật của Invoice Pro
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[19px] top-2 bottom-0 w-px bg-border" />

        <div className="space-y-10">
          {changelog.map((entry) => (
            <div key={entry.version} className="relative pl-12">
              {/* Timeline dot */}
              <div className="absolute left-[12px] top-1.5 flex size-4 items-center justify-center rounded-full bg-primary/20 ring-4 ring-background">
                <div className="size-2 rounded-full bg-primary" />
              </div>

              {/* Version header */}
              <div className="flex items-baseline gap-3 mb-3">
                <h2 className="text-lg font-bold">{entry.version}</h2>
                <time className="text-sm text-muted-foreground">
                  {new Date(entry.date).toLocaleDateString('vi-VN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </div>

              {/* Changes */}
              <ul className="space-y-1.5">
                {entry.changes.map((change, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 block size-1.5 shrink-0 rounded-full bg-primary/60" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
