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
  /** MST của công ty đang tải (dùng đặt tên file ZIP/PDF, nhất là hoá đơn mua vào). */
  companyTaxCode?: string;
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
   * Trả về INVOICES_DIR từ config.
   */
  getBaseDir(): string {
    return this.config.get('INVOICES_DIR') || './invoices';
  }

  /**
   * Xác định absolute outputDir cho một invoice dựa trên company + type + tháng.
   */
  getOutputDir(
    companyName: string,
    type: 'BUY' | 'SELL',
    invoiceDate: Date,
  ): string {
    const invoicesBaseDir = this.getBaseDir();
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
      companyTaxCode,
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
    // Tên file dùng MST của công ty đang tải; với hoá đơn mua vào,
    // invoice.nbmst là MST đối tác, không phải MST công ty.
    const fileTaxCode = String(companyTaxCode || invoice.nbmst || '');
    const baseFileName = `${fileTaxCode}-${invNum}-${statusCode}`;
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
    let downloadedZipPath: string | undefined;
    let finalZipPath: string | undefined;
    let isNoZip = false;

    try {
      const res = await this.gdtDownload.downloadInvoiceZip(
        invoice,
        token,
        outputDir,
        fileTaxCode,
      );
      downloadedZipPath = res.zipPath;
    } catch (err: any) {
      // Nếu lỗi không phải do GDT thiếu hồ sơ gốc (404/500) → cứ lan truyền
      // (để tầng trên xử lý rate-limit 429 hoặc báo lỗi thật).
      const statusCode = err?.statusCode;
      if (
        statusCode !== 404 &&
        statusCode !== 500
      ) {
        throw err;
      }
      isNoZip = true;
      this.logger.warn(
        `Không có file ZIP cho hoá đơn ${invNum} (status ${statusCode}), fallback dùng dữ liệu query.`,
      );
    }

    // ── Trường hợp có ZIP: extract + parse XML ───────────────────
    if (!isNoZip && downloadedZipPath) {
      const parsedItems = await this.processZipFlow(
        downloadedZipPath!,
        outputDir,
        invoice,
        type,
        {
          overwriteMode,
          actualVersion,
          expectedZipPath,
        },
        fileTaxCode,
      );
      finalZipPath = parsedItems.finalZipPath;
      return {
        success: true,
        invoiceId: parsedItems.invoiceId,
        zipPath: finalZipPath,
        xmlPath: parsedItems.xmlPath,
        itemsCount: parsedItems.itemsCount,
        pdfPath: parsedItems.pdfPath,
      };
    }

    // ── Trường hợp không có ZIP: fallback dùng dữ liệu query/detail ──
    return await this.processNoZipFlow(
      invoice,
      token,
      type,
      outputDir,
      {
        previousOverwriteMode: overwriteMode,
        previousVersion: actualVersion,
      },
      fileTaxCode,
    );
  }

  /**
   * Xử lý khi có ZIP: extract XML → parse items → save DB → tạo PDF.
   */
  private async processZipFlow(
    zipPath: string,
    outputDir: string,
    invoice: GdtRawInvoice,
    type: 'BUY' | 'SELL',
    opts: {
      overwriteMode: 'SKIP' | 'OVERWRITE' | 'NEW_VERSION';
      actualVersion: number;
      expectedZipPath: string;
    },
    companyTaxCode?: string,
  ): Promise<{
    invoiceId: string;
    xmlPath: string;
    itemsCount: number;
    pdfPath?: string;
    finalZipPath: string;
  }> {
    let finalZipPath = zipPath;

    // ── NEW_VERSION: đổi tên ZIP nếu cần ────────────────────────
    if (opts.overwriteMode === 'NEW_VERSION' && opts.actualVersion > 0) {
      const versionedZipPath = getVersionedFilePath(
        opts.expectedZipPath,
        opts.actualVersion,
      );
      fs.renameSync(zipPath, versionedZipPath);
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
    const baseDir = this.getBaseDir();
    const relativeZipPath = path.relative(baseDir, finalZipPath);
    const relativeXmlPath = path.relative(baseDir, xmlPath);
    const invoiceId = await this.persistence.saveItemsFromZip(
      invoice,
      type,
      parsed.items,
      relativeZipPath,
      relativeXmlPath,
    );

    // ── Tạo PDF tự động ─────────────────────────────────────────
    const pdfPath = await this.generatePdf(
      invoice,
      type,
      outputDir,
      invoiceId,
      companyTaxCode,
    );

    return {
      invoiceId: invoiceId || '',
      xmlPath,
      itemsCount: parsed.items.length,
      pdfPath,
      finalZipPath,
    };
  }

  /**
   * Fallback khi không có ZIP: dùng GDT detail API +
   * dữ liệu query để lưu items và tạo PDF.
   */
  private async processNoZipFlow(
    invoice: GdtRawInvoice,
    token: string,
    type: 'BUY' | 'SELL',
    outputDir: string,
    _opts: {
      previousOverwriteMode: 'SKIP' | 'OVERWRITE' | 'NEW_VERSION';
      previousVersion: number;
    },
    companyTaxCode?: string,
  ): Promise<DownloadSingleResult> {
    const invNum = String(invoice.shdon);

    // 1. Lấy chi tiết hoá đơn (items) từ GDT detail API
    let detail: Record<string, any> | null = null;
    try {
      detail = await this.gdtDownload.downloadInvoiceDetail(invoice, token);
    } catch (detailErr: any) {
      this.logger.warn(
        `Không lấy được detail cho ${invNum}: ${detailErr.message}`,
      );
    }

    // 2. Parse items từ detail (hdhhdvu / cttkhac)
    const detailItems =
      detail?.hdhhdvu || detail?.cttkhac || [];
    const items = this.mapDetailItems(detailItems);

    // 3. Lưu metadata + items vào DB (không có zip/xml path)
    const invoiceId = await this.persistence.saveItemsFromDetail(
      invoice,
      type,
      items,
      detail,
    );

    // 4. Tạo PDF từ dữ liệu query/detail (không cần ZIP)
    let pdfPath: string | undefined;
    if (invoiceId) {
      try {
        // Build HTML preview từ DB rồi lưu cache → render PDF
        await this.previewService.buildPreviewHtml(invoiceId);
        pdfPath = await this.generatePdf(
          invoice,
          type,
          outputDir,
          invoiceId,
          companyTaxCode,
        );
      } catch (pdfErr: any) {
        this.logger.warn(
          `Không tạo được PDF fallback cho ${invNum}: ${pdfErr.message}`,
        );
      }
    }

    this.logger.log(
      `Đã lưu hoá đơn ${invNum} từ dữ liệu query (không có ZIP), ${items.length} items`,
    );

    return {
      success: true,
      invoiceId,
      itemsCount: items.length,
      pdfPath,
      error: undefined,
    };
  }

  /**
   * Map items từ detail API GDT sang dạng chuẩn hoá trong DB.
   */
  private mapDetailItems(detailItems: any[]): Array<{
    lineNumber?: string;
    name: string;
    unit?: string;
    quantity?: number;
    price?: number;
    amount: number;
    taxRate?: string;
  }> {
    return (detailItems || []).map((item: any, idx: number) => ({
      name: String(item.ten || item.thdon || item.tchat || '').trim(),
      unit:
        String(item.dvtinh || '').trim() || undefined,
      quantity:
        item.sluong != null ? Number(item.sluong) : undefined,
      price:
        item.dgia != null ? Number(item.dgia) : undefined,
      amount: Number(item.thtien) || 0,
      taxRate:
        String(item.ltsuat || item.tsuat || '').trim() || undefined,
    })).filter((it: any) => it.name);
  }

  /**
   * Tạo PDF cho một invoice đã có HTML cache.
   */
  private async generatePdf(
    invoice: GdtRawInvoice,
    type: 'BUY' | 'SELL',
    outputDir: string,
    invoiceId: string,
    companyTaxCode?: string,
  ): Promise<string | undefined> {
    if (!invoiceId) return undefined;
    try {
      await this.previewService.getPreviewHtml(invoiceId);
      const cacheHtmlPath =
        this.previewService.getCachePath(invoiceId);
      const pdfFileName = this.pdfService.getPdfFileName({
        sellerTaxCode: invoice.nbmst || '',
        buyerTaxCode: invoice.nmmst || null,
        companyTaxCode,
        invoiceNumber: String(invoice.shdon),
        invoiceSymbol: invoice.khhdon || '',
        processStatus: invoice.ttxly ?? null,
        invoiceStatus: invoice.tthai ?? null,
        type,
      });
      const pdfPath = await this.pdfService.getOrCreatePdf(
        invoiceId,
        cacheHtmlPath,
        outputDir,
        pdfFileName,
      );
      const baseDir = this.getBaseDir();
      const relativePdfPath = path.relative(baseDir, pdfPath);
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { pdfPath: relativePdfPath },
      });
      return pdfPath;
    } catch (pdfErr: any) {
      this.logger.warn(
        `Failed to auto-generate PDF for ${invoice.shdon}: ${pdfErr.message}`,
      );
      return undefined;
    }
  }
}
