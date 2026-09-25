import { Controller, Param, Req, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { DownloadTaskService } from './download-task.service';
import { SseAuthGuard } from '../auth/guards/sse-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

/**
 * Controller riêng cho SSE stream.
 * Tách ra để tránh conflict với JwtAuthGuard ở class-level của TasksController.
 * EventSource không gửi được Authorization header nên dùng SseAuthGuard
 * (lấy token từ query param ?token=xxx).
 *
 * Security: ngoài auth hợp lệ, bắt buộc permission `invoice:read` và
 * quyền truy cập task (tạo bởi user hoặc company trong scope) trước khi
 * mở stream — chống lộ dữ liệu task giữa các user.
 */
@Controller('invoices/tasks/stream')
export class TasksSseController {
  constructor(private readonly downloadTaskService: DownloadTaskService) {}

  @Sse(':taskId')
  @UseGuards(SseAuthGuard, PermissionsGuard)
  @RequirePermissions('invoice:read')
  streamTask(
    @Req() req: any,
    @Param('taskId') taskId: string,
  ): Observable<MessageEvent> {
    return this.downloadTaskService.getTaskStream(taskId, req.user.id);
  }
}
