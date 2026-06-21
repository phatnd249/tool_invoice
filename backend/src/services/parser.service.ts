import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';

export interface ParsedInvoiceItem {
  lineNumber?: string;
  name: string;
  unit?: string;
  quantity?: number;
  price?: number;
  amount: number;
  taxRate?: string;
}

export interface ParsedInvoice {
  xmlFile: string;
  version?: string;
  invoiceName?: string;
  templateSymbol: string;
  invoiceSymbol: string;
  invoiceNumber: string;
  invoiceDate: Date;
  currency: string;
  exchangeRate: number;
  paymentMethod?: string;
  gdtProviderTaxCode?: string;
  taxAuthorityCode?: string;
  lookupCode?: string;

  // Seller info
  sellerName: string;
  sellerTaxCode: string;
  sellerAddress?: string;
  sellerPhone?: string;

  // Buyer info
  buyerName: string;
  buyerTaxCode: string;
  buyerAddress?: string;
  buyerCustomerId?: string;

  // Financial summary
  totalBeforeTax: number;
  taxAmount: number;
  totalAmount: number;
  totalAmountInWords?: string;

  pdfPath?: string;
  zipPath?: string;

  items: ParsedInvoiceItem[];
}

export class ParserService {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true, // Strips namespace prefixes like "inv:", "ds:", etc.
    });
  }

  /**
   * Helper to safely get nested values or search for tag key case-insensitively
   */
  private getNestedValue(obj: any, keys: string[]): any {
    let current = obj;
    for (const key of keys) {
      if (!current) return undefined;
      // Exact match
      if (current[key] !== undefined) {
        current = current[key];
      } else {
        // Case insensitive match
        const foundKey = Object.keys(current).find(k => k.toLowerCase() === key.toLowerCase());
        if (foundKey) {
          current = current[foundKey];
        } else {
          return undefined;
        }
      }
    }
    return current;
  }

  /**
   * Helper to safely extract text from tag even if it has attributes
   */
  private getSafeText(val: any): string {
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') {
      if (val['#text'] !== undefined) {
        return String(val['#text']).trim();
      }
      return '';
    }
    return String(val).trim();
  }

  /**
   * Safe conversion of string or object with text to number
   */
  private toNumber(val: any): number {
    if (val === undefined || val === null) return 0;
    let actualVal = val;
    if (typeof val === 'object') {
      if (val['#text'] !== undefined) {
        actualVal = val['#text'];
      } else {
        return 0;
      }
    }
    if (typeof actualVal === 'number') return actualVal;
    const cleanStr = String(actualVal).replace(/,/g, '').trim();
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Parse XML content string
   */
  public parseXmlContent(xmlContent: string, xmlFileName: string): ParsedInvoice {
    const jsonObj = this.parser.parse(xmlContent);
    
    // In some XML formats, HDon is the root, inside it is DLHDon
    const rootKey = Object.keys(jsonObj)[0];
    const root = jsonObj[rootKey] || jsonObj;
    
    const dlHDon = this.getNestedValue(root, ['DLHDon']) || root;
    const ttChung = this.getNestedValue(dlHDon, ['TTChung']);
    const nBan = this.getNestedValue(dlHDon, ['NBan']);
    const nMua = this.getNestedValue(dlHDon, ['NMua']);
    const tToan = this.getNestedValue(dlHDon, ['TToan']);
    const dshhdVu = this.getNestedValue(dlHDon, ['DSHHDVu']);
    
    // Extract items list
    const items: ParsedInvoiceItem[] = [];
    if (dshhdVu) {
      // It can be a single item or array of items
      let hhdVuList = dshhdVu.HHDVu;
      if (hhdVuList) {
        if (!Array.isArray(hhdVuList)) {
          hhdVuList = [hhdVuList];
        }
        for (const item of hhdVuList) {
          items.push({
            lineNumber: this.getSafeText(item.STT) || undefined,
            name: this.getSafeText(item.THHDVu),
            unit: item.DVTinh ? this.getSafeText(item.DVTinh) : undefined,
            quantity: item.SLuong !== undefined ? this.toNumber(item.SLuong) : undefined,
            price: item.DGia !== undefined ? this.toNumber(item.DGia) : undefined,
            amount: this.toNumber(item.ThTien),
            taxRate: item.TSuat ? this.getSafeText(item.TSuat) : undefined,
          });
        }
      }
    }

    // Try finding "MaTraCuu" in TTKhac -> TTin
    let lookupCode = '';
    const ttKhac = this.getNestedValue(dlHDon, ['TTKhac']);
    if (ttKhac && ttKhac.TTin) {
      let ttinList = ttKhac.TTin;
      if (!Array.isArray(ttinList)) {
        ttinList = [ttinList];
      }
      for (const ttin of ttinList) {
        if (this.getSafeText(ttin.TTruong) === 'MaTraCuu') {
          lookupCode = this.getSafeText(ttin.DLieu);
          break;
        }
      }
    }

    // Try parsing date (e.g. 2026-05-09T08:30:15 or 2026-05-09)
    const nlapStr = this.getSafeText(this.getNestedValue(ttChung, ['NLap'])) || '';
    let invoiceDate = new Date();
    if (nlapStr) {
      const parsedDate = Date.parse(nlapStr);
      if (!isNaN(parsedDate)) {
        invoiceDate = new Date(parsedDate);
      }
    }

    return {
      xmlFile: xmlFileName,
      version: this.getSafeText(this.getNestedValue(ttChung, ['PBan'])) || undefined,
      invoiceName: this.getSafeText(this.getNestedValue(ttChung, ['THDon'])) || undefined,
      templateSymbol: this.getSafeText(this.getNestedValue(ttChung, ['KHMSHDon'])),
      invoiceSymbol: this.getSafeText(this.getNestedValue(ttChung, ['KHHDon'])),
      invoiceNumber: this.getSafeText(this.getNestedValue(ttChung, ['SHDon'])),
      invoiceDate,
      currency: this.getSafeText(this.getNestedValue(ttChung, ['DVTTe']) || 'VND'),
      exchangeRate: this.toNumber(this.getNestedValue(ttChung, ['TGia']) || 1),
      paymentMethod: this.getSafeText(this.getNestedValue(ttChung, ['HTTToan'])) || undefined,
      gdtProviderTaxCode: this.getSafeText(this.getNestedValue(ttChung, ['MSTTCGP'])) || undefined,
      taxAuthorityCode: this.getSafeText(this.getNestedValue(root, ['MCCQT'])) || undefined,
      lookupCode: lookupCode || undefined,

      // Seller
      sellerName: this.getSafeText(this.getNestedValue(nBan, ['Ten'])),
      sellerTaxCode: this.getSafeText(this.getNestedValue(nBan, ['MST'])),
      sellerAddress: this.getSafeText(this.getNestedValue(nBan, ['DChi'])) || undefined,
      sellerPhone: this.getSafeText(this.getNestedValue(nBan, ['SDThoai'])) || undefined,

      // Buyer
      buyerName: this.getSafeText(this.getNestedValue(nMua, ['Ten'])),
      buyerTaxCode: this.getSafeText(this.getNestedValue(nMua, ['MST'])),
      buyerAddress: this.getSafeText(this.getNestedValue(nMua, ['DChi'])) || undefined,
      buyerCustomerId: this.getSafeText(this.getNestedValue(nMua, ['MKHang'])) || undefined,

      // Financial
      totalBeforeTax: this.toNumber(this.getNestedValue(tToan, ['TgTCThue'])),
      taxAmount: this.toNumber(this.getNestedValue(tToan, ['TgTThue'])),
      totalAmount: this.toNumber(this.getNestedValue(tToan, ['TgTTTBSo'])),
      totalAmountInWords: this.getSafeText(this.getNestedValue(tToan, ['TgTTTBChu'])) || undefined,

      items,
    };
  }

  /**
   * Extract zip file and parse the contained XML file
   * @param zipPath path to the zip file
   * @param outputXmlDir directory where the extracted XML should be stored
   */
  public extractAndParseZip(zipPath: string, outputXmlDir: string): ParsedInvoice | null {
    try {
      if (!fs.existsSync(zipPath)) {
        throw new Error(`Zip file not found: ${zipPath}`);
      }

      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();
      const xmlEntry = zipEntries.find(entry => entry.entryName.toLowerCase().endsWith('.xml'));

      if (!xmlEntry) {
        throw new Error(`No XML file found in ZIP: ${zipPath}`);
      }

      const baseName = path.basename(zipPath, path.extname(zipPath));
      const targetXmlName = `${baseName}.xml`;
      const targetXmlPath = path.join(outputXmlDir, targetXmlName);

      // Ensure directory exists
      fs.mkdirSync(outputXmlDir, { recursive: true });

      // Extract and write XML content directly
      const xmlContent = zip.readAsText(xmlEntry, 'utf8');
      fs.writeFileSync(targetXmlPath, xmlContent, 'utf8');

      return this.parseXmlContent(xmlContent, targetXmlName);
    } catch (error: any) {
      console.error(`[ParserService] Error unzipping or parsing XML: ${error.message}`);
      return null;
    }
  }
}
