/**
 * GDT Health Check Service
 *
 * Kiểm tra sức khoẻ các API GDT (Tổng cục Thuế) — tất cả company đều dùng chung hệ thống GDT,
 * chỉ khác token xác thực. Vì vậy health check là **global**, không phải per-company.
 *
 * Cache kết quả trong thời gian ngắn (mặc định 30s) để tránh spam GDT.
 * Token chỉ dùng để kiểm tra token validity (không ảnh hưởng đến cache health global).
 */

import axios from 'axios';
import { createLogger } from '../logger/index.js';

const log = createLogger('GdtHealthService');

// ─── Constants ───────────────────────────────────────────────────

const GDT_BASE = 'https://hoadondientu.gdt.gov.vn';
const HEALTH_TIMEOUT = parseInt(process.env.GDT_HEALTH_TIMEOUT_MS || '8000', 10);
const HEALTH_TIMEOUT_SECONDS = HEALTH_TIMEOUT / 1000;
const CACHE_TTL_MS = parseInt(process.env.GDT_HEALTH_CACHE_TTL || '30000', 10);

// ─── Types ───────────────────────────────────────────────────────

export interface GdtHealthCheckResult {
  endpoint: string;
  url: string;
  status: 'ok' | 'slow' | 'error';
  latencyMs: number;
  httpStatus: number | null;
  message: string;
}

export interface GdtHealthResult {
  /** Trạng thái tổng thể của hệ thống GDT (global, không phụ thuộc company) */
  overall: 'healthy' | 'degraded' | 'unhealthy';
  /** Mô tả ngắn gọn tình trạng */
  summary: string;
  /** Kết quả kiểm tra từng endpoint */
  checks: GdtHealthCheckResult[];
  /** Trạng thái token (nếu có token trong request) */
  tokenStatus?: 'valid' | 'expired' | 'invalid' | 'missing';
  /** Thời gian thực hiện health check */
  timestamp: string;
}

// ─── Cache (global — 1 entry duy nhất) ──────────────────────────

interface CacheEntry {
  result: GdtHealthResult;
  timestamp: number;
}

let cachedResult: CacheEntry | null = null;

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Format ngày GDT: dd/MM/yyyy
 */
function formatGdtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Tính toán latency, phân loại ok/slow/error dựa trên thời gian phản hồi.
 * Ngưỡng: < 3s = ok, 3-10s = slow, > 10s hoặc lỗi = error
 */
function classifyLatency(latencyMs: number, httpStatus: number | null): 'ok' | 'slow' | 'error' {
  if (httpStatus === null || httpStatus >= 500) return 'error';
  if (httpStatus !== 200) return 'error'; // 4xx cũng coi như lỗi
  if (latencyMs < 3000) return 'ok';
  if (latencyMs <= 10000) return 'slow';
  return 'error';
}

// ─── Service ─────────────────────────────────────────────────────

export class GdtHealthService {
  /**
   * Kiểm tra sức khoẻ hệ thống GDT.
   *
   * Kết quả health check là **global** (cache chung 1 entry) vì tất cả company
   * đều dùng chung hệ thống GDT. Token được truyền kèm để kiểm tra token validity
   * nhưng không ảnh hưởng đến cache.
   *
   * @param token Token GDT (optional) — dùng để kiểm tra token validity
   * @param _mst  MST (không còn dùng cho cache, giữ param để tương thích)
   * @param force Nếu true, bỏ qua cache và kiểm tra lại ngay lập tức
   * @returns Kết quả health check tổng hợp
   */
  async checkAll(token: string | null, _mst?: string, force?: boolean): Promise<GdtHealthResult> {
    const now = Date.now();

    // Cache global — chỉ 1 entry duy nhất cho toàn bộ hệ thống GDT
    // Bỏ qua cache nếu force=true
    if (!force && cachedResult && (now - cachedResult.timestamp) < CACHE_TTL_MS) {
      log.debug({ age: now - cachedResult.timestamp }, 'Returning cached GDT health result');
      // Nếu có token, kiểm tra token validity dựa trên kết quả có sẵn
      if (token) {
        const tokenStatus = this._checkTokenValidity(token, cachedResult.result);
        return { ...cachedResult.result, tokenStatus };
      }
      return cachedResult.result;
    }

    log.info({ hasToken: !!token }, 'Running GDT health check...');

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Dùng ngày hiện tại và ngày hôm qua để query sample
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const searchStr = `tdlap=ge=${formatGdtDate(yesterday)}T00:00:00;tdlap=le=${formatGdtDate(today)}T23:59:59`;
    const searchParam = encodeURIComponent(searchStr);

    // Danh sách endpoints cần check
    const endpoints: Array<{
      name: string;
      url: string;
    }> = [
      {
        name: 'query/invoices/sold',
        url: `${GDT_BASE}/api/query/invoices/sold?sort=tdlap:desc&size=1&search=${searchParam}`,
      },
      {
        name: 'query/invoices/purchase',
        url: `${GDT_BASE}/api/query/invoices/purchase?sort=tdlap:desc&size=1&search=${searchParam}`,
      },
      {
        name: 'sco-query/invoices/sold',
        url: `${GDT_BASE}/api/sco-query/invoices/sold?sort=tdlap:desc&size=1&search=${searchParam}`,
      },
      {
        name: 'sco-query/invoices/purchase',
        url: `${GDT_BASE}/api/sco-query/invoices/purchase?sort=tdlap:desc&size=1&search=${searchParam}`,
      },
    ];

    // Gọi đồng thời tất cả endpoints
    const results = await Promise.allSettled(
      endpoints.map((ep) => this._checkEndpoint(ep.name, ep.url, headers))
    );

    const checks: GdtHealthCheckResult[] = results.map((r, idx) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        endpoint: endpoints[idx].name,
        url: endpoints[idx].url,
        status: 'error',
        latencyMs: HEALTH_TIMEOUT,
        httpStatus: null,
        message: r.reason?.message || 'Unknown error',
      };
    });

    // Tính overall status
    const total = checks.length;
    const okCount = checks.filter((c) => c.status === 'ok').length;
    const slowCount = checks.filter((c) => c.status === 'slow').length;
    const errorCount = checks.filter((c) => c.status === 'error').length;

    let overall: GdtHealthResult['overall'];
    let summary: string;

    if (errorCount === 0 && slowCount === 0) {
      overall = 'healthy';
      summary = 'Tất cả API GDT đều hoạt động tốt.';
    } else if (errorCount < Math.ceil(total / 2)) {
      overall = 'degraded';
      const issues: string[] = [];
      if (slowCount > 0) issues.push(`${slowCount} endpoint chậm`);
      if (errorCount > 0) issues.push(`${errorCount} endpoint lỗi`);
      summary = `GDT đang hoạt động không ổn định: ${issues.join(', ')}.`;
    } else {
      overall = 'unhealthy';
      summary = `GDT không khả dụng: ${errorCount}/${total} endpoint lỗi. Không thể tải hoá đơn ngay lúc này.`;
    }

    // Kiểm tra token validity nếu có token
    const tokenStatus = this._checkTokenValidity(token, { checks, overall });

    const result: GdtHealthResult = {
      overall,
      summary,
      checks,
      tokenStatus,
      timestamp: new Date().toISOString(),
    };

    // Lưu cache global
    cachedResult = { result, timestamp: Date.now() };

    log.info({ overall, okCount, slowCount, errorCount, tokenStatus }, 'GDT health check completed');

    return result;
  }

  /**
   * Gọi 1 endpoint GDT cụ thể và đo latency.
   */
  private async _checkEndpoint(
    endpoint: string,
    url: string,
    headers: Record<string, string>,
  ): Promise<GdtHealthCheckResult> {
    const startTime = Date.now();

    try {
      // Dùng AbortSignal để đảm bảo timeout chính xác
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);

      const response = await axios.get(url, {
        headers,
        signal: controller.signal,
        validateStatus: () => true, // Không throw trên HTTP error
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      const httpStatus = response.status;
      const status = classifyLatency(latencyMs, httpStatus);

      let message = '';
      if (status === 'slow') {
        message = `Phản hồi chậm (${(latencyMs / 1000).toFixed(1)}s)`;
      } else if (status === 'error') {
        if (httpStatus === 401) {
          message = 'Token GDT không hợp lệ hoặc đã hết hạn (401)';
        } else if (httpStatus === 429) {
          message = 'GDT rate limit (429)';
        } else if (httpStatus === 504) {
          message = 'GDT gateway timeout (504)';
        } else {
          message = `HTTP ${httpStatus}`;
        }
      }

      return { endpoint, url, status, latencyMs, httpStatus, message };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;

      let message = error.message || 'Unknown error';
      if (error.code === 'ECONNABORTED' || error.name === 'AbortError' || message.includes('timeout') || message.includes('aborted')) {
        // Abort do timeout (AbortSignal)
        message = `Request timeout sau ${HEALTH_TIMEOUT_SECONDS.toFixed(0)}s — GDT không phản hồi`;
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        message = `Không thể kết nối đến GDT (${error.code})`;
      }

      return {
        endpoint,
        url,
        status: 'error',
        latencyMs: Math.min(latencyMs, HEALTH_TIMEOUT),
        httpStatus: error.response?.status || null,
        message,
      };
    }
  }

  /**
   * Kiểm tra token validity từ kết quả health check.
   * Nếu có endpoint nào trả về 401 (Unauthorized), token đã hết hạn hoặc không hợp lệ.
   */
  private _checkTokenValidity(
    token: string | null,
    result: { checks: GdtHealthCheckResult[]; overall: string },
  ): 'valid' | 'expired' | 'invalid' | 'missing' {
    if (!token) return 'missing';

    // Kiểm tra nếu bất kỳ endpoint nào trả về 401
    const has401 = result.checks.some((c) => c.httpStatus === 401);
    if (has401) return 'expired';

    // Nếu có endpoint trả về 403 hoặc các lỗi auth khác
    const hasAuthError = result.checks.some(
      (c) => c.httpStatus === 403 || (c.message && c.message.toLowerCase().includes('unauthorized')),
    );
    if (hasAuthError) return 'invalid';

    return 'valid';
  }

  /**
   * Xoá cache global health check.
   */
  clearCache(): void {
    cachedResult = null;
    log.debug('GDT health check cache cleared');
  }
}

// Singleton
export const gdtHealthService = new GdtHealthService();
