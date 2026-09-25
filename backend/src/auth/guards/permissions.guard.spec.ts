import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { ExecutionContext } from '@nestjs/common';

const mockReflector = { getAllAndOverride: jest.fn() };

const mockPrisma = {
  role: { findFirst: jest.fn().mockResolvedValue(null) },
  permission: { findMany: jest.fn() },
};

const buildContext = (userId: string): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId } }),
    }),
  }) as unknown as ExecutionContext;

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;

  beforeEach(() => {
    guard = new PermissionsGuard(
      mockReflector as unknown as Reflector,
      mockPrisma as unknown as PrismaService,
    );
    jest.clearAllMocks();
  });

  it('should allow request when no permissions are required', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(buildContext('uid-1'));
    expect(result).toBe(true);
  });

  it('should allow request when user has all required permissions', async () => {
    mockReflector.getAllAndOverride.mockReturnValue([
      'user:read',
      'user:create',
    ]);
    mockPrisma.permission.findMany.mockResolvedValue([
      { name: 'user:read' },
      { name: 'user:create' },
      { name: 'role:read' },
    ]);

    const result = await guard.canActivate(buildContext('uid-1'));
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when user lacks a required permission', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['user:delete']);
    mockPrisma.permission.findMany.mockResolvedValue([{ name: 'user:read' }]);

    await expect(guard.canActivate(buildContext('uid-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should throw ForbiddenException when user has no permissions at all', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['user:read']);
    mockPrisma.permission.findMany.mockResolvedValue([]);

    await expect(guard.canActivate(buildContext('uid-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should query permissions with correct userId filter', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(['role:read']);
    mockPrisma.permission.findMany.mockResolvedValue([{ name: 'role:read' }]);

    await guard.canActivate(buildContext('uid-42'));

    expect(mockPrisma.permission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rolePermissions: expect.objectContaining({
            some: expect.objectContaining({
              role: expect.objectContaining({
                userRoles: { some: { userId: 'uid-42' } },
              }),
            }),
          }),
        }),
      }),
    );
  });
});
