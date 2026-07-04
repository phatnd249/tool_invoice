import { Response } from 'express';
import prisma from '../utils/db.js';
import { schedulerService } from '../services/scheduler.service.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

export class ScheduleController {
  /**
   * GET /api/schedules
   * List all schedules with company info.
   */
  static async list(_req: AuthRequest, res: Response): Promise<void> {
    const schedules = await prisma.schedule.findMany({
      include: { company: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(schedules);
  }

  /**
   * POST /api/schedules
   * Create a new schedule and start its cron job.
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const { companyId, cronExpression, invoiceType } = req.body;

    if (!companyId || !cronExpression || !invoiceType) {
      res.status(400).json({ error: 'Thiếu thông tin bắt buộc: companyId, cronExpression, invoiceType.' });
      return;
    }

    // Validate company exists
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      res.status(404).json({ error: 'Không tìm thấy doanh nghiệp.' });
      return;
    }

    const schedule = await prisma.schedule.create({
      data: {
        companyId,
        cronExpression,
        invoiceType,
        isActive: true,
      },
      include: { company: true },
    });

    // Start the cron job immediately
    schedulerService.startJob(schedule.id, cronExpression, companyId, company.taxCode, invoiceType);

    res.status(201).json(schedule);
  }

  /**
   * PATCH /api/schedules/:id
   * Toggle isActive on/off.
   */
  static async toggle(req: AuthRequest, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!schedule) {
      res.status(404).json({ error: 'Không tìm thấy lịch.' });
      return;
    }

    const updated = await prisma.schedule.update({
      where: { id },
      data: { isActive: !schedule.isActive },
      include: { company: true },
    });

    if (updated.isActive) {
      schedulerService.startJob(id, updated.cronExpression, schedule.companyId, schedule.company.taxCode, updated.invoiceType);
    } else {
      schedulerService.stopJob(id);
    }

    res.json(updated);
  }

  /**
   * DELETE /api/schedules/:id
   * Remove schedule and stop its cron job.
   */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const id = Number(req.params.id);

    schedulerService.stopJob(id);
    await prisma.schedule.delete({ where: { id } });

    res.json({ success: true });
  }
}
