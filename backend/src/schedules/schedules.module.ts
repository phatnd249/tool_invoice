import { Module, OnModuleInit } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { SchedulerRunner } from './scheduler.runner';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, InvoicesModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, SchedulerRunner],
  exports: [SchedulerRunner],
})
export class SchedulesModule implements OnModuleInit {
  constructor(private readonly schedulesService: SchedulesService) {}

  async onModuleInit() {
    // Bootstrap all active schedules after server starts
    await this.schedulesService.bootstrapAll();
  }
}
