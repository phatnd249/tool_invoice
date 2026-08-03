import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

const USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  avatar: true,
  status: true,
  emailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  userRoles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          rolePermissions: {
            select: {
              permission: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private formatUser(user: any) {
    const { userRoles, ...rest } = user;
    return {
      ...rest,
      roles: userRoles?.map((ur: any) => ({
        id: ur.role.id,
        name: ur.role.name,
        description: ur.role.description,
        permissions: ur.role.rolePermissions?.map((rp: any) => rp.permission) ?? [],
      })) ?? [],
    };
  }

  private async findUserOrFail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ─── Admin: List Users ───────────────────────────────────────────────────

  async findAll(query: QueryUsersDto) {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      roleId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
      ...(status && { status }),
      ...(search && {
        OR: [
          { fullName: { contains: search } },
          { email: { contains: search } },
        ],
      }),
      ...(roleId && {
        userRoles: { some: { roleId } },
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(users.map(this.formatUser), total, page, limit);
  }

  // ─── Admin: Get User ─────────────────────────────────────────────────────

  async findOne(id: string) {
    const user = await this.findUserOrFail(id);
    return this.formatUser(user);
  }

  // ─── Admin: Create User ───────────────────────────────────────────────────

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const roles = await this.prisma.role.findMany({
      where: { id: { in: dto.roleIds } },
    });
    if (roles.length !== dto.roleIds.length) {
      throw new BadRequestException('One or more roles not found');
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashedPassword,
        emailVerified: true,
        status: 'ACTIVE',
        userRoles: {
          create: dto.roleIds.map((roleId) => ({ roleId })),
        },
      },
      select: USER_SELECT,
    });

    return this.formatUser(user);
  }

  // ─── Admin: Update User ───────────────────────────────────────────────────

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const user = await this.findUserOrFail(id);

    // Prevent editing SUPER_ADMIN by non-self
    const isSuperAdmin = user.userRoles.some(
      (ur: any) => ur.role.name === 'SUPER_ADMIN',
    );
    if (isSuperAdmin && actorId !== id) {
      throw new ForbiddenException('Cannot modify a Super Admin account');
    }

    if (dto.email && dto.email !== (user as any).email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) throw new ConflictException('Email already in use');
    }

    const { roleIds, ...updateData } = dto;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateData,
        ...(roleIds && {
          userRoles: {
            deleteMany: {},
            create: roleIds.map((roleId) => ({ roleId })),
          },
        }),
      },
      select: USER_SELECT,
    });

    return this.formatUser(updated);
  }

  // ─── Admin: Toggle User Status ────────────────────────────────────────────

  async toggleStatus(id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestException('Cannot change your own account status');
    }

    const user = await this.findUserOrFail(id);
    const newStatus = (user as any).status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: newStatus },
      select: USER_SELECT,
    });

    // Revoke all refresh tokens when deactivating
    if (newStatus === 'INACTIVE') {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return this.formatUser(updated);
  }

  // ─── Admin: Soft Delete User ──────────────────────────────────────────────

  async softDelete(id: string, actorId: string) {
    if (id === actorId) {
      throw new BadRequestException('Cannot delete your own account');
    }
    await this.findUserOrFail(id);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Revoke all tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'User deleted successfully' };
  }

  // ─── Admin: Assign Roles ──────────────────────────────────────────────────

  async assignRoles(userId: string, roleIds: string[]) {
    await this.findUserOrFail(userId);

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more roles not found');
    }

    // Upsert each role assignment
    await Promise.all(
      roleIds.map((roleId) =>
        this.prisma.userRole.upsert({
          where: { userId_roleId: { userId, roleId } },
          create: { userId, roleId },
          update: {},
        }),
      ),
    );

    return this.findOne(userId);
  }

  // ─── Admin: Revoke Role ────────────────────────────────────────────────────

  async revokeRole(userId: string, roleId: string) {
    await this.findUserOrFail(userId);

    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
    return this.findOne(userId);
  }

  // ─── Profile: Get Own Profile ─────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.formatUser(user);
  }

  // ─── Profile: Update Profile ──────────────────────────────────────────────

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: USER_SELECT,
    });
    return this.formatUser(user);
  }

  // ─── Admin: Assign Companies ──────────────────────────────────────────────

  async getUserCompanies(userId: string) {
    await this.findUserOrFail(userId);
    const companies = await this.prisma.userCompany.findMany({
      where: { userId },
      select: {
        company: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return companies.map((uc) => uc.company);
  }

  async assignCompanies(userId: string, companyIds: string[]) {
    await this.findUserOrFail(userId);

    // Validate all companies exist
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds } },
    });
    if (companies.length !== companyIds.length) {
      throw new BadRequestException('One or more companies not found');
    }

    // Replace all assignments atomically
    await this.prisma.userCompany.deleteMany({ where: { userId } });
    if (companyIds.length > 0) {
      await this.prisma.userCompany.createMany({
        data: companyIds.map((companyId) => ({ userId, companyId })),
      });
    }

    return this.getUserCompanies(userId);
  }

  // ─── Profile: Change Password ─────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) throw new BadRequestException('Current password is incorrect');

    const isSame = await bcrypt.compare(dto.newPassword, user.password);
    if (isSame) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const hashed = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    // Revoke all refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Password changed successfully. Please log in again.' };
  }
}
