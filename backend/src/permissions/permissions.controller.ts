import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // GET /api/permissions
  @Get()
  @RequirePermissions('permission:read')
  findAll() {
    return this.permissionsService.findAll();
  }

  // GET /api/permissions/:id
  @Get(':id')
  @RequirePermissions('permission:read')
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  // POST /api/permissions
  @Post()
  @RequirePermissions('permission:create')
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  // PATCH /api/permissions/:id
  @Patch(':id')
  @RequirePermissions('permission:update')
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }

  // DELETE /api/permissions/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('permission:delete')
  delete(@Param('id') id: string) {
    return this.permissionsService.delete(id);
  }
}
