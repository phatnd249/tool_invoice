import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthUser } from '../strategies/jwt.strategy';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    if (!user) throw new ForbiddenException('Access denied');

    // SUPER_ADMIN bypasses all permission checks
    const isSuperAdmin = await this.prisma.role.findFirst({
      where: {
        name: 'SUPER_ADMIN',
        userRoles: { some: { userId: user.id } },
      },
    });
    if (isSuperAdmin) return true;

    const userPermissions = await this.prisma.permission.findMany({
      where: {
        rolePermissions: {
          some: {
            role: {
              userRoles: {
                some: { userId: user.id },
              },
            },
          },
        },
      },
      select: { name: true },
    });

    const permissionSet = new Set(userPermissions.map((p) => p.name));
    const hasAll = requiredPermissions.every((p) => permissionSet.has(p));

    if (!hasAll) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
