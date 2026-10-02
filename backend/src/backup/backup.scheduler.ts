import { Injectable, Logger, OnModuleInit, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import * as cron from 'node-cron';
import { BackupService } from './backup.service';
import { GoogleDriveService } from './google-drive.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BackupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupScheduler.name);
  private scheduledTask: cron.ScheduledTask | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly backupService: BackupService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  async onModuleInit() {
    await this.initSchedule();
  }

  onModuleDestroy() {
    this.stopSchedule();
  }

  stopSchedule() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
      this.logger.log('Đã dừng tác vụ sao lưu tự động');
    }
  }

  /**
   * Khởi động lại lịch sao lưu dựa trên cài đặt trong DB hoặc tham số truyền vào
   */
  async reschedule(
    newCron?: string,
    newAutoEnabled?: boolean,
  ): Promise<{
    success: boolean;
    message: string;
    cronSchedule: string;
    autoBackupEnabled: boolean;
  }> {
    this.stopSchedule();

    const setting = await this.prisma.backupSetting.findUnique({
      where: { id: 'default' },
    });

    const isAutoEnabled =
      newAutoEnabled !== undefined
        ? newAutoEnabled
        : (setting?.autoBackupEnabled ?? (process.env.BACKUP_AUTO_ENABLED ?? 'true').toLowerCase() === 'true');

    const cronExpression = (
      newCron ||
      setting?.cronSchedule ||
      process.env.BACKUP_CRON_SCHEDULE ||
      '0 2 * * *'
    ).trim();

    if (!isAutoEnabled) {
      this.logger.log('Tự động sao lưu đang bị tắt (autoBackupEnabled = false)');
      return {
        success: true,
        message: 'Đã tắt lịch tự động sao lưu',
        cronSchedule: cronExpression,
        autoBackupEnabled: false,
      };
    }

    if (!cron.validate(cronExpression)) {
      this.logger.error(`Biểu thức Cron không hợp lệ: "${cronExpression}"`);
      throw new BadRequestException(
        `Biểu thức Cron không hợp lệ: "${cronExpression}". Vui lòng kiểm tra lại cú pháp (Ví dụ: "0 2 * * *" = 02:00 sáng hàng ngày).`,
      );
    }

    this.scheduledTask = cron.schedule(cronExpression, async () => {
      this.logger.log(`Bắt đầu chạy tác vụ sao lưu tự động theo lịch ("${cronExpression}")...`);
      try {
        const isConfigured = await this.googleDriveService.isConfigured();
        if (!isConfigured) {
          this.logger.warn(
            'Tác vụ sao lưu tự động bỏ qua: Google Drive chưa được kết nối qua OAuth.',
          );
          return;
        }
        await this.backupService.executeBackup('AUTO');
      } catch (err: any) {
        this.logger.error(`Lỗi trong tiến trình sao lưu tự động: ${err.message}`);
      }
    });

    this.logger.log(
      `Đã kích hoạt lịch sao lưu Google Drive tự động thành công: "${cronExpression}"`,
    );

    return {
      success: true,
      message: `Đã kích hoạt lịch sao lưu tự động: "${cronExpression}"`,
      cronSchedule: cronExpression,
      autoBackupEnabled: true,
    };
  }

  private async initSchedule() {
    try {
      await this.reschedule();
    } catch (err: any) {
      this.logger.error(`Lỗi khởi tạo lịch sao lưu: ${err.message}`);
    }
  }
}
