# Invoice Download Tool

Công cụ tải hoá đơn điện tử từ Tổng cục Thuế (GDT), hỗ trợ tải ZIP/XML/PDF, xem trước hoá đơn, export Excel.

## Yêu cầu

- [Bun](https://bun.sh) (recommended) hoặc Node.js 20+
- SQLite (tích hợp sẵn qua `@libsql/client`)
- [Gotenberg](https://gotenberg.dev) để convert HTML → PDF (chạy Docker)

## Cài đặt

```bash
# Cài dependencies cho cả backend & frontend
bun install

# Tạo file .env từ mẫu
cp backend/.env.example backend/.env

# Setup database (generate Prisma client + migrate + seed)
bun run db:setup
```

Cấu hình các biến trong `backend/.env`:

| Biến | Mô tả | Mặc định |
|------|-------|----------|
| `PORT` | Cổng chạy backend | `3000` |
| `JWT_ACCESS_SECRET` | Khóa JWT (bắt buộc đổi ở production) | — |
| `GEMINI_API_KEY` | API key Gemini để giải captcha GDT | — |
| `GDT_BASE_URL` | API GDT | `https://hoadondientu.gdt.gov.vn/api` |
| `GOTENBERG_URL` | URL Gotenberg | `http://localhost:3001` |
| `INVOICES_DIR` | Thư mục lưu file hoá đơn | `./invoices` |
| `SMTP_*` | Cấu hình email (tùy chọn) | — |

### Gotenberg (PDF)

```bash
docker run -d --name gotenberg -p 3001:3000 gotenberg/gotenberg:8
```

## Development

```bash
# Chạy đồng thời backend + frontend
bun run dev

# Hoặc chạy riêng
bun run dev:backend   # NestJS dev server (port 3000)
bun run dev:frontend  # Vite dev server (port 5173)
```

Frontend chạy tại `http://localhost:5173`, backend tại `http://localhost:3000`.

## Build

```bash
# Build cả backend & frontend, copy frontend vào backend/public
bun run build

# Chạy production
bun run start
```

Backend serve frontend từ `backend/public/` ở chế độ production.

## Database

```bash
bun run prisma:migrate        # Tạo migration mới
bun run prisma:migrate:deploy # Deploy migration lên production
bun run prisma:studio         # Mở Prisma Studio
bun run prisma:seed           # Seed dữ liệu mẫu
```

## Cấu trúc thư mục

```
├── backend/          # NestJS backend
│   ├── prisma/       # Schema + migrations
│   └── src/
│       ├── auth/     # Xác thực, phân quyền
│       ├── invoices/ # Tải/xử lý hoá đơn
│       ├── common/   # Utilities chung
│       └── prisma/   # Prisma service
├── frontend/         # React + Vite frontend
└── package.json      # Workspace root
```
