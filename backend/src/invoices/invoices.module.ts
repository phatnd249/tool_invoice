import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesPersistenceService } from './invoices-persistence.service';
import { GdtClientService } from './gdt-client.service';
import { XmlParserService } from './xml-parser.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoicesPersistenceService,
    GdtClientService,
    XmlParserService,
  ],
  exports: [InvoicesService],
})
export class InvoicesModule {}
