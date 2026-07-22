// backend/src/services/pdf-generation.service.ts
// Service chịu trách nhiệm tạo file PDF từ invoice.
// Tự động chọn engine: Electron IPC (nếu chạy trong app) hoặc Puppeteer (nếu chạy server).

import * as path from 'path';
import * as fs from 'fs';
import { PreviewService } from './preview.service.js';
import { generatePdfViaElectron } from '../utils/electron-ipc.js';
import { createLogger } from '../logger/index.js';
import { getPdfFileNameFromInv } from '../utils/path-resolver.js';
import { getVersionedFilePath, removeAllRelatedFiles } from '../utils/file-version.js';
import { invoicePersistenceService } from './invoice-persistence.service.js';

const log = createLogger('PdfGenerationService');
const previewService = new PreviewService();

export class PdfGenerationService {
  /**
   * Tạo PDF từ ZIP đã tải xuống.
   * 1. Lấy HTML preview từ ZIP (qua PreviewService)
   * 2. Render HTML -> PDF
   * 3. Cập nhật pdfPath trong DB
   *
   * @returns pdfPath hoặc null nếu thất bại
   */
  async generateFromZip(
    invoiceId: string,
    zipPath: string,
    targetDir: string,
    overwriteMode?: 'SKIP' | 'OVERWRITE' | 'NEW_VERSION',
    version?: number,
  ): Promise<string | null> {
    try {
      const html = await previewService.getPreviewHtml(invoiceId);
      if (!html) {
        log.warn({ invoiceId }, 'Không thể lấy HTML preview từ ZIP');
        return null;
      }

      const pdfFileName = path.basename(zipPath, '.zip') + '.pdf';
      let pdfPath = path.join(targetDir, pdfFileName);

      // Điều chỉnh đường dẫn PDF theo overwriteMode
      if (overwriteMode === 'OVERWRITE') {
        // Xoá PDF cũ nếu tồn tại
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      } else if (overwriteMode === 'NEW_VERSION' && version && version > 0) {
        // Dùng version đồng bộ với ZIP
        pdfPath = getVersionedFilePath(pdfPath, version);
      } else {
        // SKIP: kiểm tra nếu PDF đã tồn tại thì không tạo lại
        if (fs.existsSync(pdfPath)) {
          log.info({ pdfPath }, 'PDF đã tồn tại, bỏ qua (SKIP mode)');
          return pdfPath;
        }
      }

      const cacheHtmlPath = previewService.getCachePath(invoiceId);

      log.info({ invoiceId, pdfFileName, pdfPath }, 'Đang tạo PDF từ ZIP...');
      await this._renderHtmlToPdf(cacheHtmlPath, pdfPath);

      await invoicePersistenceService.updatePdfPath(invoiceId, pdfPath);
      log.info({ invoiceId, pdfPath }, 'PDF đã tạo thành công từ ZIP');
      return pdfPath;
    } catch (err: any) {
      log.error({ err, invoiceId }, 'Lỗi tạo PDF từ ZIP');
      return null;
    }
  }

  /**
   * Tạo PDF từ GDT detail API (fallback khi không có ZIP).
   * 1. Build HTML từ JSON template
   * 2. Render HTML -> PDF
   * 3. Cập nhật pdfPath trong DB
   *
   * @returns pdfPath hoặc null nếu thất bại
   */
  async generateFromDetail(
    invoiceId: string,
    detailJson: Record<string, any>,
    inv: Record<string, any>,
    targetDir: string,
    companyTaxCode?: string,
    overwriteMode?: 'SKIP' | 'OVERWRITE' | 'NEW_VERSION',
    version?: number,
  ): Promise<string | null> {
    try {
      // Build HTML từ JSON
      previewService.buildHtmlFromJson(invoiceId, detailJson);

      const html = await previewService.getPreviewHtml(invoiceId);
      if (!html) {
        log.warn({ invoiceId }, 'Không thể build HTML từ detail JSON');
        return null;
      }

      const taxCode = companyTaxCode || inv.nbmst || 'UNKNOWN';
      let pdfFileName = getPdfFileNameFromInv(taxCode, inv);
      let pdfPath = path.join(targetDir, pdfFileName);

      // Điều chỉnh đường dẫn PDF theo overwriteMode
      if (overwriteMode === 'OVERWRITE') {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      } else if (overwriteMode === 'NEW_VERSION' && version && version > 0) {
        pdfPath = getVersionedFilePath(pdfPath, version);
      } else {
        // SKIP: nếu PDF đã tồn tại thì không tạo lại
        if (fs.existsSync(pdfPath)) {
          log.info({ pdfPath }, 'PDF đã tồn tại, bỏ qua (SKIP mode)');
          return pdfPath;
        }
      }

      const cacheHtmlPath = previewService.getCachePath(invoiceId);

      log.info({ invoiceId, pdfFileName, pdfPath }, 'Đang tạo PDF từ detail API (fallback)...');
      await this._renderHtmlToPdf(cacheHtmlPath, pdfPath);

      await invoicePersistenceService.updatePdfPath(invoiceId, pdfPath);
      log.info({ invoiceId, pdfPath }, 'PDF fallback đã tạo thành công');
      return pdfPath;
    } catch (err: any) {
      log.error({ err, invoiceId }, 'Lỗi tạo PDF fallback từ detail');
      return null;
    }
  }

  /**
   * Render HTML -> PDF, tự động chọn engine.
   * - Nếu chạy trong Electron (process.send tồn tại) -> dùng Electron IPC
   * - Nếu chạy server -> dùng Puppeteer headless
   */
  private async _renderHtmlToPdf(
    htmlPath: string,
    pdfPath: string,
  ): Promise<void> {
    // Tạo thư mục đích nếu chưa có
    const pdfDir = path.dirname(pdfPath);
    fs.mkdirSync(pdfDir, { recursive: true });

    if (typeof process.send === 'function') {
      log.debug({ htmlPath, pdfPath }, 'Dùng Electron IPC để render PDF');
      await generatePdfViaElectron(htmlPath, pdfPath);
    } else {
      log.debug({ htmlPath, pdfPath }, 'Dùng Puppeteer để render PDF');
      const { puppeteerService } = await import('./puppeteer.service.js');
      await puppeteerService.generatePdf(htmlPath, pdfPath);
    }
  }
}

// Singleton export
export const pdfGenerationService = new PdfGenerationService();
