import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveService } from './google-drive.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';

export interface BackupConfigStatus {
  isDriveConfigured: boolean;
  authMethod: 'JSON_CONTENT' | 'NOT_CONFIGURED';
  clientEmail: string | null;
  folderId: string | null;
  autoBackupEnabled: boolean;
  cronSchedule: string;
  retentionCount: number;
  lastBackup: any;
  database: {
    path: string;
    exists: boolean;
    sizeBytes: number;
  };
  invoices: {
    path: string;
    exists: boolean;
    totalFiles: number;
    sizeBytes: number;
  };
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleDriveService: GoogleDriveService,
  ) { }

  /**
   * Resolve SQLite database file path from DATABASE_URL
   */
  getDatabasePath(): string {
    const rawUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
    let cleanPath = rawUrl.replace(/^file:/, '').trim();

    // If query params exist, strip them
    if (cleanPath.includes('?')) {
      cleanPath = cleanPath.split('?')[0];
    }

    if (path.isAbsolute(cleanPath)) {
      return cleanPath;
    }

    // SQLite relative paths are usually relative to backend cwd or prisma dir
    const candidates = [
      path.resolve(process.cwd(), cleanPath),
      path.resolve(process.cwd(), 'prisma', path.basename(cleanPath)),
      path.resolve(process.cwd(), 'data', path.basename(cleanPath)),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) return cand;
    }

    return path.resolve(process.cwd(), cleanPath);
  }

  /**
   * Resolve Invoices storage directory
   */
  getInvoicesDirPath(): string {
    const dir = process.env.INVOICES_DIR || './invoices';
    if (path.isAbsolute(dir)) return dir;
    return path.resolve(process.cwd(), dir);
  }

  /**
   * Helper to calculate directory size and file count recursively
   */
  private getDirStats(dirPath: string): { totalFiles: number; sizeBytes: number } {
    let totalFiles = 0;
    let sizeBytes = 0;

    if (!fs.existsSync(dirPath)) return { totalFiles: 0, sizeBytes: 0 };

    const scan = (currentDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (entry.isFile()) {
            totalFiles++;
            try {
              const stat = fs.statSync(fullPath);
              sizeBytes += stat.size;
            } catch {
              // ignore transient error
            }
          }
        }
      } catch {
        // ignore unreadable dir
      }
    };

    scan(dirPath);
    return { totalFiles, sizeBytes };
  }

  /**
   * Get backup configuration status and data statistics
   */
  async getConfigStatus(): Promise<BackupConfigStatus> {
    const dbPath = this.getDatabasePath();
    const dbExists = fs.existsSync(dbPath);
    let dbSize = 0;
    if (dbExists) {
      try {
        dbSize = fs.statSync(dbPath).size;
      } catch {
        // ignore
      }
    }

    const invoicesPath = this.getInvoicesDirPath();
    const invoicesExists = fs.existsSync(invoicesPath);
    const invoiceStats = this.getDirStats(invoicesPath);

    const lastBackup = await this.prisma.backupLog.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const autoBackupEnabled =
      (process.env.BACKUP_AUTO_ENABLED ?? 'true').toLowerCase() === 'true';
    const cronSchedule = process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *';
    const retentionCount = parseInt(process.env.BACKUP_RETENTION_COUNT || '0', 10);

    return {
      isDriveConfigured: this.googleDriveService.isConfigured(),
      authMethod: this.googleDriveService.getAuthMethod(),
      clientEmail: this.googleDriveService.getClientEmail(),
      folderId: this.googleDriveService.getFolderId(),
      autoBackupEnabled,
      cronSchedule,
      retentionCount: isNaN(retentionCount) ? 0 : retentionCount,
      lastBackup,
      database: {
        path: dbPath,
        exists: dbExists,
        sizeBytes: dbSize,
      },
      invoices: {
        path: invoicesPath,
        exists: invoicesExists,
        totalFiles: invoiceStats.totalFiles,
        sizeBytes: invoiceStats.sizeBytes,
      },
    };
  }

  /**
   * Create a ZIP archive containing database and invoice files
   */
  async createBackupArchive(): Promise<{
    archivePath: string;
    fileName: string;
    fileSize: number;
    fileCount: number;
  }> {
    const tempDir = path.join(os.tmpdir(), 'invoice-tool-backups');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, '');
    const fileName = `invoice_backup_${timestamp}.zip`;
    const archivePath = path.join(tempDir, fileName);

    this.logger.log(`Tạo gói sao lưu: ${fileName}...`);
    const zip = new AdmZip();
    let fileCount = 0;

    // 1. Pack database
    const dbPath = this.getDatabasePath();
    if (fs.existsSync(dbPath)) {
      zip.addLocalFile(dbPath, 'database');
      fileCount++;

      // Check for SQLite WAL & SHM files if WAL mode is enabled
      const walPath = `${dbPath}-wal`;
      if (fs.existsSync(walPath)) {
        zip.addLocalFile(walPath, 'database');
        fileCount++;
      }
      const shmPath = `${dbPath}-shm`;
      if (fs.existsSync(shmPath)) {
        zip.addLocalFile(shmPath, 'database');
        fileCount++;
      }
    } else {
      this.logger.warn(`Không tìm thấy file database tại ${dbPath}`);
    }

    // 2. Pack invoices directory
    const invoicesPath = this.getInvoicesDirPath();
    if (fs.existsSync(invoicesPath)) {
      zip.addLocalFolder(invoicesPath, 'invoices');
      const stats = this.getDirStats(invoicesPath);
      fileCount += stats.totalFiles;
    }

    // 3. Manifest file
    const manifest = {
      system: 'Invoice Pro',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      databasePath: dbPath,
      invoicesPath,
      totalPackedFiles: fileCount,
      hostname: os.hostname(),
      platform: process.platform,
      nodeVersion: process.version,
    };
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
    fileCount++;

    // Write zip file
    zip.writeZip(archivePath);

    const stat = fs.statSync(archivePath);
    this.logger.log(
      `Đóng gói sao lưu hoàn tất: ${fileName} (${(stat.size / 1024 / 1024).toFixed(2)} MB, ~${fileCount} files)`,
    );

    return {
      archivePath,
      fileName,
      fileSize: stat.size,
      fileCount,
    };
  }

  /**
   * Execute complete backup process and upload to Google Drive
   */
  async executeBackup(triggerType: 'MANUAL' | 'AUTO'): Promise<any> {
    if (!this.googleDriveService.isConfigured()) {
      throw new BadRequestException(
        'Google Drive chưa được cấu hình. Vui lòng thiết lập biến môi trường Google Service Account và Folder ID.',
      );
    }

    const startTime = Date.now();
    let archiveInfo: { archivePath: string; fileName: string; fileSize: number } | null = null;

    // Create log record with IN_PROGRESS status
    const backupLog = await this.prisma.backupLog.create({
      data: {
        fileName: 'backup_in_progress.zip',
        status: 'IN_PROGRESS',
        triggerType,
      },
    });

    try {
      // 1. Create local ZIP archive
      archiveInfo = await this.createBackupArchive();

      await this.prisma.backupLog.update({
        where: { id: backupLog.id },
        data: {
          fileName: archiveInfo.fileName,
          fileSize: archiveInfo.fileSize,
        },
      });

      // 2. Upload to Google Drive
      const uploadRes = await this.googleDriveService.uploadFile(
        archiveInfo.archivePath,
        archiveInfo.fileName,
      );

      // 3. Prune old backups on Drive (retentionCount=0 means keep all)
      const retentionCount = parseInt(process.env.BACKUP_RETENTION_COUNT || '0', 10);
      const pruneResult = retentionCount > 0
        ? await this.googleDriveService.pruneOldBackups(retentionCount)
        : { deletedCount: 0, deletedFiles: [] };

      const durationMs = Date.now() - startTime;

      // 4. Update log to SUCCESS
      const updatedLog = await this.prisma.backupLog.update({
        where: { id: backupLog.id },
        data: {
          status: 'SUCCESS',
          driveFileId: uploadRes.fileId,
          driveFileUrl: uploadRes.webViewLink,
          fileSize: uploadRes.size,
          durationMs,
        },
      });

      this.logger.log(
        `Sao lưu thành công [${triggerType}]: ${archiveInfo.fileName} (${(uploadRes.size / 1024 / 1024).toFixed(2)} MB) trong ${durationMs}ms`,
      );

      return {
        ...updatedLog,
        prunedFilesCount: pruneResult.deletedCount,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`Sao lưu thất bại: ${err.message}`, err.stack);

      await this.prisma.backupLog.update({
        where: { id: backupLog.id },
        data: {
          status: 'FAILED',
          errorMessage: err.message || 'Lỗi không xác định',
          durationMs,
        },
      });

      throw new InternalServerErrorException(`Sao lưu thất bại: ${err.message}`);
    } finally {
      // Always cleanup local temporary zip file
      if (archiveInfo && fs.existsSync(archiveInfo.archivePath)) {
        try {
          fs.unlinkSync(archiveInfo.archivePath);
          this.logger.log(`Đã dọn dẹp file tạm cục bộ: ${archiveInfo.archivePath}`);
        } catch (cleanupErr: any) {
          this.logger.warn(`Không thể xoá file tạm: ${cleanupErr.message}`);
        }
      }
    }
  }

  /**
   * Get history of backup runs
   */
  async getBackupHistory(limit = 30) {
    return this.prisma.backupLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
