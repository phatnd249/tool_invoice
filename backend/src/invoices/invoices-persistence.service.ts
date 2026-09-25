import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GdtRawInvoice } from './gdt-client.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoicesPersistenceService {
  private readonly logger = new Logger(InvoicesPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Upsert ──────────────────────────────────────────────────────────────

  /**
   * Upsert một hoá đơn từ GDT raw data vào DB.
   * Dùng findFirst + create/update thủ công vì composite unique key
   * có buyerTaxCode nullable (Prisma upsert không xử lý tốt null trong unique).
   */
  async upsert(
    inv: GdtRawInvoice,
    type: 'BUY' | 'SELL',
    source: string,
    companyId?: string,
  ): Promise<{ id: string; isNew: boolean }> {
    const data = this.mapToInvoiceData(inv, type, source, companyId);

    // Tìm invoice đã tồn tại theo composite key
    const where: Prisma.InvoiceWhereInput = {
      invoiceNumber: data.invoiceNumber,
      invoiceSymbol: data.invoiceSymbol,
      templateSymbol: data.templateSymbol,
      sellerTaxCode: data.sellerTaxCode,
      buyerTaxCode: data.buyerTaxCode ?? null,
    };

    const existing = await this.prisma.invoice.findFirst({ where });

    if (existing) {
      // Update
      await this.prisma.invoice.update({
        where: { id: existing.id },
        data: {
          invoiceStatus: data.invoiceStatus,
          processStatus: data.processStatus,
          totalBeforeTax: data.totalBeforeTax,
          taxAmount: data.taxAmount,
          totalAmount: data.totalAmount,
          totalAmountInWords: data.totalAmountInWords,
          buyerName: data.buyerName,
          sellerName: data.sellerName,
          type: data.type,
          source: data.source,
        },
      });
      return { id: existing.id, isNew: false };
    }

    // Create
    const created = await this.prisma.invoice.create({ data });
    return { id: created.id, isNew: true };
  }

  /**
   * Batch upsert nhiều hoá đơn.
   */
  async bulkUpsert(
    invoices: GdtRawInvoice[],
    type: 'BUY' | 'SELL',
    source: string,
    companyId?: string,
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const inv of invoices) {
      try {
        const result = await this.upsert(inv, type, source, companyId);
        if (result.isNew) {
          created++;
        } else {
          updated++;
        }
      } catch (error: any) {
        this.logger.error(
          `Không thể lưu hoá đơn ${inv.shdon}: ${error.message}`,
        );
      }
    }

    return { created, updated };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private mapToInvoiceData(
    inv: GdtRawInvoice,
    type: 'BUY' | 'SELL',
    source: string,
    companyId?: string,
  ) {
    return {
      // Core identity
      invoiceNumber: String(inv.shdon || '').trim(),
      invoiceDate: this.parseGdtDate(inv.tdlap),
      templateSymbol: String(inv.khmshdon || '').trim(),
      invoiceSymbol: String(inv.khhdon || '').trim(),

      // Seller
      sellerTaxCode: String(inv.nbmst || '').trim(),
      sellerName: String(inv.nbten || '').trim(),

      // Buyer (nullable: hoá đơn bán lẻ không có nmmst)
      buyerTaxCode: inv.nmmst ? String(inv.nmmst).trim() : null,
      buyerName: (inv.nmten || inv.nmtnmua || '').trim() || null,

      // Financial
      totalBeforeTax: inv.tgtcthue != null ? Number(inv.tgtcthue) : null,
      taxAmount: inv.tgtthue != null ? Number(inv.tgtthue) : null,
      totalAmount: Number(inv.tgtttbso) || 0,
      totalAmountInWords: inv.tgtttbchu?.trim() || null,

      // Status
      invoiceStatus: inv.tthai != null ? Number(inv.tthai) : null,
      processStatus: inv.ttxly != null ? Number(inv.ttxly) : null,

      // Type & source
      type,
      source,
      companyId: companyId || null,
    };
  }

  private parseGdtDate(dateStr: any): Date {
    if (!dateStr) return new Date();
    const parsed = Date.parse(dateStr);
    return isNaN(parsed) ? new Date() : new Date(parsed);
  }

  // ─── Invoice Items ──────────────────────────────────────────────────────

  /**
   * Lưu items từ file ZIP đã parse (XML), kèm zip/xml paths.
   * Xoá items cũ trước khi tạo mới.
   */
  async saveItemsFromZip(
    inv: GdtRawInvoice,
    type: 'BUY' | 'SELL',
    items: Array<{
      lineNumber?: string;
      name: string;
      unit?: string;
      quantity?: number;
      price?: number;
      amount: number;
      taxRate?: string;
    }>,
    zipPath: string,
    xmlPath: string,
  ): Promise<string> {
    const where = this.buildWhere(inv, type);
    const invoice = await this.prisma.invoice.findFirst({ where });
    if (!invoice) {
      this.logger.warn(`Invoice not found for ${inv.shdon}, skipping items`);
      return '';
    }

    await this.prisma.$transaction(async (tx) => {
      // Xoá items cũ
      await tx.invoiceItem.deleteMany({
        where: { invoiceId: invoice.id },
      });

      // Tạo items mới
      if (items.length > 0) {
        await tx.invoiceItem.createMany({
          data: items.map((item, idx) => ({
            invoiceId: invoice.id,
            lineNumber: item.lineNumber ? Number(item.lineNumber) : idx + 1,
            name: item.name,
            unit: item.unit || null,
            quantity: item.quantity ?? null,
            price: item.price ?? null,
            amount: item.amount,
            taxRate: item.taxRate || null,
          })),
        });
      }

      // Cập nhật zip/xml paths + status
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          zipPath,
          xmlPath,
          downloadStatus: 'PARSED',
          errorMessage: null,
        },
      });
    });

    this.logger.debug(`Saved ${items.length} items for invoice ${inv.shdon}`);

    return invoice.id;
  }

  /**
   * Đánh dấu invoice bị lỗi khi tải ZIP hoặc parse XML.
   */
  async markError(
    inv: GdtRawInvoice,
    type: 'BUY' | 'SELL',
    errorMessage: string,
  ): Promise<void> {
    const where = this.buildWhere(inv, type);
    const invoice = await this.prisma.invoice.findFirst({ where });
    if (!invoice) return;

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { downloadStatus: 'ERROR', errorMessage },
    });

    this.logger.warn(
      `Marked invoice ${inv.shdon} as ERROR: ${errorMessage.slice(0, 100)}`,
    );
  }

  /**
   * Lưu items + metadata từ GDT detail API (fallback khi không có ZIP).
   * Thay items cũ, cập nhật thông tin bên mua/phần tiền từ detail, và set
   * downloadStatus = 'PARSED'. Không gán zipPath/xmlPath vì không có hồ sơ gốc.
   *
   * @param inv - Dữ liệu query GDT
   * @param items - Items từ detail API (đã parse field chuẩn hoá)
   * @param detail - Dữ liệu detail thô (dùng để bổ sung thông tin)
   * @returns invoiceId nếu tìm thấy, ngược lại chuỗi rỗng
   */
  async saveItemsFromDetail(
    inv: GdtRawInvoice,
    type: 'BUY' | 'SELL',
    items: Array<{
      lineNumber?: string;
      name: string;
      unit?: string;
      quantity?: number;
      price?: number;
      amount: number;
      taxRate?: string;
    }>,
    detail?: Record<string, any> | null,
  ): Promise<string> {
    const where = this.buildWhere(inv, type);
    const invoice = await this.prisma.invoice.findFirst({ where });
    if (!invoice) {
      this.logger.warn(
        `Invoice not found for ${inv.shdon}, skipping detail items`,
      );
      return '';
    }

    await this.prisma.$transaction(async (tx) => {
      // Xoá items cũ
      await tx.invoiceItem.deleteMany({
        where: { invoiceId: invoice.id },
      });

      // Tạo items mới nếu có
      if (items.length > 0) {
        await tx.invoiceItem.createMany({
          data: items.map((item, idx) => ({
            invoiceId: invoice.id,
            lineNumber: item.lineNumber ? Number(item.lineNumber) : idx + 1,
            name: item.name,
            unit: item.unit || null,
            quantity: item.quantity ?? null,
            price: item.price ?? null,
            amount: item.amount,
            taxRate: item.taxRate || null,
          })),
        });
      }

      // Bổ sung thông tin từ detail nếu có
      const updateData: Prisma.InvoiceUpdateInput = {
        downloadStatus: 'PARSED',
        errorMessage: null,
      };
      if (detail) {
        if (detail.nmten || detail.nmtnmua) {
          updateData.buyerName =
            String(detail.nmten || detail.nmtnmua || '').trim() || null;
        }
        if (detail.tgtcthue != null) {
          updateData.totalBeforeTax = Number(detail.tgtcthue);
        }
        if (detail.tgtthue != null) {
          updateData.taxAmount = Number(detail.tgtthue);
        }
        if (detail.tgtttbso != null) {
          updateData.totalAmount = Number(detail.tgtttbso);
        }
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: updateData,
      });
    });

    this.logger.debug(
      `Saved ${items.length} detail items for invoice ${inv.shdon} (no ZIP)`,
    );

    return invoice.id;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private buildWhere(
    inv: GdtRawInvoice,
    _type: 'BUY' | 'SELL',
  ): Prisma.InvoiceWhereInput {
    return {
      invoiceNumber: String(inv.shdon || '').trim(),
      invoiceSymbol: String(inv.khhdon || '').trim(),
      templateSymbol: String(inv.khmshdon || '').trim(),
      sellerTaxCode: String(inv.nbmst || '').trim(),
      buyerTaxCode: inv.nmmst ? String(inv.nmmst).trim() : null,
    };
  }
}
