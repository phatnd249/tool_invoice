import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { delay } from '../../common/invoice-utils';

/**
 * Shared HTTP logic cho tất cả GDT API calls.
 * - Build headers / search strings
 * - Retry với exponential backoff
 * - Log response body khi có lỗi 4xx
 */
@Injectable()
export class GdtHttpClientService {
  private readonly logger = new Logger(GdtHttpClientService.name);

  readonly GDT_BASE = 'https://hoadondientu.gdt.gov.vn/api';

  /**
   * Tạo search string cho query invoices.
   * Format: tdlap=ge=01/01/2025T00:00:00;tdlap=le=31/01/2025T23:59:59
   */
  buildSearchString(start: Date, end: Date): string {
    const fmt = (d: Date, endOfDay: boolean) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const time = endOfDay ? '23:59:59' : '00:00:00';
      return `${dd}/${mm}/${yyyy}T${time}`;
    };
    return `tdlap=ge=${fmt(start, false)};tdlap=le=${fmt(end, true)}`;
  }

  /**
   * Tạo headers cho GDT API với Bearer token.
   */
  buildHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    };
  }

  /**
   * Gọi axios GET với retry tự động.
   * - 429 / 5xx → retry với exponential backoff dài (10s → 20s → 40s) để thoát rate-limit
   * - Timeout / lỗi mạng → retry với backoff ngắn (2s → 4s → 8s), vì lỗi thoáng qua
   * - 401 → throw ngay (token expired)
   *
   * @param options.retry5xx - mặc định true (retry 5xx). Truyền `false` cho các API
   *   mà 5xx là kết thúc (vd: export-xml trả 500 khi GDT không có hồ sơ gốc), để tránh
   *   chờ backoff vô ích, nhường cho caller xử lý fallback.
   */
  async fetchWithRetry(
    url: string,
    config: any,
    retries: number = 3,
    options?: { retry5xx?: boolean },
  ): Promise<any> {
    let rateDelayMs = 10000; // 429/5xx: chờ lâu để thoát rate-limit
    let netDelayMs = 2000; // timeout/lỗi mạng: chờ ngắn

    for (let i = 0; i <= retries; i++) {
      try {
        const resp = await axios.get(url, config);
        const status = resp.status;

        const retryableStatus =
          status === 429 ||
          (options?.retry5xx !== false && status >= 500 && status <= 599);

        if (retryableStatus && i < retries) {
          this.logger.warn(
            `HTTP ${status} from GDT, retrying in ${rateDelayMs}ms (attempt ${i + 1}/${retries})`,
          );
          await delay(rateDelayMs);
          rateDelayMs *= 2;
          continue;
        }

        return resp;
      } catch (err: any) {
        const isTimeout =
          err.code === 'ECONNABORTED' ||
          err.code === 'ETIMEDOUT' ||
          (err.message && err.message.toLowerCase().includes('timeout'));
        const status = err?.response?.status;
        const isRateLimited = status === 429;
        const is5xx = status >= 500 && status <= 599;
        const isRetryable =
          isTimeout ||
          !status ||
          isRateLimited ||
          (options?.retry5xx !== false && is5xx);

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
          const wait = isRateLimited || is5xx ? rateDelayMs : netDelayMs;
          this.logger.warn(
            `Request failed (${status || err.code}), retrying in ${wait}ms...`,
          );
          await delay(wait);
          if (isRateLimited || is5xx) {
            rateDelayMs *= 2;
          } else {
            netDelayMs *= 2;
          }
          continue;
        }
        throw err;
      }
    }

    // Should never reach here, but just in case
    throw new Error(`Thất bại sau ${retries} lần thử`);
  }
}
