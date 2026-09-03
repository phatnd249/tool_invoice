import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const RESERVED_SYSTEM_ROLES = ['SUPER_ADMIN'];

function isReservedRoleName(name: string): boolean {
  return RESERVED_SYSTEM_ROLES.includes(name.toUpperCase());
}

const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  rolePermissions: {
    select: {
      permission: {
        select: { id: true, name: true, description: true, group: true },
      },
    },
  },
  _count: {
    select: { userRoles: true },
  },
};

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private formatRole(role: any) {
    const { rolePermissions, _count, ...rest } = role;
    return {
      ...rest,
      permissions: rolePermissions?.map((rp: any) => rp.permission) ?? [],
      userCount: _count?.userRoles ?? 0,
    };
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      select: ROLE_SELECT,
    });
    return roles.map(this.formatRole);
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: ROLE_SELECT,
    });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    return this.formatRole(role);
  }

  async create(dto: CreateRoleDto) {
    if (isReservedRoleName(dto.name)) {
      throw new ForbiddenException(
        `${dto.name.toUpperCase()} là vai trò hệ thống được bảo lưu`,
      );
    }

    const existing = await this.prisma.role.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Tên vai trò này đã tồn tại');

    if (dto.permissionIds?.length) {
      const permissions = await this.prisma.permission.findMany({
        where: { id: { in: dto.permissionIds } },
      });
      if (permissions.length !== dto.permissionIds.length) {
        throw new BadRequestException('Một hoặc nhiều quyền không tồn tại');
      }
    }

    const role = await this.prisma.role.create({
      data: {
        name: dto.name.toUpperCase(),
        description: dto.description,
        ...(dto.permissionIds?.length && {
          rolePermissions: {
            create: dto.permissionIds.map((permissionId) => ({ permissionId })),
          },
        }),
      },
      select: ROLE_SELECT,
    });

    return this.formatRole(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    if (role.isSystem) {
      throw new ForbiddenException('Không thể chỉnh sửa vai trò hệ thống');
    }

    if (dto.name && dto.name !== role.name) {
      if (isReservedRoleName(dto.name)) {
        throw new ForbiddenException(
          `${dto.name.toUpperCase()} là vai trò hệ thống được bảo lưu`,
        );
      }
      const existing = await this.prisma.role.findUnique({
        where: { name: dto.name },
      });
      if (existing) throw new ConflictException('Tên vai trò này đã tồn tại');
    }

    const { permissionIds, ...updateData } = dto;

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        ...updateData,
        ...(updateData.name && { name: updateData.name.toUpperCase() }),
        ...(permissionIds !== undefined && {
          rolePermissions: {
            deleteMany: {},
            create: permissionIds.map((permissionId) => ({ permissionId })),
          },
        }),
      },
      select: ROLE_SELECT,
    });

    return this.formatRole(updated);
  }

  async delete(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { userRoles: true } } },
    });
    if (!role) throw new NotFoundException('Không tìm thấy vai trò');
    if (role.isSystem) {
      throw new ForbiddenException('Không thể xoá vai trò hệ thống');
    }
    if (role._count.userRoles > 0) {
      throw new BadRequestException(
        'Không thể xoá vai trò đang được gán cho người dùng',
      );
    }

    await this.prisma.role.delete({ where: { id } });
    return { message: 'Đã xoá vai trò thành công' };
  }
}
