import { Controller, Param, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { DownloadTaskService } from './download-task.service';
import { SseAuthGuard } from '../auth/guards/sse-auth.guard';

/**
 * Controller riêng cho SSE stream.
 * Tách ra để tránh conflict với JwtAuthGuard ở class-level của TasksController.
 * EventSource không gửi được Authorization header nên dùng SseAuthGuard
 * (lấy token từ query param ?token=xxx).
 */
@Controller('invoices/tasks/stream')
export class TasksSseController {
  constructor(
    private readonly downloadTaskService: DownloadTaskService,
  ) {}

  @Sse(':taskId')
  @UseGuards(SseAuthGuard)
  streamTask(
    @Param('taskId') taskId: string,
  ): Observable<MessageEvent> {
    return this.downloadTaskService.getTaskStream(taskId);
  }
}
