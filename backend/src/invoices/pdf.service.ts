import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import { PreviewService } from './preview.service';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly previewService: PreviewService,
  ) {}

  /**
   * Chuyển HTML thành PDF qua Gotenberg API.
   */
  async convertHtmlToPdf(htmlContent: string): Promise<Buffer> {
    const gotenbergUrl =
      this.config.get('GOTENBERG_URL') || 'http://localhost:3001';

    const form = new FormData();
    form.append('files', Buffer.from(htmlContent, 'utf-8'), {
      filename: 'index.html',
      contentType: 'text/html',
    });

    form.append('marginTop', '0');
    form.append('marginBottom', '0');
    form.append('marginLeft', '0');
    form.append('marginRight', '0');
    form.append('paperWidth', '8.27');
    form.append('paperHeight', '11.7');
    form.append('printBackground', 'true');

    const response = await axios.post(
      `${gotenbergUrl}/forms/chromium/convert/html`,
      form,
      {
        headers: form.getHeaders(),
        responseType: 'arraybuffer',
        timeout: 30000,
      },
    );

    return Buffer.from(response.data);
  }

  /**
   * Tạo (hoặc lấy cached) PDF cho một invoice.
   */
  async getOrCreatePdf(
    invoiceId: string,
    cacheHtmlPath: string,
    pdfDir: string,
    pdfFileName: string,
  ): Promise<string> {
    const pdfPath = path.join(pdfDir, pdfFileName);

    if (fs.existsSync(pdfPath)) {
      return pdfPath;
    }

    if (!fs.existsSync(cacheHtmlPath)) {
      throw new Error('HTML cache not found');
    }

    const htmlContent = fs.readFileSync(cacheHtmlPath, 'utf-8');

    this.logger.log(
      `Converting HTML to PDF for invoice ${invoiceId}...`,
    );
    const pdfBuffer = await this.convertHtmlToPdf(htmlContent);

    fs.mkdirSync(pdfDir, { recursive: true });
    fs.writeFileSync(pdfPath, pdfBuffer);

    this.logger.log(`PDF created: ${pdfPath}`);
    return pdfPath;
  }

  /**
   * Sinh tên file PDF từ thông tin invoice.
   */
  getPdfFileName(invoice: {
    sellerTaxCode: string;
    buyerTaxCode?: string | null;
    invoiceNumber: string;
    invoiceSymbol: string;
    processStatus?: number | null;
    invoiceStatus?: number | null;
    type: string;
  }): string {
    const taxCode =
      invoice.type === 'BUY'
        ? (invoice.buyerTaxCode || invoice.sellerTaxCode)
        : (invoice.sellerTaxCode ||
            invoice.buyerTaxCode ||
            'UNKNOWN');

    const statusFileCode = this.getStatusFileCode({
      khhdon: invoice.invoiceSymbol,
      ttxly: invoice.processStatus ?? undefined,
      tthai: invoice.invoiceStatus ?? undefined,
    });

    return `${taxCode}-${invoice.invoiceNumber}-${statusFileCode}.pdf`;
  }

  // ── Helper ──

  private getStatusFileCode(inv: {
    khhdon?: string;
    ttxly?: number;
    tthai?: number;
  }): string {
    const khhdon = String(inv.khhdon || '').toUpperCase();
    let baseCode = 'K';
    if (khhdon.match(/^[1-6]?M/)) baseCode = 'M';
    else if (khhdon.match(/^[1-6]?C/)) baseCode = 'C';
    if (baseCode === 'K' && inv.ttxly === 5) baseCode = 'C';
    if (baseCode === 'K' && inv.ttxly === 8) baseCode = 'M';

    const statusMap: Record<number, string> = {
      1: '', 2: 'TT', 3: 'DC', 4: 'BTT', 5: 'BDC', 6: 'HUY',
    };
    const invoiceCode =
      inv.tthai != null ? (statusMap[inv.tthai] ?? '?') : '';

    if (baseCode && invoiceCode) return `${baseCode}-${invoiceCode}`;
    return baseCode || invoiceCode || 'K';
  }
}
