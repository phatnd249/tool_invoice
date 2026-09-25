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
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { AuthUser } from '../auth/strategies/jwt.strategy';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { QueryUsersDto } from './dto/query-users.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Profile ───────────────────────────────────────────────────────────────

  // GET /api/profile
  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfile(user.id);
  }

  // PATCH /api/profile
  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  // PATCH /api/profile/change-password
  @Patch('profile/change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, dto);
  }

  // ─── Admin: User Management ────────────────────────────────────────────────

  // GET /api/users
  @Get('users')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('user:read')
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  // GET /api/users/:id
  @Get('users/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('user:read')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // POST /api/users
  @Post('users')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('user:create')
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.create(dto, user.id);
  }

  // PATCH /api/users/:id
  @Patch('users/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('user:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.update(id, dto, user.id);
  }

  // PATCH /api/users/:id/toggle-status
  @Patch('users/:id/toggle-status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('user:update')
  toggleStatus(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.toggleStatus(id, user.id);
  }

  // DELETE /api/users/:id
  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('user:delete')
  softDelete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.softDelete(id, user.id);
  }

  // POST /api/users/:id/roles
  @Post('users/:id/roles')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('role:assign')
  assignRoles(
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.assignRoles(id, dto.roleIds, user.id);
  }

  // DELETE /api/users/:id/roles/:roleId
  @Delete('users/:id/roles/:roleId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('role:assign')
  revokeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.usersService.revokeRole(id, roleId, user.id);
  }

  // ─── Admin: Company Assignments ──────────────────────────────────────────

  // GET /api/users/:id/companies
  @Get('users/:id/companies')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('user:read')
  getUserCompanies(@Param('id') id: string) {
    return this.usersService.getUserCompanies(id);
  }

  // POST /api/users/:id/companies
  @Post('users/:id/companies')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions('company:scope')
  assignCompanies(
    @Param('id') id: string,
    @Body() dto: { companyIds: string[] },
  ) {
    return this.usersService.assignCompanies(id, dto.companyIds);
  }
}
