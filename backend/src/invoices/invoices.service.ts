import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { GdtClientService, GdtRawInvoice } from './gdt-client.service';
import { InvoicesPersistenceService } from './invoices-persistence.service';
import { XmlParserService } from './xml-parser.service';
import { PreviewService } from './preview.service';
import { ExcelService } from './excel.service';
import { PdfService } from './pdf.service';
import { DownloadInvoicesDto } from './dto/download-invoices.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { sanitizeDirName, delay } from '../common/invoice-utils';
import { TokenResolverService } from '../common/token-resolver.service';
import { InvoiceDownloaderService } from './invoice-downloader.service';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenResolver: TokenResolverService,
    private readonly gdtClient: GdtClientService,
    private readonly downloader: InvoiceDownloaderService,
    private readonly persistence: InvoicesPersistenceService,
    private readonly xmlParser: XmlParserService,
    private readonly previewService: PreviewService,
    private readonly excelService: ExcelService,
    private readonly pdfService: PdfService,
  ) {}

  // ─── Check Existing ───────────────────────────────────────────────────

  async checkExisting(params: {
    companyId: string;
    startDate: string;
    endDate: string;
    invoiceType?: string;
  }): Promise<{ hasExisting: boolean; count: number }> {
    const {
      companyId,
      startDate,
      endDate,
      invoiceType = 'BOTH',
    } = params;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    const normalizedMst = company.taxCode.startsWith('0')
      ? company.taxCode.slice(1)
      : company.taxCode;

    const types: string[] =
      invoiceType === 'BOTH' ? ['BUY', 'SELL'] : [invoiceType];

    const count = await this.prisma.invoice.count({
      where: {
        invoiceDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        type: { in: types },
        OR: [
          { sellerTaxCode: company.taxCode },
          { sellerTaxCode: normalizedMst },
          { buyerTaxCode: company.taxCode },
          { buyerTaxCode: normalizedMst },
        ],
      },
    });

    return { hasExisting: count > 0, count };
  }

  // ─── Download ────────────────────────────────────────────────────────────

  async downloadInvoices(dto: DownloadInvoicesDto) {
    const { companyId, startDate, endDate, invoiceType = 'BOTH' } = dto;

    // 1. Resolve company + token
    const { company, token } = await this.tokenResolver.resolve(companyId);

    // 2. Xác định loại cần tải
    const types: Array<'BUY' | 'SELL'> =
      invoiceType === 'BOTH'
        ? ['BUY', 'SELL']
        : [invoiceType as 'BUY' | 'SELL'];

    const results: Array<{
      type: string;
      totalQueried: number;
      created: number;
      updated: number;
      itemsDownloaded: number;
      itemsFailed: number;
    }> = [];

    let grandTotal = 0;

    const invoicesBaseDir =
      this.config.get('INVOICES_DIR') || './invoices';

    for (const type of types) {
      this.logger.log(
        `Downloading ${type} invoices for ${company.taxCode} (${startDate} → ${endDate})`,
      );

      // 3. Query GDT
      const invoices = await this.gdtClient.queryInvoices(
        new Date(startDate),
        new Date(endDate),
        token,
        type,
      );

      // 4. Lưu metadata vào DB
      const stats = await this.persistence.bulkUpsert(
        invoices,
        type,
        'query',
        company.id,
      );

      // 5. Tải ZIP + parse XML + lưu items cho từng invoice
      const companyDir = sanitizeDirName(company.name);
      const typeDir =
        type === 'SELL' ? 'BanRa' : 'MuaVao';

      let itemsDownloaded = 0;
      let itemsFailed = 0;

      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];

        try {
          this.logger.debug(
            `[${i + 1}/${invoices.length}] Downloading ZIP for ${inv.shdon}...`,
          );

          const result = await this.downloader.downloadSingleInvoice({
            invoice: inv,
            token,
            type,
            companyName: company.name,
          });

          if (result.success) {
            itemsDownloaded++;
            this.logger.debug(
              `  ✓ Downloaded: ${result.itemsCount} items`,
            );
          }
        } catch (error: any) {
          itemsFailed++;
          this.logger.warn(
            `Failed to process invoice ${inv.shdon}: ${error.message}`,
          );
          // Lưu error message
          await this.persistence.markError(
            inv,
            type,
            error.message,
          ).catch(() => {});
        }

        // Delay 500ms giữa các request
        if (i < invoices.length - 1) {
          await delay(500);
        }
      }

      results.push({
        type,
        totalQueried: invoices.length,
        ...stats,
        itemsDownloaded,
        itemsFailed,
      });

      grandTotal += stats.created + stats.updated;
    }

    // 6. Cập nhật downloadCount
    if (grandTotal > 0) {
      await this.prisma.company.update({
        where: { id: company.id },
        data: { downloadCount: { increment: grandTotal } },
      });
    }

    return {
      company: {
        id: company.id,
        name: company.name,
        taxCode: company.taxCode,
      },
      dateRange: { startDate, endDate },
      results,
      totalSaved: grandTotal,
    };
  }

  // ─── Query (datatable) ──────────────────────────────────────────────────

  async findAll(query: QueryInvoicesDto): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      type,
      startDate,
      endDate,
      companyId,
      sortBy = 'invoiceDate',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      ...(type && { type }),
      ...(companyId && { companyId }),
      ...(startDate || endDate
        ? {
            invoiceDate: {
              ...(startDate && { gte: new Date(startDate) }),
              ...(endDate && { lte: new Date(endDate) }),
            },
          }
        : {}),
      ...(search && {
        OR: [
          { invoiceNumber: { contains: search } },
          { sellerName: { contains: search } },
          { sellerTaxCode: { contains: search } },
          { buyerName: { contains: search } },
          { buyerTaxCode: { contains: search } },
        ],
      }),
    };

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: { items: true },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return paginate(invoices, total, page, limit);
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        company: { select: { id: true, name: true, taxCode: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  // ─── Preview ────────────────────────────────────────────────────────────

  async previewHtml(id: string): Promise<string> {
    return this.previewService.getPreviewHtml(id);
  }

  // ─── Export Excel ───────────────────────────────────────────────────────

  async exportExcel(invoiceIds: string[]): Promise<Buffer> {
    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      include: { items: true },
    });

    if (invoices.length === 0) {
      throw new NotFoundException('No invoices found');
    }

    const data = invoices.map((inv) => this.mapToParsedInvoice(inv));
    return this.excelService.generateInvoiceReport(data);
  }

  async exportModule7(invoiceIds: string[]): Promise<Buffer> {
    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      include: { items: true },
    });

    if (invoices.length === 0) {
      throw new NotFoundException('No invoices found');
    }

    const data = invoices.map((inv) => ({
      ...this.mapToParsedInvoice(inv),
      type: inv.type,
    }));
    return this.excelService.generateModule7Report(data);
  }

  // ─── PDF Download ──────────────────────────────────────────────────────

  async downloadPdf(
    id: string,
  ): Promise<{ pdfPath: string; fileName: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { company: { select: { name: true, id: true } } },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Nếu đã có pdfPath và file tồn tại, trả luôn
    if (invoice.pdfPath && fs.existsSync(invoice.pdfPath)) {
      return {
        pdfPath: invoice.pdfPath,
        fileName: path.basename(invoice.pdfPath),
      };
    }

    // Lấy HTML preview
    await this.previewService.getPreviewHtml(id);
    const cacheHtmlPath = this.previewService.getCachePath(id);

    // Xác định thư mục lưu PDF (cùng thư mục ZIP)
    const invoicesBaseDir =
      this.config.get('INVOICES_DIR') || './invoices';
    const companyDir = sanitizeDirName(
      invoice.company?.name || 'unknown',
    );
    const invDate = new Date(invoice.invoiceDate);
    const monthDir = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}`;
    const pdfDir = path.join(
      invoicesBaseDir,
      companyDir,
      invoice.type === 'SELL' ? 'BanRa' : 'MuaVao',
      monthDir,
    );

    const pdfFileName = this.pdfService.getPdfFileName(invoice);
    const pdfPath = await this.pdfService.getOrCreatePdf(
      id,
      cacheHtmlPath,
      pdfDir,
      pdfFileName,
    );

    // Cập nhật pdfPath vào DB
    await this.prisma.invoice.update({
      where: { id },
      data: { pdfPath },
    });

    return { pdfPath, fileName: pdfFileName };
  }

  async getZipPath(
    id: string,
  ): Promise<{ zipPath: string; fileName: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (!invoice.zipPath || !fs.existsSync(invoice.zipPath)) {
      throw new NotFoundException('ZIP file not found');
    }

    return {
      zipPath: invoice.zipPath,
      fileName: path.basename(invoice.zipPath),
    };
  }

  // ─── Retry Failed ──────────────────────────────────────────────────────

  async retryFailed(invoiceIds: string[]): Promise<{
    successCount: number;
    failedCount: number;
    errors: Array<{ invoiceNumber: string; error: string }>;
  }> {
    // 1. Query invoices có downloadStatus = 'ERROR' hoặc null (chờ tải)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        OR: [
          { downloadStatus: 'ERROR' },
          { downloadStatus: null },
        ],
      },
      include: { company: true },
    });

    if (invoices.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy hoá đơn nào cần tải lại (chỉ hỗ trợ hoá đơn chờ tải hoặc bị lỗi).',
      );
    }

    // 2. Group by company để tối ưu token
    const byCompany = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      if (!inv.company) continue;
      const key = inv.company.id;
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(inv);
    }

    // Khởi tạo counters
    const invoicesBaseDir =
      this.config.get('INVOICES_DIR') || './invoices';
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ invoiceNumber: string; error: string }> = [];

    // 3. Resolve tokens trước cho tất cả companies
    const tokenMap = new Map<string, string>();
    for (const companyId of byCompany.keys()) {
      try {
        const { token } = await this.tokenResolver.resolve(companyId);
        tokenMap.set(companyId, token);
      } catch (err: any) {
        for (const inv of byCompany.get(companyId) || []) {
          failedCount++;
          errors.push({
            invoiceNumber: inv.invoiceNumber,
            error: `Không lấy được token: ${err.message}`,
          });
        }
      }
    }

    for (const [companyId, companyInvoices] of byCompany) {
      const token = tokenMap.get(companyId);
      if (!token) continue; // already logged as error above

      const company = companyInvoices[0].company!;
      const companyDir = sanitizeDirName(company.name);

      for (let i = 0; i < companyInvoices.length; i++) {
        const inv = companyInvoices[i];
        const type = inv.type as 'BUY' | 'SELL';

        try {
          // Tạo GdtRawInvoice từ DB data
          const gdtInv: GdtRawInvoice = {
            nbmst: inv.sellerTaxCode,
            khmshdon: inv.templateSymbol,
            khhdon: inv.invoiceSymbol,
            shdon: inv.invoiceNumber,
            _sourceApi: inv.source || 'query',
            ttxly: inv.processStatus ?? 5,
            tthai: inv.invoiceStatus ?? 1,
            tdlap: inv.invoiceDate.toISOString(),
            nbten: inv.sellerName,
            nmmst: inv.buyerTaxCode || '',
            tgtcthue: inv.totalBeforeTax ?? 0,
            tgtthue: inv.taxAmount ?? 0,
            tgtttbso: inv.totalAmount,
          };

          const result = await this.downloader.downloadSingleInvoice({
            invoice: gdtInv,
            token,
            type,
            companyName: company.name,
          });

          // Xoá cache preview cũ
          this.previewService.clearCache(inv.id);

          successCount++;
          this.logger.log(`Retry success: ${inv.invoiceNumber}`);
        } catch (err: any) {
          failedCount++;
          errors.push({
            invoiceNumber: inv.invoiceNumber,
            error: err.message,
          });

          // Cập nhật error message mới
          await this.persistence
            .markError(
              {
                shdon: inv.invoiceNumber,
                khmshdon: inv.templateSymbol,
                khhdon: inv.invoiceSymbol,
                nbmst: inv.sellerTaxCode,
                nmmst: inv.buyerTaxCode || '',
                tdlap: '',
                nbten: '',
                tgtcthue: 0,
                tgtthue: 0,
                tgtttbso: 0,
                ttxly: inv.processStatus ?? 5,
                tthai: inv.invoiceStatus ?? 1,
              },
              type,
              err.message,
            )
            .catch(() => {});
        }

        // Delay 500ms giữa các request
        if (i < companyInvoices.length - 1) {
          await delay(500);
        }
      }
    }

    return { successCount, failedCount, errors };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private mapToParsedInvoice(inv: any) {
    return {
      xmlFile: inv.xmlPath ? path.basename(inv.xmlPath) : 'invoice.xml',
      templateSymbol: inv.templateSymbol,
      invoiceSymbol: inv.invoiceSymbol,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      currency: 'VND',
      exchangeRate: 1,
      paymentMethod: undefined,
      sellerName: inv.sellerName,
      sellerTaxCode: inv.sellerTaxCode,
      buyerName: inv.buyerName || '',
      buyerTaxCode: inv.buyerTaxCode || '',
      totalBeforeTax: inv.totalBeforeTax || 0,
      taxAmount: inv.taxAmount || 0,
      totalAmount: inv.totalAmount,
      totalAmountInWords: inv.totalAmountInWords || undefined,
      lookupCode: undefined,
      taxAuthorityCode: undefined,
      items: inv.items.map((item: any) => ({
        lineNumber: item.lineNumber ? String(item.lineNumber) : undefined,
        name: item.name,
        unit: item.unit || undefined,
        quantity: item.quantity || undefined,
        price: item.price || undefined,
        amount: item.amount,
        taxRate: item.taxRate || undefined,
      })),
    };
  }
}
