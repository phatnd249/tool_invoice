import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import prisma from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { PreviewService } from '../services/preview.service.js';
import { invoiceDownloadService, DownloadProgress } from '../services/invoice-download.service.js';
import { invoicePersistenceService } from '../services/invoice-persistence.service.js';
import { pdfGenerationService } from '../services/pdf-generation.service.js';
import { DownloaderService } from '../services/downloader.service.js';
import { ExcelService } from '../services/excel.service.js';
import { ParserService, ParsedInvoice } from '../services/parser.service.js';
import { createLogger } from '../logger/index.js';
import { parseDateString, getResultCode, getTthaiString, getTtxlyString } from '../utils/gdt-format.js';
import { resolveTargetDir, getPdfFileNameFromInv, cleanCompanyName } from '../utils/path-resolver.js';

const log = createLogger('InvoiceController');
const downloaderService = new DownloaderService();
const parserService = new ParserService();
const excelService = new ExcelService();
const authService = new AuthService();
const previewService = new PreviewService();

export class InvoiceController {
  /**
   * POST /api/invoices/download
   * Triggers querying GDT portal, downloading zip files, parsing XML, and saving to database
   */
  public static async downloadInvoices(req: AuthRequest, res: Response): Promise<void> {
    const { startDate, endDate, companyId, token, username, password, invoiceType = 'SELL', saveToDb = true, outputDir, geminiApiKey } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Missing required parameters: startDate, endDate' });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    // Access control cho non-admin
    const accessError = await InvoiceController._checkCompanyAccess(req, companyId, username);
    if (accessError) {
      res.status(accessError.status).json({ error: accessError.error });
      return;
    }

    // Parse dates
    let start: Date, end: Date;
    try {
      start = parseDateString(startDate);
      end = parseDateString(endDate);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    log.info({ startDate, endDate, companyId, invoiceType, userId: req.user.id }, 'downloadInvoices started');

    // Run pipeline
    const result = await invoiceDownloadService.run({
      startDate: start,
      endDate: end,
      companyId: companyId ? Number(companyId) : undefined,
      token,
      username,
      password,
      geminiApiKey,
      invoiceType: (invoiceType as any) || 'SELL',
      saveToDb: saveToDb !== false,
      outputDir,
      userId: req.user.id,
      usernameLabel: req.user.username,
    });

    log.info({ successCount: result.successCount, status: result.status }, 'downloadInvoices completed');

    res.json({
      message: `Tải hoàn tất: ${result.successCount} hóa đơn (${result.status === 'PARTIAL' ? 'có lỗi' : result.status === 'FAILED' ? 'thất bại' : 'thành công'}).`,
      status: result.status,
      count: result.successCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
      data: result.parsedInvoices.map((p) => ({
        invoiceNumber: p.invoiceNumber,
        invoiceDate: p.invoiceDate,
        sellerName: p.sellerName,
        buyerName: p.buyerName,
        totalAmount: p.totalAmount,
      })),
    });
  }

  /**
   * GET /api/invoices/download/stream
   * Download invoices with SSE progress events.
   */
  public static async downloadInvoicesStream(req: AuthRequest, res: Response): Promise<void> {
    const { startDate, endDate, companyId, invoiceType = 'SELL' } = req.query as Record<string, string>;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Missing required parameters: startDate, endDate' });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let aborted = false;
    req.on('close', () => { aborted = true; });

    const sendEvent = (event: string, data: any) => {
      if (aborted) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Parse dates
    let start: Date, end: Date;
    try {
      start = parseDateString(startDate);
      end = parseDateString(endDate);
    } catch (e: any) {
      sendEvent('error', { message: e.message });
      res.end();
      return;
    }

    // Run pipeline with SSE progress
    const result = await invoiceDownloadService.run({
      startDate: start,
      endDate: end,
      companyId: companyId ? Number(companyId) : undefined,
      invoiceType: (invoiceType as any) || 'SELL',
      saveToDb: true,
      userId: req.user.id,
      usernameLabel: req.user.username,
      onProgress: (progress: DownloadProgress) => {
        if (aborted) return;
        sendEvent('progress', {
          type: progress.type,
          current: progress.current,
          total: progress.total,
          invoiceNumber: progress.invoiceNumber,
        });
        sendEvent('log', {
          time: new Date().toISOString(),
          message: progress.message || '',
          type: progress.level || 'info',
        });
      },
    });

    if (aborted) {
      sendEvent('log', { time: new Date().toISOString(), message: 'Kết nối bị ngắt bởi người dùng.', type: 'warning' });
      res.end();
      return;
    }

    sendEvent('done', {
      message: result.successCount > 0
        ? `Đã tải thành công ${result.successCount} hoá đơn.`
        : 'Không có hoá đơn nào được tải.',
      successCount: result.successCount,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 20),
    });

    res.end();
  }

  // Whitelist các field cho phép sort (tránh injection)
  private static readonly INVOICE_SORT_FIELDS = new Set([
    'invoiceNumber', 'invoiceDate', 'templateSymbol', 'invoiceSymbol',
    'sellerName', 'sellerTaxCode', 'buyerName', 'buyerTaxCode',
    'totalBeforeTax', 'taxAmount', 'totalAmount', 'invoiceStatus',
  ]);

  private static readonly HISTORY_SORT_FIELDS = new Set([
    'downloadDate', 'taxCode', 'invoiceType', 'status', 'countDownloaded', 'username',
  ]);

  /**
   * GET /api/invoices
   * Retrieve list of saved invoices with filters and sorting
   */
  public static async getInvoices(req: AuthRequest, res: Response): Promise<void> {
    const {
      type,
      sellerTaxCode,
      buyerTaxCode,
      startDate,
      endDate,
      page: pageParam,
      size: sizeParam,
      search,
      sortBy,
      sortDir,
    } = req.query;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    const hasPagination = pageParam !== undefined && sizeParam !== undefined;
    const page = hasPagination ? Math.max(0, parseInt(String(pageParam), 10) || 0) : 0;
    const size = hasPagination ? Math.min(100, Math.max(1, parseInt(String(sizeParam), 10) || 20)) : 0;

    const whereClause: any = {};
    if (type) whereClause.type = String(type);
    if (sellerTaxCode) whereClause.sellerTaxCode = String(sellerTaxCode);
    if (buyerTaxCode) whereClause.buyerTaxCode = String(buyerTaxCode);
    if (startDate || endDate) {
      whereClause.invoiceDate = {};
      if (startDate) whereClause.invoiceDate.gte = new Date(String(startDate));
      if (endDate) whereClause.invoiceDate.lte = new Date(String(endDate));
    }
    if (search) {
      const q = String(search).trim();
      if (q) {
        whereClause.OR = [
          { invoiceNumber: { contains: q } },
          { sellerName: { contains: q } },
          { sellerTaxCode: { contains: q } },
          { buyerName: { contains: q } },
          { buyerTaxCode: { contains: q } },
          { invoiceSymbol: { contains: q } },
        ];
      }
    }

    // Staff permission filter
    if (req.user.role !== 'ADMIN') {
      const assignedCompanies = await prisma.userCompany.findMany({
        where: { userId: req.user.id },
        include: { company: { select: { taxCode: true } } },
      });
      const allowedMsts = assignedCompanies.map((uc) => uc.company.taxCode);
      const accessFilter = {
        OR: [
          { sellerTaxCode: { in: allowedMsts } },
          { buyerTaxCode: { in: allowedMsts } },
        ],
      };

      if (whereClause.OR) {
        whereClause.AND = [{ OR: whereClause.OR }, accessFilter];
        delete whereClause.OR;
      } else {
        whereClause.AND = [accessFilter];
      }
    }

    // Build orderBy từ sort params
    const orderField = InvoiceController.INVOICE_SORT_FIELDS.has(String(sortBy))
      ? String(sortBy)
      : 'invoiceDate';
    const orderDir = sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [orderField]: orderDir };

    try {
      const total = hasPagination ? await prisma.invoice.count({ where: whereClause }) : 0;
      const invoices = await prisma.invoice.findMany({
        where: whereClause,
        include: { items: true },
        orderBy,
        ...(hasPagination ? { skip: page * size, take: size } : {}),
      });

      if (hasPagination) {
        res.json({ data: invoices, page, size, total, totalPages: Math.ceil(total / size) });
      } else {
        res.json(invoices);
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve invoices', details: error.message });
    }
  }

  /**
   * POST /api/invoices/export
   * Export invoices to Excel XLSX report
   */
  public static async exportInvoices(req: AuthRequest, res: Response): Promise<void> {
    const { invoiceIds } = req.body;
    if (!req.user) { res.status(401).json({ error: 'Yêu cầu xác thực.' }); return; }
    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      res.status(400).json({ error: 'Missing required parameter: invoiceIds' }); return;
    }

    try {
      let whereClause: any = { id: { in: invoiceIds } };
      if (req.user.role !== 'ADMIN') {
        const assignedCompanies = await prisma.userCompany.findMany({
          where: { userId: req.user.id },
          include: { company: { select: { taxCode: true } } },
        });
        const allowedMsts = assignedCompanies.map((uc) => uc.company.taxCode);
        whereClause.AND = [{ OR: [{ sellerTaxCode: { in: allowedMsts } }, { buyerTaxCode: { in: allowedMsts } }] }];
      }

      const invoices = await prisma.invoice.findMany({ where: whereClause, include: { items: true } });
      if (invoices.length === 0) { res.status(404).json({ error: 'No invoices found' }); return; }

      const serviceInvoices: ParsedInvoice[] = invoices.map((inv) => ({
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
        items: inv.items.map((item) => ({
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

  /**
   * POST /api/invoices/export-module7
   * Export Module 7 Excel report
   */
  public static async exportModule7(req: AuthRequest, res: Response): Promise<void> {
    const { invoiceIds } = req.body;
    if (!req.user) { res.status(401).json({ error: 'Yêu cầu xác thực.' }); return; }
    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      res.status(400).json({ error: 'Missing required parameter: invoiceIds' }); return;
    }

    try {
      let whereClause: any = { id: { in: invoiceIds } };
      if (req.user.role !== 'ADMIN') {
        const assignedCompanies = await prisma.userCompany.findMany({
          where: { userId: req.user.id },
          include: { company: { select: { taxCode: true } } },
        });
        const allowedMsts = assignedCompanies.map((uc) => uc.company.taxCode);
        whereClause.AND = [{ OR: [{ sellerTaxCode: { in: allowedMsts } }, { buyerTaxCode: { in: allowedMsts } }] }];
      }

      const invoices = await prisma.invoice.findMany({ where: whereClause, include: { items: true } });
      if (invoices.length === 0) { res.status(404).json({ error: 'No invoices found' }); return; }

      const serviceInvoices = invoices.map((inv) => ({
        xmlFile: path.basename(inv.xmlPath || 'invoice.xml'),
        type: inv.type,
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
        items: inv.items.map((item) => ({
          lineNumber: item.lineNumber || undefined,
          name: item.name,
          unit: item.unit || undefined,
          quantity: item.quantity || undefined,
          price: item.price || undefined,
          amount: item.amount,
          taxRate: item.taxRate || undefined,
        })),
      }));

      const excelBuffer = await excelService.generateModule7Report(serviceInvoices);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=BaoCao_TongHop_M7.xlsx');
      res.send(excelBuffer);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to export Module 7 report', details: error.message });
    }
  }

  /**
   * GET /api/invoices/:id/xml
   * Download raw XML file
   */
  public static async downloadXml(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    if (!req.user) { res.status(401).json({ error: 'Yêu cầu xác thực.' }); return; }

    try {
      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice || !invoice.xmlPath) { res.status(404).json({ error: 'Invoice XML not found' }); return; }

      if (!(await InvoiceController._checkInvoiceAccess(req, invoice))) {
        res.status(403).json({ error: 'Bạn không có quyền truy cập hóa đơn này.' }); return;
      }
      if (!fs.existsSync(invoice.xmlPath)) { res.status(404).json({ error: 'XML file does not exist on disk' }); return; }

      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename=${path.basename(invoice.xmlPath)}`);
      res.sendFile(invoice.xmlPath);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to download XML file', details: error.message });
    }
  }

  /**
   * GET /api/invoices/:id/zip
   * Download raw ZIP file
   */
  public static async downloadZip(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    if (!req.user) { res.status(401).json({ error: 'Yêu cầu xác thực.' }); return; }

    try {
      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice || !invoice.zipPath) { res.status(404).json({ error: 'Invoice ZIP not found' }); return; }

      if (!(await InvoiceController._checkInvoiceAccess(req, invoice))) {
        res.status(403).json({ error: 'Bạn không có quyền truy cập hóa đơn này.' }); return;
      }
      if (invoice.zipPath === 'VIRTUAL_HTML') {
        res.status(400).json({ error: 'Chỉ có bản thể hiện HTML, không có file ZIP gốc.' }); return;
      }
      if (!fs.existsSync(invoice.zipPath)) { res.status(404).json({ error: 'ZIP file does not exist on disk' }); return; }

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=${path.basename(invoice.zipPath)}`);
      res.sendFile(invoice.zipPath);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to download ZIP file', details: error.message });
    }
  }

  /**
   * GET /api/invoices/:id/pdf
   * Download raw PDF file
   */
  public static async downloadPdf(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    if (!req.user) { res.status(401).json({ error: 'Yêu cầu xác thực.' }); return; }

    try {
      const invoice = await prisma.invoice.findUnique({ where: { id } });
      if (!invoice) { res.status(404).json({ error: 'Không tìm thấy hóa đơn này.' }); return; }

      if (!(await InvoiceController._checkInvoiceAccess(req, invoice))) {
        res.status(403).json({ error: 'Bạn không có quyền truy cập hóa đơn này.' }); return;
      }

      let targetPdfPath = invoice.pdfPath;

      if (!targetPdfPath || !fs.existsSync(targetPdfPath)) {
        // Generate PDF dynamically
        try {
          const html = await previewService.getPreviewHtml(id);
          if (!html) { res.status(404).json({ error: 'Không thể tạo bản thể hiện HTML.' }); return; }

          const cacheHtmlPath = previewService.getCachePath(id);
          const pdfFileName = invoice.invoiceNumber
            ? `${invoice.sellerTaxCode}-${String(invoice.templateSymbol || '').replace(/[^a-zA-Z0-9]/g, '')}-${String(invoice.invoiceSymbol || '').replace(/[^a-zA-Z0-9]/g, '')}-${invoice.invoiceNumber}-${getResultCode({ khhdon: invoice.invoiceSymbol, ttxly: invoice.processStatus, tthai: invoice.invoiceStatus })}.pdf`
            : `invoice_${id}.pdf`;

          targetPdfPath = path.join(path.dirname(cacheHtmlPath), pdfFileName);

          const { puppeteerService } = await import('../services/puppeteer.service.js');
          await puppeteerService.generatePdf(cacheHtmlPath, targetPdfPath);

          await invoicePersistenceService.updatePdfPath(id, targetPdfPath);
        } catch (genErr: any) {
          log.error({ err: genErr, invoiceId: id }, 'Dynamic PDF generation failed');
          res.status(500).json({ error: 'Không thể tạo PDF động', details: genErr.message });
          return;
        }
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(targetPdfPath)}"`);
      res.sendFile(targetPdfPath);
    } catch (error: any) {
      res.status(500).json({ error: 'Lỗi khi tải tệp PDF', details: error.message });
    }
  }

  /**
   * GET /api/invoices/:id/preview
   * Preview invoice HTML
   */
  public static async previewInvoice(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    if (!req.user) { res.status(401).json({ error: 'Yêu cầu xác thực.' }); return; }

    try {
      if (req.user.role !== 'ADMIN') {
        const invoice = await prisma.invoice.findUnique({ where: { id }, select: { sellerTaxCode: true, buyerTaxCode: true } });
        if (!invoice) { res.status(404).json({ error: 'Không tìm thấy hóa đơn.' }); return; }
        if (!(await InvoiceController._checkInvoiceAccess(req, invoice))) {
          res.status(403).json({ error: 'Bạn không có quyền truy cập hóa đơn này.' }); return;
        }
      }

      let html = await previewService.getPreviewHtml(id);

      if (!html) {
        const invoice = await prisma.invoice.findUnique({ where: { id } });
        if (invoice && invoice.zipPath === 'VIRTUAL_HTML') {
          let company = await prisma.company.findUnique({ where: { taxCode: invoice.sellerTaxCode } });
          if (!company) company = await prisma.company.findUnique({ where: { taxCode: invoice.buyerTaxCode } });
          if (!company) { res.status(404).json({ error: 'Không tìm thấy doanh nghiệp liên kết.' }); return; }

          let activeToken = company.token;
          if (!activeToken || authService.isTokenExpired(activeToken)) {
            if (company.loginMode === 'AUTO') {
              const geminiSetting = await prisma.setting.findUnique({ where: { key: 'geminiApiKey' } });
              const apiKey = geminiSetting?.value || process.env.GEMINI_API_KEY;
              if (!apiKey) { res.status(400).json({ error: 'Token đã hết hạn và chưa cấu hình Gemini API Key.' }); return; }
              activeToken = await authService.loginAndGetToken(company.taxCode, company.lookupPassword, apiKey);
              const tokenExpiredAt = authService.getTokenExpiration(activeToken);
              await prisma.company.update({ where: { id: company.id }, data: { token: activeToken, tokenExpiredAt } });
            } else {
              res.status(401).json({ error: `Phiên làm việc của doanh nghiệp ${company.name} đã hết hạn.` }); return;
            }
          }

          try {
            const detailJson = await downloaderService.downloadInvoiceDetail({
              nbmst: invoice.sellerTaxCode,
              khmshdon: invoice.templateSymbol,
              khhdon: invoice.invoiceSymbol,
              shdon: invoice.invoiceNumber,
            }, activeToken);
            html = previewService.buildHtmlFromJson(invoice.id, detailJson);
          } catch (err: any) {
            res.status(500).json({ error: 'Không thể lấy thông tin hóa đơn từ TCT.', details: err.message }); return;
          }
        }
      }

      if (!html) { res.status(404).json({ error: 'Không tìm thấy file HTML preview.' }); return; }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(html);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to preview invoice', details: error.message });
    }
  }

  /**
   * GET /api/invoices/download-history
   * Retrieve audit logs and download stats history
   */
  public static async getDownloadHistory(req: AuthRequest, res: Response): Promise<void> {
    const { page: pageParam, size: sizeParam, search, status, sortBy, sortDir } = req.query;
    if (!req.user) { res.status(401).json({ error: 'Yêu cầu xác thực.' }); return; }

    const hasPagination = pageParam !== undefined && sizeParam !== undefined;
    const page = hasPagination ? Math.max(0, parseInt(String(pageParam), 10) || 0) : 0;
    const size = hasPagination ? Math.min(100, Math.max(1, parseInt(String(sizeParam), 10) || 20)) : 0;

    try {
      const whereClause: any = {};
      if (status) whereClause.status = String(status);
      if (search) {
        const q = String(search).trim();
        if (q) whereClause.OR = [{ taxCode: { contains: q } }, { username: { contains: q } }];
      }
      if (req.user.role !== 'ADMIN') {
        const assignedCompanies = await prisma.userCompany.findMany({
          where: { userId: req.user.id },
          include: { company: { select: { taxCode: true } } },
        });
        const allowedMsts = assignedCompanies.map((uc) => uc.company.taxCode);
        if (whereClause.OR) {
          whereClause.AND = [{ OR: whereClause.OR }, { taxCode: { in: allowedMsts } }];
          delete whereClause.OR;
        } else {
          whereClause.taxCode = { in: allowedMsts };
        }
      }

      // Build orderBy cho download history
      const orderField = InvoiceController.HISTORY_SORT_FIELDS.has(String(sortBy))
        ? String(sortBy)
        : 'downloadDate';
      const orderDir = sortDir === 'asc' ? 'asc' : 'desc';
      const orderBy = { [orderField]: orderDir };

      const total = hasPagination ? await prisma.downloadHistory.count({ where: whereClause }) : 0;
      const histories = await prisma.downloadHistory.findMany({
        where: whereClause,
        orderBy,
        ...(hasPagination ? { skip: page * size, take: size } : {}),
      });

      if (hasPagination) {
        res.json({ data: histories, page, size, total, totalPages: Math.ceil(total / size) });
      } else {
        res.json(histories);
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve download history', details: error.message });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Private Helpers
  // ═══════════════════════════════════════════════════════════

  /**
   * Kiểm tra quyền truy cập company của user (non-admin).
   * Trả về null nếu OK, hoặc object { error, status } nếu từ chối.
   */
  private static async _checkCompanyAccess(
    req: AuthRequest,
    companyId?: string | number,
    username?: string,
  ): Promise<{ error: string; status: number } | null> {
    if (req.user!.role === 'ADMIN') return null;

    const targetCid = companyId ? Number(companyId) : null;
    let checkCompanyId = targetCid;

    if (!checkCompanyId && username) {
      const resolvedComp = await prisma.company.findUnique({ where: { taxCode: username } });
      if (resolvedComp) checkCompanyId = resolvedComp.id;
    }

    if (!checkCompanyId) return { error: 'Bạn không có quyền thực hiện hành động này.', status: 403 };

    const hasAccess = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: req.user!.id, companyId: checkCompanyId } },
    });

    return hasAccess ? null : { error: 'Bạn không có quyền truy cập doanh nghiệp này.', status: 403 };
  }

  /**
   * Kiểm tra quyền truy cập invoice của user (non-admin).
   */
  private static async _checkInvoiceAccess(
    req: AuthRequest,
    invoice: { sellerTaxCode: string; buyerTaxCode: string },
  ): Promise<boolean> {
    if (req.user!.role === 'ADMIN') return true;
    const assignedCompanies = await prisma.userCompany.findMany({
      where: { userId: req.user!.id },
      include: { company: { select: { taxCode: true } } },
    });
    const allowedMsts = assignedCompanies.map((uc) => uc.company.taxCode);
    return allowedMsts.includes(invoice.sellerTaxCode) || allowedMsts.includes(invoice.buyerTaxCode);
  }
}
