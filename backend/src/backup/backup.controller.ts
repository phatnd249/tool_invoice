import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Body,
} from '@nestjs/common';
import type { Response } from 'express';
import { BackupService, UpdateBackupScheduleDto } from './backup.service';
import { GoogleDriveService } from './google-drive.service';
import { BackupScheduler } from './backup.scheduler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly backupScheduler: BackupScheduler,
  ) {}

  /**
   * GET /api/backup/config
   * Lấy cấu hình sao lưu và thông tin dung lượng hệ thống
   */
  @Get('config')
  @RequirePermissions('backup:manage')
  async getConfigStatus() {
    return this.backupService.getConfigStatus();
  }

  /**
   * PUT /api/backup/schedule
   * Cập nhật lịch sao lưu và cài đặt lưu trữ trực tiếp (không cần chỉnh trong env)
   */
  @Put('schedule')
  @RequirePermissions('backup:manage')
  async updateSchedule(@Body() body: UpdateBackupScheduleDto) {
    const updated = await this.backupService.updateSchedule(body);
    await this.backupScheduler.reschedule(body.cronSchedule, body.autoBackupEnabled);
    return {
      success: true,
      message: 'Đã lưu cấu hình lịch sao lưu thành công!',
      data: updated,
    };
  }

  /**
   * GET /api/backup/oauth/url
   * Lấy URL để người dùng đăng nhập cấp quyền Google OAuth 2.0
   */
  @Get('oauth/url')
  @RequirePermissions('backup:manage')
  async getOAuthUrl(@Query('redirectUri') redirectUri?: string) {
    return this.googleDriveService.getOAuthAuthUrl(redirectUri);
  }

  /**
   * POST /api/backup/oauth/callback
   * Tiếp nhận authorization code từ Google OAuth và lưu token vào DB
   */
  @Post('oauth/callback')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('backup:manage')
  async handleOAuthCallback(
    @Body() body: { code: string; redirectUri?: string },
  ) {
    return this.googleDriveService.handleOAuthCallback(body.code, body.redirectUri);
  }

  /**
   * POST /api/backup/oauth/credentials
   * Cấu hình hoặc cập nhật Client ID và Client Secret trực tiếp từ giao diện web
   */
  @Post('oauth/credentials')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('backup:manage')
  async saveOAuthCredentials(
    @Body() body: { clientId: string; clientSecret: string },
  ) {
    return this.googleDriveService.saveOAuthCredentials(body.clientId, body.clientSecret);
  }

  /**
   * POST /api/backup/oauth/disconnect
   * Ngắt kết nối tài khoản Google Drive
   */
  @Post('oauth/disconnect')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('backup:manage')
  async disconnectOAuth() {
    return this.googleDriveService.disconnectOAuth();
  }

  /**
   * POST /api/backup/folder
   * Cập nhật Folder ID hoặc Link thư mục lưu trữ trên Google Drive
   */
  @Post('folder')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('backup:manage')
  async updateFolder(@Body() body: { folderId: string }) {
    return this.googleDriveService.updateFolder(body.folderId);
  }

  /**
   * POST /api/backup/test-connection
   * Kiểm tra kết nối Google Drive và quyền truy cập thư mục
   */
  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('backup:manage')
  async testConnection() {
    return this.googleDriveService.testConnection();
  }

  /**
   * POST /api/backup/trigger
   * Kích hoạt sao lưu ngay lập tức
   */
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('backup:manage')
  async triggerBackup(@Body() body?: { isFullBackup?: boolean }) {
    return this.backupService.executeBackup('MANUAL', body?.isFullBackup ?? false);
  }

  /**
   * GET /api/backup/history
   * Lấy lịch sử các lần chạy sao lưu
   */
  @Get('history')
  @RequirePermissions('backup:manage')
  async getBackupHistory(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 30;
    return this.backupService.getBackupHistory(
      isNaN(parsedLimit) ? 30 : parsedLimit,
    );
  }

  /**
   * GET /api/backup/drive-files
   * Danh sách các file backup đang lưu trên thư mục Google Drive
   */
  @Get('drive-files')
  @RequirePermissions('backup:manage')
  async listDriveFiles() {
    return this.googleDriveService.listFiles();
  }

  /**
   * DELETE /api/backup/drive-files/:fileId
   * Xóa 1 bản sao lưu trên Google Drive
   */
  @Delete('drive-files/:fileId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('backup:manage')
  async deleteDriveFile(@Param('fileId') fileId: string) {
    await this.googleDriveService.deleteFile(fileId);
    return { success: true, message: 'Đã xoá file sao lưu trên Google Drive' };
  }

  /**
   * GET /api/backup/drive-files/:fileId/download
   * Tải file sao lưu từ Google Drive về máy
   */
  @Get('drive-files/:fileId/download')
  @RequirePermissions('backup:manage')
  async downloadDriveFile(
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const { stream, fileName, size } =
      await this.googleDriveService.downloadFileStream(fileId);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    if (size) {
      res.setHeader('Content-Length', size.toString());
    }

    stream.pipe(res);
  }
}
