import { Request, Response } from 'express';
import { DownloaderService } from '../services/downloader.service.js';
import { ParserService, ParsedInvoice } from '../services/parser.service.js';
import { ExcelService } from '../services/excel.service.js';
import { AuthService } from '../services/auth.service.js';
import { PreviewService } from '../services/preview.service.js';
import prisma from '../utils/db.js';
import { withRetry, processWithRateLimit } from '../utils/rate-limiter.js';
import * as path from 'path';
import * as fs from 'fs';
import { AuthRequest } from '../middleware/auth.middleware.js';

const downloaderService = new DownloaderService();
const parserService = new ParserService();
const excelService = new ExcelService();
const authService = new AuthService();
const previewService = new PreviewService();

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

/**
 * Resolve target directory for saving invoice files.
 * Structure: <baseDir>/<companyName>/<type-dir>/<YYYY-MM>/
 */
function resolveTargetDir(
  baseDir: string,
  companyName: string,
  type: 'BUY' | 'SELL',
  invoiceDate: Date,
): string {
  const cleanName = companyName.replace(/[\\/*?:"<>|]/g, '').trim();
  const typeDir = type === 'SELL' ? 'hoa-don-ban-ra' : 'hoa-don-mua-vao';
  const mm = String(invoiceDate.getMonth() + 1).padStart(2, '0');
  const yyyy = invoiceDate.getFullYear();
  const monthDir = `${yyyy}-${mm}`;
  return path.join(baseDir, cleanName, typeDir, monthDir);
}

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

    let activeToken = token;
    let dbCompany = null;
    let effectiveUsername = username;
    let effectivePassword = password;
    let effectiveGeminiKey = geminiApiKey;

    // Access control for non-admin
    if (req.user.role !== 'ADMIN') {
      const targetCid = companyId ? Number(companyId) : null;
      let checkCompanyId = targetCid;

      if (!checkCompanyId && username) {
        try {
          const resolvedComp = await prisma.company.findUnique({
            where: { taxCode: username }
          });
          if (resolvedComp) {
            checkCompanyId = resolvedComp.id;
          }
        } catch (err) {
          console.warn('[InvoiceController] Failed to check access:', err);
        }
      }

      if (!checkCompanyId) {
        res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này.' });
        return;
      }

      const hasAccess = await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId: req.user.id,
            companyId: checkCompanyId
          }
        }
      });

      if (!hasAccess) {
        res.status(403).json({ error: 'Bạn không có quyền truy cập doanh nghiệp này.' });
        return;
      }
    }

    // 1. Resolve company by ID if provided
    if (companyId) {
      try {
        dbCompany = await prisma.company.findUnique({
          where: { id: Number(companyId) }
        });
        if (!dbCompany) {
          res.status(404).json({ error: `Không tìm thấy doanh nghiệp với ID ${companyId}.` });
          return;
        }
        effectiveUsername = dbCompany.taxCode;
        effectivePassword = dbCompany.lookupPassword;
      } catch (err: any) {
        res.status(500).json({ error: 'Lỗi truy vấn thông tin doanh nghiệp.', details: err.message });
        return;
      }
    } else if (username) {
      // Resolve company by username/taxCode for backward compatibility
      try {
        dbCompany = await prisma.company.findUnique({
          where: { taxCode: username },
        });
      } catch (dbError) {
        console.warn('[InvoiceController] Failed to query company from DB:', dbError);
      }
    }

    // 2. Resolve token
    if (dbCompany) {
      if (dbCompany.token && !authService.isTokenExpired(dbCompany.token)) {
        console.log(`[InvoiceController] Reusing fresh GDT Token from Database cache for MST ${dbCompany.taxCode}.`);
        activeToken = dbCompany.token;
      } else {
        // Token is missing or expired, attempt renewal if AUTO mode
        if (dbCompany.loginMode === 'AUTO') {
          try {
            console.log(`[InvoiceController] Token is expired/missing. Attempting automatic GDT login for MST ${dbCompany.taxCode}...`);
            // Fetch global Gemini API key setting
            const geminiSetting = await prisma.setting.findUnique({
              where: { key: 'geminiApiKey' }
            });
            const apiKey = geminiSetting?.value || process.env.GEMINI_API_KEY;

            if (!apiKey) {
              res.status(400).json({ error: 'Token đã hết hạn và chưa cấu hình Gemini API Key để gia hạn tự động.' });
              return;
            }

            activeToken = await authService.loginAndGetToken(dbCompany.taxCode, dbCompany.lookupPassword, apiKey);
            const tokenExpiredAt = authService.getTokenExpiration(activeToken);

            await prisma.company.update({
              where: { id: dbCompany.id },
              data: { token: activeToken, tokenExpiredAt }
            });
          } catch (authError: any) {
            res.status(401).json({ error: `Gia hạn phiên tự động cho MST ${dbCompany.taxCode} thất bại.`, details: authError.message });
            return;
          }
        } else {
          // MANUAL mode company with expired token
          res.status(401).json({ error: `Phiên làm việc (token) của doanh nghiệp ${dbCompany.name} (${dbCompany.taxCode}) đã hết hạn. Vui lòng đăng nhập lại thủ công tại trang Cấu hình.` });
          return;
        }
      }
    } else if (!activeToken) {
      // Backward compatibility fallback to username/password
      if (effectiveUsername && effectivePassword) {
        try {
          console.log(`[InvoiceController] Attempting GDT login for MST ${effectiveUsername}...`);
          activeToken = await authService.loginAndGetToken(effectiveUsername, effectivePassword, effectiveGeminiKey);
        } catch (authError: any) {
          res.status(401).json({ error: 'Xác thực tài khoản thất bại.', details: authError.message });
          return;
        }
      } else {
        res.status(400).json({ error: 'Yêu cầu thông tin xác thực: Vui lòng truyền companyId hoặc token hoặc username/password.' });
        return;
      }
    }

    const types: Array<'BUY' | 'SELL'> = invoiceType === 'BOTH'
      ? ['BUY', 'SELL']
      : [invoiceType === 'BUY' ? 'BUY' : 'SELL'];

    let start: Date;
    let end: Date;

    try {
      start = parseDateString(startDate);
      end = parseDateString(endDate);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
      return;
    }

    const tokenMst = downloaderService.getMstFromToken(activeToken);
    if (!tokenMst) {
      res.status(401).json({ error: 'Failed to decode tax code (MST) from Token. Token might be invalid.' });
      return;
    }

    // Determine company folder name based on DB name or fallback to MST
    let companyFolder = '';
    try {
      const company = await prisma.company.findUnique({
        where: { taxCode: tokenMst },
      });
      if (company && company.name) {
        // Clean folder name from illegal characters
        companyFolder = company.name.replace(/[\\/*?:"<>|]/g, '').trim();
      }
    } catch (dbError) {
      console.warn('[InvoiceController] Could not fetch company name from DB:', dbError);
    }

    const baseDir = outputDir || process.env.INVOICES_DIR || path.join(process.cwd(), 'invoices');

    // Split date range to prevent tax server query limits
    const dateChunks = downloaderService.splitDateRange(start, end);

    // ─── Process each invoice type (BUY / SELL / BOTH) ───
    let totalSuccessCount = 0;
    const allErrors: string[] = [];
    const allParsedList: ParsedInvoice[] = [];

    for (const type of types) {
      const allQueryInvoices: any[] = [];

      console.log(`[InvoiceController] Querying ${type} invoices in ${dateChunks.length} cycles...`);

      try {
        for (const chunk of dateChunks) {
          const chunkRes = await downloaderService.queryInvoicesInRange(chunk.start, chunk.end, activeToken, type);
          allQueryInvoices.push(...chunkRes);
        }
      } catch (error: any) {
        const is401 = error.response?.status === 401 || String(error.message).includes('401');
        const canAutoRefresh = dbCompany ? (dbCompany.loginMode === 'AUTO') : (username && password);

        if (is401 && canAutoRefresh) {
          console.warn(`[InvoiceController] GDT token expired or failed with 401. Resolving a new token...`);
          try {
            const refreshTaxCode = dbCompany ? dbCompany.taxCode : username;
            const refreshPassword = dbCompany ? dbCompany.lookupPassword : password;

            const geminiSetting = await prisma.setting.findUnique({
              where: { key: 'geminiApiKey' }
            });
            const refreshApiKey = dbCompany ? (geminiSetting?.value || process.env.GEMINI_API_KEY) : geminiApiKey;

            if (!refreshApiKey) {
              throw new Error('Gemini API Key is not configured.');
            }

            activeToken = await authService.loginAndGetToken(refreshTaxCode, refreshPassword, refreshApiKey);
            const tokenExpiredAt = authService.getTokenExpiration(activeToken);

            if (dbCompany) {
              await prisma.company.update({
                where: { id: dbCompany.id },
                data: { token: activeToken, tokenExpiredAt }
              });
            } else {
              // Update DB Cache
              await prisma.company.upsert({
                where: { taxCode: refreshTaxCode },
                update: { token: activeToken, tokenExpiredAt },
                create: { taxCode: refreshTaxCode, name: refreshTaxCode, lookupPassword: refreshPassword, token: activeToken, tokenExpiredAt }
              });
            }

            // Retry query with new token
            allQueryInvoices.length = 0;
            for (const chunk of dateChunks) {
              const chunkRes = await downloaderService.queryInvoicesInRange(chunk.start, chunk.end, activeToken, type);
              allQueryInvoices.push(...chunkRes);
            }
          } catch (retryError: any) {
            await prisma.downloadHistory.create({
              data: {
                taxCode: tokenMst,
                invoiceType: type,
                status: 'FAILED',
                log: `Retry GDT API Query failed: ${retryError.message}`,
                countDownloaded: 0,
              },
            });
            allErrors.push(`Query ${type}: ${retryError.message}`);
            continue; // skip to next type
          }
        } else {
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
          allErrors.push(`Query ${type}: ${error.message}`);
          continue; // skip to next type
        }
      }

      console.log(`[InvoiceController] Found ${allQueryInvoices.length} ${type} invoices.`);

      // Download Excel report for each date chunk before downloading individual invoices
      if (allQueryInvoices.length > 0) {
        console.log(`[InvoiceController] Downloading Excel reports for ${dateChunks.length} date chunk(s)...`);
        for (const chunk of dateChunks) {
          try {
            const excelPath = await downloaderService.downloadExcelReport(
              chunk.start, chunk.end, activeToken, type, baseDir
            );
            if (excelPath) {
              console.log(`[InvoiceController] Excel report saved: ${path.basename(excelPath)}`);
            }
          } catch (err: any) {
            console.warn(`[InvoiceController] Failed to download Excel report for chunk: ${err.message}`);
          }
        }
      }

      console.log(`[InvoiceController] Starting ${type} invoice downloads...`);

      let typeSuccessCount = 0;
      const typeErrors: string[] = [];
      const typeParsedList: ParsedInvoice[] = [];

// Use rate-limited processing: batch + delay + retry
      await processWithRateLimit(allQueryInvoices, async (inv) => {
        try {
          // Resolve target directory for this specific invoice
          // Determine invoice date from GDT response (tdlap = ngày lập hoá đơn)
          // tdlap can be a timestamp (number), ISO string, or dd/MM/yyyy
          let invoiceDate = new Date();
          if (inv.tdlap) {
            const parsed = Date.parse(inv.tdlap);
            if (!isNaN(parsed)) {
              invoiceDate = new Date(parsed);
            }
          }

          const sellerTaxCode = inv.nbmst || tokenMst;
          const invCompanyName = companyFolder || sellerTaxCode;

          const invoiceTargetDir = resolveTargetDir(baseDir, invCompanyName, type, invoiceDate);

          // Download ZIP into the resolved directory
          let zipPath: string | null = null;
          try {
            zipPath = await withRetry(
              () => downloaderService.downloadInvoiceZip(inv, activeToken, invoiceTargetDir),
              { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 8000 }
            );
          } catch (downloadError: any) {
            // downloadInvoiceZip now throws Error with a user-friendly message
            typeErrors.push(`[${type}] Invoice ${inv.shdon}: ${downloadError.message}`);
            zipPath = null;
          }

          if (!zipPath) {
            // Still save basic metadata so the invoice appears in the list
            if (saveToDb) {
              try {
                await saveBasicInvoiceFromGdt(inv, type);
              } catch (dbError: any) {
                console.error(`[InvoiceController] Failed to save basic invoice ${inv.shdon} metadata:`, dbError.message);
              }
            }
            return;
          }

        let parsed = parserService.extractAndParseZip(zipPath, invoiceTargetDir);
        if (!parsed) {
          typeErrors.push(`[${type}] Invoice ${inv.shdon}: Failed to unzip or parse XML.`);
          return;
        }

        // Set paths for DB
        parsed.zipPath = zipPath;
        parsed.xmlFile = path.join(invoiceTargetDir, parsed.xmlFile);

        
        typeSuccessCount++;

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
              xmlPath: parsed.xmlFile,
              zipPath: parsed.zipPath,
              isSavedToDb: true,
            };

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
          typeErrors.push(`[${type}] Inv ${inv.shdon}: Database save error: ${err.message}`);
      }
    });

      // Log per-type results
      const typeStatus = typeSuccessCount === allQueryInvoices.length
        ? 'SUCCESS' : (typeSuccessCount > 0 ? 'PARTIAL' : 'FAILED');
      await prisma.downloadHistory.create({
        data: {
          taxCode: tokenMst,
          invoiceType: type,
          status: typeStatus,
          log: typeErrors.length > 0 ? typeErrors.join('\n') : 'Download completed successfully.',
          countDownloaded: typeSuccessCount,
          userId: req.user?.id || null,
          username: req.user?.username || null,
        },
      });

      totalSuccessCount += typeSuccessCount;
      allErrors.push(...typeErrors);
      allParsedList.push(...typeParsedList);

      if (dbCompany && typeSuccessCount > 0) {
        try {
          await prisma.company.update({
            where: { id: dbCompany.id },
            data: { downloadCount: { increment: typeSuccessCount } }
          });
        } catch (statErr) {
          console.error('[InvoiceController] Failed to update company stats:', statErr);
        }
      }
    }

    const finalStatus = totalSuccessCount > 0
      ? (allErrors.length > 0 ? 'PARTIAL' : 'SUCCESS')
      : 'FAILED';

    res.json({
      message: `Tải hoàn tất: ${totalSuccessCount} hóa đơn (${types.length} loại).`,
      status: finalStatus,
      count: totalSuccessCount,
      errors: allErrors.length > 0 ? allErrors : undefined,
      data: allParsedList.map(p => ({
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
    } = req.query;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    // Parse pagination params (default: no pagination if not provided)
    const hasPagination = pageParam !== undefined && sizeParam !== undefined;
    const page = hasPagination ? Math.max(0, parseInt(String(pageParam), 10) || 0) : 0;
    const size = hasPagination ? Math.min(100, Math.max(1, parseInt(String(sizeParam), 10) || 20)) : 0;

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

    // Server-side search across multiple fields
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
      try {
        const assignedCompanies = await prisma.userCompany.findMany({
          where: { userId: req.user.id },
          include: {
            company: {
              select: { taxCode: true }
            }
          }
        });
        const allowedMsts = assignedCompanies.map(uc => uc.company.taxCode);

        const accessFilter = {
          OR: [
            { sellerTaxCode: { in: allowedMsts } },
            { buyerTaxCode: { in: allowedMsts } }
          ]
        };

        if (whereClause.OR) {
          // Kết hợp search OR với access OR
          whereClause.AND = [
            { OR: whereClause.OR },
            accessFilter,
          ];
          delete whereClause.OR;
        } else {
          whereClause.AND = [accessFilter];
        }
      } catch (err) {
        console.error('[InvoiceController] Failed to check staff permissions:', err);
        res.status(500).json({ error: 'Không thể xác thực quyền hạn.' });
        return;
      }
    }

    try {
      // Count total matching records
      const total = hasPagination ? await prisma.invoice.count({ where: whereClause }) : 0;

      const invoices = await prisma.invoice.findMany({
        where: whereClause,
        include: {
          items: true,
        },
        orderBy: {
          invoiceDate: 'desc',
        },
        ...(hasPagination ? { skip: page * size, take: size } : {}),
      });

      if (hasPagination) {
        res.json({
          data: invoices,
          page,
          size,
          total,
          totalPages: Math.ceil(total / size),
        });
      } else {
        res.json(invoices);
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve invoices', details: error.message });
    }
  }

  /**
   * POST /api/invoices/export
   * Accepts list of invoice IDs and exports a premium Excel XLSX report
   */
  public static async exportInvoices(req: AuthRequest, res: Response): Promise<void> {
    const { invoiceIds } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      res.status(400).json({ error: 'Missing required parameter: invoiceIds (must be non-empty array)' });
      return;
    }

    try {
      let whereClause: any = { id: { in: invoiceIds } };

      if (req.user.role !== 'ADMIN') {
        const assignedCompanies = await prisma.userCompany.findMany({
          where: { userId: req.user.id },
          include: {
            company: {
              select: { taxCode: true }
            }
          }
        });
        const allowedMsts = assignedCompanies.map(uc => uc.company.taxCode);

        whereClause.AND = [
          {
            OR: [
              { sellerTaxCode: { in: allowedMsts } },
              { buyerTaxCode: { in: allowedMsts } }
            ]
          }
        ];
      }

      const invoices = await prisma.invoice.findMany({
        where: whereClause,
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

  /**
   * GET /api/invoices/:id/xml
   * Download raw XML file of invoice
   */
  public static async downloadXml(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
      });

      if (!invoice || !invoice.xmlPath) {
        res.status(404).json({ error: 'Invoice XML not found' });
        return;
      }

      // Check staff permissions
      if (req.user.role !== 'ADMIN') {
        const assignedCompanies = await prisma.userCompany.findMany({
          where: { userId: req.user.id },
          include: {
            company: {
              select: { taxCode: true }
            }
          }
        });
        const allowedMsts = assignedCompanies.map(uc => uc.company.taxCode);
        const hasAccess = allowedMsts.includes(invoice.sellerTaxCode) || allowedMsts.includes(invoice.buyerTaxCode);
        if (!hasAccess) {
          res.status(403).json({ error: 'Bạn không có quyền truy cập hóa đơn này.' });
          return;
        }
      }

      if (!fs.existsSync(invoice.xmlPath)) {
        res.status(404).json({ error: 'XML file does not exist on disk' });
        return;
      }

      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename=${path.basename(invoice.xmlPath)}`);
      res.sendFile(invoice.xmlPath);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to download XML file', details: error.message });
    }
  }

  /**
   * GET /api/invoices/:id/zip
   * Download raw ZIP file of invoice
   */
  public static async downloadZip(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
      });

      if (!invoice || !invoice.zipPath) {
        res.status(404).json({ error: 'Invoice ZIP not found' });
        return;
      }

      // Check staff permissions
      if (req.user.role !== 'ADMIN') {
        const assignedCompanies = await prisma.userCompany.findMany({
          where: { userId: req.user.id },
          include: {
            company: {
              select: { taxCode: true }
            }
          }
        });
        const allowedMsts = assignedCompanies.map(uc => uc.company.taxCode);
        const hasAccess = allowedMsts.includes(invoice.sellerTaxCode) || allowedMsts.includes(invoice.buyerTaxCode);
        if (!hasAccess) {
          res.status(403).json({ error: 'Bạn không có quyền truy cập hóa đơn này.' });
          return;
        }
      }

      if (!fs.existsSync(invoice.zipPath)) {
        res.status(404).json({ error: 'ZIP file does not exist on disk' });
        return;
      }

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=${path.basename(invoice.zipPath)}`);
      res.sendFile(invoice.zipPath);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to download ZIP file', details: error.message });
    }
  }

  /**
   * GET /api/invoices/download-history
   * Retrieve audit logs and download stats history
   */
  public static async getDownloadHistory(req: AuthRequest, res: Response): Promise<void> {
    const {
      page: pageParam,
      size: sizeParam,
      search,
      status,
    } = req.query;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    // Parse pagination params
    const hasPagination = pageParam !== undefined && sizeParam !== undefined;
    const page = hasPagination ? Math.max(0, parseInt(String(pageParam), 10) || 0) : 0;
    const size = hasPagination ? Math.min(100, Math.max(1, parseInt(String(sizeParam), 10) || 20)) : 0;

    try {
      // Build where clause
      const whereClause: any = {};

      if (status) {
        whereClause.status = String(status);
      }

      if (search) {
        const q = String(search).trim();
        if (q) {
          whereClause.OR = [
            { taxCode: { contains: q } },
            { username: { contains: q } },
          ];
        }
      }

      // Staff permission filter
      if (req.user.role !== 'ADMIN') {
        const assignedCompanies = await prisma.userCompany.findMany({
          where: { userId: req.user.id },
          include: { company: { select: { taxCode: true } } }
        });
        const allowedMsts = assignedCompanies.map(uc => uc.company.taxCode);

        if (whereClause.OR) {
          whereClause.AND = [
            { OR: whereClause.OR },
            { taxCode: { in: allowedMsts } },
          ];
          delete whereClause.OR;
        } else {
          whereClause.taxCode = { in: allowedMsts };
        }
      }

      // Count total
      const total = hasPagination ? await prisma.downloadHistory.count({ where: whereClause }) : 0;

      const histories = await prisma.downloadHistory.findMany({
        where: whereClause,
        orderBy: { downloadDate: 'desc' },
        ...(hasPagination ? { skip: page * size, take: size } : {}),
      });

      if (hasPagination) {
        res.json({
          data: histories,
          page,
          size,
          total,
          totalPages: Math.ceil(total / size),
        });
      } else {
        res.json(histories);
      }
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to retrieve download history', details: error.message });
    }
  }

  /**
   * GET /api/invoices/:id/preview
   * Preview invoice HTML extracted from its ZIP file.
   */
  public static async previewInvoice(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Yêu cầu xác thực.' });
      return;
    }

    try {
      // Check staff permissions
      if (req.user.role !== 'ADMIN') {
        const invoice = await prisma.invoice.findUnique({
          where: { id },
          select: { sellerTaxCode: true, buyerTaxCode: true },
        });

        if (!invoice) {
          res.status(404).json({ error: 'Không tìm thấy hóa đơn.' });
          return;
        }

        const assignedCompanies = await prisma.userCompany.findMany({
          where: { userId: req.user.id },
          include: { company: { select: { taxCode: true } } },
        });
        const allowedMsts = assignedCompanies.map(uc => uc.company.taxCode);
        const hasAccess =
          allowedMsts.includes(invoice.sellerTaxCode) ||
          allowedMsts.includes(invoice.buyerTaxCode);

        if (!hasAccess) {
          res.status(403).json({ error: 'Bạn không có quyền truy cập hóa đơn này.' });
          return;
        }
      }

      const html = await previewService.getPreviewHtml(id);

      if (!html) {
        res.status(404).json({ error: 'Không tìm thấy file HTML preview cho hóa đơn này.' });
        return;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to preview invoice', details: error.message });
    }
  }
}

/**
 * Helper to save basic metadata retrieved from GDT query response when ZIP fails to download
 */
async function saveBasicInvoiceFromGdt(inv: any, type: 'BUY' | 'SELL'): Promise<void> {
  const invoiceNumber = String(inv.shdon || '').trim();
  const sellerTaxCode = String(inv.nbmst || '').trim();
  const buyerTaxCode = String(inv.nmmst || inv.nmuamst || '').trim();

  if (!invoiceNumber || !sellerTaxCode || !buyerTaxCode) {
    throw new Error('Missing primary key identifiers (shdon, nbmst, nmmst)');
  }

  let invoiceDate = new Date();
  if (inv.tdlap) {
    const parsedDate = Date.parse(inv.tdlap);
    if (!isNaN(parsedDate)) {
      invoiceDate = new Date(parsedDate);
    }
  }

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
    buyerAddress: inv.nmdchi || inv.nmuadchi ? String(inv.nmdchi || inv.nmuadchi).trim() : null,
    totalBeforeTax: Number(inv.tgtcthue) || 0,
    taxAmount: Number(inv.tgtthue) || 0,
    totalAmount: Number(inv.tgtttbso) || 0,
    type,
    pdfPath: null,
    xmlPath: null,
    zipPath: null,
    isSavedToDb: true,
  };

  const compositeKey = {
    invoiceNumber_sellerTaxCode_buyerTaxCode: {
      invoiceNumber,
      sellerTaxCode,
      buyerTaxCode,
    },
  };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUnique({ where: compositeKey });
    if (existing) {
      await tx.invoice.update({
        where: { id: existing.id },
        data: dataObj,
      });
    } else {
      await tx.invoice.create({
        data: dataObj,
      });
    }
  });
}
