import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesPersistenceService } from './invoices-persistence.service';
import { GdtClientService } from './gdt-client.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoicesPersistenceService,
    GdtClientService,
  ],
  exports: [InvoicesService],
})
export class InvoicesModule {}
