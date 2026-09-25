import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Request,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompaniesDto } from './dto/query-companies.dto';
import { ManualLoginDto } from './dto/manual-login.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthUser } from '../auth/strategies/jwt.strategy';

@Controller('companies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @RequirePermissions('company:read')
  findAll(@Query() query: QueryCompaniesDto, @Request() req: any) {
    const user: AuthUser = req.user;
    return this.companiesService.findAll(query, user.id);
  }

  @Get(':id')
  @RequirePermissions('company:read')
  findOne(@Param('id') id: string, @Request() req: any) {
    const user: AuthUser = req.user;
    return this.companiesService.findOne(id, user.id);
  }

  @Post()
  @RequirePermissions('company:create')
  create(@Body() dto: CreateCompanyDto, @Req() req: any) {
    const user: AuthUser = req.user;
    return this.companiesService.create(dto, user.id);
  }

  @Put(':id')
  @RequirePermissions('company:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @Request() req: any,
  ) {
    const user: AuthUser = req.user;
    return this.companiesService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions('company:delete')
  delete(@Param('id') id: string, @Request() req: any) {
    const user: AuthUser = req.user;
    return this.companiesService.delete(id, user.id);
  }

  @Post(':id/refresh')
  @RequirePermissions('company:login')
  refreshToken(@Param('id') id: string, @Request() req: any) {
    const user: AuthUser = req.user;
    return this.companiesService.refreshToken(id, user.id);
  }

  @Post(':id/login-manual')
  @RequirePermissions('company:login')
  loginManual(
    @Param('id') id: string,
    @Body() dto: ManualLoginDto,
    @Request() req: any,
  ) {
    const user: AuthUser = req.user;
    return this.companiesService.loginManual(id, dto, user.id);
  }

  @Get(':id/login-manual/captcha')
  @RequirePermissions('company:login')
  getLoginManualCaptcha(@Param('id') id: string, @Request() req: any) {
    const user: AuthUser = req.user;
    return this.companiesService.getLoginManualCaptcha(id, user.id);
  }

  @Put(':id/sync-info')
  @RequirePermissions('company:update')
  syncInfo(@Param('id') id: string, @Request() req: any) {
    const user: AuthUser = req.user;
    return this.companiesService.syncCompanyInfo(id, user.id);
  }
}
