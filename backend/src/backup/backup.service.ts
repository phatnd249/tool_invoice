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
import * as cron from 'node-cron';

export interface BackupArchiveInfo {
  archivePath: string;
  fileName: string;
  fileSize: number;
  partIndex: number;
  totalParts: number;
  fileCount: number;
}

export interface BackupConfigStatus {
  isDriveConfigured: boolean;
  authMethod: 'OAUTH' | 'NOT_CONFIGURED';
  clientEmail: string | null;
  folderId: string | null;
  folderName?: string | null;
  folderUrl?: string | null;
  isConnected?: boolean;
  hasOAuthConfig?: boolean;
  oauthClientId?: string | null;
  lastTestedAt?: Date | null;
  lastError?: string | null;
  autoBackupEnabled: boolean;
  cronSchedule: string;
  retentionCount: number;
  lastBackup: any;
  backupMode: 'INCREMENTAL' | 'FULL';
  maxChunkSizeMb: number;
  chunkDelayMs: number;
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

export interface InvoiceFileInfo {
  fullPath: string;
  relPath: string;
  size: number;
  mtimeMs: number;
}

export class UpdateBackupScheduleDto {
  autoBackupEnabled!: boolean;
  cronSchedule!: string;
  retentionCount?: number;
  backupMode?: 'INCREMENTAL' | 'FULL';
  maxChunkSizeMb?: number;
  chunkDelayMs?: number;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  /**
   * Lấy cài đặt lịch và phân tách file từ DB (fallback về .env)
   */
  async getBackupSettings(): Promise<{
    autoBackupEnabled: boolean;
    cronSchedule: string;
    retentionCount: number;
    backupMode: 'INCREMENTAL' | 'FULL';
    maxChunkSizeMb: number;
    maxChunkBytes: number;
    chunkDelayMs: number;
  }> {
    const setting = await this.prisma.backupSetting.findUnique({
      where: { id: 'default' },
    });

    const autoBackupEnabled =
      setting?.autoBackupEnabled ??
      (process.env.BACKUP_AUTO_ENABLED ?? 'true').toLowerCase() === 'true';

    const cronSchedule =
      setting?.cronSchedule || process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *';

    const rawRetention =
      setting?.retentionCount ??
      parseInt(process.env.BACKUP_RETENTION_COUNT ?? '7', 10);
    const retentionCount = isNaN(rawRetention) || rawRetention < 0 ? 7 : rawRetention;

    const rawMode = (
      setting?.backupMode ||
      process.env.BACKUP_MODE ||
      'INCREMENTAL'
    ).toUpperCase();
    const backupMode: 'INCREMENTAL' | 'FULL' =
      rawMode === 'FULL' ? 'FULL' : 'INCREMENTAL';

    const rawChunkSize =
      setting?.maxChunkSizeMb ??
      parseInt(process.env.BACKUP_MAX_CHUNK_SIZE_MB || '15', 10);
    const maxChunkSizeMb =
      isNaN(rawChunkSize) || rawChunkSize <= 0 ? 15 : rawChunkSize;

    const rawDelay =
      setting?.chunkDelayMs ??
      parseInt(process.env.BACKUP_CHUNK_DELAY_MS || '2000', 10);
    const chunkDelayMs = isNaN(rawDelay) || rawDelay < 0 ? 2000 : rawDelay;

    return {
      autoBackupEnabled,
      cronSchedule,
      retentionCount,
      backupMode,
      maxChunkSizeMb,
      maxChunkBytes: maxChunkSizeMb * 1024 * 1024,
      chunkDelayMs,
    };
  }

  /**
   * Cập nhật cài đặt lịch sao lưu vào database
   */
  async updateSchedule(dto: UpdateBackupScheduleDto) {
    if (!cron.validate(dto.cronSchedule.trim())) {
      throw new BadRequestException(
        `Biểu thức Cron không hợp lệ: "${dto.cronSchedule}". Ví dụ: "0 2 * * *" (chạy lúc 02:00 sáng mỗi ngày).`,
      );
    }

    const retentionCount =
      dto.retentionCount !== undefined ? Math.max(0, dto.retentionCount) : 7;
    const backupMode = dto.backupMode === 'FULL' ? 'FULL' : 'INCREMENTAL';
    const maxChunkSizeMb =
      dto.maxChunkSizeMb && dto.maxChunkSizeMb > 0 ? dto.maxChunkSizeMb : 15;
    const chunkDelayMs =
      dto.chunkDelayMs !== undefined && dto.chunkDelayMs >= 0
        ? dto.chunkDelayMs
        : 2000;

    const updated = await this.prisma.backupSetting.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        autoBackupEnabled: dto.autoBackupEnabled,
        cronSchedule: dto.cronSchedule.trim(),
        retentionCount,
        backupMode,
        maxChunkSizeMb,
        chunkDelayMs,
      },
      update: {
        autoBackupEnabled: dto.autoBackupEnabled,
        cronSchedule: dto.cronSchedule.trim(),
        retentionCount,
        backupMode,
        maxChunkSizeMb,
        chunkDelayMs,
      },
    });

    this.logger.log(
      `Đã cập nhật lịch sao lưu: cron="${updated.cronSchedule}", auto=${updated.autoBackupEnabled}, retention=${updated.retentionCount}`,
    );

    return {
      autoBackupEnabled: updated.autoBackupEnabled,
      cronSchedule: updated.cronSchedule,
      retentionCount: updated.retentionCount,
      backupMode: updated.backupMode as 'INCREMENTAL' | 'FULL',
      maxChunkSizeMb: updated.maxChunkSizeMb,
      chunkDelayMs: updated.chunkDelayMs,
    };
  }

  /**
   * Resolve SQLite database file path from DATABASE_URL
   */
  getDatabasePath(): string {
    const rawUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
    let cleanPath = rawUrl.replace(/^file:/, '').trim();

    if (cleanPath.includes('?')) {
      cleanPath = cleanPath.split('?')[0];
    }

    if (path.isAbsolute(cleanPath)) {
      return cleanPath;
    }

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
   * Liệt kê toàn bộ file trong thư mục invoices (kèm đường dẫn tương đối và thời gian sửa đổi)
   */
  private getAllInvoiceFiles(baseDir: string): InvoiceFileInfo[] {
    const results: InvoiceFileInfo[] = [];
    if (!fs.existsSync(baseDir)) return results;

    const scan = (currentDir: string) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (entry.isFile()) {
            try {
              const stat = fs.statSync(fullPath);
              const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
              results.push({
                fullPath,
                relPath,
                size: stat.size,
                mtimeMs: stat.mtimeMs,
              });
            } catch {
              // ignore transient error
            }
          }
        }
      } catch {
        // ignore unreadable dir
      }
    };

    scan(baseDir);
    return results;
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

    const settings = await this.getBackupSettings();
    const driveInfo = await this.googleDriveService.getDriveConfigInfo();

    return {
      isDriveConfigured: driveInfo.isConfigured,
      authMethod: driveInfo.authMethod,
      clientEmail: driveInfo.clientEmail,
      folderId: driveInfo.folderId,
      folderName: driveInfo.folderName,
      folderUrl: driveInfo.folderUrl,
      isConnected: driveInfo.isConnected,
      hasOAuthConfig: driveInfo.hasOAuthConfig,
      oauthClientId: driveInfo.oauthClientId,
      lastTestedAt: driveInfo.lastTestedAt,
      lastError: driveInfo.lastError,
      autoBackupEnabled: settings.autoBackupEnabled,
      cronSchedule: settings.cronSchedule,
      retentionCount: settings.retentionCount,
      lastBackup,
      backupMode: settings.backupMode,
      maxChunkSizeMb: settings.maxChunkSizeMb,
      chunkDelayMs: settings.chunkDelayMs,
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
   * Đóng gói các tệp sao lưu.
   */
  async createBackupArchives(options?: {
    forceFull?: boolean;
  }): Promise<BackupArchiveInfo[]> {
    const tempDir = path.join(os.tmpdir(), 'invoice-tool-backups');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const settings = await this.getBackupSettings();
    const effectiveMode = options?.forceFull ? 'FULL' : settings.backupMode;
    const { maxChunkBytes, maxChunkSizeMb } = settings;

    const timestamp = new Date()
      .toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, '');

    // 1. Collect database files
    const dbPath = this.getDatabasePath();
    const dbFiles: Array<{ fullPath: string; zipSubPath: string; size: number }> = [];
    let dbTotalBytes = 0;

    if (fs.existsSync(dbPath)) {
      try {
        const stat = fs.statSync(dbPath);
        dbFiles.push({ fullPath: dbPath, zipSubPath: 'database', size: stat.size });
        dbTotalBytes += stat.size;
      } catch {
        // ignore
      }

      const walPath = `${dbPath}-wal`;
      if (fs.existsSync(walPath)) {
        try {
          const walStat = fs.statSync(walPath);
          dbFiles.push({ fullPath: walPath, zipSubPath: 'database', size: walStat.size });
          dbTotalBytes += walStat.size;
        } catch {
          // ignore
        }
      }

      const shmPath = `${dbPath}-shm`;
      if (fs.existsSync(shmPath)) {
        try {
          const shmStat = fs.statSync(shmPath);
          dbFiles.push({ fullPath: shmPath, zipSubPath: 'database', size: shmStat.size });
          dbTotalBytes += shmStat.size;
        } catch {
          // ignore
        }
      }
    } else {
      this.logger.warn(`Không tìm thấy file database tại ${dbPath}`);
    }

    // 2. Collect invoices files (Incremental vs Full)
    const invoicesPath = this.getInvoicesDirPath();
    const allInvoiceFiles = this.getAllInvoiceFiles(invoicesPath);
    let invoiceFilesToPack = allInvoiceFiles;
    let cutoffDate: Date | null = null;

    if (effectiveMode === 'INCREMENTAL') {
      const lastSuccess = await this.prisma.backupLog.findFirst({
        where: { status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
      });

      if (lastSuccess?.createdAt) {
        cutoffDate = lastSuccess.createdAt;
        const cutoffMs = cutoffDate.getTime();
        invoiceFilesToPack = allInvoiceFiles.filter((f) => f.mtimeMs > cutoffMs);
        this.logger.log(
          `[Backup] Chế độ INCREMENTAL: Chọn ${invoiceFilesToPack.length}/${allInvoiceFiles.length} file hoá đơn mới/sửa đổi kể từ ${cutoffDate.toISOString()}`,
        );
      } else {
        this.logger.log(
          `[Backup] Chưa có bản sao lưu thành công trước đó, thực hiện sao lưu toàn bộ (FULL).`,
        );
      }
    } else {
      this.logger.log(
        `[Backup] Chế độ FULL: Sao lưu toàn bộ ${invoiceFilesToPack.length} file hoá đơn.`,
      );
    }

    const invoicesTotalBytes = invoiceFilesToPack.reduce((sum, f) => sum + f.size, 0);
    const totalEstimatedBytes = dbTotalBytes + invoicesTotalBytes;

    // 3. Phân tách file theo giới hạn kích thước
    if (totalEstimatedBytes <= maxChunkBytes || invoiceFilesToPack.length === 0) {
      const fileName = `invoice_backup_${timestamp}.zip`;
      const archivePath = path.join(tempDir, fileName);

      this.logger.log(`Tạo gói sao lưu đơn: ${fileName}...`);
      const zip = new AdmZip();
      let fileCount = 0;

      // Add DB files
      for (const dbFile of dbFiles) {
        zip.addLocalFile(dbFile.fullPath, dbFile.zipSubPath);
        fileCount++;
      }

      // Add Invoices
      for (const invFile of invoiceFilesToPack) {
        const zipSubDir = path.dirname(path.join('invoices', invFile.relPath)).replace(/\\/g, '/');
        zip.addLocalFile(invFile.fullPath, zipSubDir);
        fileCount++;
      }

      // Add Manifest
      const manifest = {
        system: 'Invoice Pro',
        version: '1.0.0',
        backupMode: effectiveMode,
        timestamp,
        createdAt: new Date().toISOString(),
        totalParts: 1,
        partIndex: 1,
        databaseIncluded: dbFiles.length > 0,
        incrementalCutoff: cutoffDate?.toISOString() || null,
        totalInvoiceFilesPacked: invoiceFilesToPack.length,
        totalAllInvoiceFiles: allInvoiceFiles.length,
        totalPackedFiles: fileCount,
        hostname: os.hostname(),
        platform: process.platform,
        nodeVersion: process.version,
      };
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
      fileCount++;

      zip.writeZip(archivePath);
      const stat = fs.statSync(archivePath);

      this.logger.log(
        `Đóng gói hoàn tất: ${fileName} (${(stat.size / 1024 / 1024).toFixed(2)} MB, ${fileCount} files)`,
      );

      return [
        {
          archivePath,
          fileName,
          fileSize: stat.size,
          partIndex: 1,
          totalParts: 1,
          fileCount,
        },
      ];
    }

    // Nếu dung lượng lớn hơn maxChunkBytes: Chia thành nhiều file nhỏ (parts)
    this.logger.log(
      `Tổng dung lượng ước tính (~${(totalEstimatedBytes / 1024 / 1024).toFixed(2)} MB) vượt giới hạn ${maxChunkSizeMb} MB/file. Đang tự động tách thành từng file nhỏ...`,
    );

    const partsBatches: Array<{
      hasDb: boolean;
      files: InvoiceFileInfo[];
    }> = [];

    let currentBatchFiles: InvoiceFileInfo[] = [];
    let currentBatchBytes = dbTotalBytes; // Part 1 luôn chứa DB
    let isFirstPart = true;

    for (const invFile of invoiceFilesToPack) {
      if (currentBatchFiles.length > 0 && currentBatchBytes + invFile.size > maxChunkBytes) {
        partsBatches.push({
          hasDb: isFirstPart,
          files: currentBatchFiles,
        });
        currentBatchFiles = [invFile];
        currentBatchBytes = invFile.size;
        isFirstPart = false;
      } else {
        currentBatchFiles.push(invFile);
        currentBatchBytes += invFile.size;
      }
    }

    if (currentBatchFiles.length > 0 || isFirstPart) {
      partsBatches.push({
        hasDb: isFirstPart,
        files: currentBatchFiles,
      });
    }

    const totalParts = partsBatches.length;
    const archives: BackupArchiveInfo[] = [];

    for (let i = 0; i < totalParts; i++) {
      const partIndex = i + 1;
      const batch = partsBatches[i];
      const partSuffix = `_part${String(partIndex).padStart(2, '0')}_of_${String(totalParts).padStart(2, '0')}`;
      const fileName = `invoice_backup_${timestamp}${partSuffix}.zip`;
      const archivePath = path.join(tempDir, fileName);

      const zip = new AdmZip();
      let fileCount = 0;

      if (batch.hasDb) {
        for (const dbFile of dbFiles) {
          zip.addLocalFile(dbFile.fullPath, dbFile.zipSubPath);
          fileCount++;
        }
      }

      for (const invFile of batch.files) {
        const zipSubDir = path.dirname(path.join('invoices', invFile.relPath)).replace(/\\/g, '/');
        zip.addLocalFile(invFile.fullPath, zipSubDir);
        fileCount++;
      }

      const manifest = {
        system: 'Invoice Pro',
        version: '1.0.0',
        backupMode: effectiveMode,
        timestamp,
        createdAt: new Date().toISOString(),
        totalParts,
        partIndex,
        databaseIncluded: batch.hasDb,
        incrementalCutoff: cutoffDate?.toISOString() || null,
        filesInPartCount: batch.files.length,
        totalInvoiceFilesPacked: invoiceFilesToPack.length,
        totalAllInvoiceFiles: allInvoiceFiles.length,
        filesList: batch.files.map((f) => f.relPath),
        hostname: os.hostname(),
        platform: process.platform,
        nodeVersion: process.version,
      };
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
      fileCount++;

      zip.writeZip(archivePath);
      const stat = fs.statSync(archivePath);

      this.logger.log(
        `Đóng gói xong phần ${partIndex}/${totalParts}: ${fileName} (${(stat.size / 1024 / 1024).toFixed(2)} MB, ${fileCount} files)`,
      );

      archives.push({
        archivePath,
        fileName,
        fileSize: stat.size,
        partIndex,
        totalParts,
        fileCount,
      });
    }

    return archives;
  }

  /**
   * Helper tương thích ngược đóng gói trả về 1 archive
   */
  async createBackupArchive(options?: {
    forceFull?: boolean;
  }): Promise<BackupArchiveInfo> {
    const archives = await this.createBackupArchives(options);
    return archives[0];
  }

  /**
   * Execute complete backup process and upload to Google Drive.
   */
  async executeBackup(
    triggerType: 'MANUAL' | 'AUTO',
    forceFull = false,
  ): Promise<any> {
    const isConfigured = await this.googleDriveService.isConfigured();
    if (!isConfigured) {
      throw new BadRequestException(
        'Google Drive chưa được kết nối qua OAuth. Vui lòng kết nối tài khoản Google trên trang Cấu hình Sao lưu.',
      );
    }

    const settings = await this.getBackupSettings();
    const startTime = Date.now();
    let archives: BackupArchiveInfo[] = [];

    // Create log record with IN_PROGRESS status
    const backupLog = await this.prisma.backupLog.create({
      data: {
        fileName: 'backup_in_progress.zip',
        status: 'IN_PROGRESS',
        triggerType,
      },
    });

    try {
      // 1. Create local archives
      archives = await this.createBackupArchives({ forceFull });

      const totalSize = archives.reduce((sum, a) => sum + a.fileSize, 0);
      const mainFileName =
        archives.length === 1
          ? archives[0].fileName
          : `${archives[0].fileName.replace(/_part01_of_\d+/, '')} (${archives.length} parts)`;

      await this.prisma.backupLog.update({
        where: { id: backupLog.id },
        data: {
          fileName: mainFileName,
          fileSize: totalSize,
        },
      });

      // 2. Upload to Google Drive
      const { chunkDelayMs } = settings;
      const uploadedFiles: Array<{
        fileId: string;
        fileName: string;
        webViewLink?: string;
        size: number;
      }> = [];

      for (let i = 0; i < archives.length; i++) {
        const archive = archives[i];
        this.logger.log(
          `[Backup] [${i + 1}/${archives.length}] Đang tải lên Google Drive: ${archive.fileName} (${(archive.fileSize / 1024 / 1024).toFixed(2)} MB)...`,
        );

        const uploadRes = await this.googleDriveService.uploadFile(
          archive.archivePath,
          archive.fileName,
        );
        uploadedFiles.push(uploadRes);

        if (i < archives.length - 1 && chunkDelayMs > 0) {
          this.logger.log(
            `[Backup] Đã tải lên phần ${i + 1}/${archives.length}. Tạm nghỉ ${chunkDelayMs}ms trước khi tải tiếp để tiết kiệm băng thông...`,
          );
          await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
        }
      }

      // 3. Prune old backups on Drive based on configured retention count
      const pruneResult =
        settings.retentionCount > 0
          ? await this.googleDriveService.pruneOldBackups(settings.retentionCount)
          : { deletedCount: 0, deletedFiles: [] };

      const durationMs = Date.now() - startTime;

      // 4. Update log to SUCCESS
      const firstUpload = uploadedFiles[0];
      const updatedLog = await this.prisma.backupLog.update({
        where: { id: backupLog.id },
        data: {
          status: 'SUCCESS',
          driveFileId: uploadedFiles.map((u) => u.fileId).join(','),
          driveFileUrl: firstUpload?.webViewLink || null,
          fileSize: totalSize,
          durationMs,
        },
      });

      this.logger.log(
        `Sao lưu thành công [${triggerType}]: ${mainFileName} (${(totalSize / 1024 / 1024).toFixed(2)} MB, ${uploadedFiles.length} file tải lên) trong ${durationMs}ms`,
      );

      return {
        ...updatedLog,
        uploadedParts: uploadedFiles,
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
      // Always cleanup all temporary zip files
      for (const archive of archives) {
        if (fs.existsSync(archive.archivePath)) {
          try {
            fs.unlinkSync(archive.archivePath);
            this.logger.log(`Đã dọn dẹp file tạm cục bộ: ${archive.archivePath}`);
          } catch (cleanupErr: any) {
            this.logger.warn(`Không thể xoá file tạm: ${cleanupErr.message}`);
          }
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
