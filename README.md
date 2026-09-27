# Invoice Download Tool

Công cụ tải hoá đơn điện tử từ Tổng cục Thuế (GDT), hỗ trợ tải ZIP/XML/PDF, xem trước hoá đơn, export Excel.

## Yêu cầu

- Node.js 20+ và npm
- [Gotenberg](https://gotenberg.dev) — convert HTML → PDF (chạy Docker)

> SQLite được tích hợp sẵn qua `@libsql/client`, không cần cài riêng.

## Hướng dẫn nhanh

```bash
npm install
cd backend
npx prisma migrate deploy
npx prisma generate
npx tsx prisma/seed.ts
cd ..
npm run dev
```

## Cài đặt

```bash
# 1. Cài dependencies cho toàn bộ workspace (backend + frontend)
npm install
npm install --prefix backend
npm install --prefix frontend

# 2. Tạo file .env từ mẫu
cp backend/.env.example backend/.env

# 3. Setup database
cd backend
npx prisma generate
npx prisma migrate dev
npx prisma db seed
cd ..
```

## Cấu hình .env

File `backend/.env` — các biến bắt buộc và quan trọng:

| Biến | Mô tả | Bắt buộc |
|------|-------|----------|
| `JWT_ACCESS_SECRET` | Khóa ký JWT access token | Có |
| `JWT_REFRESH_SECRET` | Khóa ký JWT refresh token | Có |
| `GEMINI_API_KEY` | API key Gemini để giải captcha khi đăng nhập GDT | Có |
| `GDT_BASE_URL` | API endpoint của Tổng cục Thuế | Có |
| `GOTENBERG_URL` | URL dịch vụ Gotenberg convert PDF | Có |

Các biến còn lại đã có giá trị mặc định:

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | `3000` | Cổng backend |
| `APP_URL` | `http://localhost:5173` | URL frontend (dùng cho CORS) |
| `DATABASE_URL` | `file:./prisma/dev.db` | Đường dẫn SQLite |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Thời hạn access token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Thời hạn refresh token |
| `INVOICES_DIR` | `./invoices` | Thư mục lưu file ZIP/XML/PDF |
| `SMTP_HOST` | — | SMTP server (để trống = log ra console) |
| `FEEDBACK_TO_EMAIL` | — | Email nhận feedback |

### Gotenberg (PDF)

```bash
docker run -d --name gotenberg -p 3001:3000 gotenberg/gotenberg:8
```

## Development

```bash
# Chạy đồng thời backend + frontend
npm run dev

# Hoặc chạy riêng
npm run dev:backend   # NestJS dev server (port 3000)
npm run dev:frontend  # Vite dev server (port 5173)
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

## Build & Deploy

```bash
# Build backend + frontend, copy frontend vào backend/public/
npm run build

# Chạy production
NODE_ENV=production npm run start
```

Ở chế độ production, backend serve frontend từ `backend/public/`.

## Database

```bash
# Tạo migration từ thay đổi schema
npx prisma migrate dev --name <tên>

# Deploy migration (production)
npx prisma migrate deploy

# Reset database (xoá toàn bộ dữ liệu)
npx prisma migrate reset

# Seed dữ liệu mẫu
npx prisma db seed

# Mở Prisma Studio xem dữ liệu
npx prisma studio
```

> Chạy trong thư mục `backend/` hoặc thêm `--prefix backend`.

## Cấu trúc thư mục

```
├── backend/               # NestJS backend
│   ├── prisma/            # Schema + migrations + seed
│   │   └── schema.prisma
│   └── src/
│       ├── auth/          # Xác thực, phân quyền, JWT
│       ├── backup/        # Sao lưu tự động lên Google Drive
│       ├── invoices/      # Tải/xử lý hoá đơn, XML, PDF, Excel
│       ├── company/       # Quản lý doanh nghiệp
│       ├── common/        # Utilities dùng chung
│       └── prisma/        # Prisma service
├── frontend/              # React + Vite frontend
│   └── src/
├── .env.example           # Mẫu biến môi trường
└── package.json           # Workspace root
```

## Cấu hình Google Drive Backup

Hệ thống hỗ trợ tự động sao lưu database và file hoá đơn lên Google Drive theo lịch trình.

### Bước 1: Tạo Google Service Account

1. **Truy cập Google Cloud Console**: https://console.cloud.google.com/
2. **Chọn hoặc tạo Project**:
   - Click vào dropdown project phía trên
   - Chọn project có sẵn hoặc "New Project"
3. **Tạo Service Account**:
   - Vào menu → **IAM & Admin** → **Service Accounts**
   - Click **Create Service Account**
   - Điền tên (ví dụ: `invoice-backup`)
   - Click **Create and Continue**
   - Role: có thể bỏ qua (không cần role vì chỉ dùng Drive API)
   - Click **Done**

### Bước 2: Tạo và Download JSON Key

1. Click vào service account vừa tạo
2. Tab **Keys** → **Add Key** → **Create new key**
3. Chọn **JSON** → **Create**
4. File JSON sẽ được tự động download (ví dụ: `my-project-abc123.json`)

### Bước 3: Tạo thư mục Google Drive

1. Vào Google Drive: https://drive.google.com/
2. Tạo thư mục mới cho backup (ví dụ: "Invoice Backups")
3. Mở thư mục và copy **Folder ID** từ URL:
   ```
   https://drive.google.com/drive/folders/1D1oZQ2yIOT9Ya7A661pKrT4Nks8xCAg4
                                           ↑ Đây là Folder ID
   ```

### Bước 4: Share thư mục với Service Account

⚠️ **QUAN TRỌNG** - Nếu không thực hiện bước này, backup sẽ lỗi 403!

1. Mở file JSON key đã download ở Bước 2
2. Tìm field `"client_email"`, copy email (dạng `xxx@xxx.iam.gserviceaccount.com`)
3. Quay lại thư mục Google Drive đã tạo
4. Click **Share** (hoặc biểu tượng người + dấu cộng)
5. Paste email service account vào
6. Chọn quyền: **Editor** (Người chỉnh sửa)
7. **Bỏ tick** "Notify people" (không cần gửi email)
8. Click **Share**

### Bước 5: Cấu hình trong .env

Mở file `backend/.env` và thêm:

```env
# 1. Paste Folder ID từ bước 3
GOOGLE_DRIVE_FOLDER_ID=1D1oZQ2yIOT9Ya7A661pKrT4Nks8xCAg4

# 2. Paste TOÀN BỘ nội dung file JSON từ bước 2
# Có thể để trên 1 dòng (xóa xuống dòng) hoặc giữ nguyên format nhiều dòng
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"my-project-123","private_key_id":"abc...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n","client_email":"invoice-backup@my-project-123.iam.gserviceaccount.com",...}

# 3. Tùy chỉnh lịch backup (optional)
BACKUP_AUTO_ENABLED=true
BACKUP_CRON_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_COUNT=7
```

### Bước 6: Test kết nối

Khởi động backend và test:

```bash
cd backend
npm run dev

# Test API (cần đăng nhập trước để lấy JWT token)
curl -X POST http://localhost:4000/api/backup/test-connection \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Hoặc dùng Postman/Frontend để gọi endpoint `/api/backup/test-connection`

**Response thành công:**
```json
{
  "success": true,
  "message": "Kết nối thành công đến thư mục \"Invoice Backups\" trên Google Drive",
  "folderName": "Invoice Backups",
  "folderId": "1D1oZQ2yIOT9Ya7A661pKrT4Nks8xCAg4",
  "clientEmail": "invoice-backup@my-project-123.iam.gserviceaccount.com"
}
```

### Backup Endpoints

- `GET /api/backup/config` - Xem cấu hình và trạng thái backup
- `POST /api/backup/test-connection` - Kiểm tra kết nối Google Drive
- `POST /api/backup/trigger` - Chạy backup ngay (manual)
- `GET /api/backup/history` - Lịch sử backup
- `GET /api/backup/drive-files` - Danh sách file backup trên Drive
- `DELETE /api/backup/drive-files/:fileId` - Xóa file backup
- `GET /api/backup/drive-files/:fileId/download` - Tải file backup về

### Lịch trình tự động

Khi đã cấu hình đầy đủ, hệ thống sẽ tự động:
- Backup vào lúc 02:00 sáng mỗi ngày (mặc định)
- Đóng gói database + toàn bộ thư mục invoices vào file ZIP
- Upload lên Google Drive
- Giữ lại 7 bản backup mới nhất (xóa bản cũ hơn)

Có thể thay đổi lịch trình bằng `BACKUP_CRON_SCHEDULE`:
```env
BACKUP_CRON_SCHEDULE="0 */6 * * *"   # Mỗi 6 giờ
BACKUP_CRON_SCHEDULE="0 0 * * 0"     # Chủ nhật hàng tuần
BACKUP_CRON_SCHEDULE="0 3 1 * *"     # Ngày 1 mỗi tháng
```

### Troubleshooting

**Lỗi 404 - Folder not found:**
- Kiểm tra lại Folder ID có đúng không
- Đảm bảo thư mục chưa bị xóa

**Lỗi 403 - Permission denied:**
- Kiểm tra đã Share thư mục với service account chưa
- Email service account phải khớp với `client_email` trong JSON
- Quyền phải là "Editor" (không phải "Viewer")

**Lỗi JSON parse:**
- Kiểm tra JSON có hợp lệ không (dùng jsonlint.com)
- Đảm bảo copy đúng file từ Google Cloud (không sửa đổi)
- Nếu để trên nhiều dòng trong .env, đảm bảo format đúng

**Backup không chạy tự động:**
- Kiểm tra `BACKUP_AUTO_ENABLED=true`
- Xem logs khi khởi động: "Đã kích hoạt lịch sao lưu Google Drive tự động"
- Kiểm tra cron expression có hợp lệ không


