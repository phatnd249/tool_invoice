// backend/src/utils/path-resolver.ts
// Xử lý đường dẫn lưu file và tên file

import * as path from 'path';
import { getResultCode } from './gdt-format.js';

/**
 * Resolve thư mục đích để lưu invoice files.
 * Cấu trúc: <baseDir>/<companyName>/<type-dir>/<YYYY-MM>/
 */
export function resolveTargetDir(
  baseDir: string,
  companyName: string,
  type: 'BUY' | 'SELL',
  invoiceDate: Date,
): string {
  const cleanName = cleanCompanyName(companyName);
  const typeDir = type === 'SELL' ? 'hoa-don-ban-ra' : 'hoa-don-mua-vao';
  const mm = String(invoiceDate.getMonth() + 1).padStart(2, '0');
  const yyyy = invoiceDate.getFullYear();
  return path.join(baseDir, cleanName, typeDir, `${yyyy}-${mm}`);
}

/**
 * Sinh tên file ZIP từ thông tin invoice GDT.
 * Format: {companyTaxCode}-{invoiceNumber}-{ResultCode}.zip
 */
export function getZipFileName(
  companyTaxCode: string,
  inv: {
    shdon?: string | number;
    ttxly?: number;
    tthai?: number;
    khhdon?: string;
  },
): string {
  const resultCode = getResultCode(inv);
  return `${companyTaxCode}-${inv.shdon}-${resultCode}.zip`;
}

/**
 * Sinh tên file PDF từ tên file ZIP (chỉ đổi extension).
 */
export function getPdfFileNameFromZip(zipPath: string): string {
  return path.basename(zipPath, '.zip') + '.pdf';
}

/**
 * Sinh tên file PDF từ thông tin invoice GDT.
 */
export function getPdfFileNameFromInv(
  companyTaxCode: string,
  inv: {
    shdon?: string | number;
    ttxly?: number;
    tthai?: number;
    khhdon?: string;
  },
): string {
  return getZipFileName(companyTaxCode, inv).replace(/\.zip$/, '.pdf');
}

/**
 * Làm sạch tên công ty để dùng làm tên thư mục.
 */
export function cleanCompanyName(name: string): string {
  return name.replace(/[\\/*?:"<>|]/g, '').trim();
}
