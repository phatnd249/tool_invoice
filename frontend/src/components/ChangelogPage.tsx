import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Gift, Plus, ArrowUp, Bug, AlertTriangle } from 'lucide-react';

interface ChangelogEntry {
  version: string;
  date: string;
  type: 'major' | 'minor' | 'patch';
  changes: {
    type: 'added' | 'improved' | 'fixed' | 'deprecated';
    description: string;
  }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-07-25',
    type: 'minor',
    changes: [
      { type: 'added', description: 'Thêm trang Hướng Dẫn Sử Dụng và Changelog.' },
      { type: 'added', description: 'Tuỳ chọn ghi đè hoặc tạo bản sao khi tải hoá đơn trùng qua lịch định kỳ.' },
      { type: 'improved', description: 'Đổi input giờ trong đặt lịch thành dropdown.' },
      { type: 'improved', description: 'Hiển thị lỗi chi tiết khi refresh token GDT thất bại.' },
      { type: 'fixed', description: 'Sửa lỗi header trong bảng lịch biểu.' },
    ],
  },
  {
    version: '1.0.2',
    date: '2026-07-18 ~ 2026-07-24',
    type: 'patch',
    changes: [
      { type: 'fixed', description: 'Chỉ retry khi HTTP 429, không retry lỗi 5xx.' },
      { type: 'fixed', description: 'Chọn đúng endpoint GDT export-excel (không thêm sold/purchase path).' },
      { type: 'fixed', description: 'Loại bỏ auto refresh health check API GDT.' },
      { type: 'improved', description: 'Refactor giao diện với shadcn-ui, thay thế sidebar.' },
      { type: 'improved', description: 'Cập nhật giao diện đặt lịch: hỗ trợ nhiều công ty và lịch chạy một lần.' },
      { type: 'improved', description: 'Thêm date picker trong Invoice Downloader.' },
      { type: 'improved', description: 'Hiển thị thông tin đồng bộ doanh nghiệp từ masothue.com.' },
      { type: 'improved', description: 'Thêm bộ lọc công ty trong danh sách hoá đơn.' },
      { type: 'improved', description: 'Gộp request query GDT từ 8 luồng ttxly xuống còn 2.' },
      { type: 'improved', description: 'Cập nhật indicator trạng thái hệ thống thành API GDT health.' },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-07-04 ~ 2026-07-18',
    type: 'patch',
    changes: [
      { type: 'added', description: 'Tính năng tải đồng thời cả hoá đơn mua và bán (BOTH).' },
      { type: 'added', description: 'Tải Excel report từ GDT song song với ZIP.' },
      { type: 'added', description: 'Rate limiting và retry khi tải hoá đơn.' },
      { type: 'added', description: 'Quản lý doanh nghiệp riêng (tách thành trang riêng).' },
      { type: 'added', description: 'Cấu hình npm workspaces monorepo.' },
      { type: 'added', description: 'Tra cứu mã số thuế doanh nghiệp.' },
      { type: 'added', description: 'Góp ý và phản hồi từ người dùng.' },
      { type: 'added', description: 'Xác thực người dùng (authentication) và phân quyền.' },
      { type: 'added', description: 'Trang cấu hình API Key (Gemini).' },
      { type: 'fixed', description: 'Ngăn false logout khi gặp lỗi captcha/auth GDT.' },
      { type: 'fixed', description: 'Cập nhật tên file đã tải đúng cấu trúc.' },
      { type: 'improved', description: 'Chuyển từ Electron App thành Local Web App (Vercel Pkg).' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-21 ~ 2026-07-04',
    type: 'major',
    changes: [
      { type: 'added', description: 'Khởi tạo dự án với backend TypeScript, Prisma.' },
      { type: 'added', description: 'Tải hoá đơn từ GDT: downloader, parser XML, Excel export.' },
      { type: 'added', description: 'Tổ chức thư mục lưu trữ theo tên công ty - mã số thuế.' },
      { type: 'added', description: 'Tự động giải captcha bằng Gemini AI.' },
      { type: 'added', description: 'Token GDT caching và auto-renew.' },
      { type: 'added', description: 'Giao diện HTML/Tailwind demo.' },
      { type: 'added', description: 'Đóng gói Electron App.' },
      { type: 'fixed', description: 'Fix lỗi parse Excel sheet name trùng.' },
      { type: 'fixed', description: 'Fix lỗi parse XML tags có attributes.' },
    ],
  },
];

const typeConfig = {
  added: {
    icon: Plus,
    label: 'Thêm mới',
    color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800',
  },
  improved: {
    icon: ArrowUp,
    label: 'Cải tiến',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
  },
  fixed: {
    icon: Bug,
    label: 'Sửa lỗi',
    color: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800',
  },
  deprecated: {
    icon: AlertTriangle,
    label: 'Ngưng sử dụng',
    color: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800',
  },
};

const versionColor = {
  major: 'bg-blue-500 hover:bg-blue-600',
  minor: 'bg-emerald-500 hover:bg-emerald-600',
  patch: 'bg-amber-500 hover:bg-amber-600',
};

const versionLabel = {
  major: 'Major Release',
  minor: 'Minor Release',
  patch: 'Hotfix / Patch',
};

export default function ChangelogPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Gift className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Changelog</h2>
          <p className="text-sm text-muted-foreground">
            Lịch sử các phiên bản và thay đổi của Invoice Pro
          </p>
        </div>
      </div>

      <Separator />

      {/* Danh sách phiên bản */}
      <div className="space-y-6">
        {changelog.map((entry, index) => (
          <Card key={entry.version} className="relative">
            {/* Timeline line (except last) */}
            {index < changelog.length - 1 && (
              <div className="absolute left-8 top-20 bottom-0 w-px bg-border hidden sm:block" />
            )}

            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-3">
                  {/* Version dot on timeline */}
                  <div
                    className={`hidden sm:flex size-4 shrink-0 rounded-full border-2 border-background ${versionColor[entry.type]} ring-2 ring-background`}
                  />
                  <CardTitle className="text-xl font-bold tracking-tight">
                    v{entry.version}
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold uppercase tracking-wider ${versionColor[entry.type]} text-white border-0`}
                  >
                    {versionLabel[entry.type]}
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground pl-7 sm:pl-0">
                  {entry.date}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 pl-7 sm:pl-0">
                {entry.changes.map((change, i) => {
                  const config = typeConfig[change.type];
                  const Icon = config.icon;
                  return (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${config.color}`}
                      >
                        <Icon className="h-3 w-3" />
                      </span>
                      <span className="text-muted-foreground leading-relaxed pt-px">
                        <span className="font-medium text-foreground">{config.label}:</span>{' '}
                        {change.description}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer */}
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground italic">
          Luôn cập nhật phiên bản mới nhất để có trải nghiệm tốt nhất 🚀
        </p>
      </div>
    </div>
  );
}
