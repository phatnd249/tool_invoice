import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { PreviewService } from '../services/preview.service.js';

const previewService = new PreviewService();

let browserInstance: any = null;

export async function generatePdfFromHtml(htmlContent: string, outputPath: string): Promise<void> {
  try {
    if (!browserInstance) {
      browserInstance = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }
    
    const page = await browserInstance.newPage();
    
    // Set viewport wide enough so it doesn't wrap lines unnecessarily
    await page.setViewport({ width: 1024, height: 1448 });
    
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '10mm',
        left: '10mm'
      }
    });

    await page.close();
  } catch (error) {
    console.error('Lỗi khi tạo PDF tĩnh:', error);
  }
}

// Function to close browser gracefully when app exits
export async function closePuppeteerBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
