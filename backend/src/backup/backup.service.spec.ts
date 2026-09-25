import { Test, TestingModule } from '@nestjs/testing';
import { BackupService } from './backup.service';
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
};

const mockGoogleDriveService = {
  isConfigured: jest.fn(),
  getAuthMethod: jest.fn(),
  getClientEmail: jest.fn(),
  getFolderId: jest.fn(),
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
      mockGoogleDriveService.isConfigured.mockReturnValue(true);
      mockGoogleDriveService.getAuthMethod.mockReturnValue('KEY_PATH');
      mockGoogleDriveService.getClientEmail.mockReturnValue('test@example.iam.gserviceaccount.com');
      mockGoogleDriveService.getFolderId.mockReturnValue('folder-123');
      mockPrisma.backupLog.findFirst.mockResolvedValue(null);

      const result = await service.getConfigStatus();

      expect(result.isDriveConfigured).toBe(true);
      expect(result.authMethod).toBe('KEY_PATH');
      expect(result.clientEmail).toBe('test@example.iam.gserviceaccount.com');
      expect(result.folderId).toBe('folder-123');
      expect(result.database).toBeDefined();
      expect(result.invoices).toBeDefined();
    });
  });

  describe('executeBackup', () => {
    it('should throw BadRequestException if Google Drive is not configured', async () => {
      mockGoogleDriveService.isConfigured.mockReturnValue(false);

      await expect(service.executeBackup('MANUAL')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully execute backup and update log when configured', async () => {
      mockGoogleDriveService.isConfigured.mockReturnValue(true);
      mockPrisma.backupLog.create.mockResolvedValue({ id: 'log-1', status: 'IN_PROGRESS' });
      mockPrisma.backupLog.update.mockImplementation(({ data }) => Promise.resolve({ id: 'log-1', ...data }));

      jest.spyOn(service, 'createBackupArchive').mockResolvedValue({
        archivePath: 'fake-path.zip',
        fileName: 'invoice_backup_fake.zip',
        fileSize: 1024,
        fileCount: 5,
      });

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
      expect(mockGoogleDriveService.uploadFile).toHaveBeenCalled();
      expect(mockGoogleDriveService.pruneOldBackups).toHaveBeenCalled();
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
