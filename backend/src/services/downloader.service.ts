import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { withRetry } from '../utils/rate-limiter.js';
import { createLogger } from '../logger/index.js';
import { formatGdtError, extractResponseBody } from '../utils/gdt-errors.js';
import { getStatusFileCode } from '../utils/gdt-format.js';
import { findNextVersion, getVersionedFilePath, removeAllRelatedFiles } from '../utils/file-version.js';

const log = createLogger('DownloaderService');

/**
 * Wrapper for axios.get with automatic retry and exponential backoff for 429, 5xx, and Timeout/Network errors.
 */
async function axiosGetWithRetry(url: string, config: any, retries: number = 3, delayMs: number = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, config);
      const status = response.status;
      if (status === 429 || (status >= 500 && status <= 599)) {
        if (i < retries - 1) {
          log.warn({ url, status, delayMs, attempt: i + 1, retries }, `HTTP ${status} returned from server, retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 2;
          continue;
        }
      }
      return response;
    } catch (err: any) {
      const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || (err.message && err.message.toLowerCase().includes('timeout'));
      const status = err?.response?.status;
      const isRetryable = isTimeout || !status || status === 429 || (status >= 500 && status <= 599);

      if (i < retries - 1 && isRetryable) {
        const reason = isTimeout ? 'Timeout' : (status ? `HTTP ${status}` : err.code || err.message);
        log.warn({ url, reason, delayMs, attempt: i + 1, retries, err: err.message }, `Request failed (${reason}), retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2;
        continue;
      }
      throw err;
    }
  }
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
      log.error({ err: error }, 'Error decoding token JWT');
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
   * Query invoices from GDT Portal.
   * Gọi 2 API (query chuẩn + sco-query) mỗi loại 1 lần, không filter theo ttxly,
   * vì API tự trả về tất cả hoá đơn trong khoảng thời gian.
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

    const apiPath = type === 'BUY' ? 'purchase' : 'sold';
    const baseUrlQuery = `https://hoadondientu.gdt.gov.vn/api/query/invoices/${apiPath}`;
    const baseUrlScoQuery = `https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/${apiPath}`;

    let allInvoices: any[] = [];

    // Query standard invoices — 1 lần duy nhất (không filter ttxly, API trả về tất cả)
    try {
      const queryInvoices = await withRetry(
        () => this.fetchInvoicesFromUrl(baseUrlQuery, startStr, endStr, headers),
        { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 10000 }
      );
      allInvoices = allInvoices.concat(queryInvoices);
    } catch (error: any) {
      if (error.message && error.message.includes('401')) throw error;
      log.warn({ err: error.message }, 'Error fetching standard invoices, ignoring');
    }

    // Query cash register invoices (máy tính tiền) — 1 lần duy nhất
    try {
      const scoQueryInvoices = await withRetry(
        () => this.fetchInvoicesFromUrl(baseUrlScoQuery, startStr, endStr, headers),
        { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 10000 }
      );
      allInvoices = allInvoices.concat(scoQueryInvoices);
    } catch (error: any) {
      if (error.message && error.message.includes('401')) throw error;
      log.warn({ err: error.message }, 'Error fetching sco-query invoices, ignoring');
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
    let searchStr = `tdlap=ge=${startStr};tdlap=le=${endStr}`;
    if (status !== undefined) {
      searchStr += `;ttxly==${status}`;
    }
    const searchParam = encodeURIComponent(searchStr);
    const urlCount = `${baseUrl}?sort=tdlap:desc&size=1&search=${searchParam}`;

    try {
      log.info({ startStr, endStr, baseUrl }, 'Querying count from GDT...');
      const response = await axiosGetWithRetry(urlCount, {
        headers, timeout: 60000, validateStatus: () => true,
      });

      if (response.status === 401) throw new Error('Unauthorized GDT Token (401)');

      if (response.status !== 200) {
        const responseBody = typeof response.data === 'string'
          ? response.data.slice(0, 2000)
          : JSON.stringify(response.data).slice(0, 2000);
        log.error({ status: response.status, url: urlCount, responseBody }, 'GDT query count failed');
        const err = new Error(`GDT query failed with status ${response.status}`);
        (err as any).status = response.status;
        throw err;
      }

      const total = response.data?.total || 0;
      log.info({ total, baseUrl }, 'Found %d invoices in GDT', total);
      if (total === 0) return [];

      const PAGE_SIZE = 50;
      const totalPages = Math.ceil(total / PAGE_SIZE);
      const allRecords: any[] = [];

      for (let page = 0; page < totalPages; page++) {
        const urlPage = `${baseUrl}?sort=tdlap:desc&size=${PAGE_SIZE}&page=${page}&search=${searchParam}`;
        log.debug({ page: page + 1, totalPages, baseUrl }, 'Fetching page...');

        const responsePage = await axiosGetWithRetry(urlPage, {
          headers, timeout: 60000, validateStatus: () => true,
        });

        if (responsePage.status !== 200) {
          const responseBody = typeof responsePage.data === 'string'
            ? responsePage.data.slice(0, 2000)
            : JSON.stringify(responsePage.data).slice(0, 2000);
          log.error({ page: page + 1, totalPages, status: responsePage.status, url: urlPage, responseBody }, 'GDT query page failed');
          if (responsePage.status === 429) {
            const err = new Error(`GDT query page failed with status 429`);
            (err as any).status = 429;
            throw err;
          }
          continue;
        }

        const records = responsePage.data?.datas || [];
        const sourceApi = baseUrl.includes('sco-query') ? 'sco-query' : 'query';
        const enhancedRecords = records.map((r: any) => ({ ...r, _sourceApi: sourceApi }));
        allRecords.push(...enhancedRecords);
        log.debug({ page: page + 1, totalPages, baseUrl, recordsCount: records.length }, 'Page returned records');

        if (page < totalPages - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      log.info({ totalPages, baseUrl, totalRecords: allRecords.length }, 'Total records collected');
      return allRecords;
    } catch (error: any) {
      if (error.response) {
        const responseBody = error.response.data
          ? (typeof error.response.data === 'string'
              ? error.response.data.slice(0, 2000)
              : JSON.stringify(error.response.data).slice(0, 2000))
          : '(empty)';
        log.error({ baseUrl, status: error.response.status, responseBody }, 'GDT query error');
      } else {
        log.error({ baseUrl, err: error.message }, 'Error querying GDT invoices');
      }
      throw error;
    }
  }

  /**
   * Download the XML/ZIP file for a specific invoice.
   * @returns zipPath nếu tải thành công.
   * @throws Error với message thân thiện nếu GDT trả về lỗi.
   */
  public async downloadInvoiceZip(
    invoice: any,
    token: string,
    outputDir: string,
    invoiceType: 'BUY' | 'SELL' = 'SELL',
    companyTaxCode?: string,
    overwriteMode?: 'SKIP' | 'OVERWRITE' | 'NEW_VERSION',
  ): Promise<{ zipPath: string; version?: number }> {
    const nbmst = invoice.nbmst;
    const khmshdon = invoice.khmshdon;
    const khhdon = invoice.khhdon;
    const shdon = invoice.shdon;

    if (!nbmst || shdon === undefined || !khmshdon || !khhdon) {
      throw new Error(`Thiếu thông tin hoá đơn (nbmst/shdon/khmshdon/khhdon) để tải ZIP.`);
    }

    const statusFileCode = getStatusFileCode(invoice);
    const taxCodeForName = companyTaxCode || nbmst;
    const zipFileName = `${taxCodeForName}-${shdon}-${statusFileCode}.zip`;
    const zipPath = path.join(outputDir, zipFileName);

    // Xử lý theo overwriteMode
    let finalZipPath = zipPath;
    let version: number | undefined;

    if (overwriteMode === 'OVERWRITE') {
      // Ghi đè: xoá file cũ trước khi tải mới
      if (fs.existsSync(zipPath)) {
        removeAllRelatedFiles(zipPath);
        log.info({ zipPath }, 'Overwrite mode: đã xoá các file cũ');
      }
    } else if (overwriteMode === 'NEW_VERSION') {
      // Tạo bản sao: tìm version tiếp theo nếu file đã tồn tại
      if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) {
        version = findNextVersion(zipPath);
        finalZipPath = getVersionedFilePath(zipPath, version);
        log.info({ original: zipPath, final: finalZipPath, version }, 'New-version mode: tạo file version mới');
      }
    } else {
      // SKIP (mặc định): skip nếu file đã tồn tại
      if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) {
        return { zipPath, version: undefined };
      }
    }

    const isSco = invoice._sourceApi === 'sco-query' || String(khhdon).toUpperCase().startsWith('M');
    const apiPath = isSco ? 'sco-query' : 'query';
    const exportUrl = `https://hoadondientu.gdt.gov.vn/api/${apiPath}/invoices/export-xml?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    try {
      fs.mkdirSync(outputDir, { recursive: true });

      const response = await axiosGetWithRetry(exportUrl, {
        headers,
        responseType: 'arraybuffer',
        timeout: 60000,
        validateStatus: () => true,
      });

      if (response.status === 200) {
        fs.writeFileSync(finalZipPath, response.data);
        log.info({ zipPath: finalZipPath, invoiceNumber: shdon }, 'Đã tải ZIP thành công');
        return { zipPath: finalZipPath, version };
      }

      // Non-200 — parse và throw message thân thiện
      const responseBody = response.data ? Buffer.from(response.data).toString('utf-8').slice(0, 2000) : '(empty)';
      log.error({ status: response.status, invoiceNumber: shdon, url: exportUrl, responseBody }, 'GDT responded with error for invoice download');

      const friendlyMessage = formatGdtError(responseBody, String(shdon), response.status);
      throw new Error(friendlyMessage);
    } catch (error: any) {
      if (error.message && (
        error.message.includes('không còn tồn tại') ||
        error.message.includes('GDT trả về lỗi')
      )) {
        if (version) {
          throw new Error(`[v${version}] ${error.message}`);
        }
        throw error;
      }

      if (error.response) {
        const responseBody = extractResponseBody(error.response.data);
        log.error({ invoiceNumber: shdon, status: error.response.status, url: exportUrl, responseBody }, 'GDT error for invoice');
        const friendlyMessage = formatGdtError(responseBody, String(shdon), error.response.status);
        if (version) {
          throw new Error(`[v${version}] ${friendlyMessage}`);
        }
        throw new Error(friendlyMessage);
      }

      log.error({ invoiceNumber: shdon, err: error.message }, 'Failed to download ZIP');
      if (version) {
        throw new Error(`[v${version}] Lỗi mạng khi tải hoá đơn ${shdon}: ${error.message}`);
      }
      throw new Error(`Lỗi mạng khi tải hoá đơn ${shdon}: ${error.message}`);
    }
  }

  /**
   * Download Excel report for a date range from GDT portal.
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
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        log.debug({ filePath }, 'Excel report already exists');
        savedPaths.push(filePath);
        continue;
      }

      try {
        const response = await axiosGetWithRetry(task.url, {
          headers, responseType: 'arraybuffer', timeout: 60000, validateStatus: () => true,
        });

        if (response.status === 200) {
          fs.writeFileSync(filePath, response.data);
          log.info({ filePath }, 'Downloaded Excel report');
          savedPaths.push(filePath);
        } else {
          const responseBody = response.data ? Buffer.from(response.data).toString('utf-8').slice(0, 2000) : '(empty)';
          log.error({ status: response.status, url: task.url, responseBody }, 'GDT responded error for Excel report');
        }
      } catch (error: any) {
        if (error.response) {
          const responseBody = extractResponseBody(error.response.data);
          log.error({ status: error.response.status, url: task.url, responseBody }, 'GDT error for Excel report');
        } else {
          log.error({ url: task.url, err: error.message }, 'Failed to download Excel report');
        }
      }
    }

    return savedPaths;
  }

  /**
   * Tải chi tiết hoá đơn (JSON) từ API detail để fallback build HTML.
   */
  public async downloadInvoiceDetail(invoice: any, token: string): Promise<any> {
    const nbmst = invoice.nbmst;
    const khmshdon = invoice.khmshdon;
    const khhdon = invoice.khhdon;
    const shdon = invoice.shdon;

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
        headers, timeout: 60000, validateStatus: () => true,
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
