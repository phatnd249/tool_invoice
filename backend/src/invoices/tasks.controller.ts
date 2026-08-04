import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { DownloadTaskService } from './download-task.service';
import { DownloadInvoicesDto } from './dto/download-invoices.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('invoices/tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(
    private readonly downloadTaskService: DownloadTaskService,
  ) {}

  /**
   * Tạo task tải hoá đơn và bắt đầu chạy async.
   * Thay thế POST /invoices/download cũ.
   */
  @Post('download')
  @RequirePermissions('invoice:download')
  createDownloadTask(
    @Body() dto: DownloadInvoicesDto,
    @CurrentUser() user: any,
  ) {
    return this.downloadTaskService.createAndStart(dto, user?.id);
  }

  /**
   * Kiểm tra task đang chạy của doanh nghiệp.
   * Dùng khi reload page hoặc mất kết nối SSE.
   */
  @Get('company/:companyId')
  @RequirePermissions('invoice:read')
  getActiveTask(@Param('companyId') companyId: string) {
    return this.downloadTaskService.getActiveTaskForCompany(companyId);
  }

  /**
   * Chi tiết một task.
   * Dùng path /detail/:taskId để tránh conflict với @Get() (danh sách).
   */
  @Get('detail/:taskId')
  @RequirePermissions('invoice:read')
  findOne(@Param('taskId') taskId: string) {
    return this.downloadTaskService.findOne(taskId);
  }

  /**
   * Huỷ task đang chạy.
   */
  @Post(':taskId/cancel')
  @RequirePermissions('invoice:download')
  cancelTask(@Param('taskId') taskId: string) {
    return this.downloadTaskService.cancelTask(taskId);
  }

  /**
   * Danh sách task (có phân trang + filter).
   * PHẢI ĐẶT SAU CÙNG để không bắt các route cụ thể phía trên.
   */
  @Get()
  @RequirePermissions('invoice:read')
  findAll(@Query() query: QueryTasksDto) {
    return this.downloadTaskService.findAll(query);
  }
}
