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
} = require('docx');

async function generateDocx() {
  const primaryColor = '1E40AF'; // Deep Blue
  const secondaryColor = '2563EB'; // Royal Blue
  const codeBgColor = 'F3F4F6'; // Light Gray
  const textDark = '1F2937';

  // Helper for text runs
  const text = (str, opts = {}) =>
    new TextRun({
      text: str,
      font: 'Calibri',
      size: 22, // 11pt
      color: textDark,
      ...opts,
    });

  const bold = (str, opts = {}) => text(str, { bold: true, ...opts });

  const codeRun = (str) =>
    new TextRun({
      text: str,
      font: 'Consolas',
      size: 19, // 9.5pt
      color: '1F2937',
    });

  // Helper for code block paragraphs
  const codeBlock = (lines) => {
    return lines.map(
      (line) =>
        new Paragraph({
          children: [codeRun(line || ' ')],
          spacing: { before: 40, after: 40, line: 240 },
          shading: {
            type: ShadingType.CLEAR,
            fill: codeBgColor,
          },
          border: {
            left: { style: BorderStyle.SINGLE, size: 24, color: primaryColor },
          },
          indent: { left: 360, right: 360 },
        }),
    );
  };

  const h1 = (title) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: title,
          font: 'Calibri',
          size: 32, // 16pt
          bold: true,
          color: primaryColor,
        }),
      ],
      spacing: { before: 360, after: 140 },
    });

  const h2 = (title) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: title,
          font: 'Calibri',
          size: 26, // 13pt
          bold: true,
          color: secondaryColor,
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
          font: 'Calibri',
          size: 23, // 11.5pt
          bold: true,
          color: '374151',
        }),
      ],
      spacing: { before: 180, after: 60 },
    });

  const bullet = (runs) =>
    new Paragraph({
      bullet: { level: 0 },
      children: runs,
      spacing: { before: 60, after: 60 },
    });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', color: textDark },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1 inch margins
          },
        },
        children: [
          // Document Header / Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'KỊCH BẢN TRIỂN KHAI HỆ THỐNG INVOICE PRO',
                font: 'Calibri',
                size: 40, // 20pt
                bold: true,
                color: primaryColor,
              }),
            ],
            spacing: { before: 0, after: 100 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Hướng Dẫn Cấu Hình Máy Chủ Thật (Production), Cloudflare HTTPS SSL & Reverse Proxy',
                font: 'Calibri',
                size: 24, // 12pt
                italic: true,
                color: '4B5563',
              }),
            ],
            spacing: { before: 0, after: 80 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Hỗ trợ: Ubuntu Server (Linux) & Windows Server | Tối ưu Cloudflare Proxy | Ngày: 27/09/2026',
                font: 'Calibri',
                size: 20, // 10pt
                color: '6B7280',
              }),
            ],
            spacing: { before: 0, after: 300 },
          }),

          // Divider
          new Paragraph({
            children: [
              new TextRun({
                text: '_________________________________________________________________________________',
                color: 'D1D5DB',
              }),
            ],
            spacing: { before: 0, after: 200 },
          }),

          // 1. System Requirements
          h1('1. Yêu Cầu Máy Chủ & Chuẩn Bị Tên Miền'),
          bullet([bold('Hệ điều hành hỗ trợ: '), text('Ubuntu Server (20.04, 22.04, 24.04 LTS) hoặc Windows Server (2019, 2022).')]),
          bullet([bold('Phần cứng khuyến nghị: '), text('Tối thiểu 2 CPU Cores, 4GB RAM (khuyến nghị 4GB - 8GB), 40GB+ ổ cứng SSD.')]),
          bullet([bold('Cổng kết nối Firewall: '), text('Mở Port 80 (HTTP) và Port 443 (HTTPS) ra ngoài Internet.')]),
          bullet([bold('Tên miền qua Cloudflare: '), text('Tạo bản ghi A Record, bật đám mây cam (Proxied) trỏ về IP Public của máy chủ.')]),

          // 2. Cloudflare SSL Setup
          h1('2. Cấu Hình HTTPS Trên Cloudflare (Cực Kỳ Quan Trọng)'),
          new Paragraph({
            children: [
              text('Khi dùng Cloudflare làm Proxy bảo mật (đám mây cam), hãy thực hiện 2 bước sau để tránh lỗi và không phải gia hạn chứng chỉ định kỳ:'),
            ],
            spacing: { before: 60, after: 120 },
          }),

          h2('2.1 Chọn chế độ mã hóa SSL/TLS: Full (Strict)'),
          bullet([text('Vào Dashboard Cloudflare -> Chọn tên miền -> Mục '), bold('SSL/TLS'), text('.')]),
          bullet([text('Chọn chế độ: '), bold('Full (Strict)'), text(' (hoặc Full).')]),
          bullet([bold('LƯU Ý QUAN TRỌNG: '), text('Tuyệt đối KHÔNG chọn "Flexible" vì sẽ gây lỗi vòng lặp chuyển hướng vô tận (ERR_TOO_MANY_REDIRECTS).')]),

          h2('2.2 Tạo chứng chỉ Cloudflare Origin Certificate (Hạn 15 Năm)'),
          new Paragraph({
            children: [
              text('Cloudflare cung cấp chứng chỉ máy chủ gốc miễn phí có hạn tới 15 năm, không cần cài đặt Certbot gia hạn 3 tháng/lần:'),
            ],
            spacing: { before: 60, after: 80 },
          }),
          bullet([text('Vào '), bold('SSL/TLS -> Origin Server'), text(' -> Bấm '), bold('Create Certificate'), text('.')]),
          bullet([text('Giữ nguyên mặc định (RSA 2048, Validity: 15 years) -> Bấm '), bold('Create'), text('.')]),
          bullet([text('Copy nội dung '), bold('Origin Certificate'), text(' và lưu vào file trên máy chủ: '), codeRun('/etc/ssl/cloudflare/invoice.crt')]),
          bullet([text('Copy nội dung '), bold('Private Key'), text(' và lưu vào file trên máy chủ: '), codeRun('/etc/ssl/cloudflare/invoice.key')]),
          bullet([text('Phân quyền file an toàn trên Ubuntu: '), codeRun('sudo chmod 600 /etc/ssl/cloudflare/invoice.key')]),

          // 3. Ubuntu Server
          h1('3. Kịch Bản Triển Khai Trên Ubuntu Server'),

          h2('Phương Pháp 1: Docker Compose + Nginx (Chuẩn Production)'),

          h3('Bước 1: Cài đặt Docker & Nginx trên Ubuntu'),
          ...codeBlock([
            'sudo apt update && sudo apt upgrade -y',
            'sudo apt install -y curl git nginx docker.io docker-compose-v2',
            'sudo systemctl enable --now docker',
          ]),

          h3('Bước 2: Clone source code & tạo file môi trường .env'),
          ...codeBlock([
            'cd /var/www',
            'sudo git clone <URL_REPO_CUA_BAN> tool-invoice',
            'cd tool-invoice',
            'sudo cp backend/.env.example backend/.env',
            'sudo nano backend/.env',
          ]),
          bullet([bold('APP_URL: '), text('https://invoice.yourcompany.com (Bắt buộc dùng domain HTTPS)')]),
          bullet([bold('JWT_ACCESS_SECRET / JWT_REFRESH_SECRET: '), text('Tạo chuỗi ngẫu nhiên: '), codeRun('openssl rand -hex 32')]),
          bullet([bold('GOOGLE_SERVICE_ACCOUNT_JSON / FOLDER_ID: '), text('Cấu hình để tự động sao lưu dữ liệu lên Google Drive.')]),

          h3('Bước 3: Cấu hình Nginx với Cloudflare Real IP & Origin SSL'),
          new Paragraph({
            children: [
              text('File cấu hình mẫu trong '),
              codeRun('deploy/nginx/tool-invoice.conf'),
              text(' đã tích hợp sẵn toàn bộ dải IP của Cloudflare để khôi phục IP thật của người dùng (CF-Connecting-IP) và cấu hình SSL 15 năm.'),
            ],
            spacing: { before: 40, after: 60 },
          }),
          ...codeBlock([
            'sudo cp deploy/nginx/tool-invoice.conf /etc/nginx/sites-available/tool-invoice.conf',
            'sudo nano /etc/nginx/sites-available/tool-invoice.conf',
            '# Thay server_name thành domain thật của bạn: invoice.yourcompany.com',
            '',
            'sudo ln -s /etc/nginx/sites-available/tool-invoice.conf /etc/nginx/sites-enabled/',
            'sudo nginx -t',
            'sudo systemctl reload nginx',
          ]),

          h3('Bước 4: Khởi chạy hệ thống bằng Docker Compose'),
          ...codeBlock([
            'sudo docker compose up -d --build',
            'sudo docker compose ps',
          ]),

          h2('Phương Pháp 2: Triển Khai Native Bằng PM2 (Không Dùng Docker)'),
          ...codeBlock([
            '# 1. Cài đặt Node.js 22 LTS và PM2',
            'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -',
            'sudo apt install -y nodejs',
            'sudo npm install -g pm2',
            '',
            '# 2. Khởi động Gotenberg (HTML -> PDF converter)',
            'docker run -d --name gotenberg --restart unless-stopped -p 3001:3000 gotenberg/gotenberg:8',
            '',
            '# 3. Chạy script triển khai tự động',
            'cd /var/www/tool-invoice',
            'bash deploy/ubuntu/deploy-pm2.sh',
            '',
            '# 4. Lưu cấu hình PM2 tự bật lại khi server reboot',
            'pm2 startup',
            'pm2 save',
          ]),

          // 4. Windows Server
          h1('4. Kịch Bản Triển Khai Trên Windows Server'),
          new Paragraph({
            children: [
              text('Trên Windows Server (2019/2022), bạn chỉ cần kết hợp '),
              bold('PM2 (Node.js runtime)'),
              text(' và '),
              bold('Caddy Server (Reverse Proxy)'),
              text('. Caddy nhẹ hơn IIS rất nhiều và hỗ trợ chứng chỉ Cloudflare Origin SSL cực kỳ đơn giản.'),
            ],
            spacing: { before: 60, after: 120 },
          }),

          h3('Bước 1: Cài đặt Node.js, Git & PM2 trên Windows Server'),
          bullet([text('Cài đặt Node.js 22 LTS từ: '), bold('https://nodejs.org')]),
          bullet([text('Cài đặt Git for Windows từ: '), bold('https://git-scm.com')]),
          bullet([text('Mở PowerShell (Administrator) và cài PM2: '), codeRun('npm install -g pm2')]),

          h3('Bước 2: Cài đặt Caddy Web Server'),
          bullet([text('Tải file executable Caddy Windows 64-bit từ: '), bold('https://caddyserver.com/download')]),
          bullet([text('Đổi tên file thành '), codeRun('caddy.exe'), text(' và lưu vào thư mục '), codeRun('C:\\caddy\\')]),
          bullet([text('Thêm đường dẫn '), codeRun('C:\\caddy'), text(' vào biến môi trường Path của Windows.')]),

          h3('Bước 3: Tải mã nguồn & Chạy ứng dụng trên Windows'),
          ...codeBlock([
            'Set-Location D:\\Projects',
            'git clone <URL_REPO> tool-invoice',
            'Set-Location tool-invoice',
            'Copy-Item backend\\.env.example backend\\.env',
            'notepad backend\\.env',
            '# Chỉnh sửa APP_URL=https://invoice.yourcompany.com, JWT Secret...',
            '',
            '# Chạy script build và start tự động:',
            'powershell -ExecutionPolicy Bypass -File deploy\\windows\\deploy-pm2.ps1',
          ]),

          h3('Bước 4: Chạy Gotenberg (Engine chuyển đổi PDF)'),
          ...codeBlock([
            'docker run -d --name gotenberg --restart unless-stopped -p 3001:3000 gotenberg/gotenberg:8',
          ]),

          h3('Bước 5: Kích hoạt HTTPS với Cloudflare trên Caddy'),
          new Paragraph({
            children: [
              text('Cấu hình file '),
              codeRun('deploy/caddy/Caddyfile'),
              text(' trỏ tới chứng chỉ Cloudflare Origin Certificate:'),
            ],
            spacing: { before: 40, after: 40 },
          }),
          ...codeBlock([
            'invoice.yourcompany.com {',
            '    tls C:/ssl/cloudflare/invoice.crt C:/ssl/cloudflare/invoice.key',
            '    encode zstd gzip',
            '    reverse_proxy 127.0.0.1:3000 {',
            '        transport http {',
            '            response_header_timeout 3600s',
            '        }',
            '    }',
            '}',
          ]),
          new Paragraph({
            children: [
              text('Khởi động Caddy Server chạy nền:'),
            ],
            spacing: { before: 40, after: 40 },
          }),
          ...codeBlock([
            'caddy start --config deploy\\caddy\\Caddyfile',
          ]),

          // 5. Firewall
          h1('5. Cấu Hình Tường Lửa Bảo Mật (Firewall Security)'),
          new Paragraph({
            children: [
              text('Chỉ mở cổng 80 và 443 ra ngoài Internet. Các cổng nội bộ (3000, 3001, 9000) được đóng chặt để bảo vệ server:'),
            ],
            spacing: { before: 60, after: 80 },
          }),
          h2('Trên Ubuntu Server (UFW):'),
          ...codeBlock([
            'sudo ufw allow 22/tcp',
            'sudo ufw allow 80/tcp',
            'sudo ufw allow 443/tcp',
            'sudo ufw enable',
          ]),
          h2('Trên Windows Server (PowerShell Administrator):'),
          ...codeBlock([
            'New-NetFirewallRule -DisplayName "Allow HTTP 80" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow',
            'New-NetFirewallRule -DisplayName "Allow HTTPS 443" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow',
          ]),

          // 6. Update Script
          h1('6. Kịch Bản Cập Nhật Khi Có Phiên Bản Mới (1 Lệnh Duy Nhất)'),
          bullet([bold('Trên Ubuntu Server (Docker): '), codeRun('cd /var/www/tool-invoice && bash deploy/ubuntu/deploy-docker.sh')]),
          bullet([bold('Trên Ubuntu Server (PM2): '), codeRun('cd /var/www/tool-invoice && bash deploy/ubuntu/deploy-pm2.sh')]),
          bullet([bold('Trên Windows Server: '), codeRun('powershell -ExecutionPolicy Bypass -File deploy\\windows\\deploy-pm2.ps1')]),

          // Footer note
          new Paragraph({
            children: [
              new TextRun({
                text: 'Tài liệu được tạo tự động cho dự án Invoice Pro. Bản quyền thuộc về đội ngũ phát triển.',
                font: 'Calibri',
                size: 18,
                italic: true,
                color: '9CA3AF',
              }),
            ],
            spacing: { before: 300, after: 0 },
            alignment: AlignmentType.CENTER,
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
