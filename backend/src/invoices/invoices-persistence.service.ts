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
          rawData: data.rawData,
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
          `Failed to upsert invoice ${inv.shdon}: ${error.message}`,
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
      totalBeforeTax:
        inv.tgtcthue != null ? Number(inv.tgtcthue) : null,
      taxAmount: inv.tgtthue != null ? Number(inv.tgtthue) : null,
      totalAmount: Number(inv.tgtttbso) || 0,
      totalAmountInWords: inv.tgtttbchu?.trim() || null,

      // Status
      invoiceStatus:
        inv.tthai != null ? Number(inv.tthai) : null,
      processStatus:
        inv.ttxly != null ? Number(inv.ttxly) : null,

      // Type & source
      type,
      source,
      companyId: companyId || null,

      // ★ Raw GDT JSON — lưu toàn bộ dữ liệu gốc
      rawData: JSON.stringify(inv),
    };
  }

  private parseGdtDate(dateStr: any): Date {
    if (!dateStr) return new Date();
    const parsed = Date.parse(dateStr);
    return isNaN(parsed) ? new Date() : new Date(parsed);
  }
}
