import cron, { ScheduledTask } from 'node-cron';
import prisma from '../utils/db.js';
import { createLogger } from '../logger/index.js';
import { invoiceDownloadService } from './invoice-download.service.js';
import { parseDateString } from '../utils/gdt-format.js';

const log = createLogger('SchedulerService');

/**
 * Format Date to dd/MM/yyyy string.
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
}): { startDate: Date; endDate: Date } {
  const now = new Date();

  if (schedule.dateRangeDays) {
    const start = new Date(now);
    start.setDate(start.getDate() - schedule.dateRangeDays);
    return { startDate: start, endDate: now };
  }

  switch (schedule.repeatMode) {
    case 'daily': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: yesterday, endDate: yesterday };
    }
    case 'weekly': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: weekAgo, endDate: yesterday };
    }
    case 'monthly': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: start, endDate: end };
    }
    case 'quarterly': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: start, endDate: yesterday };
    }
    default:
      return { startDate: now, endDate: now };
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

      log.info({ count: schedules.length }, 'Started %d active schedule(s)', schedules.length);
    } catch (err: any) {
      log.error({ err: err.message }, 'Failed to start schedules');
    }
  }

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
      overwriteMode: s.overwriteMode || 'SKIP',
      isActive: s.isActive,
      lastRun: s.lastRun,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      companies,
    };
  }

  /**
   * Run the download task for all companies in a schedule.
   * Sử dụng InvoiceDownloadService thay vì gọi controller với mock req/res.
   */
  private async runDownload(schedule: ScheduleWithCompanies): Promise<void> {
    const { id, repeatMode, dateRangeDays, invoiceType, companies } = schedule;
    const companyNames = companies.map(c => c.company.taxCode).join(',');

    const ctxLog = createLogger('SchedulerService', `schedule-${id}`);
    ctxLog.info({ companyNames, invoiceType }, 'Running schedule #%d', id);

    try {
      const { startDate, endDate } = getDateRange({ repeatMode, dateRangeDays });
      ctxLog.info({ startDate: formatDate(startDate), endDate: formatDate(endDate) }, 'Date range');

      for (const sc of companies) {
        const taxCode = sc.company.taxCode;
        ctxLog.info({ company: taxCode }, 'Downloading for company...');

        const result = await invoiceDownloadService.run({
          startDate,
          endDate,
          companyId: sc.companyId,
          invoiceType: (invoiceType as any) || 'SELL',
          overwriteMode: (schedule.overwriteMode || 'SKIP') as 'SKIP' | 'OVERWRITE' | 'NEW_VERSION',
          saveToDb: true,
          usernameLabel: 'scheduler',
        });

        ctxLog.info({ company: taxCode, status: result.status, successCount: result.successCount },
          'Company done: %s', result.status);
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
        ctxLog.info('One-time schedule #%d completed and deactivated', id);
      }

      ctxLog.info('Schedule #%d completed', id);
    } catch (err: any) {
      ctxLog.error({ err: err.message }, 'Schedule #%d error', id);
    }
  }

  /**
   * Create and start a cron job (or timeout) for a schedule.
   */
  startJob(schedule: ScheduleWithCompanies): void {
    const { id, cronExpression, repeatMode, scheduledAt } = schedule;
    const companies = schedule.companies || [];
    const taxCodes = companies.map(c => c.company.taxCode).join(',') || 'unknown';

    this.stopJob(id);

    if (repeatMode === 'once') {
      if (!scheduledAt) {
        log.error({ scheduleId: id }, 'No scheduledAt for one-time schedule');
        return;
      }
      const delayMs = new Date(scheduledAt).getTime() - Date.now();
      if (delayMs <= 0) {
        log.info({ scheduleId: id }, 'One-time schedule is in the past, skipping');
        prisma.schedule.update({ where: { id }, data: { isActive: false } }).catch(() => {});
        return;
      }
      const timeout = setTimeout(() => {
        this.runDownload(schedule);
      }, delayMs);
      this.timeouts.set(id, timeout);
      log.info({ scheduleId: id, delaySec: Math.round(delayMs / 1000), scheduledAt: new Date(scheduledAt).toISOString() },
        'One-time job scheduled');
      return;
    }

    if (!cron.validate(cronExpression)) {
      log.error({ scheduleId: id, cronExpression }, 'Invalid cron expression');
      return;
    }

    const job = cron.schedule(cronExpression, async () => {
      await this.runDownload(schedule);
    }, {
      timezone: 'Asia/Ho_Chi_Minh',
    });

    this.jobs.set(id, job);
    log.info({ scheduleId: id, cronExpression, repeatMode, companies: taxCodes },
      'Job scheduled: %s', cronExpression,
    );
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
    for (const [, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    for (const [, timeout] of this.timeouts) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
    log.info('All jobs stopped.');
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
  overwriteMode: string;
  isActive: boolean;
  lastRun: Date | null;
  createdAt: Date;
  updatedAt: Date;
  companies: { companyId: number; company: { id: number; taxCode: string; name: string } }[];
}
