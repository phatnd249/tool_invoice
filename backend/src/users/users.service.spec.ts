import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$newhashed$'),
  compare: jest.fn(),
}));
import * as bcrypt from 'bcrypt';
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const mockUserResult = {
  id: 'uid-1',
  fullName: 'John Doe',
  email: 'john@example.com',
  avatar: null,
  status: 'ACTIVE',
  emailVerified: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  userRoles: [{ role: { id: 'role-1', name: 'USER', description: null } }],
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  role: { findMany: jest.fn() },
  userRole: { upsert: jest.fn(), deleteMany: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUserResult]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should apply search filter to query', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll({ search: 'john', page: 1, limit: 10 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });

    it('should apply status filter to query', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll({ status: 'ACTIVE' as any, page: 1, limit: 10 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return formatted user by id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserResult);

      const result = await service.findOne('uid-1');

      expect(result).toMatchObject({ id: 'uid-1', email: 'john@example.com' });
      expect(result).toHaveProperty('roles');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('uid-999')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Password1',
      roleIds: ['role-1'],
    };

    it('should create a new user with assigned roles', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findMany.mockResolvedValue([{ id: 'role-1', name: 'USER' }]);
      mockPrisma.user.create.mockResolvedValue({
        ...mockUserResult,
        email: 'jane@example.com',
      });

      const result = await service.create(dto);
      expect(result.email).toBe('jane@example.com');
    });

    it('should throw ConflictException if email already in use', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if one or more roles not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findMany.mockResolvedValue([]); // no roles found

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update user data', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserResult);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUserResult,
        fullName: 'Updated Name',
      });

      const result = await service.update(
        'uid-1',
        { fullName: 'Updated Name' },
        'admin-uid',
      );

      expect(result.fullName).toBe('Updated Name');
    });

    it('should throw ForbiddenException when editing a SUPER_ADMIN by another user', async () => {
      const superAdminUser = {
        ...mockUserResult,
        userRoles: [{ role: { id: 'r-1', name: 'SUPER_ADMIN', description: null } }],
      };
      mockPrisma.user.findUnique.mockResolvedValue(superAdminUser);

      await expect(
        service.update('uid-1', { fullName: 'New Name' }, 'other-admin'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if new email is already in use', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUserResult) // findUserOrFail
        .mockResolvedValueOnce({ id: 'uid-2' }); // email check

      await expect(
        service.update('uid-1', { email: 'taken@example.com' }, 'admin-uid'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── toggleStatus ─────────────────────────────────────────────────────────

  describe('toggleStatus', () => {
    it('should toggle ACTIVE → INACTIVE and revoke tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserResult);
      mockPrisma.user.update.mockResolvedValue({
        ...mockUserResult,
        status: 'INACTIVE',
        userRoles: mockUserResult.userRoles,
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.toggleStatus('uid-1', 'admin-uid');

      expect(result.status).toBe('INACTIVE');
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('should throw BadRequestException when toggling own account', async () => {
      await expect(service.toggleStatus('uid-1', 'uid-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── softDelete ───────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('should soft delete user and revoke tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserResult);
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({});

      const result = await service.softDelete('uid-1', 'admin-uid');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
        }),
      );
      expect(result.message).toContain('deleted');
    });

    it('should throw BadRequestException when deleting own account', async () => {
      await expect(service.softDelete('uid-1', 'uid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.softDelete('uid-999', 'admin-uid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── assignRoles ─────────────────────────────────────────────────────────

  describe('assignRoles', () => {
    it('should assign roles to user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserResult);
      mockPrisma.role.findMany.mockResolvedValue([
        { id: 'role-1' },
        { id: 'role-2' },
      ]);
      mockPrisma.userRole.upsert.mockResolvedValue({});

      await service.assignRoles('uid-1', ['role-1', 'role-2']);

      expect(mockPrisma.userRole.upsert).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException if a role does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserResult);
      mockPrisma.role.findMany.mockResolvedValue([{ id: 'role-1' }]); // only 1 found, 2 requested

      await expect(
        service.assignRoles('uid-1', ['role-1', 'role-999']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── revokeRole ───────────────────────────────────────────────────────────

  describe('revokeRole', () => {
    it('should revoke role from user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserResult);
      mockPrisma.userRole.deleteMany.mockResolvedValue({ count: 1 });

      await service.revokeRole('uid-1', 'role-1');

      expect(mockPrisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'uid-1', roleId: 'role-1' },
      });
    });
  });

  // ─── getProfile ───────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return the profile of the authenticated user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserResult);

      const result = await service.getProfile('uid-1');

      expect(result).toMatchObject({ id: 'uid-1', email: 'john@example.com' });
      expect(result).toHaveProperty('roles');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('uid-999')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('should update fullName and avatar', async () => {
      mockPrisma.user.update.mockResolvedValue({
        ...mockUserResult,
        fullName: 'New Name',
      });

      const result = await service.updateProfile('uid-1', { fullName: 'New Name' });

      expect(result.fullName).toBe('New Name');
    });
  });

  // ─── changePassword ───────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('should change password and revoke all refresh tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        password: '$oldhashed$',
      });
      (mockedBcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true)  // current password match
        .mockResolvedValueOnce(false); // not same as new
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({});

      const result = await service.changePassword('uid-1', {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass1',
        confirmPassword: 'NewPass1',
      });

      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled();
      expect(result.message).toContain('changed successfully');
    });

    it('should throw BadRequestException when confirmPassword does not match', async () => {
      await expect(
        service.changePassword('uid-1', {
          currentPassword: 'OldPass1',
          newPassword: 'NewPass1',
          confirmPassword: 'Different1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when current password is incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        password: '$oldhashed$',
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.changePassword('uid-1', {
          currentPassword: 'Wrong1',
          newPassword: 'NewPass1',
          confirmPassword: 'NewPass1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when new password is same as current', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'uid-1',
        password: '$oldhashed$',
      });
      (mockedBcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true)  // current password match
        .mockResolvedValueOnce(true); // same as new password

      await expect(
        service.changePassword('uid-1', {
          currentPassword: 'Pass1',
          newPassword: 'Pass1',
          confirmPassword: 'Pass1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
