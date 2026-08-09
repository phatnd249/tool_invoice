import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { AssignCompaniesDto } from './dto/assign-companies.dto';
import { SchedulerRunner } from './scheduler.runner';

const includeCompanies = {
  companies: {
    include: {
      company: {
        select: {
          id: true,
          taxCode: true,
          name: true,
          loginMode: true,
          downloadCount: true,
          address: true,
          taxAddress: true,
          representative: true,
          phone: true,
          activeDate: true,
          managedBy: true,
          companyType: true,
          status: true,
          lastSyncedAt: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
} as const;

function formatSchedule(s: any) {
  return {
    ...s,
    companies: s.companies?.map((sc: any) => ({
      companyId: sc.companyId,
      company: sc.company,
    })) || [],
  };
}

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: SchedulerRunner,
  ) {}

  /**
   * Load all active schedules & start cron jobs on server boot.
   */
  async bootstrapAll(): Promise<void> {
    const schedules = await this.prisma.schedule.findMany({
      where: { isActive: true },
      include: includeCompanies,
    });
    this.logger.log(`Bootstrapping ${schedules.length} active schedule(s)`);
    for (const s of schedules) {
      this.runner.startJob(formatSchedule(s));
    }
  }

  /**
   * GET /api/schedules
   */
  async findAll() {
    const rows = await this.prisma.schedule.findMany({
      include: includeCompanies,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(formatSchedule);
  }

  /**
   * GET /api/schedules/:id
   */
  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: includeCompanies,
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy lịch.');
    return formatSchedule(schedule);
  }

  /**
   * POST /api/schedules
   */
  async create(dto: CreateScheduleDto) {
    if (dto.repeatMode !== 'once' && !dto.cronExpression) {
      throw new BadRequestException('Thiếu cronExpression cho lịch định kỳ.');
    }
    if (dto.repeatMode === 'once' && !dto.scheduledAt) {
      throw new BadRequestException('Thiếu scheduledAt cho lịch một lần.');
    }

    const schedule = await this.prisma.schedule.create({
      data: {
        name: dto.name || null,
        repeatMode: dto.repeatMode,
        cronExpression: dto.repeatMode === 'once' ? '' : (dto.cronExpression ?? ''),
        scheduledAt: dto.repeatMode === 'once' ? new Date(dto.scheduledAt!) : null,
        dateRangeDays: dto.dateRangeDays ?? null,
        invoiceType: dto.invoiceType,
        overwriteMode: dto.overwriteMode || 'SKIP',
        isActive: true,
      },
      include: includeCompanies,
    });

    // Start immediately if it's an active job with companies
    const formatted = formatSchedule(schedule);
    if (dto.repeatMode !== 'once' || dto.scheduledAt) {
      // will be started when companies are assigned
    }
    this.logger.log(`Schedule created: ${schedule.id}`);
    return formatted;
  }

  /**
   * PUT /api/schedules/:id
   */
  async update(id: string, dto: UpdateScheduleDto) {
    const existing = await this.prisma.schedule.findUnique({
      where: { id },
      include: includeCompanies,
    });
    if (!existing) throw new NotFoundException('Không tìm thấy lịch.');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.repeatMode !== undefined) data.repeatMode = dto.repeatMode;
    if (dto.invoiceType !== undefined) data.invoiceType = dto.invoiceType;
    if (dto.overwriteMode !== undefined) data.overwriteMode = dto.overwriteMode;
    if (dto.dateRangeDays !== undefined) data.dateRangeDays = dto.dateRangeDays;

    // Handle repeat mode switching
    if (dto.repeatMode !== undefined) {
      if (dto.repeatMode === 'once') {
        data.cronExpression = '';
        data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : existing.scheduledAt;
      } else {
        data.scheduledAt = null;
        data.cronExpression = dto.cronExpression ?? existing.cronExpression;
      }
    } else {
      if (dto.cronExpression !== undefined) data.cronExpression = dto.cronExpression;
      if (dto.scheduledAt !== undefined)
        data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    }

    const updated = await this.prisma.schedule.update({
      where: { id },
      data,
      include: includeCompanies,
    });

    // Restart cron job
    const formatted = formatSchedule(updated);
    if (updated.isActive && updated.companies.length > 0) {
      this.runner.startJob(formatted);
    } else {
      this.runner.stopJob(id);
    }

    this.logger.log(`Schedule updated: ${id}`);
    return formatted;
  }

  /**
   * PATCH /api/schedules/:id/toggle
   */
  async toggle(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: includeCompanies,
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy lịch.');

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: { isActive: !schedule.isActive },
      include: includeCompanies,
    });

    const formatted = formatSchedule(updated);
    if (updated.isActive && updated.companies.length > 0) {
      this.runner.startJob(formatted);
    } else {
      this.runner.stopJob(id);
    }

    this.logger.log(`Schedule toggled: ${id} -> ${updated.isActive}`);
    return formatted;
  }

  /**
   * PUT /api/schedules/:id/companies
   */
  async updateCompanies(id: string, dto: AssignCompaniesDto) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy lịch.');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.scheduleCompany.deleteMany({ where: { scheduleId: id } });

      if (dto.companyIds.length > 0) {
        const companies = await tx.company.findMany({
          where: { id: { in: dto.companyIds } },
        });
        if (companies.length !== dto.companyIds.length) {
          throw new BadRequestException('Một số doanh nghiệp không tồn tại.');
        }
        await tx.scheduleCompany.createMany({
          data: dto.companyIds.map((cid: string) => ({
            scheduleId: id,
            companyId: cid,
          })),
        });
      }

      return tx.schedule.findUnique({
        where: { id },
        include: includeCompanies,
      });
    });

    const formatted = formatSchedule(updated!);
    if (updated?.isActive && updated.companies.length > 0) {
      this.runner.startJob(formatted);
    } else {
      this.runner.stopJob(id);
    }

    this.logger.log(`Schedule companies updated: ${id} -> [${dto.companyIds.join(',')}]`);
    return formatted;
  }

  /**
   * DELETE /api/schedules/:id
   */
  async remove(id: string) {
    this.runner.stopJob(id);
    await this.prisma.schedule.delete({ where: { id } });
    this.logger.log(`Schedule deleted: ${id}`);
    return { success: true };
  }
}
