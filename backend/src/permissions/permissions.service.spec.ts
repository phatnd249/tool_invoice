import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPermission = {
  id: 'perm-1',
  name: 'user:read',
  description: 'View users',
  group: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  permission: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    jest.clearAllMocks();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all permissions sorted by group and name', async () => {
      mockPrisma.permission.findMany.mockResolvedValue([mockPermission]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ group: 'asc' }, { name: 'asc' }],
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return permission by id', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(mockPermission);

      const result = await service.findOne('perm-1');

      expect(result.name).toBe('user:read');
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a new permission', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(null);
      mockPrisma.permission.create.mockResolvedValue(mockPermission);

      const result = await service.create({
        name: 'user:read',
        description: 'View users',
        group: 'user',
      });

      expect(result.name).toBe('user:read');
      expect(mockPrisma.permission.create).toHaveBeenCalledWith({
        data: { name: 'user:read', description: 'View users', group: 'user' },
      });
    });

    it('should throw ConflictException if name already exists', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({ id: 'perm-1' });

      await expect(
        service.create({ name: 'user:read', group: 'user' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update description and group', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(mockPermission);
      mockPrisma.permission.update.mockResolvedValue({
        ...mockPermission,
        description: 'Updated desc',
      });

      const result = await service.update('perm-1', { description: 'Updated desc' });

      expect(result.description).toBe('Updated desc');
    });

    it('should throw NotFoundException when permission not found', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete permission when not assigned to any role', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        ...mockPermission,
        _count: { rolePermissions: 0 },
      });
      mockPrisma.permission.delete.mockResolvedValue({});

      const result = await service.delete('perm-1');

      expect(mockPrisma.permission.delete).toHaveBeenCalledWith({
        where: { id: 'perm-1' },
      });
      expect(result.message).toContain('deleted');
    });

    it('should throw BadRequestException when permission is assigned to roles', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue({
        ...mockPermission,
        _count: { rolePermissions: 2 },
      });

      await expect(service.delete('perm-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when permission not found', async () => {
      mockPrisma.permission.findUnique.mockResolvedValue(null);

      await expect(service.delete('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
