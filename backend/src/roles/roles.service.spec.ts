import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

const mockRoleResult = {
  id: 'role-1',
  name: 'EDITOR',
  description: 'Editor role',
  isSystem: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  rolePermissions: [
    { permission: { id: 'perm-1', name: 'user:read', description: null, group: 'user' } },
  ],
  _count: { userRoles: 2 },
};

const mockPrisma = {
  role: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  permission: { findMany: jest.fn() },
  rolePermission: { deleteMany: jest.fn() },
};

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
    jest.clearAllMocks();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all roles with permissions and user count', async () => {
      mockPrisma.role.findMany.mockResolvedValue([mockRoleResult]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('permissions');
      expect(result[0]).toHaveProperty('userCount', 2);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return formatted role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(mockRoleResult);

      const result = await service.findOne('role-1');

      expect(result.id).toBe('role-1');
      expect(result.permissions).toHaveLength(1);
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a role without permissions', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      mockPrisma.role.create.mockResolvedValue(mockRoleResult);

      const result = await service.create({ name: 'editor', description: 'Editor role' });

      expect(mockPrisma.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'EDITOR' }),
        }),
      );
      expect(result).toHaveProperty('permissions');
    });

    it('should create a role with permissions', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      mockPrisma.permission.findMany.mockResolvedValue([{ id: 'perm-1' }]);
      mockPrisma.role.create.mockResolvedValue(mockRoleResult);

      await service.create({ name: 'editor', permissionIds: ['perm-1'] });

      expect(mockPrisma.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rolePermissions: { create: [{ permissionId: 'perm-1' }] },
          }),
        }),
      );
    });

    it('should throw ConflictException if role name already exists', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-1' });

      await expect(service.create({ name: 'editor' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException if permission not found', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);
      mockPrisma.permission.findMany.mockResolvedValue([]); // no permission found

      await expect(
        service.create({ name: 'editor', permissionIds: ['bad-perm'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update role name and permissions', async () => {
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({ id: 'role-1', isSystem: false, name: 'EDITOR' })
        .mockResolvedValueOnce(null); // no name conflict
      mockPrisma.role.update.mockResolvedValue({
        ...mockRoleResult,
        name: 'AUTHOR',
      });

      const result = await service.update('role-1', {
        name: 'author',
        permissionIds: ['perm-1'],
      });

      expect(mockPrisma.role.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'AUTHOR' }),
        }),
      );
    });

    it('should throw ForbiddenException when updating a system role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        id: 'role-1',
        isSystem: true,
        name: 'SUPER_ADMIN',
      });

      await expect(
        service.update('role-1', { description: 'new desc' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.update('bad-id', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if new name is already taken', async () => {
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({ id: 'role-1', isSystem: false, name: 'EDITOR' })
        .mockResolvedValueOnce({ id: 'role-2', name: 'AUTHOR' }); // conflict

      await expect(
        service.update('role-1', { name: 'author' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a non-system role with no users', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        ...mockRoleResult,
        isSystem: false,
        _count: { userRoles: 0 },
      });
      mockPrisma.role.delete.mockResolvedValue({});

      const result = await service.delete('role-1');

      expect(mockPrisma.role.delete).toHaveBeenCalledWith({ where: { id: 'role-1' } });
      expect(result.message).toContain('deleted');
    });

    it('should throw ForbiddenException when deleting a system role', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        ...mockRoleResult,
        isSystem: true,
        _count: { userRoles: 0 },
      });

      await expect(service.delete('role-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when role is assigned to users', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({
        ...mockRoleResult,
        isSystem: false,
        _count: { userRoles: 3 },
      });

      await expect(service.delete('role-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.delete('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
