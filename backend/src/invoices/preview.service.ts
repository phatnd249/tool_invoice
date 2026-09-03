import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { resolveInvoicePath } from '../common/invoice-utils';
import { renderInvoiceTemplate } from './templates/invoice-template';

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);
  private readonly cacheDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.cacheDir = path.join(process.cwd(), 'public', 'preview');
    fs.mkdirSync(this.cacheDir, { recursive: true });
  }

  /** Resolve absolute path từ relative path trong DB + INVOICES_DIR */
  private resolvePath(relativePath: string): string {
    const baseDir = this.config.get('INVOICES_DIR') || './invoices';
    return resolveInvoicePath(baseDir, relativePath);
  }

  /**
   * Trả về đường dẫn file HTML cache của một invoice.
   */
  getCachePath(invoiceId: string): string {
    return path.join(this.cacheDir, `${invoiceId}.html`);
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
      // Không có hồ sơ gốc (ZIP) → thử build HTML từ dữ liệu DB
      // (hoá đơn được tải fallback khi không có file ZIP).
      await this.buildPreviewHtml(invoiceId);
      const fallbackCache = path.join(this.cacheDir, `${invoiceId}.html`);
      if (fs.existsSync(fallbackCache)) {
        return fs.readFileSync(fallbackCache, 'utf-8');
      }
      throw new NotFoundException('Không tìm thấy file ZIP của hoá đơn');
    }

    const absoluteZipPath = this.resolvePath(invoice.zipPath);
    if (!fs.existsSync(absoluteZipPath)) {
      throw new NotFoundException('Không tìm thấy file ZIP trên ổ đĩa');
    }

    // 3. Giải nén ZIP, tìm HTML
    const htmlContent = this.extractHtmlFromZip(absoluteZipPath);
    if (!htmlContent) {
      throw new NotFoundException('Không tìm thấy file HTML trong ZIP');
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

      // Inject background image để PDF render đúng
      try {
        const bgPath = path.resolve(
          this.cacheDir,
          '../../../images/viewinvoice-bg.jpg',
        );

        if (fs.existsSync(bgPath)) {
          const bgBase64 = fs
            .readFileSync(bgPath)
            .toString('base64');
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
          htmlContent = htmlContent.replace(
            '</head>',
            `${styleInjection}</head>`,
          );
        } else {
          this.logger.warn(
            `Background image not found at ${bgPath}`,
          );
        }
      } catch (err: any) {
        this.logger.warn(
          { err: err.message },
          'Failed to inject custom background',
        );
      }

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

  // ─── HTML Preview từ dữ liệu DB (fallback khi không có ZIP) ──────────────

  /**
   * Sinh HTML preview hoá đơn từ dữ liệu đã lưu trong DB (invoice + items),
   * dùng khi hoá đơn không có file hồ sơ gốc (ZIP). Lưu HTML vào cache để
   * bước render PDF đọc được.
   *
   * @returns nội dung HTML
   */
  async buildPreviewHtml(invoiceId: string): Promise<string> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });

    if (!invoice) {
      throw new NotFoundException('Không tìm thấy hoá đơn');
    }

    // Map dữ liệu chuẩn hoá trong DB sang cấu trúc detail của GDT để
    // template hoá đơn chuẩn (`renderInvoiceTemplate`) render đúng mẫu.
    const detail = this.mapInvoiceToDetail(invoice);
    const htmlContent = renderInvoiceTemplate(detail);
    const cachePath = path.join(this.cacheDir, `${invoiceId}.html`);

    try {
      fs.writeFileSync(cachePath, htmlContent, 'utf-8');
    } catch (err: any) {
      this.logger.warn(
        `Failed to write generated HTML to cache: ${err.message}`,
      );
    }

    return htmlContent;
  }

  /**
   * Map invoice + items (dạng DB chuẩn hoá) sang cấu trúc detail JSON.
   */
  private mapInvoiceToDetail(invoice: any): Record<string, any> {
    const items = (invoice.items || []).map((it: any) => ({
      ten: it.name || '',
      thdon: it.name || '',
      dvtinh: it.unit || '',
      sluong: it.quantity != null ? String(it.quantity) : '',
      dgia: it.price ?? 0,
      thtien: it.amount ?? 0,
      tsuat: it.taxRate || '',
    }));

    const buyerName =
      invoice.buyerName || invoice.buyerTaxCode || '';

    return {
      khmshdon: invoice.templateSymbol,
      khhdon: invoice.invoiceSymbol,
      shdon: invoice.invoiceNumber,
      tdlap: invoice.invoiceDate
        ? new Date(invoice.invoiceDate).toISOString()
        : '',
      thdon: 'HÓA ĐƠN GIÁ TRỊ GIA TĂNG',
      mccqt: '',

      nbmst: invoice.sellerTaxCode,
      nbten: invoice.sellerName || '',
      nbdchi: '',
      nbstk: '',

      nmmst: invoice.buyerTaxCode || '',
      nmten: buyerName,
      nmuaten: buyerName,
      nmtnmua: buyerName,
      nmdchi: '',
      nmuadchi: '',
      htttoan: '',

      cttkhac: items,
      tgtcthue: invoice.totalBeforeTax ?? 0,
      tgtthue: invoice.taxAmount ?? 0,
      tgtttbso: invoice.totalAmount ?? 0,
    };
  }
}
