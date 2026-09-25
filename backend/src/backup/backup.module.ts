import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleDriveService } from './google-drive.service';
import { BackupService } from './backup.service';
import { BackupScheduler } from './backup.scheduler';
import { BackupController } from './backup.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BackupController],
  providers: [GoogleDriveService, BackupService, BackupScheduler],
  exports: [BackupService, GoogleDriveService],
})
export class BackupModule {}
