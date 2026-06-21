import { Request, Response } from 'express';
import { DownloaderService } from '../services/downloader.service.js';
import { ParserService, ParsedInvoice } from '../services/parser.service.js';
import { ExcelService } from '../services/excel.service.js';
import prisma from '../utils/db.js';
import * as path from 'path';

const downloaderService = new DownloaderService();
const parserService = new ParserService();
const excelService = new ExcelService();

/**
 * Helper to parse dd/MM/yyyy date string to JS Date
 */
function parseDateString(dateStr: string): Date {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}. Expected dd/MM/yyyy.`);
  }
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const year = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

export class InvoiceController {
  /**
   * POST /api/invoices/download
   * Triggers querying GDT portal, downloading zip files, parsing XML, and saving to database
   */
  public static async downloadInvoices(req: Request, res: Response): Promise<void> {
    const { startDate, endDate, token, invoiceType = 'SELL', saveToDb = true, outputDir } = req.body;

    if (!startDate || !endDate || !token) {
      res.status(400).json({ error: 'Missing required parameters: startDate, endDate, token' });
      return;
    }

    const type = invoiceType === 'BUY' ? 'BUY' : 'SELL';
    const targetDir = outputDir || path.join(process.cwd(), 'invoices');
    let start: Date;
    let end: Date;

    try {
      start = parseDateString(startDate);
      end = parseDateString(endDate);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    const tokenMst = downloaderService.getMstFromToken(token);
    if (!tokenMst) {
      res.status(401).json({ error: 'Failed to decode tax code (MST) from Token. Token might be invalid.' });
      return;
    }

    // Split date range to prevent tax server query limits
    const dateChunks = downloaderService.splitDateRange(start, end);
    const allQueryInvoices: any[] = [];

    console.log(`[InvoiceController] Querying ${type} invoices in ${dateChunks.length} cycles...`);
    
    try {
      for (const chunk of dateChunks) {
        const chunkRes = await downloaderService.queryInvoicesInRange(chunk.start, chunk.end, token, type);
        allQueryInvoices.push(...chunkRes);
      }
    } catch (error: any) {
      // GDT error logging
      await prisma.downloadHistory.create({
        data: {
          taxCode: tokenMst,
          invoiceType: type,
          status: 'FAILED',
          log: `GDT API Query failed: ${error.message}`,
          countDownloaded: 0,
        },
      });
      res.status(502).json({ error: 'GDT portal query failed', details: error.message });
      return;
    }

    console.log(`[InvoiceController] Found total ${allQueryInvoices.length} invoices. Starting downloads...`);
    const parsedList: ParsedInvoice[] = [];
    let successCount = 0;
    const errors: string[] = [];

    for (const inv of allQueryInvoices) {
      try {
        const zipPath = await downloaderService.downloadInvoiceZip(inv, token, targetDir);
        if (!zipPath) {
          errors.push(`Invoice ${inv.shdon}: Failed to download ZIP.`);
          continue;
        }

        const parsed = parserService.extractAndParseZip(zipPath, targetDir);
        if (!parsed) {
          errors.push(`Invoice ${inv.shdon}: Failed to unzip or parse XML.`);
          continue;
        }

        // Add additional download fields
        parsed.zipPath = zipPath;
        parsedList.push(parsed);
        successCount++;

        // Save to Database if required
        if (saveToDb) {
          await prisma.$transaction(async (tx) => {
            const compositeKey = {
              invoiceNumber_sellerTaxCode_buyerTaxCode: {
                invoiceNumber: parsed.invoiceNumber,
                sellerTaxCode: parsed.sellerTaxCode,
                buyerTaxCode: parsed.buyerTaxCode,
              },
            };

            const dataObj = {
              invoiceNumber: parsed.invoiceNumber,
              invoiceDate: parsed.invoiceDate,
              templateSymbol: parsed.templateSymbol,
              invoiceSymbol: parsed.invoiceSymbol,
              paymentMethod: parsed.paymentMethod,
              currency: parsed.currency,
              exchangeRate: parsed.exchangeRate,
              taxAuthorityCode: parsed.taxAuthorityCode,
              lookupCode: parsed.lookupCode,
              invoiceName: parsed.invoiceName,
              version: parsed.version,
              gdtProviderTaxCode: parsed.gdtProviderTaxCode,
              sellerName: parsed.sellerName,
              sellerTaxCode: parsed.sellerTaxCode,
              sellerAddress: parsed.sellerAddress,
              sellerPhone: parsed.sellerPhone,
              buyerName: parsed.buyerName,
              buyerTaxCode: parsed.buyerTaxCode,
              buyerAddress: parsed.buyerAddress,
              buyerCustomerId: parsed.buyerCustomerId,
              totalBeforeTax: parsed.totalBeforeTax,
              taxAmount: parsed.taxAmount,
              totalAmount: parsed.totalAmount,
              totalAmountInWords: parsed.totalAmountInWords,
              type,
              pdfPath: parsed.pdfPath,
              xmlPath: path.join(targetDir, parsed.xmlFile),
              zipPath: parsed.zipPath,
              isSavedToDb: true,
            };

            // Use transaction with delete & create for Items to ensure accurate sync upon upsert
            const existingInvoice = await tx.invoice.findUnique({
              where: compositeKey,
            });

            if (existingInvoice) {
              await tx.invoiceItem.deleteMany({
                where: { invoiceId: existingInvoice.id },
              });
              await tx.invoice.update({
                where: { id: existingInvoice.id },
                data: dataObj,
              });
              
              if (parsed.items && parsed.items.length > 0) {
                await tx.invoiceItem.createMany({
                  data: parsed.items.map(item => ({
                    invoiceId: existingInvoice.id,
                    lineNumber: item.lineNumber,
                    name: item.name,
                    unit: item.unit,
                    quantity: item.quantity,
                    price: item.price,
                    amount: item.amount,
                    taxRate: item.taxRate,
                  })),
                });
              }
            } else {
              const newInvoice = await tx.invoice.create({
                data: dataObj,
              });

              if (parsed.items && parsed.items.length > 0) {
                await tx.invoiceItem.createMany({
                  data: parsed.items.map(item => ({
                    invoiceId: newInvoice.id,
                    lineNumber: item.lineNumber,
                    name: item.name,
                    unit: item.unit,
                    quantity: item.quantity,
                    price: item.price,
                    amount: item.amount,
                    taxRate: item.taxRate,
                  })),
                });
              }
            }
          });
        }
      } catch (err: any) {
        errors.push(`Invoice ${inv.shdon}: Database save error: ${err.message}`);
      }
    }

    // GDT success / partial logging
    const status = successCount === allQueryInvoices.length ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL' : 'FAILED');
    await prisma.downloadHistory.create({
      data: {
        taxCode: tokenMst,
        invoiceType: type,
        status,
        log: errors.length > 0 ? errors.join('\n') : 'Download completed successfully.',
        countDownloaded: successCount,
      },
    });

    res.json({
      message: `Tải hóa đơn hoàn tất. Thành công: ${successCount}/${allQueryInvoices.length}`,
      status,
      count: successCount,
      errors: errors.length > 0 ? errors : undefined,
      data: parsedList.map(p => ({
        invoiceNumber: p.invoiceNumber,
        invoiceDate: p.invoiceDate,
        sellerName: p.sellerName,
        buyerName: p.buyerName,
        totalAmount: p.totalAmount,
      })),
    });
  }

  /**
   * GET /api/invoices
   * Retrieve list of saved invoices from SQLite database with filters
   */
  public static async getInvoices(req: Request, res: Response): Promise<void> {
    const { type, sellerTaxCode, buyerTaxCode, startDate, endDate } = req.query;

    const whereClause: any = {};
    if (type) {
      whereClause.type = String(type);
    }
    if (sellerTaxCode) {
      whereClause.sellerTaxCode = String(sellerTaxCode);
    }
    if (buyerTaxCode) {
      whereClause.buyerTaxCode = String(buyerTaxCode);
    }
    if (startDate || endDate) {
      whereClause.invoiceDate = {};
      if (startDate) {
        whereClause.invoiceDate.gte = new Date(String(startDate));
      }
      if (endDate) {
        whereClause.invoiceDate.lte = new Date(String(endDate));
      }
    }

    try {
      const invoices = await prisma.invoice.findMany({
        where: whereClause,
        include: {
          items: true,
        },
        orderBy: {
          invoiceDate: 'desc',
        },
      });
      res.json(invoices);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve invoices', details: error.message });
    }
  }

  /**
   * POST /api/invoices/export
   * Accepts list of invoice IDs and exports a premium Excel XLSX report
   */
  public static async exportInvoices(req: Request, res: Response): Promise<void> {
    const { invoiceIds } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      res.status(400).json({ error: 'Missing required parameter: invoiceIds (must be non-empty array)' });
      return;
    }

    try {
      const invoices = await prisma.invoice.findMany({
        where: {
          id: { in: invoiceIds },
        },
        include: {
          items: true,
        },
      });

      if (invoices.length === 0) {
        res.status(404).json({ error: 'No invoices found for the provided IDs' });
        return;
      }

      // Convert DB Invoice models to service compatible ParsedInvoice interface
      const serviceInvoices: ParsedInvoice[] = invoices.map(inv => ({
        xmlFile: path.basename(inv.xmlPath || 'invoice.xml'),
        version: inv.version || undefined,
        invoiceName: inv.invoiceName || undefined,
        templateSymbol: inv.templateSymbol,
        invoiceSymbol: inv.invoiceSymbol,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        currency: inv.currency,
        exchangeRate: inv.exchangeRate,
        paymentMethod: inv.paymentMethod || undefined,
        gdtProviderTaxCode: inv.gdtProviderTaxCode || undefined,
        taxAuthorityCode: inv.taxAuthorityCode || undefined,
        lookupCode: inv.lookupCode || undefined,
        sellerName: inv.sellerName,
        sellerTaxCode: inv.sellerTaxCode,
        sellerAddress: inv.sellerAddress || undefined,
        sellerPhone: inv.sellerPhone || undefined,
        buyerName: inv.buyerName,
        buyerTaxCode: inv.buyerTaxCode,
        buyerAddress: inv.buyerAddress || undefined,
        buyerCustomerId: inv.buyerCustomerId || undefined,
        totalBeforeTax: inv.totalBeforeTax,
        taxAmount: inv.taxAmount,
        totalAmount: inv.totalAmount,
        totalAmountInWords: inv.totalAmountInWords || undefined,
        items: inv.items.map(item => ({
          lineNumber: item.lineNumber || undefined,
          name: item.name,
          unit: item.unit || undefined,
          quantity: item.quantity || undefined,
          price: item.price || undefined,
          amount: item.amount,
          taxRate: item.taxRate || undefined,
        })),
      }));

      const excelBuffer = await excelService.generateInvoiceReport(serviceInvoices);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Invoice_Report.xlsx');
      res.send(excelBuffer);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to export invoices to Excel', details: error.message });
    }
  }
}
