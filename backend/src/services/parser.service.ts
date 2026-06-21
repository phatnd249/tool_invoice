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
   * Safe conversion of string to number
   */
  private toNumber(val: any): number {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    const cleanStr = String(val).replace(/,/g, '').trim();
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
            lineNumber: String(item.STT || '').trim() || undefined,
            name: String(item.THHDVu || '').trim(),
            unit: item.DVTinh ? String(item.DVTinh).trim() : undefined,
            quantity: item.SLuong !== undefined ? this.toNumber(item.SLuong) : undefined,
            price: item.DGia !== undefined ? this.toNumber(item.DGia) : undefined,
            amount: this.toNumber(item.ThTien),
            taxRate: item.TSuat ? String(item.TSuat).trim() : undefined,
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
        if (ttin.TTruong === 'MaTraCuu') {
          lookupCode = String(ttin.DLieu || '').trim();
          break;
        }
      }
    }

    // Try parsing date (e.g. 2026-05-09T08:30:15 or 2026-05-09)
    const nlapStr = this.getNestedValue(ttChung, ['NLap']) || '';
    let invoiceDate = new Date();
    if (nlapStr) {
      const parsedDate = Date.parse(nlapStr);
      if (!isNaN(parsedDate)) {
        invoiceDate = new Date(parsedDate);
      }
    }

    return {
      xmlFile: xmlFileName,
      version: this.getNestedValue(ttChung, ['PBan']),
      invoiceName: this.getNestedValue(ttChung, ['THDon']),
      templateSymbol: String(this.getNestedValue(ttChung, ['KHMSHDon']) || '').trim(),
      invoiceSymbol: String(this.getNestedValue(ttChung, ['KHHDon']) || '').trim(),
      invoiceNumber: String(this.getNestedValue(ttChung, ['SHDon']) || '').trim(),
      invoiceDate,
      currency: String(this.getNestedValue(ttChung, ['DVTTe']) || 'VND').trim(),
      exchangeRate: this.toNumber(this.getNestedValue(ttChung, ['TGia']) || 1),
      paymentMethod: this.getNestedValue(ttChung, ['HTTToan']),
      gdtProviderTaxCode: this.getNestedValue(ttChung, ['MSTTCGP']),
      taxAuthorityCode: this.getNestedValue(root, ['MCCQT']),
      lookupCode: lookupCode || undefined,

      // Seller
      sellerName: String(this.getNestedValue(nBan, ['Ten']) || '').trim(),
      sellerTaxCode: String(this.getNestedValue(nBan, ['MST']) || '').trim(),
      sellerAddress: this.getNestedValue(nBan, ['DChi']),
      sellerPhone: this.getNestedValue(nBan, ['SDThoai']),

      // Buyer
      buyerName: String(this.getNestedValue(nMua, ['Ten']) || '').trim(),
      buyerTaxCode: String(this.getNestedValue(nMua, ['MST']) || '').trim(),
      buyerAddress: this.getNestedValue(nMua, ['DChi']),
      buyerCustomerId: this.getNestedValue(nMua, ['MKHang']),

      // Financial
      totalBeforeTax: this.toNumber(this.getNestedValue(tToan, ['TgTCThue'])),
      taxAmount: this.toNumber(this.getNestedValue(tToan, ['TgTThue'])),
      totalAmount: this.toNumber(this.getNestedValue(tToan, ['TgTTTBSo'])),
      totalAmountInWords: this.getNestedValue(tToan, ['TgTTTBChu']),

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
