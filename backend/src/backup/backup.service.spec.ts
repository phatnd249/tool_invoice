import { Test, TestingModule } from '@nestjs/testing';
import { BackupService, BackupArchiveInfo } from './backup.service';
import { GoogleDriveService } from './google-drive.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

const mockPrisma = {
  backupLog: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  backupSetting: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
  },
};

const mockGoogleDriveService = {
  isConfigured: jest.fn(),
  getAuthMethod: jest.fn(),
  getClientEmail: jest.fn(),
  getFolderId: jest.fn(),
  getDriveConfigInfo: jest.fn(),
  testConnection: jest.fn(),
  uploadFile: jest.fn(),
  listFiles: jest.fn(),
  deleteFile: jest.fn(),
  downloadFileStream: jest.fn(),
  pruneOldBackups: jest.fn(),
};

describe('BackupService', () => {
  let service: BackupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GoogleDriveService, useValue: mockGoogleDriveService },
      ],
    }).compile();

    service = module.get<BackupService>(BackupService);
    jest.clearAllMocks();
  });

  describe('getConfigStatus', () => {
    it('should return system backup configuration and stats', async () => {
      mockGoogleDriveService.getDriveConfigInfo.mockResolvedValue({
        isConfigured: true,
        authMethod: 'OAUTH',
        clientEmail: 'test@example.com',
        folderId: 'folder-123',
        folderName: 'Invoice_Pro_Backups',
        folderUrl: 'https://drive.google.com/...',
        isConnected: true,
        lastTestedAt: null,
        lastError: null,
      });
      mockPrisma.backupLog.findFirst.mockResolvedValue(null);
      mockPrisma.backupSetting.findUnique.mockResolvedValue(null);

      const result = await service.getConfigStatus();

      expect(result.isDriveConfigured).toBe(true);
      expect(result.authMethod).toBe('OAUTH');
      expect(result.clientEmail).toBe('test@example.com');
      expect(result.folderId).toBe('folder-123');
      expect(result.database).toBeDefined();
      expect(result.invoices).toBeDefined();
      expect(result.backupMode).toBeDefined();
      expect(result.maxChunkSizeMb).toBeGreaterThan(0);
      expect(result.chunkDelayMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeBackup', () => {
    it('should throw BadRequestException if Google Drive is not configured', async () => {
      mockGoogleDriveService.isConfigured.mockResolvedValue(false);

      await expect(service.executeBackup('MANUAL')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully execute backup with single archive and update log when configured', async () => {
      mockGoogleDriveService.isConfigured.mockResolvedValue(true);
      mockPrisma.backupLog.create.mockResolvedValue({ id: 'log-1', status: 'IN_PROGRESS' });
      mockPrisma.backupLog.update.mockImplementation(({ data }) => Promise.resolve({ id: 'log-1', ...data }));

      jest.spyOn(service, 'createBackupArchives').mockResolvedValue([
        {
          archivePath: 'fake-path.zip',
          fileName: 'invoice_backup_fake.zip',
          fileSize: 1024,
          partIndex: 1,
          totalParts: 1,
          fileCount: 5,
        },
      ]);

      mockGoogleDriveService.uploadFile.mockResolvedValue({
        fileId: 'drive-file-1',
        fileName: 'invoice_backup_fake.zip',
        webViewLink: 'https://drive.google.com/view/1',
        size: 1024,
      });

      mockGoogleDriveService.pruneOldBackups.mockResolvedValue({
        deletedCount: 0,
        deletedFiles: [],
      });

      const result = await service.executeBackup('MANUAL');

      expect(result.status).toBe('SUCCESS');
      expect(result.driveFileId).toBe('drive-file-1');
      expect(mockGoogleDriveService.uploadFile).toHaveBeenCalledTimes(1);
      expect(mockGoogleDriveService.pruneOldBackups).toHaveBeenCalled();
    });

    it('should split into multiple parts and progressively upload them with delay', async () => {
      mockGoogleDriveService.isConfigured.mockReturnValue(true);
      mockPrisma.backupLog.create.mockResolvedValue({ id: 'log-2', status: 'IN_PROGRESS' });
      mockPrisma.backupLog.update.mockImplementation(({ data }) => Promise.resolve({ id: 'log-2', ...data }));

      // Mock chunk delay to 10ms for fast test execution
      jest.spyOn(service, 'getBackupSettings').mockResolvedValue({
        autoBackupEnabled: true,
        cronSchedule: '0 2 * * *',
        retentionCount: 7,
        maxChunkBytes: 1024 * 1024,
        maxChunkSizeMb: 1,
        chunkDelayMs: 10,
        backupMode: 'INCREMENTAL',
      });

      const part1: BackupArchiveInfo = {
        archivePath: 'fake-part1.zip',
        fileName: 'invoice_backup_test_part01_of_02.zip',
        fileSize: 500,
        partIndex: 1,
        totalParts: 2,
        fileCount: 3,
      };

      const part2: BackupArchiveInfo = {
        archivePath: 'fake-part2.zip',
        fileName: 'invoice_backup_test_part02_of_02.zip',
        fileSize: 600,
        partIndex: 2,
        totalParts: 2,
        fileCount: 4,
      };

      jest.spyOn(service, 'createBackupArchives').mockResolvedValue([part1, part2]);

      mockGoogleDriveService.uploadFile
        .mockResolvedValueOnce({
          fileId: 'drive-file-part1',
          fileName: part1.fileName,
          webViewLink: 'https://drive.google.com/view/part1',
          size: 500,
        })
        .mockResolvedValueOnce({
          fileId: 'drive-file-part2',
          fileName: part2.fileName,
          webViewLink: 'https://drive.google.com/view/part2',
          size: 600,
        });

      mockGoogleDriveService.pruneOldBackups.mockResolvedValue({
        deletedCount: 0,
        deletedFiles: [],
      });

      const result = await service.executeBackup('MANUAL');

      expect(result.status).toBe('SUCCESS');
      expect(mockGoogleDriveService.uploadFile).toHaveBeenCalledTimes(2);
      expect(result.driveFileId).toBe('drive-file-part1,drive-file-part2');
      expect(result.fileSize).toBe(1100);
      expect(result.uploadedParts).toHaveLength(2);
    });
  });

  describe('getBackupHistory', () => {
    it('should query backup logs ordered by createdAt desc', async () => {
      mockPrisma.backupLog.findMany.mockResolvedValue([]);

      const result = await service.getBackupHistory(20);

      expect(result).toEqual([]);
      expect(mockPrisma.backupLog.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });
  });
});
