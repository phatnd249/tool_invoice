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
  findAll() {
    return this.schedulesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('invoice:read')
  findOne(@Param('id') id: string) {
    return this.schedulesService.findOne(id);
  }

  @Post()
  @RequirePermissions('invoice:download')
  create(@Body() dto: CreateScheduleDto) {
    return this.schedulesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('invoice:download')
  update(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedulesService.update(id, dto);
  }

  @Patch(':id/toggle')
  @RequirePermissions('invoice:download')
  toggle(@Param('id') id: string) {
    return this.schedulesService.toggle(id);
  }

  @Put(':id/companies')
  @RequirePermissions('invoice:download')
  updateCompanies(@Param('id') id: string, @Body() dto: AssignCompaniesDto) {
    return this.schedulesService.updateCompanies(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('invoice:download')
  remove(@Param('id') id: string) {
    return this.schedulesService.remove(id);
  }
}
