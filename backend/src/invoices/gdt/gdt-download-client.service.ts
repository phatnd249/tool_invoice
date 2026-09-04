import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GdtHttpClientService } from './gdt-http-client.service';
import { GdtRawInvoice } from '../gdt-client.service';
import { getInvoiceFileStatusCode } from '../../common/invoice-utils';

/**
 * Tải file ZIP (XML) và chi tiết hoá đơn từ GDT.
 */
@Injectable()
export class GdtDownloadClientService {
  private readonly logger = new Logger(GdtDownloadClientService.name);

  constructor(private readonly http: GdtHttpClientService) {}

  /**
   * Tải file ZIP (XML) của một hoá đơn từ GDT export-xml API.
   * Thử query API trước, nếu 500 thì fallback sang sco-query.
   *
   * @returns { zipPath } - đường dẫn file ZIP đã lưu
   * @throws Error với statusCode nếu lỗi
   */
  async downloadInvoiceZip(
    invoice: GdtRawInvoice,
    token: string,
    outputDir: string,
    companyTaxCode?: string,
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

    const statusCode = getInvoiceFileStatusCode(invoice);
    // Tên file dùng MST của công ty đang tải (công ty bên mua/bán),
    // không dùng MST của đối tác. Đặc biệt quan trọng với hoá đơn mua vào.
    const fileTaxCode = String(companyTaxCode || nbmst);
    const invNum = String(shdon);
    const zipFileName = `${fileTaxCode}-${invNum}-${statusCode}.zip`;
    const zipPath = path.join(outputDir, zipFileName);

    fs.mkdirSync(outputDir, { recursive: true });

    this.logger.debug(`Downloading ZIP for invoice ${invNum}...`);

    let lastError: any;

    for (const apiPath of apiPaths) {
      const exportUrl = `${this.http.GDT_BASE}/${apiPath}/invoices/export-xml?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;

      this.logger.debug(
        `Trying ZIP download (${apiPath}): ${exportUrl}`,
      );

      // Retry tự động khi gặp timeout hoặc lỗi mạng (retries = 2):
      // - HTTP 429 / Timeout → fetchWithRetry retry (429 backoff dài, timeout backoff ngắn)
      // - HTTP 500 → KHÔNG retry nội bộ (retry5xx: false): 500 = GDT không có hồ sơ gốc,
      //   trả ngay để thử path còn lại, tránh chờ backoff vô ích
      const response = await this.http.fetchWithRetry(exportUrl, {
        headers: this.http.buildHeaders(token),
        responseType: 'arraybuffer',
        timeout: 90000,
        validateStatus: () => true,
      }, 2, { retry5xx: false });

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
      `${this.http.GDT_BASE}/${apiPath}/invoices/detail?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;

    try {
      const response = await this.http.fetchWithRetry(detailUrl, {
        headers: this.http.buildHeaders(token),
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
        `Không tải được chi tiết hoá đơn ${shdon}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Tải file Excel bảng kê (export-excel) từ GDT cho một khoảng thời gian.
   * Gọi cả 2 API (query chuẩn + sco-query), lưu mỗi file hợp lệ về outputDir
   * với tên theo quy ước `{MST}-{ngayBatDau}-{ngayKetThuc}.xlsx`.
   *
   * @returns danh sách các file đã lưu (đường dẫn tuyệt đối)
   */
  async downloadInvoiceExcel(
    startDate: Date,
    endDate: Date,
    token: string,
    outputDir: string,
    companyTaxCode: string,
  ): Promise<string[]> {
    fs.mkdirSync(outputDir, { recursive: true });

    const fmt = (d: Date, endOfDay: boolean) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const time = endOfDay ? '23:59:59' : '00:00:00';
      return `${dd}/${mm}/${yyyy}T${time}`;
    };

    const startStr = fmt(startDate, false);
    const endStr = fmt(endDate, true);
    const searchStr =
      `tdlap=ge=${startStr};tdlap=le=${endStr}`;

    // Ngày theo quy ước tên file (dd-mm-yyyy)
    const fileStart =
      `${String(startDate.getDate()).padStart(2, '0')}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${startDate.getFullYear()}`;
    const fileEnd =
      `${String(endDate.getDate()).padStart(2, '0')}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${endDate.getFullYear()}`;
    const fileName =
      `${companyTaxCode}-${fileStart}-${fileEnd}.xlsx`;
    const filePath = path.join(outputDir, fileName);

    // Nếu đã có file hợp lệ → bỏ qua (idempotent)
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      this.logger.debug(`Excel report already exists: ${filePath}`);
      return [filePath];
    }

    const apiPaths = ['query', 'sco-query'];
    for (const apiPath of apiPaths) {
      const url =
        `${this.http.GDT_BASE}/${apiPath}/invoices/export-excel?sort=tdlap:desc&search=${encodeURIComponent(searchStr)}`;

      try {
        const response = await this.http.fetchWithRetry(url, {
          headers: this.http.buildHeaders(token),
          responseType: 'arraybuffer',
          timeout: 90000,
          validateStatus: () => true,
        }, 2, { retry5xx: false });

        if (response.status === 200 && response.data) {
          fs.writeFileSync(filePath, Buffer.from(response.data));
          this.logger.log(
            `Downloaded Excel report (${apiPath}): ${filePath}`,
          );
          return [filePath];
        }

        this.logger.warn(
          `GDT export-excel (${apiPath}) returned ${response.status} for range ${startStr}→${endStr}`,
        );
      } catch (error: any) {
        this.logger.warn(
          `Không tải được bảng kê Excel (${apiPath}) cho ${startStr}→${endStr}: ${error.message}`,
        );
      }
    }

    return [];
  }
}
