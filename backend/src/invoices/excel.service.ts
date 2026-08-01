import { Injectable } from '@nestjs/common';
import { InvoiceReportService } from './excel/invoice-report.service';
import { Module7ReportService } from './excel/module7-report.service';

// ─── Re-export types ────────────────────────────────────────────────────────

export interface ParsedInvoiceItem {
  lineNumber?: string;
  name: string;
  unit?: string;
  quantity?: number;
  price?: number;
  amount: number;
  taxRate?: string;
}

export interface ParsedInvoice {
  xmlFile: string;
  templateSymbol: string;
  invoiceSymbol: string;
  invoiceNumber: string;
  invoiceDate: Date;
  currency: string;
  exchangeRate: number;
  paymentMethod?: string;
  taxAuthorityCode?: string;
  lookupCode?: string;
  sellerName: string;
  sellerTaxCode: string;
  buyerName: string;
  buyerTaxCode: string;
  totalBeforeTax: number;
  taxAmount: number;
  totalAmount: number;
  totalAmountInWords?: string;
  items: ParsedInvoiceItem[];
}

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * Facade service giữ backward compatibility.
 * Nội bộ delegate sang InvoiceReportService và Module7ReportService.
 */
@Injectable()
export class ExcelService {
  constructor(
    private readonly invoiceReport: InvoiceReportService,
    private readonly module7Report: Module7ReportService,
  ) {}

  async generateInvoiceReport(invoices: ParsedInvoice[]): Promise<Buffer> {
    return this.invoiceReport.generate(invoices);
  }

  async generateModule7Report(
    invoices: (ParsedInvoice & { type: string })[],
  ): Promise<Buffer> {
    return this.module7Report.generate(invoices);
  }
}
