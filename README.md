# Tool Invoice — Invoice Downloader & Manager

Hệ thống tải và quản lý hóa đơn điện tử từ cổng thông tin GDT (General Department of Taxation).

## Yêu cầu

- **Node.js** >= 20
- **npm** >= 9
- **SQLite** (tự động qua Prisma)

## Cấu hình môi trường

1. Copy file `.env.example` thành `.env`:

```bash
cp backend/.env.example backend/.env
```

2. Chỉnh sửa `backend/.env` với các giá trị phù hợp:

| Biến | Mô tả | Bắt buộc |
|------|-------|----------|
| `PORT` | Cổng backend server (mặc định: 3000) | ✘ |
| `DATABASE_URL` | Đường dẫn SQLite database | ✘ |
| `GEMINI_API_KEY` | API key Google Gemini (dùng OCR captcha) | **✔** |

> **Lưu ý:** File `.env` nằm trong `.gitignore`, không bao giờ commit lên git.

## Build

Build backend bundle với esbuild:

```bash
# Từ thư mục gốc (recommended)
npm run build

# Hoặc chỉ build backend
npm run build -w backend
```

Output: `backend/dist/server.cjs`

## Chạy code đã build

```bash
# Từ thư mục gốc (recommended)
npm start

# Hoặc trực tiếp
NODE_ENV=production node backend/dist/server.cjs
```

Server sẽ chạy tại `http://localhost:3000`.

## Development

Chạy backend ở chế độ hot-reload:

```bash
npm run dev
# hoặc: npm run dev -w backend
```

## Cấu trúc thư mục

```
tool-invoice/
├── backend/             # Backend API (Express + Prisma + SQLite)
│   ├── src/
│   │   ├── controllers/ # HTTP request handlers
│   │   ├── services/    # Business logic
│   │   ├── utils/       # Helpers (paths, db, rate-limiter...)
│   │   └── server.ts    # Entry point
│   ├── prisma/          # Schema & migrations
│   ├── dist/            # Build output (gitignored)
│   └── .env             # Environment variables (gitignored)
├── frontend/            # Frontend (Vite + React)
├── invoices/            # Thư mục lưu hóa đơn đã tải
└── package.json         # Root workspace config
```

## Lưu ý khi build

- **Định dạng output:** CJS (`server.cjs`) — tương thích với cả Node.js `require` và `pkg` đóng gói.
- **Warning `import.meta.url`:** Đã được xử lý qua esbuild `define` và fallback trong `paths.ts`. Không ảnh hưởng đến runtime.
- **Prisma:** Engine files không cần thiết (schema-engine, introspection-engine) được tự động xoá sau build để giảm dung lượng.
