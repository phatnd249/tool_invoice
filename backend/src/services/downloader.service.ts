import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { withRetry } from '../utils/rate-limiter.js';

// ────────────────────────────────────────────────────────────
// Helper: parse GDT error response into a user-friendly message
// ────────────────────────────────────────────────────────────

const GDT_INVOICE_NOT_FOUND_PATTERNS = [
  'Không tồn tại hồ sơ gốc của hóa đơn',
  'không tồn tại hồ sơ gốc',
  'Invoice not found',
  'No original record',
];

/**
 * Parse GDT response body và trả về message thân thiện với người dùng.
 * Phân biệt:
 *   - Hoá đơn không tồn tại (bị thu hồi/xoá) → message rõ ràng
 *   - Lỗi khác → message kèm HTTP status
 */
function formatGdtError(responseBody: string, invoiceLabel: string, status: number): string {
  const isNotFound = GDT_INVOICE_NOT_FOUND_PATTERNS.some(p =>
    responseBody.toLowerCase().includes(p.toLowerCase())
  );
  if (isNotFound) {
    return `Hoá đơn ${invoiceLabel} không còn tồn tại trên hệ thống GDT (đã bị thu hồi/xoá).`;
  }
  // Parse message từ JSON nếu có
  try {
    const parsed = JSON.parse(responseBody);
    return `GDT trả về lỗi (HTTP ${status}): ${parsed.message || responseBody.slice(0, 200)}`;
  } catch {
    return `GDT trả về lỗi (HTTP ${status}): ${responseBody.slice(0, 200)}`;
  }
}

/**
 * Lấy ký hiệu (C = có mã, K = không mã, M = máy tính tiền)
 * Dựa vào sourceApi, khhdon, hoặc ttxly
 */
function mapProcessStatusToCode(invoice: any): string {
  const khhdon = String(invoice.khhdon || '').toUpperCase();
  if (khhdon.match(/^[1-6]?M/)) return 'M';
  if (khhdon.match(/^[1-6]?C/)) return 'C';
  if (khhdon.match(/^[1-6]?K/)) return 'K';

  const ttxly = invoice.ttxly;
  if (ttxly === 8) return 'M';
  if (ttxly === 5) return 'C';
  if (ttxly === 6 || ttxly === 4) return 'K';
  
  if (invoice._sourceApi === 'sco-query') return 'M';

  return 'K'; // Default
}

/**
 * Extract response body from an axios error or response as a string.
 */
function extractResponseBody(data: any): string {
  if (!data) return '(empty)';
  if (typeof data === 'string') return data.slice(0, 2000);
  if (Buffer.isBuffer(data)) return Buffer.from(data).toString('utf-8').slice(0, 2000);
  try {
    return JSON.stringify(data).slice(0, 2000);
  } catch {
    return String(data).slice(0, 2000);
  }
}

/**
 * Wrapper for axios.get with automatic retry and exponential backoff for 429 errors.
 */
async function axiosGetWithRetry(url: string, config: any, retries: number = 3, delayMs: number = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const response = await axios.get(url, config);
    if (response.status === 429) {
      console.warn(`[DownloaderService] Rate limit (429) hit for ${url}. Retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2; // Exponential backoff
      continue;
    }
    return response;
  }
  // Last attempt
  return axios.get(url, config);
}

export class DownloaderService {
  /**
   * Decode JWT token to get MST (Tax Identification Number)
   */
  public getMstFromToken(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadB64 = parts[1];
        const buffer = Buffer.from(payloadB64, 'base64');
        const payload = JSON.parse(buffer.toString('utf-8'));
        
        const mst = payload.username || payload.mst || payload.sub;
        if (mst) {
          return String(mst).replace(/[^a-zA-Z0-9-]/g, '');
        }
      }
    } catch (error) {
      console.error('[DownloaderService] Error decoding token JWT:', error);
    }
    return null;
  }

  /**
   * Split date range into chunks of max 28 days to prevent Tax Authority API errors
   */
  public splitDateRange(startDate: Date, endDate: Date): Array<{ start: Date; end: Date }> {
    const chunks: Array<{ start: Date; end: Date }> = [];
    let currentStart = new Date(startDate.getTime());

    while (currentStart <= endDate) {
      // 27 days added (inclusive of currentStart makes a 28-day window)
      const currentEnd = new Date(currentStart.getTime());
      currentEnd.setDate(currentEnd.getDate() + 27);
      
      const actualEnd = currentEnd > endDate ? new Date(endDate.getTime()) : currentEnd;
      chunks.push({ start: new Date(currentStart), end: new Date(actualEnd) });

      currentStart = new Date(actualEnd.getTime());
      currentStart.setDate(currentStart.getDate() + 1);
    }
    
    return chunks;
  }

  /**
   * Query invoices from GDT Portal
   * @param type "BUY" or "SELL"
   */
  public async queryInvoicesInRange(
    startDate: Date,
    endDate: Date,
    token: string,
    type: 'BUY' | 'SELL'
  ): Promise<any[]> {
    const formatGdtDate = (d: Date, endOfDay: boolean) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const time = endOfDay ? 'T23:59:59' : 'T00:00:00';
      return `${dd}/${mm}/${yyyy}${time}`;
    };

    const startStr = formatGdtDate(startDate, false);
    const endStr = formatGdtDate(endDate, true);

    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    };

    // Determine correct endpoint based on BUY (purchase) or SELL (sold)
    const apiPath = type === 'BUY' ? 'purchase' : 'sold';
    const baseUrlQuery = `https://hoadondientu.gdt.gov.vn/api/query/invoices/${apiPath}`;
    const baseUrlScoQuery = `https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/${apiPath}`;

    let allInvoices: any[] = [];

    // 1. Query standard invoices for each required status:
    // 5: Đã cấp mã
    // 6: Cục thuế đã nhận không mã
    // 4: Không đủ điều kiện cấp mã
    // 7: Đã kiểm tra định kỳ
    // 8: Máy tính tiền (từ tab chuẩn)
    const standardStatuses = [4, 5, 6, 7, 8];
    for (const status of standardStatuses) {
      try {
        const queryInvoices = await withRetry(
          () => this.fetchInvoicesFromUrl(baseUrlQuery, startStr, endStr, headers, status),
          { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 10000 }
        );
        allInvoices = allInvoices.concat(queryInvoices);
      } catch (error: any) {
        if (error.message && error.message.includes('401')) {
          throw error;
        }
        console.error(`[DownloaderService] Error fetching standard invoices for status ${status}, ignoring:`, error.message);
      }
    }

    // 2. Query cash register invoices (máy tính tiền)
    // 5: Đã cấp mã
    // 6: Cục thuế đã nhận không mã
    // 8: Máy tính tiền
    const scoStatuses = [5, 6, 8];
    for (const status of scoStatuses) {
      try {
        const scoQueryInvoices = await withRetry(
          () => this.fetchInvoicesFromUrl(baseUrlScoQuery, startStr, endStr, headers, status),
          { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 10000 }
        );
        allInvoices = allInvoices.concat(scoQueryInvoices);
      } catch (error: any) {
        if (error.message && error.message.includes('401')) {
          throw error;
        }
        console.error(`[DownloaderService] Error fetching sco-query invoices for status ${status}, ignoring:`, error.message);
      }
    }

    return allInvoices;
  }

  private async fetchInvoicesFromUrl(
    baseUrl: string,
    startStr: string,
    endStr: string,
    headers: any,
    status?: number
  ): Promise<any[]> {
    // Step 1: Send query with size=1 to find total matching records
    let searchStr = `tdlap=ge=${startStr};tdlap=le=${endStr}`;
    if (status !== undefined) {
      searchStr += `;ttxly==${status}`;
    }
    const searchParam = encodeURIComponent(searchStr);
    const urlCount = `${baseUrl}?sort=tdlap:desc&size=1&search=${searchParam}`;
    
    try {
      console.log(`[DownloaderService] Querying count from ${startStr} to ${endStr} at ${baseUrl}...`);
      const response = await axiosGetWithRetry(urlCount, {
        headers,
        timeout: 60000,
        validateStatus: () => true,
      });

      if (response.status === 401) {
        throw new Error('Unauthorized GDT Token (401)');
      }

      if (response.status !== 200) {
        const responseBody = typeof response.data === 'string'
          ? response.data.slice(0, 2000)
          : JSON.stringify(response.data).slice(0, 2000);
        console.error(`[DownloaderService] GDT query count responded with status ${response.status}`);
        console.error(`  URL: ${urlCount}`);
        console.error(`  Response body: ${responseBody}`);
        const err = new Error(`GDT query failed with status ${response.status}`);
        (err as any).status = response.status;
        throw err;
      }
      
      const total = response.data?.total || 0;
      console.log(`[DownloaderService] Found ${total} invoices in GDT at ${baseUrl}.`);
      if (total === 0) return [];

      // Step 2: Retrieve all details via pagination (GDT limit: 50 records/page)
      const PAGE_SIZE = 50;
      const totalPages = Math.ceil(total / PAGE_SIZE);
      const allRecords: any[] = [];

      for (let page = 0; page < totalPages; page++) {
        const urlPage = `${baseUrl}?sort=tdlap:desc&size=${PAGE_SIZE}&page=${page}&search=${searchParam}`;

        console.log(`[DownloaderService] Fetching page ${page + 1}/${totalPages} (size=${PAGE_SIZE}) from ${baseUrl}...`);

        const responsePage = await axiosGetWithRetry(urlPage, {
          headers,
          timeout: 60000,
          validateStatus: () => true,
        });

        if (responsePage.status !== 200) {
          const responseBody = typeof responsePage.data === 'string'
            ? responsePage.data.slice(0, 2000)
            : JSON.stringify(responsePage.data).slice(0, 2000);
          console.error(`[DownloaderService] GDT query page ${page + 1}/${totalPages} responded with status ${responsePage.status}`);
          console.error(`  URL: ${urlPage}`);
          console.error(`  Response body: ${responseBody}`);
          if (responsePage.status === 429) {
            const err = new Error(`GDT query page failed with status 429`);
            (err as any).status = 429;
            throw err;
          }
          // Continue to next page instead of throwing — partial data is better than none
          continue;
        }

        const records = responsePage.data?.datas || [];
        const sourceApi = baseUrl.includes('sco-query') ? 'sco-query' : 'query';
        const enhancedRecords = records.map((r: any) => ({ ...r, _sourceApi: sourceApi }));
        allRecords.push(...enhancedRecords);
        console.log(`[DownloaderService] Page ${page + 1}/${totalPages} from ${baseUrl} returned ${records.length} records.`);

        // Delay between pages to avoid rate limiting
        if (page < totalPages - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`[DownloaderService] Total records collected across ${totalPages} page(s) from ${baseUrl}: ${allRecords.length}`);
      return allRecords;
    } catch (error: any) {
      if (error.response) {
        const responseBody = error.response.data
          ? (typeof error.response.data === 'string'
              ? error.response.data.slice(0, 2000)
              : JSON.stringify(error.response.data).slice(0, 2000))
          : '(empty)';
        console.error(`[DownloaderService] GDT query error at ${baseUrl}: status ${error.response.status}`);
        console.error(`  Response body: ${responseBody}`);
      } else {
        console.error(`[DownloaderService] Error querying GDT invoices at ${baseUrl}:`, error.message);
      }
      throw error;
    }
  }

  /**
   * Download the XML/ZIP file for a specific invoice
   */
  /**
   * Download the XML/ZIP file for a specific invoice.
   *
   * @returns zipPath nếu tải thành công.
   * @throws Error với message thân thiện nếu GDT trả về lỗi (vd: hoá đơn không tồn tại).
   */
  public async downloadInvoiceZip(
    invoice: any,
    token: string,
    outputDir: string,
    invoiceType: 'BUY' | 'SELL' = 'SELL'
  ): Promise<string> {
    const nbmst = invoice.nbmst;         // Seller tax code
    const khmshdon = invoice.khmshdon;   // Invoice template symbol
    const khhdon = invoice.khhdon;       // Invoice symbol
    const shdon = invoice.shdon;         // Invoice number
    const mhdon = invoice.mhdon;         // Tax Authority Code (MCCQT/hash)

    if (!nbmst || shdon === undefined || !khmshdon || !khhdon) {
      throw new Error(`Thiếu thông tin hoá đơn (nbmst/shdon/khmshdon/khhdon) để tải ZIP.`);
    }
    const resultCode = mapProcessStatusToCode(invoice);
    const zipFileName = `${nbmst}-${shdon}-${resultCode}.zip`;

    const zipPath = path.join(outputDir, zipFileName);

    // Skip if already downloaded and not empty
    if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) {
      return zipPath;
    }

    const isSco = invoice._sourceApi === 'sco-query' || String(khhdon).toUpperCase().startsWith('M');
    const apiPath = isSco ? 'sco-query' : 'query';
    const exportUrl = `https://hoadondientu.gdt.gov.vn/api/${apiPath}/invoices/export-xml?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    try {
      // Ensure directory exists
      fs.mkdirSync(outputDir, { recursive: true });

      const response = await axiosGetWithRetry(exportUrl, {
        headers,
        responseType: 'arraybuffer',
        timeout: 60000,
        // Do not throw on non-200 so we can inspect the response body
        validateStatus: () => true,
      });

      if (response.status === 200) {
        fs.writeFileSync(zipPath, response.data);
        return zipPath;
      }

      // Non-200 response from GDT — parse và throw message thân thiện
      const responseBody = response.data ? Buffer.from(response.data).toString('utf-8').slice(0, 2000) : '(empty)';
      console.error(`[DownloaderService] GDT responded with status ${response.status} for invoice ${shdon}`);
      console.error(`  URL: ${exportUrl}`);
      console.error(`  Response body: ${responseBody}`);

      const friendlyMessage = formatGdtError(responseBody, String(shdon), response.status);
      throw new Error(friendlyMessage);
    } catch (error: any) {
      // Nếu đã là Error với message thân thiện (do throw ở trên), throw tiếp
      if (error.message && (
        error.message.includes('không còn tồn tại') ||
        error.message.includes('GDT trả về lỗi')
      )) {
        throw error;
      }

      // Axios error với response từ GDT
      if (error.response) {
        const responseBody = extractResponseBody(error.response.data);
        console.error(`[DownloaderService] GDT error for invoice ${shdon}: status ${error.response.status}`);
        console.error(`  URL: ${exportUrl}`);
        console.error(`  Response body: ${responseBody}`);

        const friendlyMessage = formatGdtError(responseBody, String(shdon), error.response.status);
        throw new Error(friendlyMessage);
      }

      // Network error / timeout
      console.error(`[DownloaderService] Failed to download ZIP for invoice ${shdon}: ${error.message}`);
      throw new Error(`Lỗi mạng khi tải hoá đơn ${shdon}: ${error.message}`);
    }
  }

  /**
   * Download Excel report for a date range from GDT portal.
   * Returns an array of paths to saved .xlsx files.
   */
  public async downloadExcelReport(
    startDate: Date,
    endDate: Date,
    token: string,
    type: 'BUY' | 'SELL',
    outputDir: string
  ): Promise<string[]> {
    const formatGdtDate = (d: Date, endOfDay: boolean) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const time = endOfDay ? 'T23:59:59' : 'T00:00:00';
      return `${dd}/${mm}/${yyyy}${time}`;
    };

    const startStr = formatGdtDate(startDate, false);
    const endStr = formatGdtDate(endDate, true);

    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'vi',
    };

    const dateLabel = `${startStr.replace(/[/:]/g, '-')}_to_${endStr.replace(/[/:]/g, '-')}`;

    const exportTasks = [
      {
        url: `https://hoadondientu.gdt.gov.vn/api/query/invoices/export-excel?sort=tdlap:desc&search=tdlap=ge=${startStr};tdlap=le=${endStr}`,
        fileName: `invoices_${type}_${dateLabel}_standard.xlsx`
      },
      {
        url: `https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/export-excel?sort=tdlap:desc&search=tdlap=ge=${startStr};tdlap=le=${endStr}`,
        fileName: `invoices_${type}_${dateLabel}_sco.xlsx`
      }
    ];

    const savedPaths: string[] = [];
    fs.mkdirSync(outputDir, { recursive: true });

    for (const task of exportTasks) {
      const filePath = path.join(outputDir, task.fileName);

      // Skip if already downloaded
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        console.log(`[DownloaderService] Excel report already exists: ${filePath}`);
        savedPaths.push(filePath);
        continue;
      }

      try {
        const response = await axiosGetWithRetry(task.url, {
          headers,
          responseType: 'arraybuffer',
          timeout: 60000,
          // Do not throw on non-200 so we can inspect the response body
          validateStatus: () => true,
        });

        if (response.status === 200) {
          fs.writeFileSync(filePath, response.data);
          console.log(`[DownloaderService] Downloaded Excel report: ${filePath}`);
          savedPaths.push(filePath);
        } else {
          // Log non-200 response from GDT
          const responseBody = response.data ? Buffer.from(response.data).toString('utf-8').slice(0, 2000) : '(empty)';
          console.error(`[DownloaderService] GDT responded with status ${response.status} for Excel report`);
          console.error(`  URL: ${task.url}`);
          console.error(`  Response body: ${responseBody}`);
        }
      } catch (error: any) {
        if (error.response) {
          // Axios error with response from GDT
          const responseBody = error.response.data
            ? (typeof error.response.data === 'string'
                ? error.response.data.slice(0, 2000)
                : JSON.stringify(error.response.data).slice(0, 2000))
            : '(empty)';
          console.error(`[DownloaderService] GDT error for Excel report: status ${error.response.status}`);
          console.error(`  URL: ${task.url}`);
          console.error(`  Response body: ${responseBody}`);
        } else {
          console.error(`[DownloaderService] Failed to download Excel report from ${task.url}: ${error.message}`);
        }
      }
    }

    return savedPaths;
  }

  /**
   * Tải chi tiết hoá đơn (JSON) từ API detail để fallback build HTML
   * khi không tải được file ZIP gốc.
   */
  public async downloadInvoiceDetail(
    invoice: any,
    token: string
  ): Promise<any> {
    const nbmst = invoice.nbmst;         // Seller tax code
    const khmshdon = invoice.khmshdon;   // Invoice template symbol
    const khhdon = invoice.khhdon;       // Invoice symbol
    const shdon = invoice.shdon;         // Invoice number

    if (!nbmst || shdon === undefined || !khmshdon || !khhdon) {
      throw new Error(`Thiếu thông tin hoá đơn (nbmst/shdon/khmshdon/khhdon) để tải chi tiết.`);
    }

    const isSco = invoice._sourceApi === 'sco-query' || String(khhdon).toUpperCase().startsWith('M');
    const apiPath = isSco ? 'sco-query' : 'query';
    
    const detailUrl = `https://hoadondientu.gdt.gov.vn/api/${apiPath}/invoices/detail?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
    };

    try {
      const response = await axiosGetWithRetry(detailUrl, {
        headers,
        timeout: 60000,
        validateStatus: () => true,
      });

      if (response.status === 200 && response.data) {
        return response.data;
      }
      
      throw new Error(`GDT trả về lỗi ${response.status} khi lấy detail.`);
    } catch (error: any) {
      throw new Error(`Lỗi gọi API detail: ${error.message}`);
    }
  }
}
