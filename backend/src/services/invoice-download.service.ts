// backend/src/services/invoice-download.service.ts
// Service orchestration chính cho pipeline tải và lưu hoá đơn.
// Được cả REST controller và SSE controller gọi đến.

import * as path from 'path';
import * as fs from 'fs';
import { DownloaderService } from './downloader.service.js';
import { ParserService, ParsedInvoice } from './parser.service.js';
import { ExcelService } from './excel.service.js';
import { AuthService } from './auth.service.js';
import { invoicePersistenceService } from './invoice-persistence.service.js';
import { pdfGenerationService } from './pdf-generation.service.js';
import prisma from '../utils/db.js';
import { withRetry } from '../utils/rate-limiter.js';
import { createLogger, generateCorrelationId } from '../logger/index.js';
import { resolveTargetDir, cleanCompanyName } from '../utils/path-resolver.js';
import { parseGdtDate } from '../utils/gdt-format.js';
import { gdtHealthService } from './gdt-health.service.js';

const downloaderService = new DownloaderService();
const parserService = new ParserService();
const excelService = new ExcelService();
const authService = new AuthService();
const log = createLogger('InvoiceDownloadService');

// ─── Type Definitions ──────────────────────────────────────────

export interface DownloadPipelineParams {
  startDate: Date;
  endDate: Date;
  companyId?: number;
  token?: string;
  username?: string;
  password?: string;
  geminiApiKey?: string;
  invoiceType: 'BUY' | 'SELL' | 'BOTH';
  saveToDb: boolean;
  outputDir?: string;
  userId?: number;
  usernameLabel?: string;
  onProgress?: (progress: DownloadProgress) => void;
}

export interface DownloadProgress {
  type: string;
  current: number;
  total: number;
  invoiceNumber?: string;
  message?: string;
  level?: 'info' | 'warn' | 'error' | 'success';
}

export interface DownloadPipelineResult {
  successCount: number;
  errors: string[];
  parsedInvoices: ParsedInvoice[];
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
}

// ─── Service Class ─────────────────────────────────────────────

export class InvoiceDownloadService {
  /**
   * Pipeline chính: tải và lưu hoá đơn.
   *
   * @param params Tham số đầu vào
   * @param correlationId ID theo dõi luồng xử lý (tự sinh nếu không có)
   */
  async run(
    params: DownloadPipelineParams,
    correlationId?: string,
  ): Promise<DownloadPipelineResult> {
    const cid = correlationId || generateCorrelationId();
    const ctxLog = createLogger('InvoiceDownloadService', cid);
    ctxLog.info(
      {
        startDate: params.startDate.toISOString(),
        endDate: params.endDate.toISOString(),
        invoiceType: params.invoiceType,
        companyId: params.companyId,
      },
      'Bắt đầu pipeline tải hoá đơn',
    );

    // ── Phase 1: Resolve token và company ──
    const resolved = await this._resolveAuthentication(params, ctxLog);
    if (!resolved.token) {
      return { successCount: 0, errors: [resolved.error!], parsedInvoices: [], status: 'FAILED' };
    }

    const { token, company, companyFolder } = resolved;
    const types: Array<'BUY' | 'SELL'> = params.invoiceType === 'BOTH'
      ? ['BUY', 'SELL']
      : [params.invoiceType === 'BUY' ? 'BUY' : 'SELL'];

    const baseDir = params.outputDir || process.env.INVOICES_DIR || path.join(process.cwd(), 'invoices');
    const dateChunks = downloaderService.splitDateRange(params.startDate, params.endDate);

    let totalSuccessCount = 0;
    const allErrors: string[] = [];
    const allParsedList: ParsedInvoice[] = [];

    // ── Phase 2: Process từng loại (BUY / SELL) ──
    for (const type of types) {
      ctxLog.info({ type }, `Bắt đầu xử lý loại hoá đơn ${type}`);

      // 2a. Query invoices
      const queryResult = await this._queryInvoices(type, dateChunks, token, ctxLog);
      if (!queryResult.invoices) {
        allErrors.push(`Query ${type}: ${queryResult.error}`);
        await this._recordDownloadHistory({
          taxCode: company?.taxCode || '',
          invoiceType: type,
          status: 'FAILED',
          log: `GDT API Query failed: ${queryResult.error}`,
          countDownloaded: 0,
          startDate: params.startDate,
          endDate: params.endDate,
          totalInvoices: 0,
          userId: params.userId,
          username: params.usernameLabel,
        }, ctxLog);
        continue;
      }

      const invoices = queryResult.invoices;
      ctxLog.info({ type, count: invoices.length }, `Tìm thấy ${invoices.length} hoá đơn`);

      // 2b. Download Excel reports cho từng chunk
      await this._downloadExcelReports(dateChunks, type, token, baseDir, companyFolder, ctxLog);

      // 2c. Download từng invoice
      const { successCount, errors, parsedList } = await this._processInvoices(
        invoices, type, token, baseDir, companyFolder, params.saveToDb, params.onProgress, ctxLog,
      );

      totalSuccessCount += successCount;
      allErrors.push(...errors);
      allParsedList.push(...parsedList);

      // 2d. Ghi download history cho type này
      const typeStatus = successCount === invoices.length
        ? 'SUCCESS'
        : successCount > 0 ? 'PARTIAL' : 'FAILED';
      await this._recordDownloadHistory({
        taxCode: company?.taxCode || '',
        invoiceType: type,
        status: typeStatus,
        log: errors.length > 0 ? errors.join('\n') : 'Download completed successfully.',
        countDownloaded: successCount,
        startDate: params.startDate,
        endDate: params.endDate,
        totalInvoices: invoices.length,
        userId: params.userId,
        username: params.usernameLabel,
      }, ctxLog);

      // 2e. Cập nhật download count cho company
      if (company && successCount > 0) {
        try {
          await prisma.company.update({
            where: { id: company.id },
            data: { downloadCount: { increment: successCount } },
          });
        } catch (err: any) {
          ctxLog.warn({ err }, 'Không thể cập nhật company stats');
        }
      }
    }

    // ── Phase 3: Tạo Excel report tổng hợp ──
    if (allParsedList.length > 0) {
      await this._generateSummaryExcel(allParsedList, baseDir, companyFolder, ctxLog);
    }

    const finalStatus = totalSuccessCount > 0
      ? (allErrors.length > 0 ? 'PARTIAL' : 'SUCCESS')
      : 'FAILED';

    ctxLog.info(
      { successCount: totalSuccessCount, errorCount: allErrors.length, status: finalStatus },
      'Pipeline hoàn tất',
    );

    return {
      successCount: totalSuccessCount,
      errors: allErrors,
      parsedInvoices: allParsedList,
      status: finalStatus,
    };
  }

  // ═══════════════════════════════════════════════════════════
  //  Private Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Phase 1: Xác thực và resolve token/company.
   */
  private async _resolveAuthentication(
    params: DownloadPipelineParams,
    ctxLog: ReturnType<typeof createLogger>,
  ): Promise<{
    token: string | null;
    company: { id: number; taxCode: string; name: string; loginMode: string } | null;
    companyFolder: string;
    error?: string;
  }> {
    const result = { token: null as string | null, company: null as any, companyFolder: '' };

    // 1. Resolve company từ DB nếu có companyId
    if (params.companyId) {
      const dbCompany = await prisma.company.findUnique({
        where: { id: params.companyId },
      });
      if (!dbCompany) {
        return { ...result, error: `Không tìm thấy doanh nghiệp với ID ${params.companyId}.` };
      }
      result.company = dbCompany;

      // 2. Resolve token
      if (dbCompany.token && !authService.isTokenExpired(dbCompany.token)) {
        ctxLog.info({ mst: dbCompany.taxCode }, 'Reusing fresh GDT Token from DB');
        result.token = dbCompany.token;
      } else if (dbCompany.loginMode === 'AUTO') {
        ctxLog.info({ mst: dbCompany.taxCode }, 'Token expired, attempting auto-refresh...');
        const geminiSetting = await prisma.setting.findUnique({ where: { key: 'geminiApiKey' } });
        const apiKey = geminiSetting?.value || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return { ...result, error: 'Token đã hết hạn và chưa cấu hình Gemini API Key để gia hạn tự động.' };
        }
        try {
          result.token = await authService.loginAndGetToken(
            dbCompany.taxCode, dbCompany.lookupPassword, apiKey,
          );
          const tokenExpiredAt = authService.getTokenExpiration(result.token);
          await prisma.company.update({
            where: { id: dbCompany.id },
            data: { token: result.token, tokenExpiredAt },
          });
          ctxLog.info({ mst: dbCompany.taxCode }, 'Token refreshed successfully');
        } catch (err: any) {
          return { ...result, error: `Gia hạn phiên tự động cho MST ${dbCompany.taxCode} thất bại: ${err.message}` };
        }
      } else {
        return {
          ...result,
          error: `Phiên làm việc (token) của doanh nghiệp ${dbCompany.name} (${dbCompany.taxCode}) đã hết hạn. Vui lòng đăng nhập lại thủ công.`,
        };
      }

      result.companyFolder = cleanCompanyName(dbCompany.name || dbCompany.taxCode);
      return { ...result, company: dbCompany, companyFolder: result.companyFolder, token: result.token };
    }

    // 3. Fallback: dùng token truyền trực tiếp
    if (params.token) {
      const mst = downloaderService.getMstFromToken(params.token);
      if (!mst) {
        return { ...result, error: 'Token không hợp lệ, không thể giải mã MST.' };
      }
      result.token = params.token;
      const dbCompany = await prisma.company.findUnique({ where: { taxCode: mst } });
      if (dbCompany) {
        result.company = dbCompany;
        result.companyFolder = cleanCompanyName(dbCompany.name || mst);
      } else {
        result.companyFolder = mst;
      }
      return result;
    }

    // 4. Fallback cuối: username/password
    if (params.username && params.password) {
      try {
        const apiKey = params.geminiApiKey || process.env.GEMINI_API_KEY;
        result.token = await authService.loginAndGetToken(
          params.username, params.password, apiKey,
        );
        result.companyFolder = params.username;
        return result;
      } catch (err: any) {
        return { ...result, error: `Xác thực tài khoản thất bại: ${err.message}` };
      }
    }

    return { ...result, error: 'Yêu cầu thông tin xác thực: companyId, token, hoặc username/password.' };
  }

  /**
   * Phase 2a: Query invoices từ GDT.
   */
  private async _queryInvoices(
    type: 'BUY' | 'SELL',
    dateChunks: Array<{ start: Date; end: Date }>,
    token: string,
    ctxLog: ReturnType<typeof createLogger>,
  ): Promise<{ invoices?: any[]; error?: string }> {
    try {
      const allInvoices: any[] = [];
      for (const chunk of dateChunks) {
        const chunkRes = await downloaderService.queryInvoicesInRange(
          chunk.start, chunk.end, token, type,
        );
        allInvoices.push(...chunkRes);
      }
      return { invoices: allInvoices };
    } catch (err: any) {
      ctxLog.error({ err, type }, 'Query GDT invoices thất bại');
      return { error: err.message };
    }
  }

  /**
   * Phase 2b: Download Excel reports.
   */
  private async _downloadExcelReports(
    dateChunks: Array<{ start: Date; end: Date }>,
    type: 'BUY' | 'SELL',
    token: string,
    baseDir: string,
    companyFolder: string,
    ctxLog: ReturnType<typeof createLogger>,
  ): Promise<void> {
    const typeDir = type === 'SELL' ? 'BanRa' : 'MuaVao';
    const excelDir = path.join(baseDir, companyFolder, typeDir);

    for (const chunk of dateChunks) {
      try {
        const paths = await downloaderService.downloadExcelReport(
          chunk.start, chunk.end, token, type, excelDir,
        );
        if (paths.length > 0) {
          ctxLog.info({ files: paths.map(p => path.basename(p)) }, 'Excel reports downloaded');
        }
      } catch (err: any) {
        ctxLog.warn({ err }, 'Download Excel report thất bại cho 1 chunk');
      }
    }
  }

  /**
   * Phase 2c: Xử lý từng invoice trong danh sách.
   * Với mỗi invoice: download ZIP -> parse XML -> save DB -> generate PDF
   * Nếu không có ZIP: fallback detail API -> save DB -> generate PDF fallback
   */
  private async _processInvoices(
    invoices: any[],
    type: 'BUY' | 'SELL',
    token: string,
    baseDir: string,
    companyFolder: string,
    saveToDb: boolean,
    onProgress: DownloadPipelineParams['onProgress'],
    ctxLog: ReturnType<typeof createLogger>,
  ): Promise<{ successCount: number; errors: string[]; parsedList: ParsedInvoice[] }> {
    const total = invoices.length;
    let successCount = 0;
    const errors: string[] = [];
    const parsedList: ParsedInvoice[] = [];

    for (let i = 0; i < total; i++) {
      const inv = invoices[i];
      const current = i + 1;
      const invNum = String(inv.shdon || 'unknown');

      ctxLog.info({ invoiceNumber: invNum, current, total, type },
        `[${current}/${total}] Hoá đơn ${invNum}: đang xử lý...`,
      );

      onProgress?.({
        type, current, total, invoiceNumber: invNum,
        message: `[${current}/${total}] Hoá đơn ${invNum}: đang xử lý...`,
        level: 'info',
      });

      try {
        const invoiceDate = parseGdtDate(inv.tdlap);
        const sellerTaxCode = inv.nbmst || '';
        const invCompanyName = companyFolder || sellerTaxCode;
        const invoiceTargetDir = resolveTargetDir(baseDir, invCompanyName, type, invoiceDate);

        // Thử download ZIP
        let zipPath: string | null = null;
        try {
          zipPath = await withRetry(
            () => downloaderService.downloadInvoiceZip(inv, token, invoiceTargetDir, type),
            { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 8000, logger: ctxLog.warn.bind(ctxLog) },
          );
          if (zipPath) {
            ctxLog.info({ invoiceNumber: invNum }, `[${current}/${total}] Hoá đơn ${invNum}: đã tải ZIP`);
          }
        } catch (downloadErr: any) {
          ctxLog.warn({ invoiceNumber: invNum, err: downloadErr.message },
            `[${current}/${total}] Hoá đơn ${invNum}: ${downloadErr.message}`,
          );
          errors.push(`[${type}] Invoice ${invNum}: ${downloadErr.message}`);
        }

        // ── Case A: Có ZIP -> parse XML + save ──
        if (zipPath) {
          const parsed = parserService.extractAndParseZip(zipPath, invoiceTargetDir);
          if (!parsed) {
            errors.push(`[${type}] Invoice ${invNum}: Không thể giải nén hoặc parse XML.`);
            continue;
          }

          parsed.zipPath = zipPath;
          parsed.xmlFile = path.join(invoiceTargetDir, parsed.xmlFile);
          parsedList.push(parsed);
          successCount++;

          if (saveToDb) {
            const { invoiceId } = await invoicePersistenceService.upsertInvoice(parsed, type);
            await pdfGenerationService.generateFromZip(invoiceId, zipPath, invoiceTargetDir);
          }

          onProgress?.({
            type, current, total, invoiceNumber: invNum,
            message: `[${current}/${total}] Hoá đơn ${invNum}: đã lưu thành công`,
            level: 'success',
          });
        }
        // ── Case B: Không có ZIP -> fallback detail API ──
        else if (saveToDb) {
          const { invoiceId } = await invoicePersistenceService.saveBasicInvoiceFromGdt(inv, type);
          await invoicePersistenceService.updateZipPath(invoiceId, 'VIRTUAL_HTML');

          let detailJson: Record<string, any> | null = null;
          try {
            detailJson = await downloaderService.downloadInvoiceDetail(inv, token);
            if (detailJson) {
              await invoicePersistenceService.updateInvoiceDetail(invoiceId, detailJson);
              const detailItems = detailJson.hdhhdvu || detailJson.cttkhac || [];
              await invoicePersistenceService.saveInvoiceItemsFromDetail(invoiceId, detailItems);

              await pdfGenerationService.generateFromDetail(invoiceId, detailJson, inv, invoiceTargetDir);
            }
          } catch (detailErr: any) {
            ctxLog.warn({ err: detailErr, invoiceNumber: invNum },
              `[${current}/${total}] Hoá đơn ${invNum}: không thể lấy chi tiết - ${detailErr.message}`,
            );
          }

          // Tạo ParsedInvoice fallback cho Excel report
          const parsedFallback = this._buildParsedFallback(inv, detailJson, invoiceDate);
          parsedList.push(parsedFallback);
          successCount++;

          onProgress?.({
            type, current, total, invoiceNumber: invNum,
            message: `[${current}/${total}] Hoá đơn ${invNum}: đã lưu metadata (không có ZIP)`,
            level: 'info',
          });
        }
      } catch (err: any) {
        ctxLog.error({ err, invoiceNumber: invNum },
          `[${current}/${total}] Hoá đơn ${invNum}: lỗi - ${err.message}`,
        );
        errors.push(`[${type}] Invoice ${invNum}: ${err.message}`);
        onProgress?.({
          type, current, total, invoiceNumber: invNum,
          message: `[${current}/${total}] Hoá đơn ${invNum}: lỗi - ${err.message}`,
          level: 'error',
        });
      }

      // Delay giữa các invoice để tránh rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }

    return { successCount, errors, parsedList };
  }

  /**
   * Phase 3: Tạo Excel summary report.
   */
  private async _generateSummaryExcel(
    parsedList: ParsedInvoice[],
    baseDir: string,
    companyFolder: string,
    ctxLog: ReturnType<typeof createLogger>,
  ): Promise<void> {
    try {
      ctxLog.info('Đang tạo file Excel Báo Cáo Tổng Hợp...');
      const excelBuffer = await excelService.generateInvoiceReport(parsedList);
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = `${now.getHours()}h${now.getMinutes()}m${now.getSeconds()}s`;
      const reportFileName = `BaoCao_HoaDon_${dateStr}_${timeStr}.xlsx`;
      const targetDir = path.join(baseDir, companyFolder);
      fs.mkdirSync(targetDir, { recursive: true });
      const reportPath = path.join(targetDir, reportFileName);
      fs.writeFileSync(reportPath, excelBuffer);
      ctxLog.info({ reportPath }, 'Đã lưu file báo cáo Excel');
    } catch (err: any) {
      ctxLog.error({ err }, 'Lỗi tạo Excel report tổng hợp');
    }
  }

  /**
   * Ghi download history vào DB.
   */
  private async _recordDownloadHistory(
    params: {
      taxCode: string;
      invoiceType: string;
      status: string;
      log: string;
      countDownloaded: number;
      startDate?: Date | null;
      endDate?: Date | null;
      totalInvoices?: number | null;
      userId?: number | null;
      username?: string | null;
    },
    ctxLog: ReturnType<typeof createLogger>,
  ): Promise<void> {
    try {
      await invoicePersistenceService.recordDownloadHistory(params as any);
    } catch (err: any) {
      ctxLog.warn({ err }, 'Không thể ghi download history');
    }
  }

  /**
   * Build ParsedInvoice fallback từ GDT query response (khi không có XML).
   */
  private _buildParsedFallback(
    inv: Record<string, any>,
    detailJson: Record<string, any> | null,
    invoiceDate: Date,
  ): any {
    const fallback: any = {
      invoiceNumber: String(inv.shdon || ''),
      invoiceSymbol: String(inv.khhdon || ''),
      templateSymbol: String(inv.khmshdon || ''),
      invoiceDate,
      sellerTaxCode: String(inv.nbmst || ''),
      sellerName: String(detailJson?.nbten || inv.nbten || ''),
      sellerAddress: String(detailJson?.nbdchi || inv.nbdchi || ''),
      buyerTaxCode: String(inv.nmmst || ''),
      buyerName: String(detailJson?.nmten || detailJson?.nmuaten || inv.nmten || ''),
      buyerAddress: String(detailJson?.nmdchi || detailJson?.nmuadchi || inv.nmdchi || ''),
      totalBeforeTax: Number(detailJson?.tgtcthue || inv.tgtcthue || 0),
      taxAmount: Number(detailJson?.tgtthue || inv.tgtthue || 0),
      totalAmount: Number(detailJson?.tgtttbso || inv.tgtttbso || 0),
      currency: String(detailJson?.dvtte || 'VND'),
      exchangeRate: Number(detailJson?.tgia || 1),
      invoiceStatus: inv.tthai,
      paymentMethod: String(detailJson?.htttoan || ''),
      xmlFile: '',
      zipPath: 'VIRTUAL_HTML',
      items: [],
    };

    const detailItems = detailJson?.hdhhdvu || detailJson?.cttkhac || [];
    if (detailItems.length > 0) {
      fallback.items = detailItems.map((item: any, idx: number) => ({
        lineNumber: String(idx + 1),
        name: String(item.ten || item.thdon || item.tchat || '').trim(),
        unit: String(item.dvtinh || '').trim(),
        quantity: Number(item.sluong) || 0,
        price: Number(item.dgia) || 0,
        amount: Number(item.thtien) || 0,
        taxRate: String(item.ltsuat || item.tsuat || '').trim(),
      }));
    }

    return fallback;
  }
}

// Singleton export
export const invoiceDownloadService = new InvoiceDownloadService();
