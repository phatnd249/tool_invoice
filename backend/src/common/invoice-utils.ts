// ─── Shared Invoice Utilities ───────────────────────────────────────────────
// Dùng chung cho toàn bộ invoice module. Pure functions, không dependency.

import * as path from 'path';

/**
 * Sinh mã trạng thái file (K/C/M kèm trạng thái) dùng đặt tên file ZIP/XML/PDF.
 *
 * Logic:
 * - K: hoá đơn thông thường (mặc định)
 * - M: hoá đơn máy tính tiền (kí hiệu bắt đầu bằng M)
 * - C: hoá đơn có mã (kí hiệu bắt đầu bằng C, hoặc ttxly=5)
 *
 * Kết hợp với invoice status: TT (thay thế), DC (điều chỉnh), BTT (bị thay thế), ...
 */
export function getInvoiceFileStatusCode(inv: {
  khhdon?: string;
  ttxly?: number;
  tthai?: number;
}): string {
  const khhdon = String(inv.khhdon || '').toUpperCase();
  let baseCode = 'K';
  if (khhdon.match(/^[1-6]?M/)) baseCode = 'M';
  else if (khhdon.match(/^[1-6]?C/)) baseCode = 'C';
  if (baseCode === 'K' && inv.ttxly === 5) baseCode = 'C';
  if (baseCode === 'K' && inv.ttxly === 8) baseCode = 'M';

  const statusMap: Record<number, string> = {
    1: '',
    2: 'TT',
    3: 'DC',
    4: 'BTT',
    5: 'BDC',
    6: 'HUY',
  };
  const invoiceCode = inv.tthai != null ? (statusMap[inv.tthai] ?? '?') : '';

  if (baseCode && invoiceCode) return `${baseCode}-${invoiceCode}`;
  return baseCode || invoiceCode || 'K';
}

/**
 * Làm sạch tên thư mục: bỏ ký tự đặc biệt, thay whitespace bằng underscore.
 * Giới hạn 100 ký tự.
 */
export function sanitizeDirName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9À-ỹ\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}

/**
 * Sinh đường dẫn tương đối (không bao gồm INVOICES_DIR) cho file hoá đơn.
 * Pattern: {companyDir}/{typeDir}/{monthDir}/{fileName}
 *
 * Được lưu vào DB để khi đổi INVOICES_DIR không cần migrate.
 */
export function getInvoiceRelativePath(params: {
  companyName: string;
  type: 'BUY' | 'SELL';
  invoiceDate: Date;
  fileName: string;
}): string {
  const companyDir = sanitizeDirName(params.companyName);
  const typeDir = params.type === 'SELL' ? 'BanRa' : 'MuaVao';
  const monthDir = `${params.invoiceDate.getFullYear()}-${String(params.invoiceDate.getMonth() + 1).padStart(2, '0')}`;
  return path.join(companyDir, typeDir, monthDir, params.fileName);
}

/**
 * Resolve đường dẫn tuyệt đối từ relative path trong DB + INVOICES_DIR.
 * Có KIỂM TRA CONTAINMENT: vứt bỏ đường dẫn cố thoát ra ngoài baseDir
 * (path traversal) — dữ liệu DB bị can thiệp hoặc tên file độc hại sẽ không
 * thể đọc/ghi file ngoài thư mục cho phép.
 */
export function resolveInvoicePath(
  baseDir: string,
  relativePath: string,
): string {
  const resolved = path.resolve(baseDir, relativePath);
  const base = path.resolve(baseDir);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `Đường dẫn không hợp lệ (ngoài phạm vi thư mục gốc): ${relativePath}`,
    );
  }
  return resolved;
}

/**
 * Delay async với Promise.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
