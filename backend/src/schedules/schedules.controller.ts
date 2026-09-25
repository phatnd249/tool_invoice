import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { AssignCompaniesDto } from './dto/assign-companies.dto';

@Controller('schedules')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get()
  @RequirePermissions('invoice:read')
  findAll(@CurrentUser() user: any) {
    return this.schedulesService.findAll(user.id);
  }

  @Get(':id')
  @RequirePermissions('invoice:read')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.schedulesService.findOne(id, user.id);
  }

  @Post()
  @RequirePermissions('invoice:download')
  create(@Body() dto: CreateScheduleDto) {
    return this.schedulesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('invoice:download')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() user: any,
  ) {
    return this.schedulesService.update(id, dto, user.id);
  }

  @Patch(':id/toggle')
  @RequirePermissions('invoice:download')
  toggle(@Param('id') id: string, @CurrentUser() user: any) {
    return this.schedulesService.toggle(id, user.id);
  }

  @Put(':id/companies')
  @RequirePermissions('invoice:download')
  updateCompanies(
    @Param('id') id: string,
    @Body() dto: AssignCompaniesDto,
    @CurrentUser() user: any,
  ) {
    return this.schedulesService.updateCompanies(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions('invoice:download')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.schedulesService.remove(id, user.id);
  }
}
