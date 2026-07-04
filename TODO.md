# Triển khai Backend Schedules với node-cron

## Hiện trạng

- Frontend `SchedulePanel` đã hoàn chỉnh, gọi API `/api/schedules`
- Backend **chưa có** routes, controller, service cho schedules → lỗi 404
- DB schema đã có bảng `Schedule` (prisma/schema.prisma)

## Mục tiêu

1. CRUD schedules: tạo, xem danh sách, toggle on/off, xoá
2. Chạy cron job thực tế: khi đến giờ, tự động gọi `InvoiceController.downloadInvoices()`
3. Khởi động lại tất cả active jobs khi server start

---

## Các bước thực hiện

### Bước 1: Cài `node-cron` và types

```bash
cd backend
npm install node-cron
npm install -D @types/node-cron
```

### Bước 2: Tạo `backend/src/services/scheduler.service.ts`

Service quản lý cron jobs runtime:

```ts
import cron from 'node-cron';
import prisma from '../utils/db.js';
import { InvoiceController } from '../controllers/invoice.controller.js';

class SchedulerService {
  private jobs = new Map<number, cron.ScheduledTask>();

  /** Khởi động tất cả active schedules khi server start */
  async startAll() {
    const schedules = await prisma.schedule.findMany({
      where: { isActive: true },
      include: { company: true },
    });
    for (const s of schedules) {
      this.startJob(s.id, s.cronExpression, s.company.taxCode, s.invoiceType);
    }
    console.log(`[Scheduler] Started ${schedules.length} active schedule(s).`);
  }

  /** Tạo và chạy 1 cron job */
  startJob(id: number, cronExpression: string, taxCode: string, invoiceType: string) {
    if (!cron.validate(cronExpression)) {
      console.error(`[Scheduler] Invalid cron "${cronExpression}" for schedule #${id}`);
      return;
    }

    const job = cron.schedule(cronExpression, async () => {
      console.log(`[Scheduler] Running schedule #${id} (${taxCode}, ${invoiceType})...`);
      try {
        // Tự động tính date range: hôm nay → hôm nay
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const todayStr = `${dd}/${mm}/${yyyy}`;

        // Gọi download với date range = hôm nay
        // Dùng companyId và token từ DB
        await InvoiceController.downloadInvoices(
          { body: { startDate: todayStr, endDate: todayStr, invoiceType, companyId: id } } as any,
          { json: () => {}, status: () => ({ json: () => {} }) } as any
        );

        await prisma.schedule.update({
          where: { id },
          data: { lastRun: new Date() },
        });
      } catch (err: any) {
        console.error(`[Scheduler] Schedule #${id} failed:`, err.message);
      }
    });

    this.jobs.set(id, job);
    console.log(`[Scheduler] Job #${id} started: ${cronExpression}`);
  }

  /** Dừng 1 job */
  stopJob(id: number) {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
  }

  /** Dừng tất cả jobs (dùng khi shutdown) */
  stopAll() {
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
  }
}

export const schedulerService = new SchedulerService();
```

### Bước 3: Tạo `backend/src/controllers/schedule.controller.ts`

Logic CRUD cơ bản, tích hợp với schedulerService:

```ts
import { Request, Response } from 'express';
import prisma from '../utils/db.js';
import { schedulerService } from '../services/scheduler.service.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

export class ScheduleController {
  // GET /api/schedules
  static async list(_req: AuthRequest, res: Response) {
    const schedules = await prisma.schedule.findMany({
      include: { company: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(schedules);
  }

  // POST /api/schedules
  static async create(req: AuthRequest, res: Response) {
    const { companyId, cronExpression, invoiceType } = req.body;
    if (!companyId || !cronExpression || !invoiceType) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    }
    const schedule = await prisma.schedule.create({
      data: { companyId, cronExpression, invoiceType, isActive: true },
      include: { company: true },
    });
    // Start job immediately
    schedulerService.startJob(schedule.id, cronExpression, schedule.company.taxCode, invoiceType);
    res.status(201).json(schedule);
  }

  // PATCH /api/schedules/:id — toggle isActive
  static async toggle(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    const schedule = await prisma.schedule.findUnique({ where: { id }, include: { company: true } });
    if (!schedule) return res.status(404).json({ error: 'Không tìm thấy lịch.' });

    const updated = await prisma.schedule.update({
      where: { id },
      data: { isActive: !schedule.isActive },
      include: { company: true },
    });

    if (updated.isActive) {
      schedulerService.startJob(id, updated.cronExpression, schedule.company.taxCode, updated.invoiceType);
    } else {
      schedulerService.stopJob(id);
    }
    res.json(updated);
  }

  // DELETE /api/schedules/:id
  static async remove(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    schedulerService.stopJob(id);
    await prisma.schedule.delete({ where: { id } });
    res.json({ success: true });
  }
}
```

### Bước 4: Tạo `backend/src/routes/schedule.routes.ts`

```ts
import { Router } from 'express';
import { ScheduleController } from '../controllers/schedule.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();
router.get('/', authenticate, ScheduleController.list);
router.post('/', authenticate, ScheduleController.create);
router.patch('/:id', authenticate, ScheduleController.toggle);
router.delete('/:id', authenticate, ScheduleController.remove);
export default router;
```

### Bước 5: Đăng ký route trong `server.ts`

```ts
import scheduleRoutes from './routes/schedule.routes.js';
// ...
app.use('/api/schedules', scheduleRoutes);
```

Và khởi động scheduler sau khi server start:

```ts
import { schedulerService } from './services/scheduler.service.js';
// ...
findFreePort(Number(PORT)).then(async (freePort) => {
  await AuthController.seedInitialAdmin();
  await schedulerService.startAll(); // <-- thêm dòng này

  app.listen(freePort, () => { ... });
});
```

### Bước 6: Cập nhật frontend SchedulePanel — thêm preset "Hàng quý"

Thêm nút thứ 5 vào preset:

```tsx
{ value: 'quarterly' as const, label: 'Hàng quý' },
```

Và cập nhật cron expression:

```ts
const cronExpression = repeatMode === 'custom'
  ? customCron
  : repeatMode === 'quarterly'
    ? `${scheduleMinute} ${scheduleHour} 1 1,4,7,10 *`
    : `${scheduleMinute} ${scheduleHour} * * ${repeatMode === 'weekly' ? '1' : repeatMode === 'monthly' ? '1' : '*'}`;
```

---

## Tóm tắt thay đổi

| File | Hành động |
|---|---|
| `backend/package.json` | Thêm `node-cron`, `@types/node-cron` |
| `backend/src/services/scheduler.service.ts` | **Tạo mới** — quản lý cron jobs runtime |
| `backend/src/controllers/schedule.controller.ts` | **Tạo mới** — CRUD REST endpoints |
| `backend/src/routes/schedule.routes.ts` | **Tạo mới** — định nghĩa routes |
| `backend/src/server.ts` | Đăng ký route + gọi `schedulerService.startAll()` |
| `frontend/src/components/SchedulePanel.tsx` | Thêm preset "Hàng quý" |
