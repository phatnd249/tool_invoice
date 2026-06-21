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
   * Recursively finds a key in a JSON object case-insensitively, similar to Python's find_xml_element
   */
  private findKeyRecursive(obj: any, targetKey: string): any {
    if (!obj || typeof obj !== 'object') return undefined;

    // Check if the current object has the key (case-insensitive)
    const keys = Object.keys(obj);
    const foundKey = keys.find(k => k.toLowerCase() === targetKey.toLowerCase());
    if (foundKey) {
      return obj[foundKey];
    }

    // Recursively check children
    for (const key of keys) {
      const child = obj[key];
      if (child && typeof child === 'object') {
        const result = this.findKeyRecursive(child, targetKey);
        if (result !== undefined) {
          return result;
        }
      }
    }
    return undefined;
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
    
    const dlHDon = this.findKeyRecursive(root, 'DLHDon') || root;
    const ttChung = this.findKeyRecursive(dlHDon, 'TTChung');
    const nBan = this.findKeyRecursive(dlHDon, 'NBan');
    const nMua = this.findKeyRecursive(dlHDon, 'NMua');
    const tToan = this.findKeyRecursive(dlHDon, 'TToan');
    const dshhdVu = this.findKeyRecursive(dlHDon, 'DSHHDVu');
    
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
    const ttKhac = this.findKeyRecursive(dlHDon, 'TTKhac');
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
    const nlapStr = this.getSafeText(this.findKeyRecursive(ttChung, 'NLap')) || '';
    let invoiceDate = new Date();
    if (nlapStr) {
      const parsedDate = Date.parse(nlapStr);
      if (!isNaN(parsedDate)) {
        invoiceDate = new Date(parsedDate);
      }
    }

    return {
      xmlFile: xmlFileName,
      version: this.getSafeText(this.findKeyRecursive(ttChung, 'PBan')) || undefined,
      invoiceName: this.getSafeText(this.findKeyRecursive(ttChung, 'THDon')) || undefined,
      templateSymbol: this.getSafeText(this.findKeyRecursive(ttChung, 'KHMSHDon')),
      invoiceSymbol: this.getSafeText(this.findKeyRecursive(ttChung, 'KHHDon')),
      invoiceNumber: this.getSafeText(this.findKeyRecursive(ttChung, 'SHDon')),
      invoiceDate,
      currency: this.getSafeText(this.findKeyRecursive(ttChung, 'DVTTe') || 'VND'),
      exchangeRate: this.toNumber(this.findKeyRecursive(ttChung, 'TGia') || 1),
      paymentMethod: this.getSafeText(this.findKeyRecursive(ttChung, 'HTTToan')) || undefined,
      gdtProviderTaxCode: this.getSafeText(this.findKeyRecursive(ttChung, 'MSTTCGP')) || undefined,
      taxAuthorityCode: this.getSafeText(this.findKeyRecursive(root, 'MCCQT')) || undefined,
      lookupCode: lookupCode || undefined,

      // Seller
      sellerName: this.getSafeText(this.findKeyRecursive(nBan, 'Ten')),
      sellerTaxCode: this.getSafeText(this.findKeyRecursive(nBan, 'MST')),
      sellerAddress: this.getSafeText(this.findKeyRecursive(nBan, 'DChi')) || undefined,
      sellerPhone: this.getSafeText(this.findKeyRecursive(nBan, 'SDThoai')) || undefined,

      // Buyer
      buyerName: this.getSafeText(this.findKeyRecursive(nMua, 'Ten')),
      buyerTaxCode: this.getSafeText(this.findKeyRecursive(nMua, 'MST')),
      buyerAddress: this.getSafeText(this.findKeyRecursive(nMua, 'DChi')) || undefined,
      buyerCustomerId: this.getSafeText(this.findKeyRecursive(nMua, 'MKHang')) || undefined,

      // Financial
      totalBeforeTax: this.toNumber(this.findKeyRecursive(tToan, 'TgTCThue')),
      taxAmount: this.toNumber(this.findKeyRecursive(tToan, 'TgTThue')),
      totalAmount: this.toNumber(this.findKeyRecursive(tToan, 'TgTTTBSo')),
      totalAmountInWords: this.getSafeText(this.findKeyRecursive(tToan, 'TgTTTBChu')) || undefined,

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
