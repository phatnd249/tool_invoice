import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { resolveInvoicePath } from '../common/invoice-utils';

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
      throw new NotFoundException('Invoice ZIP file not found');
    }

    const absoluteZipPath = this.resolvePath(invoice.zipPath);
    if (!fs.existsSync(absoluteZipPath)) {
      throw new NotFoundException('ZIP file not found on disk');
    }

    // 3. Giải nén ZIP, tìm HTML
    const htmlContent = this.extractHtmlFromZip(absoluteZipPath);
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
      throw new NotFoundException('Invoice not found');
    }

    const htmlContent = this.renderInvoiceHtml(invoice);
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
   * Render HTML hoá đơn từ dữ liệu invoice đã chuẩn hoá trong DB.
   */
  private renderInvoiceHtml(invoice: any): string {
    const fmt = (v: any) =>
      v == null || isNaN(v) ? '0' : new Intl.NumberFormat('vi-VN').format(v);
    const fmtDate = (d: any) =>
      d ? new Date(d).toLocaleDateString('vi-VN') : '—';

    const typeLabel = invoice.type === 'SELL' ? 'Bán ra' : 'Mua vào';

    const items = (invoice.items || []).map((it: any, i: number) => {
      const qty =
        it.quantity != null ? new Intl.NumberFormat('vi-VN').format(it.quantity) : '';
      const price =
        it.price != null ? new Intl.NumberFormat('vi-VN').format(it.price) : '';
      return `
        <tr>
          <td class="tx-center">${i + 1}</td>
          <td class="tx-left">${this.escapeHtml(String(it.name || ''))}</td>
          <td class="tx-center">${this.escapeHtml(String(it.unit || ''))}</td>
          <td class="tx-center">${qty}</td>
          <td class="tx-right">${price}</td>
          <td class="tx-center">${this.escapeHtml(String(it.taxRate || ''))}</td>
          <td class="tx-right">${fmt(it.amount)}</td>
        </tr>`;
    }).join('');

    const totalBeforeTax = invoice.totalBeforeTax ?? 0;
    const totalTax = invoice.taxAmount ?? 0;
    const totalAmount = invoice.totalAmount ?? 0;

    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hoá đơn ${this.escapeHtml(String(invoice.invoiceNumber ?? ''))}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", serif;
    margin: 0 auto;
    padding: 0;
    font-size: 13pt;
    color: #000;
  }
  .page {
    width: 210mm;
    margin: 0 auto;
    padding: 20px;
  }
  .header {
    text-align: center;
    border-bottom: 1px solid #000;
    padding-bottom: 8px;
  }
  .title {
    font-size: 16pt;
    font-weight: bold;
    text-transform: uppercase;
    margin: 6px 0;
  }
  .subtitle {
    font-size: 11pt;
    color: #333;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 11pt;
    margin: 8px 0;
  }
  .party {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 10px 0;
    font-size: 12pt;
  }
  .party .col { flex: 1; }
  .label { font-weight: bold; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0;
    font-size: 11pt;
  }
  th, td {
    border: 1px solid #000;
    padding: 4px 6px;
  }
  th { text-align: center; background: #f1f1f1; }
  .tx-left { text-align: left; }
  .tx-right { text-align: right; }
  .tx-center { text-align: center; }
  .total { font-size: 12pt; }
  .total td { border: none; padding: 2px 6px; }
  .words { margin-top: 8px; font-size: 12pt; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="title">HOÁ ĐƠN ${this.escapeHtml(typeLabel)}</div>
      <div class="subtitle">${this.escapeHtml(String(invoice.invoiceNumber || ''))}</div>
      <div class="meta">
        <div>Mẫu số: ${this.escapeHtml(String(invoice.templateSymbol || ''))}</div>
        <div>Ký hiệu: ${this.escapeHtml(String(invoice.invoiceSymbol || ''))}</div>
        <div>Ngày: ${fmtDate(invoice.invoiceDate)}</div>
      </div>
    </div>

    <div class="party">
      <div class="col">
        <div class="label">Người bán:</div>
        <div>${this.escapeHtml(String(invoice.sellerName || '—'))}</div>
        <div>MST: ${this.escapeHtml(String(invoice.sellerTaxCode || ''))}</div>
      </div>
      <div class="col">
        <div class="label">Người mua:</div>
        <div>${this.escapeHtml(String(invoice.buyerName || '—'))}</div>
        <div>MST: ${this.escapeHtml(String(invoice.buyerTaxCode || '—'))}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:32px">STT</th>
          <th>Tên hàng hoá, dịch vụ</th>
          <th style="width:64px">ĐVT</th>
          <th style="width:72px">Số lượng</th>
          <th style="width:96px">Đơn giá</th>
          <th style="width:72px">Thuế suất</th>
          <th style="width:112px">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${items || '<tr><td colspan="7" class="tx-center">Không có dữ liệu hàng hoá</td></tr>'}
      </tbody>
    </table>

    <table class="total">
      <tr><td class="tx-left">Tổng cộng tiền trước thuế:</td><td class="tx-right">${fmt(totalBeforeTax)}</td></tr>
      <tr><td class="tx-left">Tổng tiền thuế:</td><td class="tx-right">${fmt(totalTax)}</td></tr>
      <tr><td class="tx-left"><b>Tổng tiền thanh toán:</b></td><td class="tx-right"><b>${fmt(totalAmount)}</b></td></tr>
    </table>

    ${invoice.totalAmountInWords
      ? `<div class="words">Bằng chữ: ${this.escapeHtml(String(invoice.totalAmountInWords))}</div>`
      : ''}
  </div>
</body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
