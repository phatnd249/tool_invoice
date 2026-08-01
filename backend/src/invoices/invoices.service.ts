import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { GdtAuthService } from '../ai/gdt-auth.service';
import { GdtClientService, GdtRawInvoice } from './gdt-client.service';
import { InvoicesPersistenceService } from './invoices-persistence.service';
import { XmlParserService } from './xml-parser.service';
import { PreviewService } from './preview.service';
import { ExcelService } from './excel.service';
import { DownloadInvoicesDto } from './dto/download-invoices.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gdtAuth: GdtAuthService,
    private readonly gdtClient: GdtClientService,
    private readonly persistence: InvoicesPersistenceService,
    private readonly xmlParser: XmlParserService,
    private readonly previewService: PreviewService,
    private readonly excelService: ExcelService,
  ) {}

  // ─── Download ────────────────────────────────────────────────────────────

  async downloadInvoices(dto: DownloadInvoicesDto) {
    const { companyId, startDate, endDate, invoiceType = 'BOTH' } = dto;

    // 1. Resolve company + token
    const { company, token } = await this.resolveCompanyAndToken(companyId);

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
      const companyDir = this.sanitizeDirName(company.name);
      const outputDir = path.join(
        invoicesBaseDir,
        companyDir,
        type === 'SELL' ? 'BanRa' : 'MuaVao',
      );

      let itemsDownloaded = 0;
      let itemsFailed = 0;

      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        try {
          this.logger.debug(
            `[${i + 1}/${invoices.length}] Downloading ZIP for ${inv.shdon}...`,
          );

          // 5a. Tải ZIP
          const { zipPath } = await this.gdtClient.downloadInvoiceZip(
            inv,
            token,
            outputDir,
          );

          // 5b. Giải nén → XML
          const xmlPath = this.xmlParser.extractXmlFromZip(
            zipPath,
            outputDir,
          );

          // 5c. Parse XML → items
          const parsed = this.xmlParser.parseInvoiceXml(xmlPath);

          // 5d. Lưu items + paths vào DB
          await this.persistence.saveItemsFromZip(
            inv,
            type,
            parsed.items,
            zipPath,
            xmlPath,
          );

          itemsDownloaded++;
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
          await this.delay(500);
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

    // 3. Xử lý từng company
    const invoicesBaseDir =
      this.config.get('INVOICES_DIR') || './invoices';
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ invoiceNumber: string; error: string }> = [];

    for (const [companyId, companyInvoices] of byCompany) {
      let token: string;
      try {
        const { token: t } =
          await this.resolveCompanyAndToken(companyId);
        token = t;
      } catch (err: any) {
        for (const inv of companyInvoices) {
          failedCount++;
          errors.push({
            invoiceNumber: inv.invoiceNumber,
            error: `Không lấy được token: ${err.message}`,
          });
        }
        continue;
      }

      const company = companyInvoices[0].company!;
      const companyDir = this.sanitizeDirName(company.name);

      for (let i = 0; i < companyInvoices.length; i++) {
        const inv = companyInvoices[i];
        const type = inv.type as 'BUY' | 'SELL';
        const outputDir = path.join(
          invoicesBaseDir,
          companyDir,
          type === 'SELL' ? 'BanRa' : 'MuaVao',
        );

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

          // Tải ZIP
          const { zipPath } = await this.gdtClient.downloadInvoiceZip(
            gdtInv,
            token,
            outputDir,
          );

          // Parse XML
          const xmlPath = this.xmlParser.extractXmlFromZip(
            zipPath,
            outputDir,
          );
          const parsed = this.xmlParser.parseInvoiceXml(xmlPath);

          // Lưu items
          await this.persistence.saveItemsFromZip(
            gdtInv,
            type,
            parsed.items,
            zipPath,
            xmlPath,
          );

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
          await this.delay(500);
        }
      }
    }

    return { successCount, failedCount, errors };
  }

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

  // ─── Token Resolution ────────────────────────────────────────────────────

  private async resolveCompanyAndToken(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    let token = company.token;

    if (!token || this.gdtAuth.isTokenExpired(token)) {
      if (company.loginMode !== 'AUTO') {
        throw new BadRequestException(
          `Token của ${company.name} (${company.taxCode}) đã hết hạn. Vui lòng đăng nhập lại thủ công.`,
        );
      }

      this.logger.log(
        `Token expired for ${company.taxCode}, auto-refreshing...`,
      );

      token = await this.gdtAuth.loginAuto(
        company.taxCode,
        company.lookupPassword,
      );

      await this.prisma.company.update({
        where: { id: company.id },
        data: {
          token,
          tokenExpiredAt: this.gdtAuth.getTokenExpiration(token),
        },
      });

      this.logger.log(`Token refreshed for ${company.taxCode}`);
    }

    return { company, token };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private sanitizeDirName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9À-ỹ\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
