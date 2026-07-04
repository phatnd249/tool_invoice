import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export class DownloaderService {
  /**
   * Decode JWT token to get MST (Tax Identification Number)
   */
  public getMstFromToken(token: string): string | null {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadB64 = parts[1];
        const buffer = Buffer.from(payloadB64, 'base64');
        const payload = JSON.parse(buffer.toString('utf-8'));
        
        const mst = payload.username || payload.mst || payload.sub;
        if (mst) {
          return String(mst).replace(/[^a-zA-Z0-9-]/g, '');
        }
      }
    } catch (error) {
      console.error('[DownloaderService] Error decoding token JWT:', error);
    }
    return null;
  }

  /**
   * Split date range into chunks of max 28 days to prevent Tax Authority API errors
   */
  public splitDateRange(startDate: Date, endDate: Date): Array<{ start: Date; end: Date }> {
    const chunks: Array<{ start: Date; end: Date }> = [];
    let currentStart = new Date(startDate.getTime());

    while (currentStart <= endDate) {
      // 27 days added (inclusive of currentStart makes a 28-day window)
      const currentEnd = new Date(currentStart.getTime());
      currentEnd.setDate(currentEnd.getDate() + 27);
      
      const actualEnd = currentEnd > endDate ? new Date(endDate.getTime()) : currentEnd;
      chunks.push({ start: new Date(currentStart), end: new Date(actualEnd) });

      currentStart = new Date(actualEnd.getTime());
      currentStart.setDate(currentStart.getDate() + 1);
    }
    
    return chunks;
  }

  /**
   * Query invoices from GDT Portal
   * @param type "BUY" or "SELL"
   */
  public async queryInvoicesInRange(
    startDate: Date,
    endDate: Date,
    token: string,
    type: 'BUY' | 'SELL'
  ): Promise<any[]> {
    const formatGdtDate = (d: Date, endOfDay: boolean) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const time = endOfDay ? 'T23:59:59' : 'T00:00:00';
      return `${dd}/${mm}/${yyyy}${time}`;
    };

    const startStr = formatGdtDate(startDate, false);
    const endStr = formatGdtDate(endDate, true);

    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    };

    // Determine correct endpoint based on BUY (purchase) or SELL (sold)
    const apiPath = type === 'BUY' ? 'purchase' : 'sold';
    const baseUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/${apiPath}`;
    
    // Step 1: Send query with size=1 to find total matching records
    const urlCount = `${baseUrl}?sort=tdlap:desc&size=1&search=tdlap=ge=${startStr};tdlap=le=${endStr}`;
    
    try {
      console.log(`[DownloaderService] Querying count from ${startStr} to ${endStr}...`);
      const response = await axios.get(urlCount, { headers, timeout: 20000 });
      
      if (response.status === 401) {
        throw new Error('Unauthorized GDT Token (401)');
      }
      
      const total = response.data?.total || 0;
      console.log(`[DownloaderService] Found ${total} invoices in GDT.`);
      if (total === 0) return [];

      // Step 2: Query again to retrieve all details
      const urlAll = `${baseUrl}?sort=tdlap:desc&size=${total}&search=tdlap=ge=${startStr};tdlap=le=${endStr}`;
      const responseAll = await axios.get(urlAll, { headers, timeout: 30000 });
      
      return responseAll.data?.datas || [];
    } catch (error: any) {
      console.error('[DownloaderService] Error querying GDT invoices:', error.message);
      throw error;
    }
  }

  /**
   * Download the XML/ZIP file for a specific invoice
   */
  public async downloadInvoiceZip(
    invoice: any,
    token: string,
    outputDir: string
  ): Promise<string | null> {
    const nbmst = invoice.nbmst;         // Seller tax code
    const khmshdon = invoice.khmshdon;   // Invoice template symbol
    const khhdon = invoice.khhdon;       // Invoice symbol
    const shdon = invoice.shdon;         // Invoice number
    const mhdon = invoice.mhdon;         // Tax Authority Code (MCCQT/hash)

    let zipFileName = '';
    if (mhdon) {
      zipFileName = `${mhdon}.zip`;
    } else if (nbmst && khhdon && shdon !== undefined && khmshdon !== undefined) {
      zipFileName = `${nbmst}_${khmshdon}_${khhdon}_${shdon}.zip`;
    } else {
      console.warn(`[DownloaderService] Missing fields to construct zip name for ID: ${invoice.id}`);
      return null;
    }

    const zipPath = path.join(outputDir, zipFileName);

    // Skip if already downloaded and not empty
    if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) {
      return zipPath;
    }

    const exportUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/export-xml?nbmst=${nbmst}&khhdon=${khhdon}&shdon=${shdon}&khmshdon=${khmshdon}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    try {
      // Ensure directory exists
      fs.mkdirSync(outputDir, { recursive: true });

      const response = await axios.get(exportUrl, {
        headers,
        responseType: 'arraybuffer',
        timeout: 20000,
      });

      if (response.status === 200) {
        fs.writeFileSync(zipPath, response.data);
        return zipPath;
      }
      return null;
    } catch (error: any) {
      console.error(`[DownloaderService] Failed to download ZIP for invoice ${shdon}: ${error.message}`);
      return null;
    }
  }

  /**
   * Download Excel report for a date range from GDT portal.
   * Returns path to saved .xlsx file, or null on failure.
   */
  public async downloadExcelReport(
    startDate: Date,
    endDate: Date,
    token: string,
    type: 'BUY' | 'SELL',
    outputDir: string
  ): Promise<string | null> {
    const formatGdtDate = (d: Date, endOfDay: boolean) => {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const time = endOfDay ? 'T23:59:59' : 'T00:00:00';
      return `${dd}/${mm}/${yyyy}${time}`;
    };

    const startStr = formatGdtDate(startDate, false);
    const endStr = formatGdtDate(endDate, true);

    // GDT export-excel uses a single endpoint (no sold/purchase distinction unlike query)
    const url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/export-excel?sort=tdlap:desc&search=tdlap=ge=${startStr};tdlap=le=${endStr}`;

    const headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'vi',
    };

    const dateLabel = `${startStr.replace(/[/:]/g, '-')}_to_${endStr.replace(/[/:]/g, '-')}`;
    const fileName = `invoices_${type}_${dateLabel}.xlsx`;
    const filePath = path.join(outputDir, fileName);

    // Skip if already downloaded
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      console.log(`[DownloaderService] Excel report already exists: ${filePath}`);
      return filePath;
    }

    try {
      fs.mkdirSync(outputDir, { recursive: true });

      const response = await axios.get(url, {
        headers,
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      if (response.status === 200) {
        fs.writeFileSync(filePath, response.data);
        console.log(`[DownloaderService] Downloaded Excel report: ${filePath}`);
        return filePath;
      }
      return null;
    } catch (error: any) {
      console.error(`[DownloaderService] Failed to download Excel report: ${error.message}`);
      return null;
    }
  }
}
