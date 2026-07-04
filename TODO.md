# Kế hoạch: Tập trung cấu hình đường dẫn vào .env

## Vấn đề

Hiện tại có **2 nguồn** xác định đường dẫn database và thư mục lưu hoá đơn:

1. `backend/.env` — `DATABASE_URL="file:./dev.db"` (trỏ vào `backend/prisma/dev.db`)
2. `backend/src/utils/setup.ts` — hàm `initializeEnvironment()` **override** `DATABASE_URL` thành `file:/home/zero/InvoiceDownloader/database.db` (hardcode)

Hai nguồn này mâu thuẫn nhau, gây ra việc database thực tế dùng khác với database đã migrate.

## Mục tiêu

Mọi cấu hình đường dẫn (database, thư mục lưu hoá đơn) đều tập trung vào file `.env`. Cả dev lẫn đóng gói đều tuân theo `.env`.

---

## Các bước thực hiện

### Bước 1: Cập nhật `backend/.env` — thêm biến mới

```env
# Đường dẫn database (relative hoặc absolute)
DATABASE_URL="file:./dev.db"

# Thư mục lưu hoá đơn tải về (mặc định suy ra từ thư mục chứa database)
# INVOICES_DIR="./invoices"
```

- `DATABASE_URL`: dùng `./dev.db` cho dev (relative đến `backend/`), absolute path khi đóng gói
- `INVOICES_DIR`: optional, nếu không set thì suy từ thư mục chứa database

### Bước 2: Sửa `setup.ts` — đọc từ `.env`, không hardcode

**Thay đổi trong hàm `initializeEnvironment()`:**

| Logic cũ | Logic mới |
|---|---|
| `const homeDir = os.homedir()` | Đọc `DATABASE_URL` từ `process.env` (đã load bởi dotenv) |
| `const appDataDir = path.join(homeDir, 'InvoiceDownloader')` | Parse đường dẫn từ `DATABASE_URL` (bỏ `file:` prefix) |
| `const dbPath = path.join(appDataDir, 'database.db')` | Dùng đường dẫn từ `.env` |
| `const invoicesDir = path.join(appDataDir, 'invoices')` | Dùng `INVOICES_DIR` từ `.env`, nếu không có thì suy từ thư mục database + `/invoices` |
| Copy template nếu database chưa tồn tại | **Giữ nguyên** — copy template từ `prisma/dev.db` nếu file đích chưa có |
| Override `process.env.DATABASE_URL` | **Giữ nguyên** — nhưng giá trị giờ đã đúng từ `.env` |

**Chi tiết:**

```typescript
export function initializeEnvironment(): { dbPath: string; invoicesDir: string } {
  // Đọc DATABASE_URL từ .env (đã load bởi dotenv.config() ở server.ts)
  const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
  // Parse đường dẫn thực tế (bỏ "file:" prefix)
  const dbPath = path.resolve(dbUrl.replace(/^file:/, ''));

  // Thư mục chứa database (dùng để suy ra invoicesDir nếu cần)
  const dbDir = path.dirname(dbPath);

  // Đọc INVOICES_DIR từ .env, nếu không có thì mặc định là thư mục invoices cạnh database
  const invoicesDir = process.env.INVOICES_DIR
    ? path.resolve(process.env.INVOICES_DIR)
    : path.join(dbDir, 'invoices');

  console.log(`[Setup] Resolving environment paths:`);
  console.log(` - Database Path: ${dbPath}`);
  console.log(` - Invoices Directory: ${invoicesDir}`);

  // Tạo thư mục nếu chưa tồn tại
  const invoicesDirAbsolute = path.resolve(invoicesDir);
  if (!fs.existsSync(invoicesDirAbsolute)) {
    fs.mkdirSync(invoicesDirAbsolute, { recursive: true });
  }

  // Copy template database nếu file đích chưa tồn tại
  if (!fs.existsSync(dbPath)) {
    const dbDirAbsolute = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dbDirAbsolute)) {
      fs.mkdirSync(dbDirAbsolute, { recursive: true });
    }

    // Tìm template database
    const possibleTemplates = [
      path.join(_dirname, '../../prisma/dev.db'),
      path.join(_dirname, '../prisma/dev.db'),
      path.join(process.cwd(), 'prisma/dev.db'),
      path.join(process.cwd(), 'backend/prisma/dev.db'),
    ];

    let templateFound = false;
    for (const templatePath of possibleTemplates) {
      if (fs.existsSync(templatePath)) {
        try {
          fs.copyFileSync(templatePath, dbPath);
          console.log(`[Setup] Successfully copied template database from: ${templatePath}`);
          templateFound = true;
          break;
        } catch (err) {
          console.error(`[Setup] Failed to copy database from ${templatePath}:`, err);
        }
      }
    }

    if (!templateFound) {
      console.warn('[Setup] WARNING: SQLite template database not found. Prisma may fail to initialize unless migrated.');
    }
  }

  // Set environment variables để Prisma và controllers dùng
  process.env.DATABASE_URL = `file:${path.resolve(dbPath).replace(/\\/g, '/')}`;
  process.env.INVOICES_DIR = path.resolve(invoicesDir);

  // Resolve PRISMA_QUERY_ENGINE_LIBRARY khi đóng gói (giữ nguyên)
  if (typeof (process as any).pkg !== 'undefined') {
    const execDir = path.dirname(process.execPath);
    const clientDir = path.join(execDir, 'node_modules/.prisma/client');
    if (fs.existsSync(clientDir)) {
      try {
        const files = fs.readdirSync(clientDir);
        const engineFile = files.find(f => (f.startsWith('libquery_engine-') || f.startsWith('query_engine-')) && f.endsWith('.node'));
        if (engineFile) {
          const enginePath = path.join(clientDir, engineFile);
          process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath;
          console.log(`[Setup] Set PRISMA_QUERY_ENGINE_LIBRARY dynamically to: ${enginePath}`);
        }
      } catch (err) {
        console.error('[Setup] Failed to scan native Prisma client folder:', err);
      }
    }
  }

  return { dbPath, invoicesDir };
}
```

### Bước 3: Thêm migration tự động khi database mới

Trong `setup.ts`, thêm hàm `ensureDatabaseSchema()` chạy sau khi `initializeEnvironment()`:

```typescript
import { execSync } from 'child_process';

function ensureDatabaseSchema(): void {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;

  const dbPath = dbUrl.replace(/^file:/, '');
  
  // Nếu database chưa tồn tại hoặc chưa có bảng (mới copy template), không cần migrate
  // Chỉ migrate khi template không được tìm thấy (database mới tạo rỗng)
  // Hoặc luôn chạy migrate deploy an toàn
  try {
    console.log('[Setup] Ensuring database schema is up-to-date...');
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
      timeout: 30000,
    });
    console.log('[Setup] Database schema is up-to-date.');
  } catch (error) {
    console.warn('[Setup] prisma migrate deploy failed, trying db push...');
    try {
      execSync('npx prisma db push --skip-generate', {
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log('[Setup] Database schema synchronized via db push.');
    } catch (pushError) {
      console.error('[Setup] Failed to synchronize database schema:', pushError);
    }
  }
}
```

**Giải thích:** 
- Thử `migrate deploy` trước (chỉ chạy migration chưa áp dụng, an toàn nhất)
- Nếu thất bại (vd: không có thư mục migrations), fallback sang `db push` (tạo bảng từ schema)
- Chỉ chạy khi cần, không gây hại nếu database đã có schema

### Bước 4: Gọi `ensureDatabaseSchema()` trong `server.ts`

Sau `initializeEnvironment()` và trước khi dùng Prisma, thêm:

```typescript
import { initializeEnvironment, findFreePort, ensureDatabaseSchema } from './utils/setup.js';

initializeEnvironment();
ensureDatabaseSchema();  // <-- Thêm dòng này
```

### Bước 5: Cập nhật `build.js` — đóng gói kèm Prisma CLI

Khi build với `pkg`, cần đảm bảo Prisma CLI binary có trong package để migrate tự động.

Trong `backend/package.json`:
```json
{
  "pkg": {
    "assets": [
      "prisma/schema.prisma",
      "prisma/dev.db",
      "prisma/migrations/**/*",
      "../frontend/dist/**/*",
      "node_modules/.prisma/client/*.js",
      "node_modules/.prisma/client/package.json",
      "node_modules/.prisma/client/schema.prisma"
    ]
  }
}
```

Thêm `node_modules/.bin/prisma` vào assets nếu có thể.

### Bước 6: Cập nhật `.gitignore`

```gitignore
# Database files (giữ nguyên)
*.db
*.db-journal
*.db-shm
*.db-wal

# Thêm: không ignore backend/prisma/dev.db (template cần được commit)
# backend/prisma/dev.db vẫn được track vì nó là template
```

### Bước 7: Kiểm tra

1. **Dev:** 
   - Set `.env`: `DATABASE_URL="file:./dev.db"`
   - Xoá `backend/prisma/dev.db`
   - Chạy `npx prisma db push` (1 lần để tạo template)
   - Chạy `npm run dev` — server hoạt động, seed admin OK

2. **Production (mô phỏng):**
   - Set `.env`: `DATABASE_URL="file:/tmp/test-invoice/database.db"`
   - Chạy `npm run dev` — database mới được copy từ template, hoặc migrate tự động

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `backend/.env` | Thêm comment, **không đổi giá trị** (vẫn `file:./dev.db`) |
| `backend/src/utils/setup.ts` | Sửa `initializeEnvironment()` — đọc `.env`, không hardcode |
| `backend/src/utils/setup.ts` | Thêm hàm `ensureDatabaseSchema()` |
| `backend/src/server.ts` | Thêm 1 dòng gọi `ensureDatabaseSchema()` |
| `backend/build.js` | (Có thể) Thêm Prisma CLI vào assets |

## Luồng hoạt động sau khi sửa

```
server.ts khởi động
  ├── dotenv.config()           → đọc .env, set DATABASE_URL
  ├── initializeEnvironment()   → parse DATABASE_URL, tạo thư mục, copy template nếu cần
  ├── ensureDatabaseSchema()    → migrate nếu database chưa có bảng
  ├── Prisma khởi tạo           → dùng DATABASE_URL đã set
  └── seedInitialAdmin()        → tạo admin nếu chưa có
```

Kết quả: **Chỉ cần sửa `.env` là đổi được nơi lưu database và hoá đơn**, cả dev lẫn production đều hoạt động nhất quán.
