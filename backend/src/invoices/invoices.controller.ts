import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { DownloadInvoicesDto } from './dto/download-invoices.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('download')
  @RequirePermissions('invoice:download')
  download(@Body() dto: DownloadInvoicesDto) {
    return this.invoicesService.downloadInvoices(dto);
  }

  @Get()
  @RequirePermissions('invoice:read')
  findAll(@Query() query: QueryInvoicesDto) {
    return this.invoicesService.findAll(query);
  }

  @Get('detail/:id')
  @RequirePermissions('invoice:read')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Get('preview/:id')
  @RequirePermissions('invoice:read')
  async preview(@Param('id') id: string, @Res() res: Response) {
    const html = await this.invoicesService.previewHtml(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  }
}
