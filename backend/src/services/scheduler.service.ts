import cron from 'node-cron';
import prisma from '../utils/db.js';

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
        this.startJob(s.id, s.cronExpression, s.companyId, s.company.taxCode, s.invoiceType);
      }

      console.log(`[Scheduler] Started ${schedules.length} active schedule(s).`);
    } catch (err: any) {
      console.error('[Scheduler] Failed to start schedules:', err.message);
    }
  }

  /**
   * Create and start a cron job for a schedule.
   */
  startJob(
    id: number,
    cronExpression: string,
    companyId: number,
    taxCode: string,
    invoiceType: string,
  ): void {
    // Stop existing job if any
    this.stopJob(id);

    if (!cron.validate(cronExpression)) {
      console.error(`[Scheduler] Invalid cron "${cronExpression}" for schedule #${id}`);
      return;
    }

    const job = cron.schedule(cronExpression, async () => {
      console.log(`[Scheduler] Running schedule #${id} (${taxCode}, ${invoiceType})...`);

      try {
        // Compute today's date range
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const todayStr = `${dd}/${mm}/${yyyy}`;

        // Import dynamically to avoid circular dependency at module level
        const { InvoiceController } = await import('../controllers/invoice.controller.js');

        // Build a fake Request/Response for the download handler
        const mockReq = {
          body: {
            startDate: todayStr,
            endDate: todayStr,
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
    console.log(`[Scheduler] Job #${id} scheduled: ${cronExpression}`);
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
