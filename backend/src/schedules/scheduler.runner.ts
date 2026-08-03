import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as cron from 'node-cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';

export interface ScheduleWithCompanies {
  id: string;
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
  companies: {
    companyId: string;
    company: { id: string; taxCode: string; name: string };
  }[];
}

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
 * Runtime cron engine.
 * Manages cron jobs and one-time timeouts via in-memory maps.
 * Jobs are persisted in DB (Schedule table) and re-created on server restart.
 */
@Injectable()
export class SchedulerRunner implements OnModuleDestroy {
  private readonly logger = new Logger(SchedulerRunner.name);
  private readonly jobs = new Map<string, cron.ScheduledTask>();
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  onModuleDestroy(): void {
    this.stopAll();
  }

  /**
   * Run the download task for all companies in a schedule.
   */
  private async runDownload(schedule: ScheduleWithCompanies): Promise<void> {
    const { id, repeatMode, dateRangeDays, invoiceType, overwriteMode, companies } = schedule;
    const taxCodes = companies.map((c) => c.company.taxCode).join(', ');

    this.logger.log(`Running schedule #${id} (${schedule.name || 'unnamed'}) for companies: ${taxCodes}`);

    try {
      const { startDate, endDate } = getDateRange({ repeatMode, dateRangeDays });
      this.logger.log(`  Date range: ${formatDate(startDate)} → ${formatDate(endDate)}`);

      for (const sc of companies) {
        this.logger.log(`  Downloading for ${sc.company.taxCode}...`);
        try {
          await this.invoicesService.downloadInvoices({
            companyId: sc.companyId,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            invoiceType,
            overwriteMode,
          });
          this.logger.log(`  ✓ ${sc.company.taxCode} done`);
        } catch (err: any) {
          this.logger.error(`  ✗ ${sc.company.taxCode} failed: ${err.message}`);
        }
      }

      // Update lastRun
      await this.prisma.schedule.update({
        where: { id },
        data: { lastRun: new Date() },
      });

      // Auto-deactivate one-time schedules
      if (repeatMode === 'once') {
        await this.prisma.schedule.update({
          where: { id },
          data: { isActive: false },
        });
        this.stopJob(id);
        this.logger.log(`One-time schedule #${id} completed and deactivated`);
      }

      this.logger.log(`Schedule #${id} completed`);
    } catch (err: any) {
      this.logger.error(`Schedule #${id} error: ${err.message}`);
    }
  }

  /**
   * Create and start a cron job (or timeout) for a schedule.
   */
  startJob(schedule: ScheduleWithCompanies): void {
    const { id, cronExpression, repeatMode, scheduledAt, companies } = schedule;
    const taxCodes = companies.map((c) => c.company.taxCode).join(', ') || 'none';

    // Stop existing job first
    this.stopJob(id);

    if (companies.length === 0) {
      this.logger.warn(`Schedule #${id} has no companies, skipping`);
      return;
    }

    if (repeatMode === 'once') {
      if (!scheduledAt) {
        this.logger.error(`Schedule #${id}: no scheduledAt for one-time`);
        return;
      }
      const delayMs = new Date(scheduledAt).getTime() - Date.now();
      if (delayMs <= 0) {
        this.logger.warn(`Schedule #${id}: one-time in the past, deactivating`);
        this.prisma.schedule
          .update({ where: { id }, data: { isActive: false } })
          .catch(() => {});
        return;
      }
      const timeout = setTimeout(() => {
        this.runDownload(schedule);
      }, delayMs);
      this.timeouts.set(id, timeout);
      this.logger.log(
        `One-time job #${id} scheduled in ${Math.round(delayMs / 1000)}s (at ${new Date(scheduledAt).toISOString()})`,
      );
      return;
    }

    if (!cron.validate(cronExpression)) {
      this.logger.error(`Invalid cron expression: "${cronExpression}" for schedule #${id}`);
      return;
    }

    const job = cron.schedule(
      cronExpression,
      async () => {
        await this.runDownload(schedule);
      },
      {
        timezone: 'Asia/Ho_Chi_Minh',
      },
    );

    this.jobs.set(id, job);
    this.logger.log(
      `Job scheduled: #${id} cron="${cronExpression}" repeatMode=${repeatMode} companies=[${taxCodes}]`,
    );
  }

  /**
   * Stop and remove a single job (cron or timeout).
   */
  stopJob(id: string): void {
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
   * Stop all jobs. Called on graceful shutdown.
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
    this.logger.log('All schedule jobs stopped');
  }
}
