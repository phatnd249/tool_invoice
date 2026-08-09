import { Injectable, Logger } from '@nestjs/common';
import { GdtQueryClientService } from './gdt/gdt-query-client.service';
import { GdtDownloadClientService } from './gdt/gdt-download-client.service';

// ─── Re-export types ────────────────────────────────────────────────────────

export interface GdtRawInvoice {
  shdon: string;
  tdlap: string;
  khmshdon: string;
  khhdon: string;
  nbmst: string;
  nbten: string;
  nbdchi?: string;
  nmmst: string;
  nmten?: string;
  nmtnmua?: string;
  nmdchi?: string;
  htttoan?: string;
  dvtte?: string;
  tgia?: number;
  tgtcthue: number;
  tgtthue: number;
  tgtttbso: number;
  ttcktmai?: number;
  tgtphi?: number;
  tthai?: number;
  ttxly: number;
  mccqt?: string;
  matracuu?: string;
  thdon?: string;
  _sourceApi?: string;
  [key: string]: any;
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Facade service giữ backward compatibility với code cũ.
 * Nội bộ delegate sang GdtQueryClientService và GdtDownloadClientService.
 */
@Injectable()
export class GdtClientService {
  constructor(
    private readonly queryClient: GdtQueryClientService,
    private readonly downloadClient: GdtDownloadClientService,
  ) {}

  /**
   * Query hoá đơn từ GDT cho một ngày duy nhất.
   * Gọi cả 2 API (chuẩn + sco) và merge, có pagination nếu > 50.
   */
  async queryOneDay(
    date: Date,
    token: string,
    type: 'BUY' | 'SELL',
  ): Promise<GdtRawInvoice[]> {
    return this.queryClient.queryOneDay(date, token, type);
  }

  /**
   * Query hoá đơn từ GDT trong khoảng thời gian.
   * @deprecated Dùng queryOneDay() lặp theo từng ngày để tránh mất dữ liệu.
   */
  async queryInvoices(
    startDate: Date,
    endDate: Date,
    token: string,
    type: 'BUY' | 'SELL',
  ): Promise<GdtRawInvoice[]> {
    return this.queryClient.queryInvoices(startDate, endDate, token, type);
  }

  /**
   * Tải file ZIP (XML) của một hoá đơn từ GDT.
   * @deprecated Dùng trực tiếp GdtDownloadClientService.downloadInvoiceZip().
   */
  async downloadInvoiceZip(
    invoice: GdtRawInvoice,
    token: string,
    outputDir: string,
    companyTaxCode?: string,
  ): Promise<{ zipPath: string }> {
    return this.downloadClient.downloadInvoiceZip(
      invoice,
      token,
      outputDir,
      companyTaxCode,
    );
  }

  /**
   * Gọi GDT detail API để lấy chi tiết hoá đơn.
   * @deprecated Dùng trực tiếp GdtDownloadClientService.downloadInvoiceDetail().
   */
  async downloadInvoiceDetail(
    invoice: GdtRawInvoice,
    token: string,
  ): Promise<Record<string, any> | null> {
    return this.downloadClient.downloadInvoiceDetail(invoice, token);
  }
}
