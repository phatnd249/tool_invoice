import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { GoogleDriveService } from './google-drive.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  /**
   * GET /api/backup/config
   * Get current Google Drive backup configuration & storage status
   */
  @Get('config')
  @RequirePermissions('backup:manage')
  async getConfigStatus() {
    return this.backupService.getConfigStatus();
  }

  /**
   * POST /api/backup/test-connection
   * Test connection to Google Drive and verify folder access
   */
  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('backup:manage')
  async testConnection() {
    return this.googleDriveService.testConnection();
  }

  /**
   * POST /api/backup/trigger
   * Manually trigger a backup immediately
   */
  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('backup:manage')
  async triggerBackup() {
    return this.backupService.executeBackup('MANUAL');
  }

  /**
   * GET /api/backup/history
   * Get backup execution logs from database
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
   * List backup files stored in the Google Drive folder
   */
  @Get('drive-files')
  @RequirePermissions('backup:manage')
  async listDriveFiles() {
    return this.googleDriveService.listFiles();
  }

  /**
   * DELETE /api/backup/drive-files/:fileId
   * Delete a backup file from Google Drive
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
   * Stream download a backup file from Google Drive
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
