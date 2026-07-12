import puppeteer, { Browser } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

export class PuppeteerService {
  private browser: Browser | null = null;
  private browserLaunchPromise: Promise<Browser> | null = null;

  /**
   * Khởi tạo trình duyệt ẩn (chỉ chạy một instance duy nhất để tiết kiệm RAM)
   */
  private async getBrowser(): Promise<Browser> {
    if (this.browser) return this.browser;
    if (this.browserLaunchPromise) return this.browserLaunchPromise;

    console.log('[PuppeteerService] Khởi tạo trình duyệt Chromium ẩn...');
    this.browserLaunchPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }).then(browser => {
      this.browser = browser;
      this.browserLaunchPromise = null;
      return browser;
    }).catch(err => {
      this.browserLaunchPromise = null;
      throw err;
    });

    return this.browserLaunchPromise;
  }

  /**
   * Đọc file HTML từ đĩa và render ra PDF
   * @param htmlPath Đường dẫn file HTML cần convert
   * @param pdfPath Đường dẫn file PDF đích
   */
  public async generatePdf(htmlPath: string, pdfPath: string): Promise<void> {
    if (!fs.existsSync(htmlPath)) {
      throw new Error(`File HTML không tồn tại: ${htmlPath}`);
    }

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Đọc nội dung HTML thay vì load file URL để kiểm soát tốt hơn
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');

      // Bắt buộc render như màn hình (screen) thay vì chế độ in (print) để giữ nguyên định dạng gốc
      await page.emulateMediaType('screen');
      
      // Đặt viewport đủ rộng để HTML không bị co bóp
      await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });

      // Set content và đợi load xong (bao gồm network idle cho ảnh/font)
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Tạo thư mục chứa file PDF nếu chưa có
      const pdfDir = path.dirname(pdfPath);
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
      }

      // Xuất PDF
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0mm',
          bottom: '0mm',
          left: '0mm',
          right: '0mm'
        }
      });
    } finally {
      await page.close();
    }
  }

  /**
   * Đóng trình duyệt khi server tắt hoặc không còn dùng nữa
   */
  public async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const puppeteerService = new PuppeteerService();
