import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { TasksController } from './tasks.controller';
import { TasksSseController } from './tasks-sse.controller';
import { DownloadTaskService } from './download-task.service';
import { InvoiceDownloaderService } from './invoice-downloader.service';
import { InvoicesPersistenceService } from './invoices-persistence.service';
import { GdtClientService } from './gdt-client.service';
import { GdtHttpClientService } from './gdt/gdt-http-client.service';
import { GdtQueryClientService } from './gdt/gdt-query-client.service';
import { GdtDownloadClientService } from './gdt/gdt-download-client.service';
import { XmlParserService } from './xml-parser.service';
import { PreviewService } from './preview.service';
import { ExcelService } from './excel.service';
import { ExcelBaseService } from './excel/excel-base.service';
import { InvoiceReportService } from './excel/invoice-report.service';
import { Module7ReportService } from './excel/module7-report.service';
import { PdfService } from './pdf.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { TokenResolverService } from '../common/token-resolver.service';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [InvoicesController, TasksController, TasksSseController],
  providers: [
    InvoicesService,
    DownloadTaskService,
    InvoiceDownloaderService,
    InvoicesPersistenceService,
    GdtClientService,
    GdtHttpClientService,
    GdtQueryClientService,
    GdtDownloadClientService,
    XmlParserService,
    PreviewService,
    ExcelService,
    InvoiceReportService,
    Module7ReportService,
    PdfService,
    TokenResolverService,
  ],
  exports: [InvoicesService, DownloadTaskService],
})
export class InvoicesModule {}
