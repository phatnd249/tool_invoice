import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Kiểm tra quyền truy cập dữ liệu theo tenant (company).
 * User có quyền toàn cục (SUPER_ADMIN hoặc `company:scope`) xem được tất cả;
 * ngược lại chỉ xem được các company trong `userCompanies`.
 */
@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** SUPER_ADMIN hoặc giữ permission `company:scope`. */
  async hasGlobalScope(userId: string): Promise<boolean> {
    const isSuperAdmin = await this.prisma.role.findFirst({
      where: {
        name: 'SUPER_ADMIN',
        userRoles: { some: { userId } },
      },
      select: { id: true },
    });
    if (isSuperAdmin) return true;

    const hasScope = await this.prisma.permission.findFirst({
      where: {
        name: 'company:scope',
        rolePermissions: {
          some: {
            role: { userRoles: { some: { userId } } },
          },
        },
      },
      select: { id: true },
    });
    return !!hasScope;
  }

  async companyIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });
    return rows.map((r) => r.companyId);
  }

  async isCompanyAccessible(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    if (await this.hasGlobalScope(userId)) return true;
    const count = await this.prisma.userCompany.count({
      where: { userId, companyId },
    });
    return count > 0;
  }

  async assertCompanyAccess(
    userId: string,
    companyId: string | null,
  ): Promise<void> {
    if (!userId || !companyId) {
      throw new ForbiddenException('Truy cập bị từ chối');
    }
    if (!(await this.isCompanyAccessible(userId, companyId))) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập doanh nghiệp này',
      );
    }
  }

  async assertInvoiceAccess(userId: string, invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { companyId: true },
    });
    if (!invoice) throw new NotFoundException('Không tìm thấy hoá đơn');
    await this.assertCompanyAccess(userId, invoice.companyId);
  }

  async assertTaskAccess(userId: string, taskId: string): Promise<void> {
    const task = await this.prisma.downloadTask.findUnique({
      where: { id: taskId },
      select: { companyId: true, createdBy: true },
    });
    if (!task) throw new NotFoundException('Không tìm thấy task');
    // Người tạo task luôn được xem/điều khiển task của mình.
    if (task.createdBy === userId) return;
    await this.assertCompanyAccess(userId, task.companyId);
  }

  /** Một lịch chỉ được thao tác khi user truy cập được TẤT CẢ company của lịch. */
  async assertScheduleAccess(
    userId: string,
    scheduleId: string,
  ): Promise<void> {
    if (await this.hasGlobalScope(userId)) return;
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { companies: { select: { companyId: true } } },
    });
    if (!schedule) throw new NotFoundException('Không tìm thấy lịch.');

    const ids = schedule.companies.map((s) => s.companyId);
    if (ids.length === 0) {
      throw new ForbiddenException(
        'Bạn không có quyền thao tác lịch chưa gắn doanh nghiệp',
      );
    }
    const accessible = await this.prisma.userCompany.count({
      where: { userId, companyId: { in: ids } },
    });
    if (accessible < ids.length) {
      throw new ForbiddenException('Bạn không có quyền thao tác lịch này');
    }
  }

  /** Bổ sung điều kiện `companyId` vào query dựa trên scope của user. */
  async companyScopeWhere(userId: string): Promise<{ companyId?: any }> {
    if (await this.hasGlobalScope(userId)) return {};
    const ids = await this.companyIds(userId);
    return { companyId: { in: ids } };
  }
}
