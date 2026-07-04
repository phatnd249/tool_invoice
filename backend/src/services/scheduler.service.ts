import cron from 'node-cron';
import prisma from '../utils/db.js';

/**
 * Format Date to dd/MM/yyyy string (GMT+7 safe).
 */
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Compute date range for a schedule based on repeatMode and optional dateRangeDays.
 */
function getDateRange(schedule: {
  repeatMode: string;
  dateRangeDays: number | null;
}): { startDate: string; endDate: string } {
  const now = new Date();
  const today = formatDate(now);

  // Yesterday
  const yesterday = (() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  })();

  // If user set a custom number of days → use it
  if (schedule.dateRangeDays) {
    const start = new Date(now);
    start.setDate(start.getDate() - schedule.dateRangeDays);
    return { startDate: formatDate(start), endDate: today };
  }

  // Auto-detect from repeatMode
  switch (schedule.repeatMode) {
    case 'weekly': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { startDate: formatDate(weekAgo), endDate: yesterday };
    }
    case 'monthly': {
      const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLast = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: formatDate(firstOfLast), endDate: formatDate(lastOfLast) };
    }
    case 'quarterly': {
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return { startDate: formatDate(threeMonthsAgo), endDate: yesterday };
    }
    default:
      return { startDate: today, endDate: today };
  }
}

/**
 * Manages cron jobs at runtime using a Map.
 * Jobs are persisted in DB (Schedule table) and re-created on server restart.
 */
class SchedulerService {
  private jobs = new Map<number, cron.ScheduledTask>();

  /**
   * Start all active schedules from database.
   * Called once after server starts.
   */
  async startAll(): Promise<void> {
    try {
      const schedules = await prisma.schedule.findMany({
        where: { isActive: true },
        include: { company: true },
      });

      for (const s of schedules) {
        this.startJob(s);
      }

      console.log(`[Scheduler] Started ${schedules.length} active schedule(s).`);
    } catch (err: any) {
      console.error('[Scheduler] Failed to start schedules:', err.message);
    }
  }

  /**
   * Create and start a cron job for a schedule.
   */
  startJob(schedule: {
    id: number;
    cronExpression: string;
    companyId: number;
    repeatMode: string;
    dateRangeDays: number | null;
    invoiceType: string;
    company?: { taxCode: string };
  }): void {
    const { id, cronExpression, companyId, repeatMode, dateRangeDays, invoiceType } = schedule;
    const taxCode = schedule.company?.taxCode || 'unknown';

    // Stop existing job if any
    this.stopJob(id);

    if (!cron.validate(cronExpression)) {
      console.error(`[Scheduler] Invalid cron "${cronExpression}" for schedule #${id}`);
      return;
    }

    const job = cron.schedule(cronExpression, async () => {
      console.log(`[Scheduler] Running schedule #${id} (${taxCode}, ${invoiceType})...`);

      try {
        const { startDate, endDate } = getDateRange({ repeatMode, dateRangeDays });
        console.log(`[Scheduler] Date range: ${startDate} → ${endDate}`);

        // Import dynamically to avoid circular dependency at module level
        const { InvoiceController } = await import('../controllers/invoice.controller.js');

        // Build a fake Request/Response for the download handler
        const mockReq = {
          body: {
            startDate,
            endDate,
            invoiceType,
            companyId,
          },
          user: { id: null, username: 'scheduler', role: 'ADMIN' },
        } as any;

        let resultMessage = '';
        const mockRes = {
          json: (data: any) => { resultMessage = data?.message || JSON.stringify(data); },
          status: (code: number) => ({
            json: (data: any) => {
              if (code >= 400) {
                console.error(`[Scheduler] Schedule #${id} failed with status ${code}:`, data?.error || data);
              }
              resultMessage = data?.message || data?.error || JSON.stringify(data);
            },
          }),
        } as any;

        await InvoiceController.downloadInvoices(mockReq, mockRes);

        // Update lastRun
        await prisma.schedule.update({
          where: { id },
          data: { lastRun: new Date() },
        });

        console.log(`[Scheduler] Schedule #${id} completed: ${resultMessage}`);
      } catch (err: any) {
        console.error(`[Scheduler] Schedule #${id} error:`, err.message);
      }
    });

    this.jobs.set(id, job);
    console.log(`[Scheduler] Job #${id} scheduled: ${cronExpression} (mode=${repeatMode}, days=${dateRangeDays ?? 'auto'})`);
  }

  /**
   * Stop and remove a single job.
   */
  stopJob(id: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
      console.log(`[Scheduler] Job #${id} stopped.`);
    }
  }

  /**
   * Stop all jobs. Call on graceful shutdown.
   */
  stopAll(): void {
    for (const [id, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    console.log('[Scheduler] All jobs stopped.');
  }
}

export const schedulerService = new SchedulerService();
