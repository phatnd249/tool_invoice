import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { TasksController } from './tasks.controller';
import { TasksSseController } from './tasks-sse.controller';
import { DownloadTaskService } from './download-task.service';
import { InvoicesPersistenceService } from './invoices-persistence.service';
import { GdtClientService } from './gdt-client.service';
import { XmlParserService } from './xml-parser.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [InvoicesController, TasksController, TasksSseController],
  providers: [
    InvoicesService,
    DownloadTaskService,
    InvoicesPersistenceService,
    GdtClientService,
    XmlParserService,
  ],
  exports: [InvoicesService, DownloadTaskService],
})
export class InvoicesModule {}
