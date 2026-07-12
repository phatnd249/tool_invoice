import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import prisma from '../utils/db.js';
import { renderInvoiceTemplate } from '../templates/invoice-template.js';

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
   * Lấy đường dẫn tệp HTML cache của một invoice.
   */
  public getCachePath(invoiceId: string): string {
    return path.join(this.cacheDir, `${invoiceId}.html`);
  }

  /**
   * Lấy nội dung HTML preview của một invoice.
   *
   * @param invoiceId UUID của invoice trong DB
   * @returns Nội dung HTML hoặc null nếu không tìm thấy
   */
  public async getPreviewHtml(invoiceId: string): Promise<string | null> {
    // 1. Kiểm tra cache trước (vì nếu có HTML build từ JSON thì zipPath có thể bằng 'VIRTUAL_HTML')
    const cachePath = path.join(this.cacheDir, `${invoiceId}.html`);
    if (fs.existsSync(cachePath)) {
      return fs.readFileSync(cachePath, 'utf-8');
    }

    // 2. Query invoice từ DB
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || !invoice.zipPath) {
      return null;
    }

    // Nếu zipPath là VIRTUAL_HTML mà không có file cache thì lỗi
    if (invoice.zipPath === 'VIRTUAL_HTML') {
      return null;
    }

    // 3. Kiểm tra file ZIP có tồn tại trên disk không
    if (!fs.existsSync(invoice.zipPath)) {
      return null;
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
   * Sinh HTML từ dữ liệu JSON chi tiết của hoá đơn.
   */
  public buildHtmlFromJson(invoiceId: string, detail: any): string {
    const htmlContent = renderInvoiceTemplate(detail);

    // Lưu cache
    const cachePath = path.join(this.cacheDir, `${invoiceId}.html`);
    try {
      fs.writeFileSync(cachePath, htmlContent, 'utf-8');
    } catch (err: any) {
      console.warn(`[PreviewService] Failed to write generated HTML to cache: ${err.message}`);
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

      let htmlContent = zip.readAsText(htmlEntry, 'utf8');

      // Inline assets (JS, CSS, Images) into HTML so the frontend can render it perfectly
      entries.forEach(entry => {
        if (entry === htmlEntry || entry.isDirectory) return;

        const name = entry.entryName;
        const ext = name.split('.').pop()?.toLowerCase();

        // Prevent regex errors by escaping special characters in file names
        const escapedName = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

        if (ext === 'js' || ext === 'css' || ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '')) {
          const buffer = zip.readFile(entry);
          if (buffer) {
            const base64 = buffer.toString('base64');
            let mimeType = 'application/octet-stream';
            
            if (ext === 'js') mimeType = 'text/javascript';
            else if (ext === 'css') mimeType = 'text/css';
            else if (ext === 'svg') mimeType = 'image/svg+xml';
            else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
            else if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'gif') mimeType = 'image/gif';

            const dataUri = `data:${mimeType};base64,${base64}`;

            // Replace src="name", href="name", or url("name")
            htmlContent = htmlContent.replace(new RegExp(`src=["']?\\/?${escapedName}["']?`, 'g'), `src="${dataUri}"`);
            htmlContent = htmlContent.replace(new RegExp(`href=["']?\\/?${escapedName}["']?`, 'g'), `href="${dataUri}"`);
            // Only replace the url without adding !important to avoid !important !important syntax errors
            htmlContent = htmlContent.replace(new RegExp(`url\\(["']?\\/?${escapedName}["']?\\)`, 'g'), `url("${dataUri}")`);
          }
        }
      });

      // Inject the explicit background image from the images directory to ensure it is always present
      try {
        // Resolve bgPath by finding the 'images' folder in the root workspace
        // this.cacheDir is something like tool-invoice/backend/public/preview
        const bgPath = path.resolve(this.cacheDir, '../../../images/viewinvoice-bg.jpg');
        
        if (fs.existsSync(bgPath)) {
          const bgBase64 = fs.readFileSync(bgPath).toString('base64');
          const bgDataUri = `data:image/jpeg;base64,${bgBase64}`;
          const styleInjection = `
            <style>
              @media print {
                .main-page, .bg-container {
                  background-image: url("${bgDataUri}") !important;
                  background-color: transparent !important;
                  border: 3px double rgba(145, 87, 21, 0.69) !important;
                }
              }
              .main-page, .bg-container {
                background-image: url("${bgDataUri}") !important;
              }
            </style>
          `;
          htmlContent = htmlContent.replace('</head>', `${styleInjection}</head>`);
        } else {
          console.warn('[PreviewService] Background image not found at', bgPath);
        }
      } catch (err) {
        console.warn('[PreviewService] Failed to inject custom background:', err);
      }

      return htmlContent;
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
