import { Response } from 'express';
import prisma from '../utils/db.js';
import { schedulerService } from '../services/scheduler.service.js';
import { AuthRequest } from '../middleware/auth.middleware.js';

function formatSchedule(schedule: any) {
  return {
    ...schedule,
    companies: schedule.companies?.map((sc: any) => ({
      companyId: sc.companyId,
      company: sc.company,
    })) || [],
  };
}

export class ScheduleController {
  /**
   * GET /api/schedules
   * List all schedules with their associated companies.
   */
  static async list(_req: AuthRequest, res: Response): Promise<void> {
    const schedules = await prisma.schedule.findMany({
      include: { companies: { include: { company: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(schedules.map(formatSchedule));
  }

  /**
   * POST /api/schedules
   * Create a new schedule with multiple companies and start its cron job.
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const { companyIds, name, cronExpression, scheduledAt, invoiceType, repeatMode, dateRangeDays } = req.body;

    if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
      res.status(400).json({ error: 'Thiếu thông tin bắt buộc: companyIds phải là mảng có ít nhất một doanh nghiệp.' });
      return;
    }

    if (repeatMode !== 'once' && !cronExpression) {
      res.status(400).json({ error: 'Thiếu cronExpression cho lịch định kỳ.' });
      return;
    }

    if (repeatMode === 'once' && !scheduledAt) {
      res.status(400).json({ error: 'Thiếu scheduledAt cho lịch một lần.' });
      return;
    }

    if (!invoiceType) {
      res.status(400).json({ error: 'Thiếu invoiceType.' });
      return;
    }

    // Validate all companies exist
    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
    });
    if (companies.length !== companyIds.length) {
      res.status(404).json({ error: 'Một số doanh nghiệp không tồn tại.' });
      return;
    }

    const effectiveCron = repeatMode === 'once' ? '' : cronExpression;

    const schedule = await prisma.schedule.create({
      data: {
        name: name || null,
        cronExpression: effectiveCron,
        repeatMode: repeatMode || 'weekly',
        scheduledAt: repeatMode === 'once' ? new Date(scheduledAt) : null,
        dateRangeDays: dateRangeDays || null,
        invoiceType,
        isActive: true,
        companies: {
          create: companyIds.map((cid: number) => ({ companyId: cid })),
        },
      },
      include: { companies: { include: { company: true } } },
    });

    // Start the cron job immediately
    schedulerService.startJob(formatSchedule(schedule));

    res.status(201).json(formatSchedule(schedule));
  }

  /**
   * PATCH /api/schedules/:id
   * Toggle isActive on/off.
   */
  static async toggle(req: AuthRequest, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: { companies: { include: { company: true } } },
    });

    if (!schedule) {
      res.status(404).json({ error: 'Không tìm thấy lịch.' });
      return;
    }

    const updated = await prisma.schedule.update({
      where: { id },
      data: { isActive: !schedule.isActive },
      include: { companies: { include: { company: true } } },
    });

    if (updated.isActive) {
      schedulerService.startJob(formatSchedule(updated));
    } else {
      schedulerService.stopJob(id);
    }

    res.json(formatSchedule(updated));
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

/**
 * Type helper for a schedule with populated companies relation.
 */
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
