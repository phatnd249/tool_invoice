import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

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

@Injectable()
export class GdtClientService {
  private readonly logger = new Logger(GdtClientService.name);

  private readonly GDT_BASE = 'https://hoadondientu.gdt.gov.vn/api';
  private readonly PAGE_SIZE = 50;

  // ttxly values hợp lệ cho từng loại API
  private readonly VALID_STANDARD_STATUSES = new Set([4, 5, 6, 7, 8]);
  private readonly VALID_SCO_STATUSES = new Set([5, 6, 8]);

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Query hoá đơn từ GDT trong khoảng thời gian.
   * Tự động gọi cả 2 API (query chuẩn + sco-query) và merge kết quả.
   */
  async queryInvoices(
    startDate: Date,
    endDate: Date,
    token: string,
    type: 'BUY' | 'SELL',
  ): Promise<GdtRawInvoice[]> {
    const searchStr = this.buildSearchString(startDate, endDate);
    const headers = this.buildHeaders(token);
    const apiPath = type === 'BUY' ? 'purchase' : 'sold';

    const results: GdtRawInvoice[] = [];

    // Query standard invoices
    try {
      const standard = await this.queryAllPages(
        `${this.GDT_BASE}/query/invoices/${apiPath}`,
        searchStr,
        headers,
        'query',
      );
      const filtered = standard.filter((inv) =>
        this.VALID_STANDARD_STATUSES.has(inv.ttxly),
      );
      results.push(...filtered);
      this.logger.log(
        `Standard API: ${filtered.length}/${standard.length} invoices (${type})`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Standard API failed for ${type}: ${error.message}`,
      );
    }

    // Query sco (cash register) invoices
    try {
      const sco = await this.queryAllPages(
        `${this.GDT_BASE}/sco-query/invoices/${apiPath}`,
        searchStr,
        headers,
        'sco-query',
      );
      const filtered = sco.filter((inv) =>
        this.VALID_SCO_STATUSES.has(inv.ttxly),
      );
      results.push(...filtered);
      this.logger.log(
        `SCO API: ${filtered.length}/${sco.length} invoices (${type})`,
      );
    } catch (error: any) {
      this.logger.warn(
        `SCO API failed for ${type}: ${error.message}`,
      );
    }

    return results;
  }

  // ─── State-based Pagination ──────────────────────────────────────────────

  private async queryAllPages(
    baseUrl: string,
    searchStr: string,
    headers: Record<string, string>,
    source: string,
  ): Promise<GdtRawInvoice[]> {
    const allRecords: GdtRawInvoice[] = [];
    let state: string | undefined;

    // Lấy tổng số trước
    const countUrl = `${baseUrl}?sort=tdlap:desc&size=1&search=${encodeURIComponent(searchStr)}`;
    const countResp = await this.fetchWithRetry(countUrl, { headers, timeout: 20000 });

    if (countResp.status === 401) {
      throw Object.assign(new Error('GDT token expired'), { status: 401 });
    }
    const total: number = countResp.data?.total || 0;
    this.logger.debug(`Total invoices from ${source}: ${total}`);
    if (total === 0) return [];

    // Fetch từng page bằng state cursor
    let pageCount = 0;
    while (true) {
      pageCount++;
      let url: string;
      if (state) {
        url = `${baseUrl}?sort=tdlap:desc&size=${this.PAGE_SIZE}&state=${encodeURIComponent(state)}&search=${encodeURIComponent(searchStr)}`;
      } else {
        url = `${baseUrl}?sort=tdlap:desc&size=${this.PAGE_SIZE}&search=${encodeURIComponent(searchStr)}`;
      }

      const resp = await this.fetchWithRetry(url, { headers, timeout: 20000 });

      if (resp.status === 401) {
        throw Object.assign(new Error('GDT token expired'), { status: 401 });
      }

      const records = resp.data?.datas || [];
      // Gắn source để phân biệt
      const tagged = records.map((r: any) => ({ ...r, _sourceApi: source }));
      allRecords.push(...tagged);

      state = resp.data?.state;
      if (!state) break; // Hết dữ liệu

      // Rate limiting
      await this.delay(500);
    }

    this.logger.debug(
      `Fetched ${allRecords.length} records in ${pageCount} pages from ${source}`,
    );
    return allRecords;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private buildSearchString(start: Date, end: Date): string {
    const fmt = (d: Date, endOfDay: boolean) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const time = endOfDay ? '23:59:59' : '00:00:00';
      return `${dd}/${mm}/${yyyy}T${time}`;
    };
    return `tdlap=ge=${fmt(start, false)};tdlap=le=${fmt(end, true)}`;
  }

  private buildHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    };
  }

  private async fetchWithRetry(
    url: string,
    config: any,
    retries: number = 3,
  ): Promise<any> {
    let lastError: any;
    let delayMs = 1000;

    for (let i = 0; i <= retries; i++) {
      try {
        const resp = await axios.get(url, config);
        const status = resp.status;

        // Retry on 429 or 5xx
        if ((status === 429 || (status >= 500 && status <= 599)) && i < retries) {
          this.logger.warn(
            `HTTP ${status} from GDT, retrying in ${delayMs}ms (attempt ${i + 1}/${retries})`,
          );
          await this.delay(delayMs);
          delayMs *= 2;
          continue;
        }

        return resp;
      } catch (err: any) {
        const isTimeout =
          err.code === 'ECONNABORTED' ||
          err.code === 'ETIMEDOUT' ||
          (err.message && err.message.toLowerCase().includes('timeout'));
        const status = err?.response?.status;
        const isRetryable =
          isTimeout ||
          !status ||
          status === 429 ||
          (status >= 500 && status <= 599);

        // Log response body cho lỗi 4xx (client error) để debug
        if (status && status >= 400 && status < 500 && !isRetryable) {
          const errBody = err.response?.data
            ? (typeof err.response.data === 'string'
                ? err.response.data
                : JSON.stringify(err.response.data)
              ).slice(0, 2000)
            : '(empty)';
          this.logger.error(
            `GDT trả về HTTP ${status} (${err.config?.url || url}): ${errBody}`,
          );
        }

        if (i < retries && isRetryable) {
          this.logger.warn(
            `Request failed (${status || err.code}), retrying in ${delayMs}ms...`,
          );
          await this.delay(delayMs);
          delayMs *= 2;
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sinh mã trạng thái để đặt tên file ZIP.
   * Copy từ code cũ: getStatusFileCode()
   */
  private getStatusFileCode(inv: {
    khhdon?: string;
    ttxly?: number;
    tthai?: number;
  }): string {
    const khhdon = String(inv.khhdon || '').toUpperCase();
    let baseCode = 'K';
    if (khhdon.match(/^[1-6]?M/)) baseCode = 'M';
    else if (khhdon.match(/^[1-6]?C/)) baseCode = 'C';
    if (baseCode === 'K' && inv.ttxly === 5) baseCode = 'C';
    if (baseCode === 'K' && inv.ttxly === 8) baseCode = 'M';

    const statusMap: Record<number, string> = {
      1: '', 2: 'TT', 3: 'DC', 4: 'BTT', 5: 'BDC', 6: 'HUY',
    };
    const invoiceCode =
      inv.tthai != null ? (statusMap[inv.tthai] ?? '?') : '';

    if (baseCode && invoiceCode) return `${baseCode}-${invoiceCode}`;
    return baseCode || invoiceCode || 'K';
  }

  // ─── Invoice ZIP Download ───────────────────────────────────────────────

  /**
   * Tải file ZIP (XML) của một hoá đơn từ GDT export-xml API.
   * Lưu vào outputDir và trả về đường dẫn file ZIP.
   */
  async downloadInvoiceZip(
    invoice: GdtRawInvoice,
    token: string,
    outputDir: string,
  ): Promise<{ zipPath: string }> {
    const nbmst = invoice.nbmst;
    const khmshdon = invoice.khmshdon;
    const khhdon = invoice.khhdon;
    const shdon = invoice.shdon;

    if (!nbmst || shdon === undefined || !khmshdon || !khhdon) {
      throw new Error(
        `Thiếu thông tin hoá đơn (nbmst/shdon/khmshdon/khhdon) để tải ZIP`,
      );
    }

    const isSco =
      invoice._sourceApi === 'sco-query' ||
      String(khhdon).toUpperCase().startsWith('M');
    const apiPaths = isSco
      ? ['sco-query', 'query']
      : ['query', 'sco-query'];

    const statusCode = this.getStatusFileCode(invoice);
    const taxCode = String(nbmst);
    const invNum = String(shdon);
    const zipFileName = `${taxCode}-${invNum}-${statusCode}.zip`;
    const zipPath = path.join(outputDir, zipFileName);

    fs.mkdirSync(outputDir, { recursive: true });

    this.logger.debug(`Downloading ZIP for invoice ${invNum}...`);

    let lastError: any;

    for (const apiPath of apiPaths) {
      const exportUrl = `${this.GDT_BASE}/${apiPath}/invoices/export-xml?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;

      this.logger.debug(
        `Trying ZIP download (${apiPath}): ${exportUrl}`,
      );

      // Không retry khi tải ZIP:
      // - HTTP 429 → để tầng trên (download-task.service) xử lý cooldown
      // - HTTP 500 → thử path còn lại, nếu cả 2 đều fail mới báo lỗi
      const response = await this.fetchWithRetry(exportUrl, {
        headers: this.buildHeaders(token),
        responseType: 'arraybuffer',
        timeout: 60000,
        validateStatus: () => true,
      }, 0);

      if (response.status === 200) {
        fs.writeFileSync(zipPath, Buffer.from(response.data));
        this.logger.log(`Downloaded ZIP (${apiPath}): ${zipPath}`);
        return { zipPath };
      }

      const responseBody = response.data
        ? Buffer.from(response.data).toString('utf-8').slice(0, 2000)
        : '(empty)';

      // Nếu là 500, thử path còn lại
      if (response.status === 500 && apiPath !== apiPaths[apiPaths.length - 1]) {
        this.logger.warn(
          `GDT returned 500 for ${apiPath}, trying fallback path...`,
        );
        lastError = { status: response.status, body: responseBody };
        continue;
      }

      // Các lỗi khác: throw ngay
      this.logger.error(
        `GDT returned ${response.status} for invoice ${invNum} (URL: ${exportUrl}): ${responseBody}`,
      );

      let gdtMessage = '';
      try {
        const json = JSON.parse(responseBody);
        gdtMessage = json.message || json.error || '';
      } catch {
        gdtMessage = responseBody.slice(0, 300);
      }

      throw Object.assign(
        new Error(
          gdtMessage || `GDT trả về lỗi (HTTP ${response.status}) cho hoá đơn ${invNum}`,
        ),
        { statusCode: response.status },
      );
    }

    // Cả 2 path đều thất bại
    this.logger.error(
      `GDT returned 500 for both paths, invoice ${invNum}: ${lastError?.body}`,
    );
    throw Object.assign(
      new Error(
        `GDT không có file ZIP cho hoá đơn ${invNum} (đã thử cả query và sco-query)`,
      ),
      { statusCode: lastError?.status || 500 },
    );
  }

  // ─── Invoice Detail ────────────────────────────────────────────────────

  /**
   * Gọi GDT detail API để lấy chi tiết hoá đơn (bao gồm items).
   * Dùng khi cần lấy hdhhdvu / cttkhac.
   */
  async downloadInvoiceDetail(
    invoice: GdtRawInvoice,
    token: string,
  ): Promise<Record<string, any> | null> {
    const nbmst = invoice.nbmst;
    const khmshdon = invoice.khmshdon;
    const khhdon = invoice.khhdon;
    const shdon = invoice.shdon;

    if (!nbmst || shdon === undefined || !khmshdon || !khhdon) {
      this.logger.warn(
        `Thiếu thông tin để gọi detail API: nbmst=${nbmst}, shdon=${shdon}`,
      );
      return null;
    }

    const isSco =
      invoice._sourceApi === 'sco-query' ||
      String(khhdon).toUpperCase().startsWith('M');
    const apiPath = isSco ? 'sco-query' : 'query';
    const detailUrl =
      `${this.GDT_BASE}/${apiPath}/invoices/detail?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;

    try {
      const response = await this.fetchWithRetry(detailUrl, {
        headers: this.buildHeaders(token),
        timeout: 20000,
      });

      if (response.status === 200 && response.data) {
        return response.data;
      }
      this.logger.warn(
        `GDT detail API returned status ${response.status} for ${shdon}`,
      );
      return null;
    } catch (error: any) {
      this.logger.warn(
        `Failed to fetch detail for invoice ${shdon}: ${error.message}`,
      );
      return null;
    }
  }
}
