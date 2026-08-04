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
│       ├── invoices/      # Tải/xử lý hoá đơn, XML, PDF, Excel
│       ├── company/       # Quản lý doanh nghiệp
│       ├── common/        # Utilities dùng chung
│       └── prisma/        # Prisma service
├── frontend/              # React + Vite frontend
│   └── src/
├── .env.example           # Mẫu biến môi trường
└── package.json           # Workspace root
```
