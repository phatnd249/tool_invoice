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

Hệ thống sử dụng duy nhất phương thức **Google OAuth 2.0** để kết nối và sao lưu tự động lên Google Drive:
- **Đăng nhập trực tiếp**: Đăng nhập 1 cú nhấp chuột bằng chính tài khoản Google của bạn trên trình duyệt, không cần quản lý file token hay JSON key.
- **Tự động tạo thư mục**: Hệ thống tự động tạo thư mục `Invoice_Pro_Backups` trên Google Drive và quản lý token ngầm.
- **Lịch chạy tự động tùy chỉnh trên Web**: Bạn có thể điều chỉnh tần suất sao lưu (hàng ngày, mỗi 6h, biểu thức Cron tùy ý), bật/tắt tự động, số bản lưu giữ (retention count) và chế độ sao lưu trực tiếp trên giao diện web (`/backup`) mà không cần sửa file `.env` hay restart máy chủ.

---

### Hướng dẫn cấu hình Google Drive OAuth 2.0 (Chi tiết từ A-Z)

Quá trình cấu hình gồm 4 bước đơn giản trên Google Cloud Console (chỉ cần làm một lần duy nhất, hoàn toàn miễn phí):

#### Bước 1: Tạo Project & Bật Google Drive API
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/) và đăng nhập tài khoản Google của bạn.
2. Tạo Project mới (hoặc chọn Project có sẵn): Bấm vào menu chọn Project ở thanh tiêu đề trên cùng > **New Project** (ví dụ đặt tên: `Invoice Pro Backup`) > **Create**.
3. Bật Google Drive API: Vào menu điều hướng **APIs & Services** > **Library** > Tìm từ khóa `Google Drive API` > Nhấn vào kết quả và bấm nút **Enable**.

#### Bước 2: Cấu hình OAuth Consent Screen (Màn hình xin phép)
Google yêu cầu cấu hình màn hình này trước khi tạo thông tin xác thực:
1. Vào **APIs & Services** > **OAuth consent screen**.
2. Mục **User Type**: Chọn **External** (để dùng được cho tài khoản cá nhân @gmail.com) > Nhấn **Create**.
3. Điền các trường cơ bản:
   - **App name**: `Invoice Pro`
   - **User support email**: Chọn email của bạn
   - **Developer contact information**: Nhập email của bạn
   - Bấm **Save and Continue**.
4. **Scopes (Phạm vi)**: Bấm **Add or Remove Scopes** > Tìm chọn `https://www.googleapis.com/auth/drive.file` hoặc `.../auth/drive` > Bấm **Update** > Bấm **Save and Continue**.
5. **Test users (Quan trọng)**: Bấm **Add Users** > Nhập tài khoản Gmail mà bạn sẽ dùng để đăng nhập sao lưu > Bấm **Save and Continue**.
   > 💡 **Mẹo:** Bạn **KHÔNG CẦN** phải nộp hồ sơ xin Google xác minh (Verify app) phức tạp. Chỉ cần giữ ứng dụng ở trạng thái **Testing** và thêm email của bạn vào danh sách **Test users** là có thể sử dụng vĩnh viễn và an toàn!

#### Bước 3: Tạo OAuth 2.0 Client ID & Secret
1. Vào **APIs & Services** > **Credentials** > Bấm **Create Credentials** ở trên cùng > Chọn **OAuth client ID**.
2. **Application type**: Chọn **Web application**.
3. **Name**: `Invoice Pro Web Client`.
4. **Authorized redirect URIs (Bắt buộc chính xác)**: Bấm **Add URI** và thêm đường dẫn chuyển hướng sau:
   - Chạy kiểm thử cục bộ: `http://localhost:5173/backup`
   - Chạy qua Docker Compose: `http://localhost:8080/backup`
   - Triển khai Production có domain riêng: `https://<domain-cua-ban>/backup`
5. Bấm **Create**. Một hộp thoại sẽ hiện ra hiển thị **Client ID** và **Client Secret**. Hãy sao chép 2 giá trị này.

#### Bước 4: Kết nối tài khoản Google trên giao diện Invoice Pro
1. Truy cập vào trang **Sao lưu Google Drive** (`/backup`) trên trình duyệt web của bạn.
2. Bấm nút **"Cài đặt OAuth"** (hoặc điền vào file `backend/.env`):
   ```env
   GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5173/backup
   ```
3. Bấm **"Lưu & Kết nối Google"** > Trình duyệt sẽ mở màn hình xác thực của Google:
   - Đăng nhập tài khoản Google của bạn (email đã thêm vào Test Users ở Bước 2).
   - Nếu Google hiển thị cảnh báo: *"Google hasn't verified this app" (Google chưa xác minh ứng dụng này)*: Hãy nhấn vào **Advanced (Nâng cao)** > Chọn **Go to Invoice Pro (unsafe) / Tiếp tục truy cập...**.
   - Tích chọn cho phép quyền truy cập Google Drive > Nhấn **Continue (Tiếp tục)**.
4. Hệ thống sẽ tự động hoàn tất đăng nhập, quay lại trang web và thông báo thành công! Thư mục `Invoice_Pro_Backups` sẽ được tự động tạo trên Google Drive của bạn.

---

### Quản lý lịch sao lưu & tối ưu băng thông trên Web UI
Trên trang **Sao lưu Google Drive** (`/backup`), bạn có thể điều chỉnh trực tiếp trên thẻ cấu hình:
- **Bật / Tắt**: Bật hoặc tắt tiến trình tự động sao lưu.
- **Tần suất chạy**: Chọn nhanh (02:00 sáng hàng ngày, 00:00 đêm, mỗi 6 tiếng, mỗi 12 tiếng, hàng tuần) hoặc nhập giờ cụ thể / biểu thức Cron tùy ý.
- **Số bản lưu giữ**: Tự động dọn dẹp các bản sao lưu cũ trên Google Drive khi vượt quá số lượng này (mặc định 7 bản).
- **Chế độ sao lưu**:
  - `INCREMENTAL` (Khuyên dùng): Chỉ sao lưu hóa đơn mới hoặc đã sửa đổi kể từ lần thành công trước đó (tiết kiệm băng thông tối đa).
  - `FULL`: Sao lưu toàn bộ tất cả hóa đơn từ trước đến nay.

### Bước 3: Áp dụng cấu hình & Khởi chạy

Nếu bạn cấu hình qua file `.env`, hãy khởi động lại container/service để nạp biến môi trường mới:

```bash
# Docker
docker compose up -d --force-recreate backend
docker logs backend | grep -i "sao lưu\|Drive"    # xác nhận đã kích hoạt lịch

# Local (PM2 / npm)
npm run dev:backend
```

### Bước 4: Kiểm tra kết nối

Bạn có thể nhấn nút **"Kiểm tra kết nối"** trực tiếp trên trang `/backup`, hoặc gọi qua API:

```bash
# Docker: app ở cổng HOST_PORT (mặc định 8080)
curl -X POST http://localhost:8080/api/backup/test-connection \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Local dev: theo PORT trong backend/.env (mặc định 4000)
curl -X POST http://localhost:4000/api/backup/test-connection \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

> ⚠️ `POST /api/backup/trigger` **luôn trả HTTP 200** kể cả khi thất bại — phải kiểm tra `status` / `errorMessage` trong **body**, không chỉ HTTP status.

**Response thành công:**
```json
{
  "success": true,
  "message": "Kết nối thành công đến thư mục \"Invoice_Pro_Backups\" trên Google Drive",
  "folderName": "Invoice_Pro_Backups",
  "folderId": "1D1oZQ2yIOT9Ya7A661pKrT4Nks8xCAg4",
  "clientEmail": "your-google-account@gmail.com"
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

### Tối ưu băng thông (chunking)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `BACKUP_MODE` | `INCREMENTAL` | `INCREMENTAL` chỉ đóng gói file hoá đơn mới/sửa kể từ lần backup **thành công** cuối. `FULL` luôn đóng gói toàn bộ. Database luôn được backup đầy đủ. |
| `BACKUP_MAX_CHUNK_SIZE_MB` | `15` | Tổng dữ liệu vượt ngưỡng này sẽ tự tách thành nhiều file `..._part01_of_0N.zip`. **Chỉ nhận số nguyên** (giá trị thập phân sẽ bị bỏ qua). |
| `BACKUP_CHUNK_DELAY_MS` | `2000` | Nghỉ giữa các lần upload từng phần để tránh chạm giới hạn Google Drive API. |

> ⚠️ **Với `BACKUP_MODE=INCREMENTAL`, việc khôi phục phải gộp TẤT CẢ các file backup từ lần thành công đầu tiên trở đi** (mỗi bản chỉ chứa phần *thay đổi*). Nếu cần bản sao lưu độc lập tại một thời điểm, dùng nút **"Backup toàn bộ"** trong UI (tương đương `isFullBackup: true`) hoặc đặt `BACKUP_MODE=FULL`.

### Troubleshooting

**Lỗi 404 - Folder not found:**
- Kiểm tra lại Folder ID có đúng không
- Đảm bảo thư mục chưa bị xóa

**Lỗi 403 - Permission denied:**
- Kiểm tra đã Share thư mục với service account chưa
- Email service account phải khớp với `client_email` trong JSON
- Quyền phải là "Editor" (không phải "Viewer")
- **Google Drive API chưa được Enable** cho project → lỗi `SERVICE_DISABLED` (xem Bước 1)

**Lỗi JSON parse:**
- Kiểm tra JSON có hợp lệ không (dùng jsonlint.com)
- Đảm bảo copy đúng file từ Google Cloud (không sửa đổi)
- Nếu để trên nhiều dòng trong .env, đảm bảo format đúng

**Backup không chạy tự động:**
- Kiểm tra `BACKUP_AUTO_ENABLED=true`
- Xem logs khi khởi động: "Đã kích hoạt lịch sao lưu Google Drive tự động"
- Kiểm tra cron expression có hợp lệ không


