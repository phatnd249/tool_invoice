import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import prisma from '../utils/db.js';
import { AuthRequest } from '../middleware/auth.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { PreviewService } from '../services/preview.service.js';
import { invoiceDownloadService, DownloadProgress } from '../services/invoice-download.service.js';
import { downloadJobService, jobEventBus } from '../services/download-job.service.js';
import { invoicePersistenceService } from '../services/invoice-persistence.service.js';
import { pdfGenerationService } from '../services/pdf-generation.service.js';
import { DownloaderService } from '../services/downloader.service.js';
import { ExcelService } from '../services/excel.service.js';
import { ParserService, ParsedInvoice } from '../services/parser.service.js';
import { createLogger } from '../logger/index.js';
import { parseDateString, getStatusFileCode, getTthaiString, getTtxlyString } from '../utils/gdt-format.js';
import { resolveTargetDir, cleanCompanyName } from '../utils/path-resolver.js';

const log = createLogger('InvoiceController');
const downloaderService = new DownloaderService();
const parserService = new ParserService();
const excelService = new ExcelService();
const authService = new AuthService();
const previewService = new PreviewService();

// Map lưu AbortController cho mỗi job, để hỗ trợ cancel
const jobAbortControllers = new Map<string, AbortController>();

// Map lưu company name theo companyId cho việc tạo job
const companyNameCache = new Map<number, { name: string; taxCode: string }>();

export class InvoiceController {
  /**
   * POST /api/invoices/check-existing
   */
  public static async checkExistingInvoices(req: AuthRequest, res: Response): Promise<void> {
    const { companyId, startDate, endDate, invoiceType = 'SELL' } = req.body;

    if (!companyId || !startDate || !endDate) {
      res.status(400).json({ error: 'Missing required parameters: companyId, startDate, endDate' });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      let start: Date, end: Date;
      try {
        start = parseDateString(startDate);
        end = parseDateString(endDate);
      } catch {
        res.status(400).json({ error: 'Invalid date format. Expected dd/MM/yyyy.' });
        return;
      }

      const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });
      if (!company) {
        res.status(404).json({ error: `Không tìm thấy doanh nghiệp với ID ${companyId}.` });
        return;
      }

      const normalizedMst = company.taxCode.startsWith('0')
        ? company.taxCode.slice(1)
        : company.taxCode;

      const types: string[] = invoiceType === 'BOTH' ? ['BUY', 'SELL'] : [invoiceType];
      const whereClause: any = {
        invoiceDate: { gte: start, lte: end },
        type: { in: types },
        OR: [
          { sellerTaxCode: company.taxCode },
          { sellerTaxCode: normalizedMst },
          { buyerTaxCode: company.taxCode },
          { buyerTaxCode: normalizedMst },
        ],
      };

      const count = await prisma.invoice.count({ where: whereClause });

      res.json({
        hasExisting: count > 0,
        count,
        message: count > 0
          ? `Đã tìm thấy ${count} hóa đơn trong khoảng thời gian từ ${startDate} đến ${endDate} của doanh nghiệp ${company.name}.`
          : `Không tìm thấy hóa đơn nào trong khoảng thời gian này.`,
      });
    } catch (error: any) {
      log.error({ err: error }, 'Error checking existing invoices');
      res.status(500).json({ error: 'Lỗi khi kiểm tra hoá đơn tồn tại.', details: error.message });
    }
  }

  /**
   * POST /api/invoices/download
   * Tạo job và chạy pipeline bất đồng bộ. Trả về jobId để frontend theo dõi.
   */
  public static async downloadInvoices(req: AuthRequest, res: Response): Promise<void> {
    const { startDate, endDate, companyId, token, username, password, invoiceType = 'SELL', saveToDb = true, outputDir, geminiApiKey, overwriteMode = 'SKIP' } = req.body;

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

    // Lấy thông tin company để tạo job
    let companyName: string | undefined;
    let taxCode: string | undefined;
    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });
      if (company) {
        companyName = company.name;
        taxCode = company.taxCode;
        companyNameCache.set(Number(companyId), { name: company.name, taxCode: company.taxCode });
      }
    } else if (username) {
      companyName = username;
      taxCode = username;
    }

    // Tạo job trong DB
    const jobId = await downloadJobService.create({
      companyId: companyId ? Number(companyId) : undefined,
      companyName,
      taxCode,
      userId: req.user.id,
      username: req.user.username,
      startDate: start,
      endDate: end,
      invoiceType: invoiceType as 'BUY' | 'SELL' | 'BOTH',
      overwriteMode,
    });

    log.info({ jobId, startDate, endDate, companyId, invoiceType, overwriteMode, userId: req.user.id }, 'downloadInvoices job created');

    // Trả về jobId ngay lập tức
    res.json({ jobId, message: 'Job đã được tạo. Theo dõi tiến trình qua SSE stream.' });

    // Chạy pipeline bất đồng bộ (không await)
    InvoiceController._runPipelineAsync(jobId, {
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
      overwriteMode: overwriteMode as 'SKIP' | 'OVERWRITE' | 'NEW_VERSION',
    });
  }

  /**
   * GET /api/invoices/download/stream/:jobId
   * SSE endpoint theo dõi tiến trình của một job cụ thể.
   * Hỗ trợ reconnect: nếu job đã kết thúc, gửi ngay trạng thái cuối.
   */
  public static async downloadInvoicesStream(req: AuthRequest, res: Response): Promise<void> {
    const { jobId } = req.params;

    if (!jobId) {
      res.status(400).json({ error: 'Missing required parameter: jobId' });
      return;
    }

    // ── Tự xác thực token từ query param (vì EventSource không hỗ trợ custom headers) ──
    const tokenFromQuery = req.query.token as string;
    let authenticatedUserId: number | undefined;
    let authenticatedRole: string | undefined;

    if (req.user) {
      // Nếu có req.user (middleware authen), dùng luôn
      authenticatedUserId = req.user.id;
      authenticatedRole = req.user.role;
    } else if (tokenFromQuery) {
      // Xác thực qua query param token
      try {
        const { verifyToken } = await import('../middleware/auth.middleware.js');
        const decoded = verifyToken(tokenFromQuery) as { id: number; role: string } | null;
        if (decoded) {
          authenticatedUserId = decoded.id;
          authenticatedRole = decoded.role;
        }
      } catch {
        // Token không hợp lệ
      }
    }

    if (!authenticatedUserId) {
      res.status(401).json({ error: 'Yêu cầu xác thực. Vui lòng cung cấp token qua header Authorization hoặc query param ?token=...' });
      return;
    }

    // Lấy job từ DB
    const job = await downloadJobService.getById(jobId);

    if (!job) {
      res.status(404).json({ error: 'Không tìm thấy job này.' });
      return;
    }

    // Kiểm tra quyền truy cập
    if (authenticatedRole !== 'ADMIN' && job.userId !== authenticatedUserId) {
      res.status(403).json({ error: 'Bạn không có quyền theo dõi job này.' });
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

    // ── Nếu job đã kết thúc, gửi ngay trạng thái cuối ──
    if (job.status === 'COMPLETED') {
      const logs = JSON.parse(job.logs || '[]');
      for (const logEntry of logs) {
        sendEvent('log', { time: logEntry.time, message: logEntry.message, type: logEntry.type });
      }
      sendEvent('done', {
        message: `Đã tải thành công ${job.successCount} hoá đơn.`,
        successCount: job.successCount,
        errorCount: job.errorCount,
        errors: JSON.parse(job.errors || '[]').slice(0, 20),
      });
      res.end();
      return;
    }

    if (job.status === 'FAILED') {
      const logs = JSON.parse(job.logs || '[]');
      for (const logEntry of logs) {
        sendEvent('log', { time: logEntry.time, message: logEntry.message, type: logEntry.type });
      }
      sendEvent('error', { message: job.progressMessage || 'Job thất bại.' });
      res.end();
      return;
    }

    if (job.status === 'CANCELLED') {
      sendEvent('log', { time: new Date().toISOString(), message: 'Job đã bị huỷ.', type: 'warning' });
      sendEvent('done', { message: 'Job đã bị huỷ.', successCount: job.successCount, errorCount: job.errorCount });
      res.end();
      return;
    }

    // ── Job đang chạy (RUNNING / PENDING): subscribe vào EventEmitter ──
    // Gửi trạng thái hiện tại trước
    if (job.status === 'RUNNING') {
      sendEvent('progress', {
        type: job.progressType || '',
        current: job.progressCurrent,
        total: job.progressTotal,
      });
      // Gửi các log đã có
      const existingLogs = JSON.parse(job.logs || '[]');
      for (const logEntry of existingLogs) {
        sendEvent('log', { time: logEntry.time, message: logEntry.message, type: logEntry.type });
      }
    } else {
      // PENDING
      sendEvent('log', { time: new Date().toISOString(), message: 'Job đang chờ xử lý...', type: 'info' });
    }

    // Subscribe vào event bus
    const onProgress = (data: any) => {
      if (aborted) return;
      sendEvent('progress', {
        type: data.type || '',
        current: data.current,
        total: data.total,
      });
    };

    const onLog = (data: any) => {
      if (aborted) return;
      sendEvent('log', { time: data.time, message: data.message, type: data.type || 'info' });
    };

    const onDone = (data: any) => {
      if (aborted) return;
      sendEvent('done', {
        message: data.successCount > 0
          ? `Đã tải thành công ${data.successCount} hoá đơn.`
          : 'Không có hoá đơn nào được tải.',
        successCount: data.successCount,
        errorCount: data.errorCount || 0,
      });
      res.end();
    };

    const onError = (data: any) => {
      if (aborted) return;
      sendEvent('error', { message: data.message || 'Có lỗi xảy ra.' });
      res.end();
    };

    const onCancelled = (data: any) => {
      if (aborted) return;
      sendEvent('log', { time: new Date().toISOString(), message: data.message || 'Job đã bị huỷ.', type: 'warning' });
      sendEvent('done', { message: 'Job đã bị huỷ.', successCount: 0, errorCount: 0 });
      res.end();
    };

    jobEventBus.on(`job:${jobId}:progress`, onProgress);
    jobEventBus.on(`job:${jobId}:log`, onLog);
    jobEventBus.on(`job:${jobId}:done`, onDone);
    jobEventBus.on(`job:${jobId}:error`, onError);
    jobEventBus.on(`job:${jobId}:cancelled`, onCancelled);

    // Cleanup khi client disconnect
    req.on('close', () => {
      aborted = true;
      jobEventBus.off(`job:${jobId}:progress`, onProgress);
      jobEventBus.off(`job:${jobId}:log`, onLog);
      jobEventBus.off(`job:${jobId}:done`, onDone);
      jobEventBus.off(`job:${jobId}:error`, onError);
      jobEventBus.off(`job:${jobId}:cancelled`, onCancelled);
    });
  }

  /**
   * GET /api/invoices/download/jobs
   * Lấy danh sách jobs của user (active + recent).
   */
  public static async getDownloadJobs(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      const { status, limit } = req.query;

      const jobs = await downloadJobService.getRecentJobs({
        userId: req.user.role === 'ADMIN' ? undefined : req.user.id,
        limit: limit ? parseInt(String(limit), 10) : 20,
        status: status ? String(status) : undefined,
      });

      // Parse JSON fields before sending
      const parsed = jobs.map((job) => ({
        ...job,
        logs: JSON.parse(job.logs || '[]'),
        errors: JSON.parse(job.errors || '[]'),
      }));

      res.json(parsed);
    } catch (error: any) {
      log.error({ err: error }, 'Error getting download jobs');
      res.status(500).json({ error: 'Lỗi khi lấy danh sách job.', details: error.message });
    }
  }

  /**
   * GET /api/invoices/download/jobs/:id
   * Lấy chi tiết một job.
   */
  public static async getDownloadJobById(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      const job = await downloadJobService.getById(id);
      if (!job) {
        res.status(404).json({ error: 'Không tìm thấy job.' });
        return;
      }

      // Kiểm tra quyền
      if (req.user.role !== 'ADMIN' && job.userId !== req.user.id) {
        res.status(403).json({ error: 'Bạn không có quyền xem job này.' });
        return;
      }

      res.json({
        ...job,
        logs: JSON.parse(job.logs || '[]'),
        errors: JSON.parse(job.errors || '[]'),
      });
    } catch (error: any) {
      log.error({ err: error, jobId: id }, 'Error getting job by id');
      res.status(500).json({ error: 'Lỗi khi lấy thông tin job.', details: error.message });
    }
  }

  /**
   * POST /api/invoices/download/jobs/:id/cancel
   * Huỷ một job đang chạy.
   */
  public static async cancelDownloadJob(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      const job = await downloadJobService.getById(id);
      if (!job) {
        res.status(404).json({ error: 'Không tìm thấy job.' });
        return;
      }

      // Kiểm tra quyền
      if (req.user.role !== 'ADMIN' && job.userId !== req.user.id) {
        res.status(403).json({ error: 'Bạn không có quyền huỷ job này.' });
        return;
      }

      if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        res.status(400).json({ error: 'Job đã kết thúc, không thể huỷ.' });
        return;
      }

      // Huỷ abort controller
      const abortController = jobAbortControllers.get(id);
      if (abortController) {
        abortController.abort();
        jobAbortControllers.delete(id);
      }

      // Cập nhật status trong DB
      await downloadJobService.cancel(id);

      log.info({ jobId: id, userId: req.user.id }, 'Job cancelled by user');
      res.json({ message: 'Đã huỷ job thành công.' });
    } catch (error: any) {
      log.error({ err: error, jobId: id }, 'Error cancelling job');
      res.status(500).json({ error: 'Lỗi khi huỷ job.', details: error.message });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Private Helpers
  // ═══════════════════════════════════════════════════════════

  /**
   * Chạy pipeline bất đồng bộ với job tracking.
   */
  private static async _runPipelineAsync(jobId: string, params: any): Promise<void> {
    const abortController = new AbortController();
    jobAbortControllers.set(jobId, abortController);

    try {
      await downloadJobService.addLog(jobId, '🚀 Bắt đầu tải hoá đơn...', 'info');
      await downloadJobService.addLog(jobId, `Khoảng thời gian: ${params.startDate.toLocaleDateString('vi-VN')} → ${params.endDate.toLocaleDateString('vi-VN')}`, 'info');

      // Inject jobId và abortSignal vào params
      params.jobId = jobId;
      params.abortSignal = abortController.signal;

      const result = await invoiceDownloadService.run(params);

      log.info({ jobId, successCount: result.successCount, status: result.status }, 'Async pipeline completed');
    } catch (err: any) {
      log.error({ err, jobId }, 'Async pipeline unexpected error');

      // Chỉ update job nếu chưa được update bởi pipeline
      const job = await downloadJobService.getById(jobId);
      if (job && (job.status === 'RUNNING' || job.status === 'PENDING')) {
        await downloadJobService.fail(jobId, `Lỗi không mong đợi: ${err.message}`);
        await downloadJobService.addLog(jobId, `❌ Lỗi hệ thống: ${err.message}`, 'error');
      }
    } finally {
      jobAbortControllers.delete(jobId);
    }
  }

  // ─── Các methods còn lại được giữ nguyên ───

  /**
   * GET /api/invoices
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
    if (sellerTaxCode) {
      const raw = String(sellerTaxCode);
      const normalized = raw.startsWith('0') ? raw.slice(1) : raw;
      whereClause.sellerTaxCode = { contains: normalized };
    }
    if (buyerTaxCode) {
      const raw = String(buyerTaxCode);
      const normalized = raw.startsWith('0') ? raw.slice(1) : raw;
      whereClause.buyerTaxCode = { contains: normalized };
    }
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
        try {
          const html = await previewService.getPreviewHtml(id);
          if (!html) { res.status(404).json({ error: 'Không thể tạo bản thể hiện HTML.' }); return; }

          const cacheHtmlPath = previewService.getCachePath(id);
          const taxCodeForName = invoice.type === 'BUY' ? (invoice.buyerTaxCode || invoice.sellerTaxCode) : (invoice.sellerTaxCode || invoice.buyerTaxCode);
          const pdfFileName = invoice.invoiceNumber
            ? `${taxCodeForName}-${invoice.invoiceNumber}-${getStatusFileCode({ khhdon: invoice.invoiceSymbol, ttxly: invoice.processStatus ?? undefined, tthai: invoice.invoiceStatus ?? undefined })}.pdf`
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
  //  Static Helpers
  // ═══════════════════════════════════════════════════════════

  private static readonly INVOICE_SORT_FIELDS = new Set([
    'invoiceNumber', 'invoiceDate', 'templateSymbol', 'invoiceSymbol',
    'sellerName', 'sellerTaxCode', 'buyerName', 'buyerTaxCode',
    'totalBeforeTax', 'taxAmount', 'totalAmount', 'invoiceStatus',
  ]);

  private static readonly HISTORY_SORT_FIELDS = new Set([
    'downloadDate', 'taxCode', 'invoiceType', 'status', 'countDownloaded', 'username',
  ]);

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
