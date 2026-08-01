import { Injectable, Logger } from '@nestjs/common';
import { GdtHttpClientService } from './gdt-http-client.service';
import { GdtRawInvoice } from '../gdt-client.service';
import { delay } from '../../common/invoice-utils';

/**
 * Query hoá đơn từ GDT API.
 * Tự động gọi cả 2 API (query chuẩn + sco-query) và merge kết quả.
 */
@Injectable()
export class GdtQueryClientService {
  private readonly logger = new Logger(GdtQueryClientService.name);

  private readonly PAGE_SIZE = 50;

  // ttxly values hợp lệ cho từng loại API
  private readonly VALID_STANDARD_STATUSES = new Set([4, 5, 6, 7, 8]);
  private readonly VALID_SCO_STATUSES = new Set([5, 6, 8]);

  constructor(private readonly http: GdtHttpClientService) {}

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
    const searchStr = this.http.buildSearchString(startDate, endDate);
    const headers = this.http.buildHeaders(token);
    const apiPath = type === 'BUY' ? 'purchase' : 'sold';

    const results: GdtRawInvoice[] = [];

    // Query standard invoices
    try {
      const standard = await this.queryAllPages(
        `${this.http.GDT_BASE}/query/invoices/${apiPath}`,
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
        `${this.http.GDT_BASE}/sco-query/invoices/${apiPath}`,
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
    const countResp = await this.http.fetchWithRetry(countUrl, { headers, timeout: 20000 });

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

      const resp = await this.http.fetchWithRetry(url, { headers, timeout: 20000 });

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
      await delay(500);
    }

    this.logger.debug(
      `Fetched ${allRecords.length} records in ${pageCount} pages from ${source}`,
    );
    return allRecords;
  }
}
