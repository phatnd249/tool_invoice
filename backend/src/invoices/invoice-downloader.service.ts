import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { GdtClientService, GdtRawInvoice } from './gdt-client.service';
import { GdtDownloadClientService } from './gdt/gdt-download-client.service';
import { InvoicesPersistenceService } from './invoices-persistence.service';
import { XmlParserService } from './xml-parser.service';
import { PreviewService } from './preview.service';
import { PdfService } from './pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeDirName, getInvoiceFileStatusCode } from '../common/invoice-utils';
import {
  findNextVersion,
  getVersionedFilePath,
  removeAllRelatedFiles,
} from '../common/file-version';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DownloadSingleResult {
  success: boolean;
  invoiceId?: string;
  zipPath?: string;
  xmlPath?: string;
  itemsCount?: number;
  pdfPath?: string;
  error?: string;
  isRateLimited?: boolean;
}

export interface DownloadSingleParams {
  invoice: GdtRawInvoice;
  token: string;
  type: 'BUY' | 'SELL';
  companyName: string;
  invoicesBaseDir?: string;
  overwriteMode?: 'SKIP' | 'OVERWRITE' | 'NEW_VERSION';
  currentVersion?: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Service tập trung logic tải một hoá đơn:
 * ZIP → extract XML → parse items → save DB → generate PDF.
 *
 * Được gọi từ:
 * - InvoicesService.downloadInvoices()
 * - InvoicesService.retryFailed()
 * - DownloadTaskService.executeTask()
 */
@Injectable()
export class InvoiceDownloaderService {
  private readonly logger = new Logger(InvoiceDownloaderService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly gdtClient: GdtClientService,
    private readonly gdtDownload: GdtDownloadClientService,
    private readonly xmlParser: XmlParserService,
    private readonly persistence: InvoicesPersistenceService,
    private readonly previewService: PreviewService,
    private readonly pdfService: PdfService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Xác định outputDir cho một invoice dựa trên company + type + tháng.
   */
  getOutputDir(
    companyName: string,
    type: 'BUY' | 'SELL',
    invoiceDate: Date,
  ): string {
    const invoicesBaseDir =
      this.config.get('INVOICES_DIR') || './invoices';
    const companyDir = sanitizeDirName(companyName);
    const typeDir = type === 'SELL' ? 'BanRa' : 'MuaVao';
    const monthDir = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
    return path.join(invoicesBaseDir, companyDir, typeDir, monthDir);
  }

  /**
   * Tải một hoá đơn: ZIP → extract XML → parse items → save DB → PDF.
   *
   * Flow:
   * 1. Kiểm tra overwrite logic (SKIP/OVERWRITE/NEW_VERSION)
   * 2. Gọi GDT download ZIP
   * 3. Extract XML từ ZIP
   * 4. Parse XML → items
   * 5. Lưu items + paths vào DB
   * 6. Tạo PDF tự động
   *
   * @returns DownloadSingleResult: kết quả chi tiết
   * @throws Error với statusCode nếu lỗi (429 → rate limit, khác → lỗi thật)
   */
  async downloadSingleInvoice(
    params: DownloadSingleParams,
  ): Promise<DownloadSingleResult> {
    const {
      invoice,
      token,
      type,
      companyName,
      overwriteMode = 'SKIP',
      currentVersion = 0,
    } = params;

    const invNum = String(invoice.shdon);
    const outputDir = this.getOutputDir(
      companyName,
      type,
      new Date(invoice.tdlap),
    );

    // ── Overwrite logic ────────────────────────────────────────────
    const statusCode = getInvoiceFileStatusCode(invoice);
    const taxCode = String(invoice.nbmst);
    const baseFileName = `${taxCode}-${invNum}-${statusCode}`;
    const zipFileName = `${baseFileName}.zip`;
    const expectedZipPath = path.join(outputDir, zipFileName);

    let actualVersion = currentVersion;

    if (overwriteMode === 'SKIP') {
      if (
        fs.existsSync(expectedZipPath) &&
        (fs.statSync(expectedZipPath).size || 0) > 0
      ) {
        return {
          success: true,
          zipPath: expectedZipPath,
          itemsCount: 0,
        };
      }
    } else if (overwriteMode === 'OVERWRITE') {
      removeAllRelatedFiles(expectedZipPath);
    } else if (overwriteMode === 'NEW_VERSION') {
      if (
        fs.existsSync(expectedZipPath) &&
        (fs.statSync(expectedZipPath).size || 0) > 0
      ) {
        actualVersion = findNextVersion(expectedZipPath);
      }
    }

    // ── Tải ZIP ──────────────────────────────────────────────────
    const { zipPath: downloadedZipPath } =
      await this.gdtDownload.downloadInvoiceZip(
        invoice,
        token,
        outputDir,
      );

    let finalZipPath = downloadedZipPath;

    // ── NEW_VERSION: đổi tên nếu cần ────────────────────────────
    if (overwriteMode === 'NEW_VERSION' && actualVersion > 0) {
      const versionedZipPath = getVersionedFilePath(
        expectedZipPath,
        actualVersion,
      );
      fs.renameSync(downloadedZipPath, versionedZipPath);
      finalZipPath = versionedZipPath;
    }

    // ── Extract XML ──────────────────────────────────────────────
    const xmlPath = this.xmlParser.extractXmlFromZip(
      finalZipPath,
      outputDir,
    );

    // ── Parse XML → items ────────────────────────────────────────
    const parsed = this.xmlParser.parseInvoiceXml(xmlPath);

    // ── Save items + paths vào DB ────────────────────────────────
    const invoiceId = await this.persistence.saveItemsFromZip(
      invoice,
      type,
      parsed.items,
      finalZipPath,
      xmlPath,
    );

    // ── Tạo PDF tự động ─────────────────────────────────────────
    let pdfPath: string | undefined;
    if (invoiceId) {
      try {
        await this.previewService.getPreviewHtml(invoiceId);
        const cacheHtmlPath = this.previewService.getCachePath(invoiceId);
        const pdfFileName = this.pdfService.getPdfFileName({
          sellerTaxCode: invoice.nbmst || '',
          buyerTaxCode: invoice.nmmst || null,
          invoiceNumber: String(invoice.shdon),
          invoiceSymbol: invoice.khhdon || '',
          processStatus: invoice.ttxly ?? null,
          invoiceStatus: invoice.tthai ?? null,
          type,
        });
        pdfPath = await this.pdfService.getOrCreatePdf(
          invoiceId,
          cacheHtmlPath,
          outputDir,
          pdfFileName,
        );
        await this.prisma.invoice.update({
          where: { id: invoiceId },
          data: { pdfPath },
        });
      } catch (pdfErr: any) {
        this.logger.warn(
          `Failed to auto-generate PDF for ${invNum}: ${pdfErr.message}`,
        );
      }
    }

    return {
      success: true,
      invoiceId,
      zipPath: finalZipPath,
      xmlPath,
      itemsCount: parsed.items.length,
      pdfPath,
    };
  }
}
