import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

export interface InvoiceItemData {
  lineNumber?: string;
  name: string;
  unit?: string;
  quantity?: number;
  price?: number;
  amount: number;
  taxRate?: string;
}

export interface ParsedXmlData {
  items: InvoiceItemData[];
}

@Injectable()
export class XmlParserService {
  private readonly logger = new Logger(XmlParserService.name);
  private readonly parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
    });
  }

  /**
   * Giải nén ZIP và lấy đường dẫn file XML bên trong.
   * Trả về đường dẫn file XML đã giải nén.
   */
  extractXmlFromZip(zipPath: string, outputDir: string): string {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`Không tìm thấy file ZIP: ${zipPath}`);
    }

    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    const xmlEntry = zipEntries.find((entry) =>
      entry.entryName.toLowerCase().endsWith('.xml'),
    );

    if (!xmlEntry) {
      throw new Error(`Không tìm thấy file XML trong ZIP: ${zipPath}`);
    }

    const baseName = path.basename(zipPath, path.extname(zipPath));
    const xmlFileName = `${baseName}.xml`;
    const xmlPath = path.join(outputDir, xmlFileName);

    fs.mkdirSync(outputDir, { recursive: true });

    const xmlContent = zip.readAsText(xmlEntry, 'utf8');
    fs.writeFileSync(xmlPath, xmlContent, 'utf8');

    this.logger.debug(`Extracted XML: ${xmlPath}`);
    return xmlPath;
  }

  /**
   * Parse file XML hoá đơn và trích xuất danh sách items.
   */
  parseInvoiceXml(xmlPath: string): ParsedXmlData {
    const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
    const jsonObj = this.parser.parse(xmlContent);

    const rootKey = Object.keys(jsonObj)[0];
    const root = jsonObj[rootKey] || jsonObj;
    const dlHDon = this.findKeyRecursive(root, 'DLHDon') || root;

    const dshhdVu = this.findKeyRecursive(dlHDon, 'DSHHDVu');

    const items: InvoiceItemData[] = [];
    if (dshhdVu) {
      let hhdVuList = dshhdVu.HHDVu;
      if (hhdVuList) {
        if (!Array.isArray(hhdVuList)) {
          hhdVuList = [hhdVuList];
        }
        for (const item of hhdVuList) {
          items.push({
            lineNumber: this.getSafeText(item.STT) || undefined,
            name: this.getSafeText(item.THHDVu),
            unit: this.getSafeText(item.DVTinh) || undefined,
            quantity:
              item.SLuong !== undefined
                ? this.toNumber(item.SLuong)
                : undefined,
            price:
              item.DGia !== undefined
                ? this.toNumber(item.DGia)
                : undefined,
            amount: this.toNumber(item.ThTien),
            taxRate: this.getSafeText(item.TSuat) || undefined,
          });
        }
      }
    }

    this.logger.debug(
      `Parsed ${items.length} items from ${xmlPath}`,
    );

    return { items };
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private findKeyRecursive(
    obj: any,
    targetKey: string,
  ): any {
    if (!obj || typeof obj !== 'object') return undefined;

    const keys = Object.keys(obj);
    const foundKey = keys.find(
      (k) => k.toLowerCase() === targetKey.toLowerCase(),
    );
    if (foundKey) return obj[foundKey];

    for (const key of keys) {
      const child = obj[key];
      if (child && typeof child === 'object') {
        const result = this.findKeyRecursive(child, targetKey);
        if (result !== undefined) return result;
      }
    }
    return undefined;
  }

  private getSafeText(val: any): string {
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') {
      return val['#text'] !== undefined
        ? String(val['#text']).trim()
        : '';
    }
    return String(val).trim();
  }

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
}
