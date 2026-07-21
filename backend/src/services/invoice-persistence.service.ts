// backend/src/services/invoice-persistence.service.ts
// Service chịu trách nhiệm lưu trữ invoice và invoice items vào database.
// Tất cả thao tác Prisma liên quan đến invoice đều qua service này.

import prisma from '../utils/db.js';
import { ParsedInvoice } from './parser.service.js';
import { createLogger } from '../logger/index.js';

const log = createLogger('InvoicePersistenceService');

export interface UpsertInvoiceResult {
  invoiceId: string;
  isNew: boolean;
}

/**
 * Service lưu trữ invoice và invoice items vào database.
 * - upsertInvoice: từ dữ liệu parse XML
 * - saveBasicInvoiceFromGdt: từ GDT query response (khi không tải được ZIP)
 * - updateInvoiceDetail: cập nhật metadata từ GDT detail API
 * - saveInvoiceItemsFromDetail: lưu items từ GDT detail API
 */
export class InvoicePersistenceService {
  /**
   * Upsert một invoice (parsed từ XML) và các items của nó.
   * Dùng composite unique key: (invoiceNumber, invoiceSymbol, templateSymbol, sellerTaxCode, buyerTaxCode)
   * để tránh duplicate.
   */
  async upsertInvoice(
    parsed: ParsedInvoice,
    type: 'BUY' | 'SELL',
  ): Promise<UpsertInvoiceResult> {
    const compositeKey = {
      invoiceNumber_invoiceSymbol_templateSymbol_sellerTaxCode_buyerTaxCode: {
        invoiceNumber: parsed.invoiceNumber,
        invoiceSymbol: parsed.invoiceSymbol,
        templateSymbol: parsed.templateSymbol,
        sellerTaxCode: parsed.sellerTaxCode,
        buyerTaxCode: parsed.buyerTaxCode,
      },
    };

    const dataObj = {
      invoiceNumber: parsed.invoiceNumber,
      invoiceDate: parsed.invoiceDate,
      templateSymbol: parsed.templateSymbol,
      invoiceSymbol: parsed.invoiceSymbol,
      paymentMethod: parsed.paymentMethod ?? null,
      currency: parsed.currency,
      exchangeRate: parsed.exchangeRate,
      taxAuthorityCode: parsed.taxAuthorityCode ?? null,
      lookupCode: parsed.lookupCode ?? null,
      invoiceName: parsed.invoiceName ?? null,
      version: parsed.version ?? null,
      gdtProviderTaxCode: parsed.gdtProviderTaxCode ?? null,
      sellerName: parsed.sellerName,
      sellerTaxCode: parsed.sellerTaxCode,
      sellerAddress: parsed.sellerAddress ?? null,
      sellerPhone: parsed.sellerPhone ?? null,
      buyerName: parsed.buyerName,
      buyerTaxCode: parsed.buyerTaxCode,
      buyerAddress: parsed.buyerAddress ?? null,
      buyerCustomerId: parsed.buyerCustomerId ?? null,
      totalBeforeTax: parsed.totalBeforeTax,
      taxAmount: parsed.taxAmount,
      totalAmount: parsed.totalAmount,
      discountAmount: parsed.discountAmount ?? null,
      feeAmount: parsed.feeAmount ?? null,
      totalAmountInWords: parsed.totalAmountInWords ?? null,
      invoiceStatus: parsed.invoiceStatus ?? null,
      processStatus: parsed.processStatus ?? null,
      type,
      pdfPath: parsed.pdfPath ?? null,
      xmlPath: parsed.xmlFile ?? null,
      zipPath: parsed.zipPath ?? null,
      isSavedToDb: true,
    };

    return await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({ where: compositeKey });

      if (existing) {
        log.debug({ invoiceNumber: parsed.invoiceNumber }, 'Updating existing invoice');
        await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
        await tx.invoice.update({ where: { id: existing.id }, data: dataObj });

        if (parsed.items && parsed.items.length > 0) {
          await tx.invoiceItem.createMany({
            data: parsed.items.map((item) => ({
              invoiceId: existing.id,
              lineNumber: item.lineNumber ?? null,
              name: item.name,
              unit: item.unit ?? null,
              quantity: item.quantity ?? null,
              price: item.price ?? null,
              amount: item.amount,
              taxRate: item.taxRate ?? null,
            })),
          });
        }

        return { invoiceId: existing.id, isNew: false };
      }

      log.debug({ invoiceNumber: parsed.invoiceNumber }, 'Creating new invoice');
      const created = await tx.invoice.create({ data: dataObj });

      if (parsed.items && parsed.items.length > 0) {
        await tx.invoiceItem.createMany({
          data: parsed.items.map((item) => ({
            invoiceId: created.id,
            lineNumber: item.lineNumber ?? null,
            name: item.name,
            unit: item.unit ?? null,
            quantity: item.quantity ?? null,
            price: item.price ?? null,
            amount: item.amount,
            taxRate: item.taxRate ?? null,
          })),
        });
      }

      return { invoiceId: created.id, isNew: true };
    });
  }

  /**
   * Lưu thông tin cơ bản của invoice từ GDT query response (khi không tải được ZIP).
   * Dữ liệu từ GDT query API có các field: shdon, nbmst, khhdon, khmshdon, tdlap, ...
   */
  async saveBasicInvoiceFromGdt(
    inv: Record<string, any>,
    type: 'BUY' | 'SELL',
  ): Promise<UpsertInvoiceResult> {
    const invoiceNumber = String(inv.shdon || '').trim();
    const sellerTaxCode = String(inv.nbmst || '').trim();
    const buyerTaxCode = String(inv.nmmst || inv.nmuamst || '').trim();

    if (!invoiceNumber || !sellerTaxCode || !buyerTaxCode) {
      throw new Error('Missing primary key identifiers (shdon, nbmst, nmmst)');
    }

    const invoiceDate = this._parseDate(inv.tdlap);

    const dataObj = {
      invoiceNumber,
      invoiceDate,
      templateSymbol: String(inv.khmshdon || '').trim(),
      invoiceSymbol: String(inv.khhdon || '').trim(),
      paymentMethod: inv.htttoan ? String(inv.htttoan).trim() : null,
      currency: String(inv.dvtte || 'VND').trim(),
      exchangeRate: Number(inv.tgia) || 1.0,
      taxAuthorityCode: inv.mccqt ? String(inv.mccqt).trim() : null,
      lookupCode: inv.matracuu ? String(inv.matracuu).trim() : null,
      invoiceName: inv.thdon ? String(inv.thdon).trim() : 'Hóa đơn điện tử',
      sellerName: String(inv.nbten || '').trim(),
      sellerTaxCode,
      sellerAddress: inv.nbdchi ? String(inv.nbdchi).trim() : null,
      buyerName: String(inv.nmten || inv.nmuaten || '').trim(),
      buyerTaxCode,
      buyerAddress:
        inv.nmdchi || inv.nmuadchi
          ? String(inv.nmdchi || inv.nmuadchi).trim()
          : null,
      totalBeforeTax: Number(inv.tgtcthue) || 0,
      taxAmount: Number(inv.tgtthue) || 0,
      totalAmount: Number(inv.tgtttbso) || 0,
      discountAmount:
        inv.ttcktmai !== undefined && inv.ttcktmai !== null
          ? Number(inv.ttcktmai)
          : null,
      feeAmount:
        inv.tgtphi !== undefined && inv.tgtphi !== null
          ? Number(inv.tgtphi)
          : null,
      invoiceStatus: inv.tthai !== undefined ? Number(inv.tthai) : null,
      processStatus: inv.ttxly !== undefined ? Number(inv.ttxly) : null,
      type,
      pdfPath: null,
      xmlPath: null,
      zipPath: null,
      isSavedToDb: true,
    };

    const compositeKey = {
      invoiceNumber_invoiceSymbol_templateSymbol_sellerTaxCode_buyerTaxCode: {
        invoiceNumber,
        invoiceSymbol: dataObj.invoiceSymbol,
        templateSymbol: dataObj.templateSymbol,
        sellerTaxCode,
        buyerTaxCode,
      },
    };

    return await prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({ where: compositeKey });

      if (existing) {
        const updated = await tx.invoice.update({
          where: compositeKey,
          data: dataObj,
        });
        return { invoiceId: updated.id, isNew: false };
      }

      const created = await tx.invoice.create({ data: dataObj });
      return { invoiceId: created.id, isNew: true };
    });
  }

  /**
   * Cập nhật chi tiết invoice từ GDT detail API (fallback khi không có ZIP).
   */
  async updateInvoiceDetail(
    invoiceId: string,
    detail: Record<string, any>,
  ): Promise<void> {
    const updateData: Record<string, any> = {};

    if (detail.nbten) updateData.sellerName = String(detail.nbten).trim();
    if (detail.nbdchi) updateData.sellerAddress = String(detail.nbdchi).trim();
    if (detail.nmten || detail.nmuaten)
      updateData.buyerName = String(detail.nmten || detail.nmuaten).trim();
    if (detail.nmdchi || detail.nmuadchi)
      updateData.buyerAddress = String(detail.nmdchi || detail.nmuadchi).trim();
    if (detail.htttoan) updateData.paymentMethod = String(detail.htttoan).trim();
    if (detail.dvtte) updateData.currency = String(detail.dvtte).trim();
    if (detail.tgia !== undefined) updateData.exchangeRate = Number(detail.tgia) || 1.0;
    if (detail.tgtcthue !== undefined) updateData.totalBeforeTax = Number(detail.tgtcthue) || 0;
    if (detail.tgtthue !== undefined) updateData.taxAmount = Number(detail.tgtthue) || 0;
    if (detail.tgtttbso !== undefined) updateData.totalAmount = Number(detail.tgtttbso) || 0;
    if (detail.ttcktmai !== undefined) updateData.discountAmount = Number(detail.ttcktmai) || null;
    if (detail.tgtphi !== undefined) updateData.feeAmount = Number(detail.tgtphi) || null;

    if (Object.keys(updateData).length > 0) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: updateData,
      });
    }
  }

  /**
   * Lưu items từ GDT detail API (fallback khi không có ZIP).
   */
  async saveInvoiceItemsFromDetail(
    invoiceId: string,
    detailItems: Record<string, any>[],
  ): Promise<void> {
    if (!detailItems || detailItems.length === 0) return;

    await prisma.invoiceItem.deleteMany({ where: { invoiceId } });
    await prisma.invoiceItem.createMany({
      data: detailItems.map((item: any, idx: number) => ({
        invoiceId,
        lineNumber: String(idx + 1),
        name: String(item.ten || item.thdon || item.tchat || '').trim(),
        unit: String(item.dvtinh || '').trim(),
        quantity: Number(item.sluong) || 0,
        price: Number(item.dgia) || 0,
        amount: Number(item.thtien) || 0,
        taxRate: String(item.ltsuat || item.tsuat || '').trim(),
      })),
    });
  }

  /**
   * Cập nhật pdfPath cho invoice.
   */
  async updatePdfPath(invoiceId: string, pdfPath: string): Promise<void> {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { pdfPath },
    });
  }

  /**
   * Cập nhật zipPath cho invoice.
   */
  async updateZipPath(invoiceId: string, zipPath: string): Promise<void> {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { zipPath },
    });
  }

  /**
   * Ghi download history.
   */
  async recordDownloadHistory(params: {
    taxCode: string;
    invoiceType: string;
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
    log: string;
    countDownloaded: number;
    userId?: number | null;
    username?: string | null;
  }): Promise<void> {
    await prisma.downloadHistory.create({
      data: {
        taxCode: params.taxCode,
        invoiceType: params.invoiceType,
        status: params.status,
        log: params.log,
        countDownloaded: params.countDownloaded,
        userId: params.userId ?? null,
        username: params.username ?? null,
      },
    });
  }

  /**
   * Lấy invoice theo ID.
   */
  async getInvoiceById(id: string) {
    return prisma.invoice.findUnique({ where: { id } });
  }

  // ─── Private helpers ────────────────────────────────────

  private _parseDate(dateStr: any): Date {
    if (!dateStr) return new Date();
    const parsed = Date.parse(dateStr);
    return isNaN(parsed) ? new Date() : new Date(parsed);
  }
}

// Singleton export
export const invoicePersistenceService = new InvoicePersistenceService();
