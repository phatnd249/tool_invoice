# Thêm date range cho lịch tải hoá đơn

## Vấn đề

Hiện tại scheduler luôn tải `startDate = endDate = today`, không phù hợp với các chu kỳ khác nhau (tuần/tháng/quý).

## Mục tiêu

- Mỗi lần cron chạy, tự động tính date range phù hợp với chu kỳ
- Người dùng custom cron có thể chọn số ngày trong quá khứ để tải
- Không cần người dùng sửa lại date range sau này (dùng relative days)

---

## Các bước thực hiện

### Bước 1: Thêm column vào Prisma schema

```prisma
model Schedule {
  // ... existing fields ...
  cronExpression String    // e.g., "0 9 * * *"
  repeatMode     String    @default("weekly") // "weekly" | "monthly" | "quarterly" | "custom"
  dateRangeDays  Int?      // Số ngày tải ngược (null = auto từ repeatMode)
  invoiceType    String    // "BUY" or "SELL" or "BOTH"
  isActive       Boolean   @default(true)
  lastRun        DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

Chạy migration: `npx prisma migrate dev --name add_schedule_date_range`

### Bước 2: Cập nhật frontend `SchedulePanel.tsx`

**State mới:**
```ts
const [dateRangeDays, setDateRangeDays] = useState(7);
const [showDateRange, setShowDateRange] = useState(false); // toggle hiển thị
```

**Gửi kèm khi tạo schedule:**
```ts
await axios.post(`${API_BASE_URL}/api/schedules`, {
  companyId: Number(selectedCompanyId),
  cronExpression,
  invoiceType,
  repeatMode,
  dateRangeDays: showDateRange ? dateRangeDays : null,
});
```

**UI mới cho phần custom:**
Sau custom cron input, thêm 1 dòng toggle + input:

```tsx
{/* Date range selector for custom mode */}
{repeatMode === 'custom' && (
  <div className="space-y-2">
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={showDateRange}
        onChange={(e) => setShowDateRange(e.target.checked)}
        className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-indigo-500"
      />
      <span className="text-xs text-slate-400">Giới hạn thời gian tải</span>
    </label>
    {showDateRange && (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Tải dữ liệu trong</span>
        <input
          type="number" min={1} max={365}
          value={dateRangeDays}
          onChange={(e) => setDateRangeDays(Number(e.target.value))}
          className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 text-center focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs text-slate-500">ngày qua</span>
      </div>
    )}
  </div>
)}
```

### Bước 3: Cập nhật `backend/src/services/scheduler.service.ts`

**Hàm tính date range theo schedule:**

```ts
function getDateRange(schedule: any): { startDate: string; endDate: string } {
  const now = new Date();
  const format = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const today = format(now);
  const yesterday = (() => {
    const d = new Date(now); d.setDate(d.getDate() - 1); return format(d);
  })();

  // Nếu có dateRangeDays → dùng nó
  if (schedule.dateRangeDays) {
    const start = new Date(now);
    start.setDate(start.getDate() - schedule.dateRangeDays);
    return { startDate: format(start), endDate: today };
  }

  // Auto-detect từ repeatMode
  switch (schedule.repeatMode) {
    case 'weekly': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { startDate: format(weekAgo), endDate: yesterday };
    }
    case 'monthly': {
      const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLast = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: format(firstOfLast), endDate: format(lastOfLast) };
    }
    case 'quarterly': {
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return { startDate: format(threeMonthsAgo), endDate: yesterday };
    }
    default:
      return { startDate: today, endDate: today };
  }
}
```

**Dùng trong `startJob()`:**
```ts
const { startDate, endDate } = getDateRange({ repeatMode, dateRangeDays, ... });

// Gọi downloadInvoices với date range tính được
const mockReq = {
  body: { startDate, endDate, invoiceType, companyId },
  user: { id: null, username: 'scheduler', role: 'ADMIN' },
};
```

### Bước 4: Cập nhật controller và route

- `schedule.controller.ts`: nhận thêm `repeatMode` và `dateRangeDays` khi create
- Route không cần thay đổi (POST body thêm field)

### Bước 5: Migration

```bash
cd backend
npx prisma migrate dev --name add_schedule_date_range
```

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `backend/prisma/schema.prisma` | Thêm `repeatMode` (String) và `dateRangeDays` (Int?) |
| DB migration | `add_schedule_date_range` |
| `frontend/src/components/SchedulePanel.tsx` | Thêm checkbox + input `dateRangeDays` cho custom mode |
| `backend/src/services/scheduler.service.ts` | Thêm hàm `getDateRange()`, dùng khi gọi download |
| `backend/src/controllers/schedule.controller.ts` | Nhận thêm `repeatMode`, `dateRangeDays` từ body |

## Luồng mới

```
Cron chạy → scheduler.startJob
  → getDateRange(schedule) → { startDate, endDate }
    → InvoiceController.downloadInvoices(startDate, endDate)
```

| repeatMode | dateRangeDays | Kết quả |
|---|---|---|
| `weekly` | `null` | 7 ngày qua → hôm qua |
| `monthly` | `null` | Đầu tháng trước → cuối tháng trước |
| `quarterly` | `null` | 3 tháng qua → hôm qua |
| `custom` | `30` | 30 ngày qua → hôm nay |
| `custom` | `null` | Hôm nay |
