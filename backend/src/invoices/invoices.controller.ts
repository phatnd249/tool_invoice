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
import * as path from 'path';
import { InvoicesService } from './invoices.service';
import { DownloadInvoicesDto } from './dto/download-invoices.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('check-existing')
  @RequirePermissions('invoice:read')
  checkExisting(
    @Body()
    body: {
      companyId: string;
      startDate: string;
      endDate: string;
      invoiceType?: string;
    },
    @CurrentUser() user: any,
  ) {
    return this.invoicesService.checkExisting(body, user.id);
  }

  @Post('download')
  @RequirePermissions('invoice:download')
  download(@Body() dto: DownloadInvoicesDto, @CurrentUser() user: any) {
    return this.invoicesService.downloadInvoices(dto, user.id);
  }

  @Get()
  @RequirePermissions('invoice:read')
  findAll(@Query() query: QueryInvoicesDto, @CurrentUser() user: any) {
    return this.invoicesService.findAll(query, user.id);
  }

  @Get('detail/:id')
  @RequirePermissions('invoice:read')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invoicesService.findOne(id, user.id);
  }

  @Get('preview/:id')
  @RequirePermissions('invoice:read')
  async preview(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const html = await this.invoicesService.previewHtml(id, user.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // CSP sandbox để chặn script/khóa mạng khi HTML từ GDT bị nhiễm nội dung độc hại.
    res.setHeader(
      'Content-Security-Policy',
      "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'",
    );
    res.writeHead(200);
    res.end(html);
  }

  @Post('export')
  @RequirePermissions('invoice:read')
  async exportExcel(
    @Body() body: { invoiceIds: string[] },
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const buffer = await this.invoicesService.exportExcel(
      body.invoiceIds,
      user.id,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=BaoCao_HoaDon_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    res.send(buffer);
  }

  @Post('export-module7')
  @RequirePermissions('invoice:read')
  async exportModule7(
    @Body() body: { invoiceIds: string[] },
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const buffer = await this.invoicesService.exportModule7(
      body.invoiceIds,
      user.id,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=BaoCao_TongHop_M7_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    res.send(buffer);
  }

  @Post('retry-failed')
  @RequirePermissions('invoice:download')
  retryFailed(
    @Body() body: { invoiceIds: string[] },
    @CurrentUser() user: any,
  ) {
    return this.invoicesService.retryFailed(body.invoiceIds, user.id);
  }

  @Get('pdf/:id')
  @RequirePermissions('invoice:read')
  async downloadPdf(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { pdfPath, fileName } = await this.invoicesService.downloadPdf(
      id,
      user.id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(pdfPath);
  }

  @Get('xml/:id')
  @RequirePermissions('invoice:read')
  async downloadXml(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { xmlPath, fileName } = await this.invoicesService.getXmlPath(
      id,
      user.id,
    );
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(xmlPath);
  }

  @Get('zip/:id')
  @RequirePermissions('invoice:read')
  async downloadZip(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { zipPath, fileName } = await this.invoicesService.getZipPath(
      id,
      user.id,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(zipPath);
  }
}
