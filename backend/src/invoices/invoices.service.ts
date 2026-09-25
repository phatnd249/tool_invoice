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
import {
  sanitizeDirName,
  delay,
  resolveInvoicePath,
} from '../common/invoice-utils';
import { TokenResolverService } from '../common/token-resolver.service';
import { InvoiceDownloaderService } from './invoice-downloader.service';
import { TenantAccessService } from '../tenant/tenant-access.service';

const MAX_DATE_RANGE_DAYS = 366;

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
    private readonly tenant: TenantAccessService,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────

  private validateDateRange(startDate: string, endDate: string): void {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Ngày không hợp lệ');
    }
    if (start > end) {
      throw new BadRequestException(
        'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc',
      );
    }
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (days > MAX_DATE_RANGE_DAYS) {
      throw new BadRequestException(
        `Khoảng ngày tối đa ${MAX_DATE_RANGE_DAYS} ngày`,
      );
    }
  }

  private async assertInvoiceScope(userId: string, invoiceId: string) {
    await this.tenant.assertInvoiceAccess(userId, invoiceId);
  }

  private async invoiceScopeFilter(userId: string) {
    return this.tenant.companyScopeWhere(userId);
  }

  // ─── Check Existing ───────────────────────────────────────────────────

  async checkExisting(
    params: {
      companyId: string;
      startDate: string;
      endDate: string;
      invoiceType?: string;
    },
    userId: string,
  ): Promise<{ hasExisting: boolean; count: number }> {
    const { companyId, startDate, endDate, invoiceType = 'BOTH' } = params;

    await this.tenant.assertCompanyAccess(userId, companyId);
    this.validateDateRange(startDate, endDate);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Không tìm thấy doanh nghiệp');

    const normalizedMst = company.taxCode.startsWith('0')
      ? company.taxCode.slice(1)
      : company.taxCode;

    const types: string[] =
      invoiceType === 'BOTH' ? ['BUY', 'SELL'] : [invoiceType];

    const count = await this.prisma.invoice.count({
      where: {
        invoiceDate: this.toVietnamDayRange(startDate, endDate),
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

  async downloadInvoices(dto: DownloadInvoicesDto, userId?: string) {
    const { companyId, startDate, endDate, invoiceType = 'BOTH' } = dto;

    if (userId) {
      // Truy cập trực tiếp từ HTTP: phải có quyền trên company.
      // Path cron (scheduler) có userId undefined nhưng đã được kiểm soát
      // ngay khi tạo/assign schedule.
      await this.tenant.assertCompanyAccess(userId, companyId);
    }
    this.validateDateRange(startDate, endDate);

    // 1. Resolve company + token
    const { company, token } = await this.tokenResolver.resolve(
      companyId,
      userId,
    );

    // 2. Xác định loại cần tải
    const types: Array<'BUY' | 'SELL'> =
      invoiceType === 'BOTH'
        ? ['BUY', 'SELL']
        : [invoiceType as 'BUY' | 'SELL'];

    // 3. Tính danh sách ngày
    const dates = this.generateDateRange(
      new Date(startDate),
      new Date(endDate),
    );

    const results: Array<{
      type: string;
      totalQueried: number;
      created: number;
      updated: number;
      itemsDownloaded: number;
      itemsFailed: number;
    }> = [];

    let grandTotal = 0;

    for (const type of types) {
      this.logger.log(
        `Downloading ${type} invoices for ${company.taxCode} (${startDate} → ${endDate}, ${dates.length} days)`,
      );

      let typeTotalQueried = 0;
      let typeCreated = 0;
      let typeUpdated = 0;
      let typeItemsDownloaded = 0;
      let typeItemsFailed = 0;

      // 4. Query + download từng ngày
      for (const date of dates) {
        const dateStr = date.toISOString().slice(0, 10);

        // Query một ngày
        let dayInvoices: GdtRawInvoice[];
        try {
          dayInvoices = await this.gdtClient.queryOneDay(date, token, type);
        } catch (err: any) {
          this.logger.warn(
            `Query failed for ${dateStr} (${type}): ${err.message}`,
          );
          continue;
        }

        typeTotalQueried += dayInvoices.length;
        this.logger.log(`  ${dateStr}: ${dayInvoices.length} invoices`);

        if (dayInvoices.length === 0) continue;

        // Lưu metadata
        const stats = await this.persistence.bulkUpsert(
          dayInvoices,
          type,
          'query',
          company.id,
        );
        typeCreated += stats.created;
        typeUpdated += stats.updated;

        // Tải ZIP + parse XML
        for (let i = 0; i < dayInvoices.length; i++) {
          const inv = dayInvoices[i];

          try {
            this.logger.debug(
              `[${dateStr}][${i + 1}/${dayInvoices.length}] Downloading ZIP for ${inv.shdon}...`,
            );

            const result = await this.downloader.downloadSingleInvoice({
              invoice: inv,
              token,
              type,
              companyName: company.name,
              companyTaxCode: company.taxCode,
            });

            if (result.success) {
              typeItemsDownloaded++;
              this.logger.debug(`  ✓ Downloaded: ${result.itemsCount} items`);
            }
          } catch (error: any) {
            typeItemsFailed++;
            this.logger.warn(
              `Failed to process invoice ${inv.shdon}: ${error.message}`,
            );
            await this.persistence
              .markError(inv, type, error.message)
              .catch(() => {});
          }

          if (i < dayInvoices.length - 1) {
            await delay(500);
          }
        }

        // Delay giữa các ngày
        if (dates.length > 1) {
          await delay(300);
        }
      }

      results.push({
        type,
        totalQueried: typeTotalQueried,
        created: typeCreated,
        updated: typeUpdated,
        itemsDownloaded: typeItemsDownloaded,
        itemsFailed: typeItemsFailed,
      });

      grandTotal += typeCreated + typeUpdated;
    }

    // 5. Cập nhật downloadCount
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

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Tạo mảng các ngày từ startDate đến endDate (UTC, không lệch múi giờ).
   */
  private generateDateRange(startDate: Date, endDate: Date): Date[] {
    const dates: Date[] = [];
    const current = new Date(
      Date.UTC(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate(),
      ),
    );
    const end = new Date(
      Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()),
    );

    while (current <= end) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  /**
   * Chuyển ngày dương lịch (yyyy-MM-dd) thành khoảng [00:00:00, 23:59:59.999]
   * theo múi giờ Việt Nam (UTC+7, không có DST).
   *
   * invoiceDate được lưu theo ngày Việt Nam (ví dụ 20/07 lưu dạng 19T17:00:00Z),
   * trong khi `new Date('yyyy-MM-dd')` là nửa đêm UTC — so sánh trực tiếp sẽ làm
   * mất ngày bắt đầu. Khoảng này đảm bảo lọc bao gồm trọn cả ngày bắt đầu và
   * ngày kết thúc (inclusive).
   */
  private toVietnamDayRange(startDate?: string, endDate?: string) {
    return {
      ...(startDate && { gte: new Date(`${startDate}T00:00:00+07:00`) }),
      ...(endDate && { lte: new Date(`${endDate}T23:59:59.999+07:00`) }),
    };
  }

  // ─── Query (datatable) ──────────────────────────────────────────────────

  async findAll(
    query: QueryInvoicesDto,
    userId: string,
  ): Promise<PaginatedResult<any>> {
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

    if (companyId) {
      await this.tenant.assertCompanyAccess(userId, companyId);
    }

    const where: any = {
      ...(type && { type }),
      ...(companyId
        ? { companyId }
        : await this.tenant.companyScopeWhere(userId)),
      ...(startDate || endDate
        ? { invoiceDate: this.toVietnamDayRange(startDate, endDate) }
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

  async findOne(id: string, userId: string) {
    await this.assertInvoiceScope(userId, id);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        company: { select: { id: true, name: true, taxCode: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Không tìm thấy hoá đơn');
    }
    return invoice;
  }

  // ─── Preview ────────────────────────────────────────────────────────────

  async previewHtml(id: string, userId: string): Promise<string> {
    await this.assertInvoiceScope(userId, id);
    return this.previewService.getPreviewHtml(id);
  }

  // ─── Export Excel ───────────────────────────────────────────────────────

  async exportExcel(invoiceIds: string[], userId: string): Promise<Buffer> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        ...(await this.invoiceScopeFilter(userId)),
      },
      include: { items: true },
    });

    if (invoices.length === 0) {
      throw new NotFoundException(
        'Không tìm thấy hoá đơn nào trong phạm vi của bạn',
      );
    }

    const data = invoices.map((inv) => this.mapToParsedInvoice(inv));
    return this.excelService.generateInvoiceReport(data);
  }

  async exportModule7(invoiceIds: string[], userId: string): Promise<Buffer> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        ...(await this.invoiceScopeFilter(userId)),
      },
      include: { items: true },
    });

    if (invoices.length === 0) {
      throw new NotFoundException(
        'Không tìm thấy hoá đơn nào trong phạm vi của bạn',
      );
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
    userId: string,
  ): Promise<{ pdfPath: string; fileName: string }> {
    await this.assertInvoiceScope(userId, id);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { company: { select: { name: true, id: true } } },
    });

    if (!invoice) {
      throw new NotFoundException('Không tìm thấy hoá đơn');
    }

    // Nếu đã có pdfPath và file tồn tại, trả luôn
    const baseDir = this.config.get('INVOICES_DIR') || './invoices';
    if (invoice.pdfPath) {
      const absolutePdfPath = resolveInvoicePath(baseDir, invoice.pdfPath);
      if (fs.existsSync(absolutePdfPath)) {
        return {
          pdfPath: absolutePdfPath,
          fileName: path.basename(invoice.pdfPath),
        };
      }
    }

    // Lấy HTML preview
    await this.previewService.getPreviewHtml(id);
    const cacheHtmlPath = this.previewService.getCachePath(id);

    // Xác định thư mục lưu PDF (cùng thư mục ZIP)
    const invoicesBaseDir = this.config.get('INVOICES_DIR') || './invoices';
    const companyDir = sanitizeDirName(invoice.company?.name || 'unknown');
    const invDate = new Date(invoice.invoiceDate);
    const monthDir = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, '0')}`;
    const pdfDir = path.join(
      invoicesBaseDir,
      companyDir,
      invoice.type === 'SELL' ? 'BanRa' : 'MuaVao',
      monthDir,
    );

    const pdfFileName = this.pdfService.getPdfFileName(invoice);
    const absolutePdfPath = await this.pdfService.getOrCreatePdf(
      id,
      cacheHtmlPath,
      pdfDir,
      pdfFileName,
    );

    // Lưu relative path vào DB
    const relativePdfPath = path.relative(baseDir, absolutePdfPath);
    await this.prisma.invoice.update({
      where: { id },
      data: { pdfPath: relativePdfPath },
    });

    return { pdfPath: absolutePdfPath, fileName: pdfFileName };
  }

  async getXmlPath(
    id: string,
    userId: string,
  ): Promise<{ xmlPath: string; fileName: string }> {
    await this.assertInvoiceScope(userId, id);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException('Không tìm thấy hoá đơn');
    }

    if (!invoice.xmlPath) {
      throw new NotFoundException(
        'Không tìm thấy đường dẫn XML trong cơ sở dữ liệu',
      );
    }

    const baseDir = this.config.get('INVOICES_DIR') || './invoices';
    const absoluteXmlPath = resolveInvoicePath(baseDir, invoice.xmlPath);
    if (!fs.existsSync(absoluteXmlPath)) {
      throw new NotFoundException('Không tìm thấy file XML trên ổ đĩa');
    }

    return {
      xmlPath: absoluteXmlPath,
      fileName: path.basename(invoice.xmlPath),
    };
  }

  async getZipPath(
    id: string,
    userId: string,
  ): Promise<{ zipPath: string; fileName: string }> {
    await this.assertInvoiceScope(userId, id);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      throw new NotFoundException('Không tìm thấy hoá đơn');
    }

    if (!invoice.zipPath) {
      throw new NotFoundException(
        'Không tìm thấy đường dẫn ZIP trong cơ sở dữ liệu',
      );
    }

    const baseDir = this.config.get('INVOICES_DIR') || './invoices';
    const absoluteZipPath = resolveInvoicePath(baseDir, invoice.zipPath);
    if (!fs.existsSync(absoluteZipPath)) {
      throw new NotFoundException('Không tìm thấy file ZIP trên ổ đĩa');
    }

    return {
      zipPath: absoluteZipPath,
      fileName: path.basename(invoice.zipPath),
    };
  }

  // ─── Retry Failed ──────────────────────────────────────────────────────

  async retryFailed(
    invoiceIds: string[],
    userId: string,
  ): Promise<{
    successCount: number;
    failedCount: number;
    errors: Array<{ invoiceNumber: string; error: string }>;
  }> {
    // 1. Query invoices có downloadStatus = 'ERROR' hoặc null (chờ tải)
    //    — giới hạn trong phạm vi công ty user được truy cập.
    const invoices = await this.prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        ...(await this.invoiceScopeFilter(userId)),
        OR: [{ downloadStatus: 'ERROR' }, { downloadStatus: null }],
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
    const invoicesBaseDir = this.config.get('INVOICES_DIR') || './invoices';
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ invoiceNumber: string; error: string }> = [];

    // 3. Resolve tokens trước cho tất cả companies
    const tokenMap = new Map<string, string>();
    for (const companyId of byCompany.keys()) {
      try {
        const { token } = await this.tokenResolver.resolve(companyId, userId);
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
            companyTaxCode: company.taxCode,
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
