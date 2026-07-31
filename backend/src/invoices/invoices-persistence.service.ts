import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GdtRawInvoice } from './gdt-client.service';

@Injectable()
export class InvoicesPersistenceService {
  private readonly logger = new Logger(InvoicesPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Upsert ──────────────────────────────────────────────────────────────

  /**
   * Upsert một hoá đơn từ GDT raw data vào DB.
   * Dùng composite unique key để tránh trùng lặp.
   */
  async upsert(
    inv: GdtRawInvoice,
    type: 'BUY' | 'SELL',
    source: string,
    companyId?: string,
  ): Promise<{ id: string; isNew: boolean }> {
    const data = this.mapToInvoiceData(inv, type, source, companyId);

    const result = await this.prisma.invoice.upsert({
      where: {
        invoiceNumber_invoiceSymbol_templateSymbol_sellerTaxCode_buyerTaxCode:
          {
            invoiceNumber: data.invoiceNumber,
            invoiceSymbol: data.invoiceSymbol,
            templateSymbol: data.templateSymbol,
            sellerTaxCode: data.sellerTaxCode,
            buyerTaxCode: data.buyerTaxCode,
          },
      },
      create: data,
      update: {
        invoiceStatus: data.invoiceStatus,
        processStatus: data.processStatus,
        totalBeforeTax: data.totalBeforeTax,
        taxAmount: data.taxAmount,
        totalAmount: data.totalAmount,
        discountAmount: data.discountAmount,
        type: data.type,
        source: data.source,
        paymentMethod: data.paymentMethod,
        currency: data.currency,
        exchangeRate: data.exchangeRate,
      },
    });

    return { id: result.id, isNew: result.createdAt.getTime() === result.updatedAt.getTime() };
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
      invoiceNumber: String(inv.shdon || '').trim(),
      invoiceDate: this.parseGdtDate(inv.tdlap),
      templateSymbol: String(inv.khmshdon || '').trim(),
      invoiceSymbol: String(inv.khhdon || '').trim(),
      paymentMethod: inv.htttoan ? String(inv.htttoan).trim() : null,
      currency: String(inv.dvtte || 'VND').trim(),
      exchangeRate: Number(inv.tgia) || 1.0,
      taxAuthorityCode: inv.mccqt ? String(inv.mccqt).trim() : null,
      lookupCode: inv.matracuu ? String(inv.matracuu).trim() : null,
      invoiceName: inv.thdon ? String(inv.thdon).trim() : 'Hoá đơn điện tử',
      sellerName: String(inv.nbten || '').trim(),
      sellerTaxCode: String(inv.nbmst || '').trim(),
      sellerAddress: inv.nbdchi ? String(inv.nbdchi).trim() : null,
      sellerPhone: null,
      buyerName: String(inv.nmten || inv.nmtnmua || '').trim(),
      buyerTaxCode: String(inv.nmmst || '').trim(),
      buyerAddress: inv.nmdchi ? String(inv.nmdchi).trim() : null,
      totalBeforeTax: Number(inv.tgtcthue) || 0,
      taxAmount: Number(inv.tgtthue) || 0,
      totalAmount: Number(inv.tgtttbso) || 0,
      discountAmount:
        inv.ttcktmai != null ? Number(inv.ttcktmai) : null,
      totalAmountInWords: null,
      invoiceStatus:
        inv.tthai != null ? Number(inv.tthai) : null,
      processStatus:
        inv.ttxly != null ? Number(inv.ttxly) : null,
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
}
