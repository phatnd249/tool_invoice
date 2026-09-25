import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantAccessService } from './tenant-access.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  role: { findFirst: jest.fn() },
  permission: { findFirst: jest.fn() },
  userCompany: { findMany: jest.fn(), count: jest.fn() },
  invoice: { findUnique: jest.fn() },
  downloadTask: { findUnique: jest.fn() },
  schedule: { findUnique: jest.fn() },
};

describe('TenantAccessService', () => {
  let service: TenantAccessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantAccessService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TenantAccessService>(TenantAccessService);
    jest.clearAllMocks();
  });

  describe('companyScopeWhere', () => {
    it('returns empty where for global scope user (SUPER_ADMIN)', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'r1' });
      await expect(service.companyScopeWhere('uid-1')).resolves.toEqual({});
    });

    it('returns companyId-in filter for non-global user', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.permission.findFirst.mockResolvedValue(null);
      mockPrisma.userCompany.findMany.mockResolvedValue([
        { companyId: 'c1' },
        { companyId: 'c2' },
      ]);

      await expect(service.companyScopeWhere('uid-1')).resolves.toEqual({
        companyId: { in: ['c1', 'c2'] },
      });
    });
  });

  describe('assertCompanyAccess', () => {
    it('allows when user is assigned to the company', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.permission.findFirst.mockResolvedValue(null);
      mockPrisma.userCompany.count.mockResolvedValue(1);

      await expect(
        service.assertCompanyAccess('uid-1', 'c1'),
      ).resolves.toBeUndefined();
    });

    it('forbids when user has no access and has no global scope', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.permission.findFirst.mockResolvedValue(null);
      mockPrisma.userCompany.count.mockResolvedValue(0);

      await expect(service.assertCompanyAccess('uid-1', 'c1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows any company for a global-scope user', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'r1' });

      await expect(
        service.assertCompanyAccess('uid-1', 'c1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertInvoiceAccess', () => {
    it('forbids when invoice has no company', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({ companyId: null });

      await expect(
        service.assertInvoiceAccess('uid-1', 'inv-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns NotFound when invoice missing', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        service.assertInvoiceAccess('uid-1', 'inv-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertTaskAccess', () => {
    it('allows the task creator even without company scope', async () => {
      mockPrisma.downloadTask.findUnique.mockResolvedValue({
        companyId: 'c1',
        createdBy: 'uid-1',
      });

      await expect(
        service.assertTaskAccess('uid-1', 't1'),
      ).resolves.toBeUndefined();
    });

    it('forbids non-creator without company access', async () => {
      mockPrisma.downloadTask.findUnique.mockResolvedValue({
        companyId: 'c1',
        createdBy: 'other',
      });
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.permission.findFirst.mockResolvedValue(null);
      mockPrisma.userCompany.count.mockResolvedValue(0);

      await expect(service.assertTaskAccess('uid-1', 't1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertScheduleAccess', () => {
    it('requires access to ALL companies in the schedule', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.permission.findFirst.mockResolvedValue({ id: 'p1' }); // global scope
      await expect(
        service.assertScheduleAccess('uid-1', 's1'),
      ).resolves.toBeUndefined();
    });

    it('forbids when user misses any company of the schedule', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);
      mockPrisma.permission.findFirst.mockResolvedValue(null);
      mockPrisma.schedule.findUnique.mockResolvedValue({
        companies: [{ companyId: 'c1' }, { companyId: 'c2' }],
      });
      mockPrisma.userCompany.count.mockResolvedValue(1);

      await expect(service.assertScheduleAccess('uid-1', 's1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
