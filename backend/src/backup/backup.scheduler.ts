import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as cron from 'node-cron';
import { BackupService } from './backup.service';
import { GoogleDriveService } from './google-drive.service';

@Injectable()
export class BackupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupScheduler.name);
  private scheduledTask: cron.ScheduledTask | null = null;

  constructor(
    private readonly backupService: BackupService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  onModuleInit() {
    this.initSchedule();
  }

  onModuleDestroy() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
    }
  }

  private initSchedule() {
    const isAutoEnabled =
      (process.env.BACKUP_AUTO_ENABLED ?? 'true').toLowerCase() === 'true';

    if (!isAutoEnabled) {
      this.logger.log('Tự động sao lưu đang bị tắt (BACKUP_AUTO_ENABLED=false)');
      return;
    }

    if (!this.googleDriveService.isConfigured()) {
      this.logger.warn(
        'Google Drive chưa được cấu hình. Lịch sao lưu tự động sẽ không kích hoạt.',
      );
      return;
    }

    const cronExpression = process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *'; // Mặc định 02:00 sáng mỗi ngày

    if (!cron.validate(cronExpression)) {
      this.logger.error(
        `Biểu thức BACKUP_CRON_SCHEDULE không hợp lệ: "${cronExpression}"`,
      );
      return;
    }

    this.logger.log(
      `Đã kích hoạt lịch sao lưu Google Drive tự động: "${cronExpression}"`,
    );

    this.scheduledTask = cron.schedule(cronExpression, async () => {
      this.logger.log('Bắt đầu chạy tác vụ sao lưu tự động theo lịch trình...');
      try {
        await this.backupService.executeBackup('AUTO');
      } catch (err: any) {
        this.logger.error(`Lỗi trong tiến trình sao lưu tự động: ${err.message}`);
      }
    });
  }
}
