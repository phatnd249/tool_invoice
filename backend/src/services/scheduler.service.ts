import cron, { ScheduledTask } from 'node-cron';
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
    case 'daily': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: formatDate(yesterday), endDate: formatDate(yesterday) };
    }
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
  private jobs = new Map<number, ScheduledTask>();
  private timeouts = new Map<number, ReturnType<typeof setTimeout>>();

  /**
   * Start all active schedules from database.
   * Called once after server starts.
   */
  async startAll(): Promise<void> {
    try {
      const schedules = await prisma.schedule.findMany({
        where: { isActive: true },
        include: { companies: { include: { company: true } } },
      });

      for (const s of schedules) {
        this.startJob(this.formatSchedule(s));
      }

      console.log(`[Scheduler] Started ${schedules.length} active schedule(s).`);
    } catch (err: any) {
      console.error('[Scheduler] Failed to start schedules:', err.message);
    }
  }

  /**
   * Normalise schedule object: convert DB shape to the expected interface.
   */
  private formatSchedule(s: any): ScheduleWithCompanies {
    const companies = s.companies?.map((sc: any) => ({
      companyId: sc.companyId,
      company: sc.company,
    })) || [];
    return {
      id: s.id,
      name: s.name,
      cronExpression: s.cronExpression,
      repeatMode: s.repeatMode,
      scheduledAt: s.scheduledAt,
      dateRangeDays: s.dateRangeDays,
      invoiceType: s.invoiceType,
      isActive: s.isActive,
      lastRun: s.lastRun,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      companies,
    };
  }

  /**
   * Run the download task for all companies in a schedule.
   */
  private async runDownload(schedule: ScheduleWithCompanies): Promise<void> {
    const { id, repeatMode, dateRangeDays, invoiceType, companies } = schedule;
    const companyNames = companies.map(c => c.company.taxCode).join(',');
    console.log(`[Scheduler] Running schedule #${id} (${companyNames}, ${invoiceType})...`);

    try {
      const { startDate, endDate } = getDateRange({ repeatMode, dateRangeDays });
      console.log(`[Scheduler] Date range: ${startDate} → ${endDate}`);

      const { InvoiceController } = await import('../controllers/invoice.controller.js');

      for (const sc of companies) {
        const taxCode = sc.company.taxCode;
        console.log(`[Scheduler] Downloading for company ${taxCode}...`);

        const mockReq = {
          body: {
            startDate,
            endDate,
            invoiceType,
            companyId: sc.companyId,
          },
          user: { id: null, username: 'scheduler', role: 'ADMIN' },
        } as any;

        let resultMessage = '';
        const mockRes = {
          json: (data: any) => { resultMessage = data?.message || JSON.stringify(data); },
          status: (code: number) => ({
            json: (data: any) => {
              if (code >= 400) {
                console.error(`[Scheduler] Schedule #${id} company #${sc.companyId} failed with status ${code}:`, data?.error || data);
              }
              resultMessage = data?.message || data?.error || JSON.stringify(data);
            },
          }),
        } as any;

        await InvoiceController.downloadInvoices(mockReq, mockRes);
        console.log(`[Scheduler] Company ${taxCode} done: ${resultMessage}`);
      }

      // Update lastRun
      await prisma.schedule.update({
        where: { id },
        data: { lastRun: new Date() },
      });

      // Auto-deactivate one-time schedules after first run
      if (repeatMode === 'once') {
        await prisma.schedule.update({
          where: { id },
          data: { isActive: false },
        });
        this.stopJob(id);
        console.log(`[Scheduler] One-time schedule #${id} completed and deactivated.`);
      }

      console.log(`[Scheduler] Schedule #${id} completed.`);
    } catch (err: any) {
      console.error(`[Scheduler] Schedule #${id} error:`, err.message);
    }
  }

  /**
   * Create and start a cron job (or timeout) for a schedule.
   */
  startJob(schedule: ScheduleWithCompanies): void {
    const { id, cronExpression, repeatMode, scheduledAt } = schedule;
    const companies = schedule.companies || [];
    const taxCodes = companies.map(c => c.company.taxCode).join(',') || 'unknown';

    // Stop existing job if any
    this.stopJob(id);

    if (repeatMode === 'once') {
      // One-time: use setTimeout
      if (!scheduledAt) {
        console.error(`[Scheduler] No scheduledAt for one-time schedule #${id}`);
        return;
      }
      const delayMs = new Date(scheduledAt).getTime() - Date.now();
      if (delayMs <= 0) {
        console.log(`[Scheduler] One-time schedule #${id} is in the past, skipping.`);
        // Deactivate it
        prisma.schedule.update({ where: { id }, data: { isActive: false } }).catch(() => {});
        return;
      }
      const timeout = setTimeout(() => {
        this.runDownload(schedule);
      }, delayMs);
      this.timeouts.set(id, timeout);
      console.log(`[Scheduler] One-time job #${id} scheduled in ${Math.round(delayMs / 1000)}s (at ${new Date(scheduledAt).toISOString()})`);
      return;
    }

    // Recurring: use cron
    if (!cron.validate(cronExpression)) {
      console.error(`[Scheduler] Invalid cron "${cronExpression}" for schedule #${id}`);
      return;
    }

    const job = cron.schedule(cronExpression, async () => {
      await this.runDownload(schedule);
    }, {
      timezone: 'Asia/Ho_Chi_Minh'
    });

    this.jobs.set(id, job);
    console.log(`[Scheduler] Job #${id} scheduled: ${cronExpression} (mode=${repeatMode}, companies=${taxCodes})`);
  }

  /**
   * Stop and remove a single job (cron or timeout).
   */
  stopJob(id: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
    }
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
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
    for (const [id, timeout] of this.timeouts) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    console.log('[Scheduler] All jobs stopped.');
  }
}

export const schedulerService = new SchedulerService();

export interface ScheduleWithCompanies {
  id: number;
  name: string | null;
  cronExpression: string;
  repeatMode: string;
  scheduledAt: Date | null;
  dateRangeDays: number | null;
  invoiceType: string;
  isActive: boolean;
  lastRun: Date | null;
  createdAt: Date;
  updatedAt: Date;
  companies: { companyId: number; company: { id: number; taxCode: string; name: string } }[];
}
