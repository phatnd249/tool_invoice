import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);
  private readonly cacheDir: string;

  constructor(private readonly prisma: PrismaService) {
    this.cacheDir = path.join(process.cwd(), 'public', 'preview');
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  /**
   * Lấy nội dung HTML preview của một invoice.
   * Ưu tiên cache, nếu chưa có thì giải nén từ ZIP và lưu cache.
   */
  async getPreviewHtml(invoiceId: string): Promise<string> {
    // 1. Kiểm tra cache
    const cachePath = path.join(this.cacheDir, `${invoiceId}.html`);
    if (fs.existsSync(cachePath)) {
      return fs.readFileSync(cachePath, 'utf-8');
    }

    // 2. Lấy invoice từ DB
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || !invoice.zipPath) {
      throw new NotFoundException('Invoice ZIP file not found');
    }

    if (!fs.existsSync(invoice.zipPath)) {
      throw new NotFoundException('ZIP file not found on disk');
    }

    // 3. Giải nén ZIP, tìm HTML
    const htmlContent = this.extractHtmlFromZip(invoice.zipPath);
    if (!htmlContent) {
      throw new NotFoundException('No HTML file found in ZIP');
    }

    // 4. Lưu cache
    try {
      fs.writeFileSync(cachePath, htmlContent, 'utf-8');
    } catch (err: any) {
      this.logger.warn(`Failed to write cache file: ${err.message}`);
    }

    return htmlContent;
  }

  /**
   * Giải nén ZIP, tìm file HTML đầu tiên, inline tất cả assets.
   */
  private extractHtmlFromZip(zipPath: string): string | null {
    try {
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      const htmlEntry = entries.find((entry) =>
        entry.entryName.toLowerCase().endsWith('.html'),
      );

      if (!htmlEntry) {
        this.logger.warn(`No HTML file found in ${zipPath}`);
        return null;
      }

      let htmlContent = zip.readAsText(htmlEntry, 'utf8');

      // Inline tất cả assets (JS, CSS, ảnh) vào HTML
      entries.forEach((entry) => {
        if (entry === htmlEntry || entry.isDirectory) return;

        const name = entry.entryName;
        const ext = name.split('.').pop()?.toLowerCase();

        if (
          ext &&
          ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)
        ) {
          const buffer = zip.readFile(entry);
          if (buffer) {
            const base64 = buffer.toString('base64');
            let mimeType = 'application/octet-stream';

            if (ext === 'js') mimeType = 'text/javascript';
            else if (ext === 'css') mimeType = 'text/css';
            else if (ext === 'svg') mimeType = 'image/svg+xml';
            else if (ext === 'jpg' || ext === 'jpeg')
              mimeType = 'image/jpeg';
            else if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'gif') mimeType = 'image/gif';

            const dataUri = `data:${mimeType};base64,${base64}`;

            // Escape tên file để dùng trong regex
            const escapedName = name.replace(
              /[-[\]{}()*+?.,\\^$|#\s]/g,
              '\\$&',
            );

            htmlContent = htmlContent.replace(
              new RegExp(`src=["']?\\/?${escapedName}["']?`, 'g'),
              `src="${dataUri}"`,
            );
            htmlContent = htmlContent.replace(
              new RegExp(`href=["']?\\/?${escapedName}["']?`, 'g'),
              `href="${dataUri}"`,
            );
            htmlContent = htmlContent.replace(
              new RegExp(`url\\(["']?\\/?${escapedName}["']?\\)`, 'g'),
              `url("${dataUri}")`,
            );
          }
        }
      });

      return htmlContent;
    } catch (error: any) {
      this.logger.error(
        `Error extracting HTML from ZIP: ${error.message}`,
      );
      return null;
    }
  }

  /** Xoá cache của một invoice */
  clearCache(invoiceId: string): void {
    const cachePath = path.join(this.cacheDir, `${invoiceId}.html`);
    try {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to clear cache: ${err.message}`);
    }
  }
}
