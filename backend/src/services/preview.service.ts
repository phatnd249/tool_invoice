import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../utils/db.js';

/**
 * Service xử lý preview hoá đơn (file HTML từ ZIP).
 *
 * File HTML được giải nén một lần và cache vào thư mục
 * backend/public/preview/{invoiceId}.html để tải nhanh ở những lần sau.
 */
export class PreviewService {
  /** Thư mục cache file preview (nằm trong public/ để có thể serve static nếu cần) */
  private readonly cacheDir: string;

  constructor() {
    // Resolve backend root:
    //   - Khi bundled (CJS):   __dirname có sẵn
    //   - Khi chạy tsx (ESM):  process.argv[1] trỏ đến file entry
    let baseDir: string;
    if (typeof __dirname !== 'undefined') {
      baseDir = __dirname; // src/services/ hoặc dist/
    } else {
      baseDir = path.dirname(path.resolve(process.argv[1]));
    }
    const backendRoot = path.resolve(baseDir, '..');
    this.cacheDir = path.join(backendRoot, 'public', 'preview');
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  /**
   * Lấy nội dung HTML preview của một invoice.
   *
   * @param invoiceId UUID của invoice trong DB
   * @returns Nội dung HTML hoặc null nếu không tìm thấy
   */
  public async getPreviewHtml(invoiceId: string): Promise<string | null> {
    // 1. Query invoice từ DB
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || !invoice.zipPath) {
      return null;
    }

    // 2. Kiểm tra file ZIP có tồn tại trên disk không
    if (!fs.existsSync(invoice.zipPath)) {
      return null;
    }

    // 3. Kiểm tra cache
    const cachePath = path.join(this.cacheDir, `${invoiceId}.html`);
    if (fs.existsSync(cachePath)) {
      return fs.readFileSync(cachePath, 'utf-8');
    }

    // 4. Giải nén ZIP, tìm file HTML
    const htmlContent = this.extractHtmlFromZip(invoice.zipPath);
    if (!htmlContent) {
      return null;
    }

    // 5. Lưu cache
    try {
      fs.writeFileSync(cachePath, htmlContent, 'utf-8');
    } catch (err: any) {
      console.warn(`[PreviewService] Failed to write cache file: ${err.message}`);
    }

    return htmlContent;
  }

  /**
   * Giải nén file ZIP và tìm nội dung file HTML đầu tiên.
   *
   * @param zipPath Đường dẫn file ZIP
   * @returns Nội dung file HTML hoặc null nếu không tìm thấy
   */
  public extractHtmlFromZip(zipPath: string): string | null {
    try {
      if (!fs.existsSync(zipPath)) {
        console.warn(`[PreviewService] ZIP file not found: ${zipPath}`);
        return null;
      }

      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      // Tìm entry kết thúc bằng .html (không phân biệt hoa/thường)
      const htmlEntry = entries.find(entry =>
        entry.entryName.toLowerCase().endsWith('.html')
      );

      if (!htmlEntry) {
        console.warn(`[PreviewService] No HTML file found in ZIP: ${zipPath}`);
        return null;
      }

      return zip.readAsText(htmlEntry, 'utf8');
    } catch (error: any) {
      console.error(`[PreviewService] Error extracting HTML from ZIP: ${error.message}`);
      return null;
    }
  }

  /**
   * Xoá cache preview của một invoice (khi ZIP thay đổi hoặc invoice bị xoá).
   */
  public clearCache(invoiceId: string): void {
    const cachePath = path.join(this.cacheDir, `${invoiceId}.html`);
    try {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch (err: any) {
      console.warn(`[PreviewService] Failed to clear cache: ${err.message}`);
    }
  }
}
