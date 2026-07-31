import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { MaSoThueService } from './masothue.service';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, MaSoThueService],
  exports: [CompaniesService, MaSoThueService],
})
export class CompaniesModule {}
