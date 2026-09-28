const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  PageNumber,
  PageBreak,
} = require('docx');

async function generateDocx() {
  // Enterprise Theme Colors
  const primaryNavy = '0F2744';     // Deep Corporate Navy
  const royalBlue = '1D4ED8';       // Rich Royal Blue
  const accentBlue = '3B82F6';      // Vivid Blue
  const slateDark = '1E293B';       // Slate 800 (Headings)
  const textBody = '334155';        // Slate 700 (Body Text)
  const textMuted = '64748B';       // Slate 500 (Footers/Hints)
  const codeBg = 'F8FAFC';          // Slate 50 (Code Block Background)
  const borderLight = 'E2E8F0';     // Slate 200 (Borders)
  const borderHeader = 'CBD5E1';    // Slate 300
  const zebraBg = 'F8FAFC';         // Table row alternating

  // Typography helper
  const text = (str, opts = {}) =>
    new TextRun({
      text: str,
      font: 'Segoe UI',
      size: 21, // 10.5pt
      color: textBody,
      ...opts,
    });

  const bold = (str, opts = {}) => text(str, { bold: true, ...opts });
  const italic = (str, opts = {}) => text(str, { italic: true, ...opts });

  const codeInline = (str) =>
    new TextRun({
      text: ` ${str} `,
      font: 'Consolas',
      size: 19, // 9.5pt
      color: '0F2744',
      bold: true,
      shading: {
        type: ShadingType.CLEAR,
        fill: 'F1F5F9',
      },
    });

  const codeRun = (str) =>
    new TextRun({
      text: str,
      font: 'Consolas',
      size: 19, // 9.5pt
      color: '1E293B',
    });

  // Code Block Paragraphs with left accent border and shaded background
  const codeBlock = (lines) => {
    return lines.map(
      (line) =>
        new Paragraph({
          children: [codeRun(line || ' ')],
          spacing: { before: 30, after: 30, line: 240 },
          shading: {
            type: ShadingType.CLEAR,
            fill: codeBg,
          },
          border: {
            left: { style: BorderStyle.SINGLE, size: 24, color: royalBlue },
          },
          indent: { left: 280, right: 280 },
        }),
    );
  };

  // Modern Callout / Alert Box
  const callout = (title, contentLines, type = 'info') => {
    let borderColor = royalBlue;
    let bgColor = 'EFF6FF';
    let titleColor = '1E40AF';
    let icon = 'ℹ️ ';

    if (type === 'warning') {
      borderColor = 'D97706';
      bgColor = 'FFFBEB';
      titleColor = '92400E';
      icon = '⚠️ ';
    } else if (type === 'danger') {
      borderColor = 'DC2626';
      bgColor = 'FEF2F2';
      titleColor = '991B1B';
      icon = '🛑 ';
    } else if (type === 'success') {
      borderColor = '059669';
      bgColor = 'ECFDF5';
      titleColor = '065F46';
      icon = '✅ ';
    }

    const cellParagraphs = [];
    if (title) {
      cellParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${icon}${title}`,
              font: 'Segoe UI',
              size: 21,
              bold: true,
              color: titleColor,
            }),
          ],
          spacing: { before: 0, after: 60 },
        }),
      );
    }

    const lines = Array.isArray(contentLines) ? contentLines : [contentLines];
    lines.forEach((line) => {
      cellParagraphs.push(
        new Paragraph({
          children: typeof line === 'string' ? [text(line)] : line,
          spacing: { before: 20, after: 40 },
        }),
      );
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.SINGLE, size: 36, color: borderColor },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: bgColor, type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 200, right: 200 },
              children: cellParagraphs,
            }),
          ],
        }),
      ],
    });
  };

  // Beautiful Table Builder
  const createTable = (headers, rows, colWidths = []) => {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: borderHeader },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: borderHeader },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: borderLight },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map((h, i) =>
            new TableCell({
              shading: { fill: primaryNavy, type: ShadingType.CLEAR },
              margins: { top: 140, bottom: 140, left: 160, right: 160 },
              width: colWidths[i] ? { size: colWidths[i], type: WidthType.PERCENTAGE } : undefined,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: h,
                      font: 'Segoe UI',
                      size: 20,
                      bold: true,
                      color: 'FFFFFF',
                    }),
                  ],
                  spacing: { before: 0, after: 0 },
                }),
              ],
            }),
          ),
        }),
        ...rows.map((row, rIdx) =>
          new TableRow({
            children: row.map((cell, cIdx) =>
              new TableCell({
                shading: rIdx % 2 === 1 ? { fill: zebraBg, type: ShadingType.CLEAR } : undefined,
                margins: { top: 110, bottom: 110, left: 160, right: 160 },
                width: colWidths[cIdx] ? { size: colWidths[cIdx], type: WidthType.PERCENTAGE } : undefined,
                children: [
                  new Paragraph({
                    children: Array.isArray(cell) ? cell : [text(cell)],
                    spacing: { before: 0, after: 0 },
                  }),
                ],
              }),
            ),
          }),
        ),
      ],
    });
  };

  // Heading Builders
  const h1 = (title) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: title,
          font: 'Segoe UI',
          size: 30, // 15pt
          bold: true,
          color: primaryNavy,
        }),
      ],
      spacing: { before: 360, after: 140 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: accentBlue },
      },
    });

  const h2 = (title) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: title,
          font: 'Segoe UI',
          size: 25, // 12.5pt
          bold: true,
          color: royalBlue,
        }),
      ],
      spacing: { before: 260, after: 100 },
    });

  const h3 = (title) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [
        new TextRun({
          text: title,
          font: 'Segoe UI',
          size: 22, // 11pt
          bold: true,
          color: slateDark,
        }),
      ],
      spacing: { before: 180, after: 60 },
    });

  const bullet = (runs) =>
    new Paragraph({
      bullet: { level: 0 },
      children: runs,
      spacing: { before: 50, after: 50 },
    });

  const p = (runs) =>
    new Paragraph({
      children: Array.isArray(runs) ? runs : [text(runs)],
      spacing: { before: 60, after: 80 },
    });

  // Construct Document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Segoe UI', color: textBody },
        },
      },
    },
    sections: [
      // =========================================================================
      // SECTION 1: PROFESSIONAL COVER PAGE (Trang Bìa)
      // =========================================================================
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children: [
          new Paragraph({ spacing: { before: 400, after: 0 } }),

          // Category Badge
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'HỆ THỐNG QUẢN LÝ HÓA ĐƠN DOANH NGHIỆP — INVOICE PRO',
                font: 'Segoe UI',
                size: 20,
                bold: true,
                color: royalBlue,
              }),
            ],
            spacing: { before: 0, after: 160 },
          }),

          // Main Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'KỊCH BẢN TRIỂN KHAI VẬN HÀNH\nMÁY CHỦ THẬT (PRODUCTION)',
                font: 'Segoe UI',
                size: 44, // 22pt
                bold: true,
                color: primaryNavy,
              }),
            ],
            spacing: { before: 100, after: 200 },
          }),

          // Subtitle
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Hướng Dẫn Toàn Diện Cấu Hình HTTPS Cloudflare, Reverse Proxy, Bảo Mật Hệ Thống, Docker/PM2, Sao Lưu Google Drive & Xử Lý Sự Cố',
                font: 'Segoe UI',
                size: 22,
                italic: true,
                color: textMuted,
              }),
            ],
            spacing: { before: 0, after: 600 },
          }),

          // Metadata Table
          new Table({
            width: { size: 90, type: WidthType.PERCENTAGE },
            alignment: AlignmentType.CENTER,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 12, color: royalBlue },
              bottom: { style: BorderStyle.SINGLE, size: 12, color: royalBlue },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: borderLight },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 35, type: WidthType.PERCENTAGE },
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [bold('Dự án / Mã nguồn:')] })],
                  }),
                  new TableCell({
                    width: { size: 65, type: WidthType.PERCENTAGE },
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [text('Invoice Pro (tr1nh/tool-invoice)')] })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [bold('Phiên bản tài liệu:')] })],
                  }),
                  new TableCell({
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [text('v2.2 — Cập nhật đầy đủ 13 chuyên mục')] })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [bold('Ngày cập nhật:')] })],
                  }),
                  new TableCell({
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [text('Tháng 09/2026')] })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [bold('Hệ điều hành mục tiêu:')] })],
                  }),
                  new TableCell({
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [text('Ubuntu Server 20.04/22.04/24.04 LTS & Windows Server 2019/2022')] })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [bold('Cấp độ bảo mật:')] })],
                  }),
                  new TableCell({
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    children: [new Paragraph({ children: [text('Tài liệu nội bộ & Hướng dẫn kỹ thuật vận hành')] })],
                  }),
                ],
              }),
            ],
          }),

          new Paragraph({ spacing: { before: 800, after: 0 } }),

          // Cover Footer
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'HÀ NỘI — 2026',
                font: 'Segoe UI',
                size: 20,
                bold: true,
                color: textMuted,
              }),
            ],
          }),
        ],
      },

      // =========================================================================
      // SECTION 2: MAIN DOCUMENT BODY (Nội dung chi tiết 13 mục)
      // =========================================================================
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'INVOICE PRO — KỊCH BẢN TRIỂN KHAI VẬN HÀNH PRODUCTION',
                    font: 'Segoe UI',
                    size: 16,
                    color: textMuted,
                    bold: true,
                  }),
                ],
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 6, color: borderLight },
                },
                spacing: { after: 120 },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'Tài liệu lưu hành nội bộ  |  Trang ',
                    font: 'Segoe UI',
                    size: 18,
                    color: textMuted,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: 'Segoe UI',
                    size: 18,
                    color: primaryNavy,
                    bold: true,
                  }),
                  new TextRun({
                    text: ' / ',
                    font: 'Segoe UI',
                    size: 18,
                    color: textMuted,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    font: 'Segoe UI',
                    size: 18,
                    color: textMuted,
                  }),
                ],
                border: {
                  top: { style: BorderStyle.SINGLE, size: 6, color: borderLight },
                },
                spacing: { before: 120 },
              }),
            ],
          }),
        },
        children: [
          // Table of Contents Summary
          h1('MỤC LỤC & TỔNG QUAN NỘI DUNG TRIỂN KHAI'),
          p('Tài liệu hướng dẫn triển khai hệ thống Invoice Pro bao gồm 13 chuyên đề cốt lõi, được chuẩn hóa theo tiêu chuẩn DevOps & Production Security:'),

          createTable(
            ['STT', 'Chuyên mục', 'Nền tảng áp dụng', 'Mô tả nội dung tóm tắt'],
            [
              ['1', 'Yêu Cầu Máy Chủ & Tên Miền', 'Ubuntu / Windows', 'Cấu hình phần cứng, cổng mạng, DNS A-Record Cloudflare'],
              ['2', 'Cấu Hình HTTPS Cloudflare', 'Cloudflare Proxy', 'Full (Strict) SSL, tạo Origin Certificate hạn 15 năm'],
              ['3', 'Triển Khai Ubuntu (Docker Compose)', 'Ubuntu Server', 'Cài đặt Docker, Nginx Reverse Proxy, chạy full container stack'],
              ['4', 'Triển Khai Ubuntu (PM2 Native)', 'Ubuntu Server', 'Node.js 22 LTS, Gotenberg container, cấu hình PM2 daemon'],
              ['5', 'Triển Khai Windows Server', 'Windows Server', 'PowerShell deploy script, Caddy reverse proxy, Gotenberg PDF'],
              ['6', 'Cấu Hình Tường Lửa (Firewall)', 'UFW / Win Defender', 'Quy tắc mở cổng 80/443 và cô lập các cổng nội bộ 3000, 9000'],
              ['7', 'Kịch Bản Cập Nhật Bản Mới', 'Mọi nền tảng', 'Cập nhật 1 lệnh tự động kéo Git, migrate DB và rebuild ứng dụng'],
              ['8', 'Bảo Mật & Gia Cố Hệ Thống', 'Security Hardening', 'Tạo JWT Secrets ngẫu nhiên mạnh, phân quyền .env, đổi mật khẩu'],
              ['9', 'Quản Trị Dữ Liệu & Volume', 'Docker / SQLite', 'Cấu trúc thư mục dữ liệu, backup volume Docker, migration máy chủ'],
              ['10', 'Sao Lưu & Phục Hồi Google Drive', 'Disaster Recovery', 'Backup Incremental & Chunking, cấu hình Cron, quy trình Restore'],
              ['11', 'Giám Sát Hệ Thống & Logs', 'Monitoring', 'Kiểm tra Healthcheck /api/health, theo dõi dung lượng SQLite, Logs'],
              ['12', 'Tự Khởi Động Khi Server Reboot', 'Auto-Startup', 'Thiết lập PM2 systemd (Ubuntu) và Windows Service (pm2-windows)'],
              ['13', 'Xử Lý Sự Cố & Checklist Go-Live', 'Troubleshooting', 'Bảng tra cứu 8 lỗi thường gặp & Checklist 12 tiêu chí nghiệm thu'],
            ],
            [8, 28, 20, 44],
          ),

          new Paragraph({ spacing: { before: 200, after: 0 } }),

          // ---------------------------------------------------------------------
          // 1. Yêu Cầu Máy Chủ & Tên Miền
          // ---------------------------------------------------------------------
          h1('1. Yêu Cầu Máy Chủ & Chuẩn Bị Tên Miền'),
          p('Trước khi bắt đầu triển khai, đảm bảo máy chủ đáp ứng đầy đủ các thông số tài nguyên và điều kiện mạng dưới đây:'),

          createTable(
            ['Thành phần', 'Cấu hình tối thiểu', 'Cấu hình khuyến nghị', 'Ghi chú kỹ thuật'],
            [
              ['Hệ điều hành', 'Ubuntu 20.04 LTS / Win 2019', 'Ubuntu 22.04/24.04 LTS / Win 2022', 'Ưu tiên Ubuntu LTS cho hiệu năng cao nhất'],
              ['Vi xử lý (CPU)', '2 Cores', '4 Cores trở lên', 'Xử lý parse XML hóa đơn & chuyển đổi PDF'],
              ['Bộ nhớ (RAM)', '4 GB RAM', '8 GB RAM', 'Node.js build stack & Gotenberg Chromium memory'],
              ['Ổ đĩa cứng', 'SSD 40 GB', 'SSD 80 GB+ NVMe', 'Lưu trữ tệp SQLite database và tệp hóa đơn XML/PDF'],
              ['Cổng kết nối', 'Mở 80, 443 ra ngoài', 'Khóa tất cả cổng nội bộ khác', 'Quản trị từ xa qua SSH (22) hoặc RDP (3389)'],
            ],
            [20, 25, 25, 30],
          ),

          h2('1.1 Cấu hình bản ghi DNS trên Cloudflare:'),
          bullet([bold('Loại bản ghi: '), text('A Record')]),
          bullet([bold('Tên miền phụ (Name): '), text('invoice (ví dụ: invoice.yourcompany.com)')]),
          bullet([bold('Địa chỉ IPv4: '), text('<Địa chỉ IP Public của máy chủ>')]),
          bullet([bold('Trạng thái Proxy: '), text('Bật đám mây cam (🟠 Proxied) để Cloudflare ẩn IP thật và chống DDoS.')]),

          // ---------------------------------------------------------------------
          // 2. HTTPS SSL Trên Cloudflare
          // ---------------------------------------------------------------------
          h1('2. Cấu Hình HTTPS Trên Cloudflare (Cực Kỳ Quan Trọng)'),
          p('Sử dụng Cloudflare làm Proxy mang lại 2 lợi ích vượt trội: bảo vệ an toàn máy chủ gốc và miễn phí chứng chỉ Origin SSL có hạn dùng tới 15 năm (không cần chạy Certbot gia hạn mỗi 90 ngày).'),

          h2('2.1 Chọn chế độ mã hóa SSL/TLS: Full (Strict)'),
          bullet([text('Truy cập Dashboard Cloudflare -> Chọn tên miền -> Vào mục '), bold('SSL/TLS'), text('.')]),
          bullet([text('Tại mục SSL/TLS encryption mode, chọn: '), bold('Full (Strict)'), text(' (hoặc Full).')]),

          callout(
            'Cảnh Báo Quan Trọng Về Chế Độ SSL Flexible',
            'Tuyệt đối KHÔNG chọn chế độ "Flexible". Chế độ này sẽ gây ra lỗi vòng lặp chuyển hướng vô tận (ERR_TOO_MANY_REDIRECTS) vì Nginx/Caddy nhận traffic HTTP nhưng Cloudflare lại redirect sang HTTPS liên tục.',
            'danger',
          ),

          h2('2.2 Tạo chứng chỉ Cloudflare Origin Certificate (Thời hạn 15 năm)'),
          bullet([text('Vào mục '), bold('SSL/TLS'), text(' -> '), bold('Origin Server'), text(' -> Bấm '), bold('Create Certificate'), text('.')]),
          bullet([text('Giữ nguyên các giá trị mặc định (RSA 2048, Hostnames: *.yourcompany.com, yourcompany.com, Validity: 15 years).')]),
          bullet([text('Bấm '), bold('Create'), text(', giao diện sẽ xuất hiện 2 khối mã chứng chỉ: ')]),
          bullet([bold('Origin Certificate: '), text('Lưu vào tệp '), codeInline('/etc/ssl/cloudflare/invoice.crt'), text(' (hoặc C:\\ssl\\cloudflare\\invoice.crt trên Windows).')]),
          bullet([bold('Private Key: '), text('Lưu vào tệp '), codeInline('/etc/ssl/cloudflare/invoice.key'), text(' (hoặc C:\\ssl\\cloudflare\\invoice.key trên Windows).')]),

          p('Khởi tạo thư mục và phân quyền chặt chẽ trên Ubuntu:'),
          ...codeBlock([
            'sudo mkdir -p /etc/ssl/cloudflare',
            'sudo chmod 600 /etc/ssl/cloudflare/invoice.key',
            'sudo chmod 644 /etc/ssl/cloudflare/invoice.crt',
          ]),

          // ---------------------------------------------------------------------
          // 3. Kịch Bản Ubuntu Docker Compose
          // ---------------------------------------------------------------------
          h1('3. Kịch Bản A: Triển Khai Trên Ubuntu Server (Docker Compose)'),
          p('Đây là phương án chuẩn Production được khuyến nghị nhất: đóng gói backend và engine Gotenberg trong container cách ly, quản lý reverse proxy qua Nginx.'),

          h2('Bước 1: Cài đặt Docker & Nginx'),
          ...codeBlock([
            'sudo apt update && sudo apt upgrade -y',
            'sudo apt install -y curl git nginx docker.io docker-compose-v2',
            'sudo systemctl enable --now docker',
            'sudo systemctl enable --now nginx',
          ]),

          h2('Bước 2: Tải mã nguồn & cấu hình biến môi trường'),
          ...codeBlock([
            'cd /var/www',
            'sudo git clone https://github.com/tr1nh/tool-invoice.git',
            'cd tool-invoice',
            'sudo cp backend/.env.example backend/.env',
            'sudo nano backend/.env',
          ]),

          callout(
            'Lưu Ý Bảo Mật Biến Môi Trường (.env)',
            [
              'Bắt buộc thiết lập APP_URL=https://invoice.yourcompany.com (dùng domain HTTPS thực tế).',
              'Bắt buộc tạo mới JWT_ACCESS_SECRET và JWT_REFRESH_SECRET ngẫu nhiên bằng lệnh: openssl rand -hex 32.',
              'Tuyệt đối không sử dụng khóa JWT mặc định trên môi trường Production.',
            ],
            'warning',
          ),

          h2('Bước 3: Kích hoạt Nginx Reverse Proxy'),
          ...codeBlock([
            'sudo cp deploy/nginx/tool-invoice.conf /etc/nginx/sites-available/tool-invoice.conf',
            'sudo nano /etc/nginx/sites-available/tool-invoice.conf  # Sửa server_name thành tên miền thật',
            'sudo ln -s /etc/nginx/sites-available/tool-invoice.conf /etc/nginx/sites-enabled/',
            'sudo nginx -t && sudo systemctl reload nginx',
          ]),

          h2('Bước 4: Build và khởi chạy Docker Stack'),
          ...codeBlock([
            'sudo docker compose down || true',
            'sudo docker compose up -d --build',
            'sudo docker compose ps',
          ]),

          // ---------------------------------------------------------------------
          // 4. Kịch Bản Ubuntu PM2 Native
          // ---------------------------------------------------------------------
          h1('4. Kịch Bản B: Triển Khai Trên Ubuntu Server (PM2 Native)'),
          p('Phương án chạy trực tiếp trên máy chủ không qua Docker container, phù hợp với VPS có cấu hình RAM hạn chế.'),

          h2('Bước 1: Cài đặt Node.js 22 LTS & PM2'),
          ...codeBlock([
            'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -',
            'sudo apt install -y nodejs build-essential',
            'sudo npm install -g pm2',
            'node -v  # Đảm bảo hiển thị v22.x.x',
          ]),

          h2('Bước 2: Khởi động Gotenberg (PDF Engine)'),
          ...codeBlock([
            'docker run -d --name gotenberg --restart unless-stopped -p 3001:3000 gotenberg/gotenberg:8',
          ]),

          h2('Bước 3: Chạy script triển khai tự động'),
          ...codeBlock([
            'cd /var/www/tool-invoice',
            'bash deploy/ubuntu/deploy-pm2.sh',
          ]),

          h2('Bước 4: Cấu hình PM2 tự khởi động cùng hệ thống'),
          ...codeBlock([
            'pm2 startup',
            '# Thực thi dòng lệnh env sudo do PM2 in ra màn hình',
            'pm2 save',
          ]),

          // ---------------------------------------------------------------------
          // 5. Kịch Bản Windows Server
          // ---------------------------------------------------------------------
          h1('5. Kịch Bản C: Triển Khai Trên Windows Server'),
          p('Triển khai trên hệ điều hành Windows Server 2019/2022 bằng PowerShell, PM2 và Caddy Server làm reverse proxy siêu nhẹ.'),

          h2('Bước 1: Chuẩn bị môi trường'),
          bullet([text('Cài đặt '), bold('Node.js 22 LTS'), text(' từ trang chủ nodejs.org.')]),
          bullet([text('Cài đặt '), bold('Git for Windows'), text(' từ trang chủ git-scm.com.')]),
          bullet([text('Mở PowerShell Administrator, chạy: '), codeInline('npm install -g pm2')]),

          h2('Bước 2: Cài đặt Caddy Server'),
          bullet([text('Tải '), codeInline('caddy.exe'), text(' về lưu tại thư mục '), codeInline('C:\\caddy\\caddy.exe')]),
          bullet([text('Thêm '), codeInline('C:\\caddy'), text(' vào biến môi trường Path của hệ thống.')]),

          h2('Bước 3: Chạy ứng dụng qua PowerShell'),
          ...codeBlock([
            'Set-Location D:\\Projects\\tool-invoice',
            'Copy-Item backend\\.env.example backend\\.env',
            'notepad backend\\.env  # Chỉnh sửa APP_URL và JWT secrets',
            'powershell -ExecutionPolicy Bypass -File deploy\\windows\\deploy-pm2.ps1',
          ]),

          h2('Bước 4: Kích hoạt HTTPS với Caddy'),
          p('Cấu hình tệp deploy\\caddy\\Caddyfile với chứng chỉ Cloudflare:'),
          ...codeBlock([
            'invoice.yourcompany.com {',
            '    tls C:/ssl/cloudflare/invoice.crt C:/ssl/cloudflare/invoice.key',
            '    encode zstd gzip',
            '    # Cổng 3000 cho PM2 native (hoặc 9000 nếu dùng Docker Compose trên Windows):',
            '    reverse_proxy 127.0.0.1:3000 {',
            '        transport http {',
            '            response_header_timeout 3600s',
            '        }',
            '    }',
            '}',
          ]),
          p('Khởi động Caddy chạy nền:'),
          ...codeBlock(['caddy start --config deploy\\caddy\\Caddyfile']),

          // ---------------------------------------------------------------------
          // 6. Firewall
          // ---------------------------------------------------------------------
          h1('6. Cấu Hình Tường Lửa Bảo Mật (Firewall Security)'),
          p('Nguyên tắc bất biến trong kiến trúc an ninh: Chỉ mở cổng 80 (HTTP) và 443 (HTTPS) ra Internet. Tất cả cổng backend nội bộ (3000, 9000, 3001) phải được đóng kín.'),

          h2('Trên Ubuntu Server (UFW):'),
          ...codeBlock([
            'sudo ufw allow 22/tcp   # Giữ kết nối SSH',
            'sudo ufw allow 80/tcp   # HTTP',
            'sudo ufw allow 443/tcp  # HTTPS',
            'sudo ufw enable',
            'sudo ufw status verbose',
          ]),

          h2('Trên Windows Server (PowerShell Administrator):'),
          ...codeBlock([
            'New-NetFirewallRule -DisplayName "Allow HTTP 80" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow',
            'New-NetFirewallRule -DisplayName "Allow HTTPS 443" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow',
          ]),

          // ---------------------------------------------------------------------
          // 7. Update Script
          // ---------------------------------------------------------------------
          h1('7. Kịch Bản Cập Nhật Bản Mới (1 Lệnh Tự Động Duy Nhất)'),
          p('Mỗi khi có phiên bản code mới được push lên Git, người quản trị chỉ cần chạy duy nhất 1 lệnh, script sẽ tự động kéo code, cài dependencies, migrate DB và khởi động lại dịch vụ không gián đoạn:'),

          createTable(
            ['Môi trường', 'Lệnh cập nhật duy nhất', 'Hành động tự động thực hiện'],
            [
              ['Ubuntu (Docker)', 'cd /var/www/tool-invoice && bash deploy/ubuntu/deploy-docker.sh', 'git pull -> docker compose build -> up -d'],
              ['Ubuntu (PM2)', 'cd /var/www/tool-invoice && bash deploy/ubuntu/deploy-pm2.sh', 'git pull -> npm install -> prisma migrate -> build -> pm2 reload'],
              ['Windows Server', 'powershell -ExecutionPolicy Bypass -File deploy\\windows\\deploy-pm2.ps1', 'git pull -> npm install -> prisma migrate -> build -> pm2 restart'],
            ],
            [22, 45, 33],
          ),

          // ---------------------------------------------------------------------
          // 8. Security Hardening
          // ---------------------------------------------------------------------
          h1('8. Bảo Mật & Gia Cố Hệ Thống (Security Hardening)'),

          h2('8.1 Sinh JWT Secret ngẫu nhiên mã hóa mạnh:'),
          p('Tuyệt đối không dùng secret đơn giản hoặc mặc định:'),
          ...codeBlock([
            '# Trên Ubuntu / Linux:',
            'openssl rand -hex 32',
            '',
            '# Trên Windows PowerShell:',
            "[System.BitConverter]::ToString((1..32 | % { Get-Random -Max 256 }) -as [byte[]]).Replace('-','').ToLower()",
          ]),
          p('Điền 2 chuỗi ngẫu nhiên khác nhau vào biến JWT_ACCESS_SECRET và JWT_REFRESH_SECRET trong tệp backend/.env.'),

          h2('8.2 Đổi mật khẩu Admin mặc định ngay sau khi seed:'),
          p('Sau khi chạy khởi tạo database ban đầu, tài khoản quản trị viên được cấp mật khẩu mặc định qua ADMIN_INITIAL_PASSWORD. Cần đăng nhập và đổi mật khẩu mới có độ phức tạp cao (tối thiểu 12 ký tự) ngay lập tức.'),

          h2('8.3 Phân quyền bảo mật tệp cấu hình trên Server:'),
          ...codeBlock([
            'sudo chmod 600 /var/www/tool-invoice/backend/.env  # Chỉ chủ sở hữu mới đọc được file bí mật',
          ]),

          // ---------------------------------------------------------------------
          // 9. Data & Volume
          // ---------------------------------------------------------------------
          h1('9. Quản Trị Dữ Liệu & Persistent Volumes (Docker)'),
          p('Khi triển khai bằng Docker Compose, toàn bộ dữ liệu nghiệp vụ được lưu trong volume có tên app_data:'),

          ...codeBlock([
            'app_data:/app/backend/data',
            '    ├── dev.db          ← SQLite database (toàn bộ dữ liệu hệ thống)',
            '    ├── dev.db-wal      ← SQLite Write-Ahead Logging journal',
            '    └── invoices/       ← Thư mục lưu tệp hóa đơn tải về (ZIP, XML, PDF)',
          ]),

          callout(
            'Quy Tắc Quản Trị Volume Sống Còn',
            'Lệnh docker compose down KHÔNG làm mất volume. Tuyệt đối KHÔNG chạy lệnh "docker compose down -v" vì cờ -v sẽ xóa sạch toàn bộ cơ sở dữ liệu và tệp hóa đơn!',
            'danger',
          ),

          h2('Lệnh sao lưu Volume Docker ra tệp nén:'),
          ...codeBlock([
            'docker run --rm -v tool-invoice_app_data:/data -v $(pwd):/backup alpine \\',
            '  tar czf /backup/data_backup_$(date +%Y%m%d).tar.gz -C /data .',
          ]),

          h2('Quy trình chuyển đổi (Migrate) dữ liệu sang server mới:'),
          ...codeBlock([
            '# 1. Tại server mới, khởi tạo volume trống:',
            'docker compose up -d && docker compose stop backend',
            '# 2. Bung dữ liệu tệp nén vào volume:',
            'docker run --rm -v tool-invoice_app_data:/data -v $(pwd):/backup alpine \\',
            '  sh -c "cd /data && tar xzf /backup/data_export.tar.gz"',
            '# 3. Khởi động lại backend:',
            'docker compose start backend',
          ]),

          // ---------------------------------------------------------------------
          // 10. Backup Google Drive
          // ---------------------------------------------------------------------
          h1('10. Quy Trình Sao Lưu & Phục Hồi Với Google Drive'),
          p('Hệ thống tích hợp sẵn module sao lưu đám mây Google Drive với 2 thuật toán tiên tiến: Incremental Backup (chỉ sao lưu tệp mới) và Chunking (tự động chia nhỏ tệp nếu vượt ngưỡng dung lượng).'),

          h2('10.1 Các bước thiết lập Google Drive Service Account:'),
          bullet([text('Bật '), bold('Google Drive API'), text(' cho project trên Google Cloud Console (APIs & Services -> Library -> Google Drive API -> Enable). BẮT BUỘC để tránh lỗi 403 SERVICE_DISABLED.')]),
          bullet([text('Truy cập Google Cloud Console -> IAM & Admin -> Service Accounts.')]),
          bullet([text('Tạo Service Account mới -> Tab Keys -> Add Key -> Tạo khóa định dạng '), bold('JSON'), text(' và tải về.')]),
          bullet([text('Tạo thư mục trên Google Drive cá nhân/doanh nghiệp (ví dụ: Invoice-Backups).')]),
          bullet([text('Chia sẻ thư mục đó cho email Service Account (field client_email trong file JSON) với quyền '), bold('Editor'), text('.')]),
          bullet([text('Lấy Folder ID trên thanh URL Google Drive: https://drive.google.com/drive/folders/'), bold('<FOLDER_ID>')]),

          h2('10.2 Cấu hình tệp backend/.env:'),
          ...codeBlock([
            'GOOGLE_DRIVE_FOLDER_ID=1D1oZQ2yIOT9Ya7A661pKrT4Nks8xCAg4',
            '# Chuỗi JSON phải trên 1 dòng, ký tự xuống dòng của private_key là \\n',
            'GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}',
            'BACKUP_AUTO_ENABLED=true',
            'BACKUP_CRON_SCHEDULE="0 2 * * *"   # Tự động sao lưu lúc 2:00 sáng mỗi ngày',
            'BACKUP_RETENTION_COUNT=7            # Duy trì 7 bản sao lưu gần nhất',
            'BACKUP_MODE=INCREMENTAL             # Sao lưu vi sai tối ưu băng thông',
            'BACKUP_MAX_CHUNK_SIZE_MB=15         # Tự động chia nhỏ nếu gói dữ liệu > 15MB',
          ]),

          p('Áp dụng cấu hình môi trường mới cho container Docker:'),
          ...codeBlock([
            'docker compose up -d --force-recreate backend',
            '# Kiểm tra log xác nhận: "Đã kích hoạt lịch sao lưu Google Drive tự động"',
          ]),

          callout(
            'Lưu Ý Kiểm Thử Backup',
            'Endpoint /api/backup/trigger luôn trả về HTTP 200 kể cả khi upload thất bại. Cần kiểm tra thuộc tính status và errorMessage trong response body (hoặc kiểm tra log container). Trên giao diện web KHÔNG có nút phục hồi (restore), thao tác khôi phục bắt buộc thực hiện thủ công trên server.',
            'warning',
          ),

          h2('10.3 Kịch bản khôi phục dữ liệu khi gặp sự cố (Disaster Recovery):'),
          ...codeBlock([
            '# 1. Tải tệp backup ZIP từ Google Drive về máy chủ',
            '# 2. Giải nén vào thư mục tạm (/tmp/restore):',
            'mkdir -p /tmp/restore && unzip invoice_backup_2026-09-28_02-00-00.zip -d /tmp/restore',
            '#    (Nếu backup chia nhiều part: giải nén toàn bộ part*.zip vào cùng thư mục)',
            '# 3. Tạm dừng dịch vụ backend:',
            'docker compose stop backend',
            '# 4. Ghi đè vào Named Volume Docker (KHÔNG copy vào backend/data/ trên host):',
            'docker cp /tmp/restore/database/dev.db backend:/app/backend/data/dev.db',
            'docker cp /tmp/restore/invoices/. backend:/app/backend/data/invoices/',
            '#    (Nếu chạy PM2 không Docker: cp /tmp/restore/database/dev.db backend/prisma/dev.db && cp -r /tmp/restore/invoices/* backend/invoices/)',
            '# 5. Khởi động lại (docker-entrypoint.sh tự động migrate schema):',
            'docker compose up -d backend',
            'curl -s http://localhost:9000/api     # Kiểm tra: phải trả "Hello World!"',
          ]),

          // ---------------------------------------------------------------------
          // 11. Monitoring
          // ---------------------------------------------------------------------
          h1('11. Giám Sát Hệ Thống & Theo Dõi Logs (Monitoring)'),

          h2('11.1 Kiểm tra trạng thái sức khỏe (Healthcheck):'),
          ...codeBlock([
            '# Xem trạng thái container Docker:',
            'docker inspect --format="{{.State.Health.Status}}" backend',
            '# Kiểm tra phản hồi trực tiếp:',
            'curl -s http://localhost:9000/api/health',
          ]),

          h2('11.2 Theo dõi dung lượng ổ cứng định kỳ:'),
          p('Cơ sở dữ liệu SQLite và thư mục invoices sẽ tăng dần theo số lượng hóa đơn phát sinh hàng tháng:'),
          ...codeBlock([
            '# Kiểm tra dung lượng volume Docker:',
            'docker exec backend du -sh /app/backend/data/',
            '# Kiểm tra trực tiếp trên máy host:',
            'du -sh backend/prisma/dev.db backend/invoices/',
          ]),

          h2('11.3 Giám sát Log thời gian thực:'),
          ...codeBlock([
            '# Đối với Docker Compose:',
            'docker compose logs -f backend --tail 100',
            '# Đối với PM2:',
            'pm2 logs invoice-backend --lines 100',
          ]),

          // ---------------------------------------------------------------------
          // 12. PM2 Auto Startup Windows
          // ---------------------------------------------------------------------
          h1('12. Thiết Lập Tự Động Khởi Động Khi Server Reboot'),
          p('Đảm bảo khi máy chủ vật lý khởi động lại (do mất điện hoặc cập nhật OS), các dịch vụ ứng dụng sẽ tự động chạy lại mà không cần sự can thiệp thủ công của kỹ trị viên.'),

          h2('Trên Ubuntu Server:'),
          ...codeBlock([
            'pm2 startup   # Tự động sinh cấu hình systemd service',
            'pm2 save      # Lưu trạng thái danh sách process hiện tại',
          ]),

          h2('Trên Windows Server:'),
          p('Windows không hỗ trợ lệnh pm2 startup mặc định. Thực hiện 1 trong 2 cách sau:'),
          bullet([bold('Cách 1 (Khuyên dùng): '), text('Cài đặt gói pm2-windows-startup:')]),
          ...codeBlock([
            'npm install -g pm2-windows-startup',
            'pm2-startup install',
            'pm2 save',
          ]),
          bullet([bold('Cách 2: '), text('Tạo Windows Service thông qua tiện ích NSSM (Non-Sucking Service Manager):')]),
          ...codeBlock([
            'nssm install InvoiceBackend "C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\Administrator\\AppData\\Roaming\\npm\\node_modules\\pm2\\bin\\pm2" resurrect',
            'nssm start InvoiceBackend',
          ]),

          // ---------------------------------------------------------------------
          // 13. Troubleshooting & Checklist
          // ---------------------------------------------------------------------
          h1('13. Xử Lý Sự Cố (Troubleshooting) & Checklist Nghiệm Thu'),

          h2('13.1 Bảng tra cứu và xử lý sự cố thường gặp:'),
          createTable(
            ['Hiện tượng / Mã lỗi', 'Nguyên nhân kỹ thuật', 'Biện pháp khắc phục triệt để'],
            [
              ['ERR_TOO_MANY_REDIRECTS', 'SSL Cloudflare đang đặt Flexible', 'Đổi sang Full (Strict) trong SSL/TLS Cloudflare Dashboard'],
              ['Backend crash khi vừa up', 'DB migration chưa chạy hoặc thiếu .env', 'Chạy "docker compose logs backend" để xem nguyên nhân cụ thể'],
              ['EACCES: permission denied', 'Chạy npm install bằng root user', 'Chạy: sudo chown -R $USER:$USER /var/www/tool-invoice'],
              ['Cổng 80/443/3000 bị chiếm', 'Process IIS hoặc web service khác đang giữ', 'Ubuntu: sudo lsof -i :80 | Windows: netstat -ano | findstr :80'],
              ['Backup Drive lỗi 403 Forbidden', 'Chưa phân quyền thư mục Google Drive', 'Share thư mục cho email client_email trong JSON quyền Editor'],
              ['JavaScript heap out of memory', 'Server thiếu RAM khi build TypeScript', 'Gán thêm: NODE_OPTIONS="--max-old-space-size=4096" npm run build'],
              ['Gotenberg timeout khi xuất PDF', 'File hóa đơn quá nặng hoặc container tắt', 'Kiểm tra container "gotenberg" có đang chạy ở cổng 3001 không'],
              ['PM2 mất app sau khi reboot Win', 'Chưa cấu hình khởi động tự động', 'Cài đặt pm2-windows-startup hoặc NSSM service theo Mục 12'],
            ],
            [26, 34, 40],
          ),

          new Paragraph({ spacing: { before: 200, after: 0 } }),

          h2('13.2 Checklist 12 tiêu chí nghiệm thu trước khi bàn giao (Go-Live Checklist):'),
          createTable(
            ['Mục', 'Tiêu chí kiểm tra', 'Trạng thái nghiệm thu', 'Ghi chú xác nhận'],
            [
              ['01', 'Cấu hình phần cứng tối thiểu 2 Cores, 4GB RAM, 40GB SSD', '[  ] ĐẠT', 'Kiểm tra htop / Task Manager'],
              ['02', 'Cài đặt phiên bản Node.js 22 LTS chuẩn xác', '[  ] ĐẠT', 'Chạy node -v kiểm tra'],
              ['03', 'Docker & Docker Compose hoạt động ổn định', '[  ] ĐẠT', 'Chạy docker info'],
              ['04', 'Tên miền đã trỏ DNS A Record qua Cloudflare (Proxied 🟠)', '[  ] ĐẠT', 'Kiểm tra ping và dig domain'],
              ['05', 'Cloudflare SSL đặt ở chế độ Full (Strict)', '[  ] ĐẠT', 'Kiểm tra Dashboard Cloudflare'],
              ['06', 'Chứng chỉ Origin Certificate 15 năm đã cài trên máy chủ', '[  ] ĐẠT', 'Kiểm tra tệp .crt và .key'],
              ['07', 'JWT Secret đã được sinh chuỗi ngẫu nhiên mạnh (không dùng mặc định)', '[  ] ĐẠT', 'Kiểm tra tệp backend/.env'],
              ['08', 'Tường lửa chỉ mở cổng 80, 443 (đóng 3000, 3001, 9000)', '[  ] ĐẠT', 'Kiểm tra ufw status'],
              ['09', 'Reverse Proxy (Nginx/Caddy) chuyển tiếp HTTPS trơn tru', '[  ] ĐẠT', 'Truy cập domain hiển thị khóa xanh'],
              ['10', 'Đã đổi mật khẩu quản trị viên (Admin) mặc định', '[  ] ĐẠT', 'Đăng nhập mật khẩu mới thành công'],
              ['11', 'Sao lưu tự động Google Drive đã kiểm tra kết nối thành công', '[  ] ĐẠT', 'Bấm nút Test kết nối trên Web'],
              ['12', 'Đã cấu hình tự khởi động lại khi máy chủ reboot', '[  ] ĐẠT', 'Kiểm tra systemd / PM2 service'],
            ],
            [8, 48, 18, 26],
          ),

          new Paragraph({ spacing: { before: 300, after: 0 } }),

          // Document Closing
          callout(
            'Xác Nhận Nghiệm Thu & Bàn Giao Kỹ Thuật',
            'Tài liệu này được áp dụng làm quy chuẩn triển khai chính thức cho dự án Invoice Pro. Đội ngũ kỹ thuật vận hành cần tuân thủ nghiêm ngặt các quy tắc an toàn bảo mật thông tin và lịch trình sao lưu định kỳ.',
            'success',
          ),

          new Paragraph({ spacing: { before: 300, after: 0 } }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: '— HẾT TÀI LIỆU —',
                font: 'Segoe UI',
                size: 20,
                bold: true,
                color: textMuted,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.resolve(__dirname, '..', 'deploy', 'KICH_BAN_DEPLOY_SERVER.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ File docx đã được tạo thành công tại: ${outputPath}`);
}

generateDocx().catch(console.error);
