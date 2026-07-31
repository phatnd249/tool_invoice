import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });
    if (!permission) throw new NotFoundException('Permission not found');
    return permission;
  }

  async create(dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Permission name already exists');

    return this.prisma.permission.create({ data: dto });
  }

  async update(id: string, dto: UpdatePermissionDto) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });
    if (!permission) throw new NotFoundException('Permission not found');

    return this.prisma.permission.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
      include: { _count: { select: { rolePermissions: true } } },
    });
    if (!permission) throw new NotFoundException('Permission not found');
    if (permission._count.rolePermissions > 0) {
      throw new BadRequestException(
        'Cannot delete a permission that is assigned to roles',
      );
    }

    await this.prisma.permission.delete({ where: { id } });
    return { message: 'Permission deleted successfully' };
  }
}
