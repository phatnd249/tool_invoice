// backend/src/utils/gdt-errors.ts
// Xử lý lỗi từ GDT portal response

const GDT_INVOICE_NOT_FOUND_PATTERNS = [
  'Không tồn tại hồ sơ gốc của hóa đơn',
  'không tồn tại hồ sơ gốc',
  'Invoice not found',
  'No original record',
];

/**
 * Parse GDT response body và trả về message thân thiện với người dùng.
 * Phân biệt:
 *   - Hoá đơn không tồn tại (bị thu hồi/xoá) -> message rõ ràng
 *   - Lỗi khác -> message kèm HTTP status
 */
export function formatGdtError(
  responseBody: string,
  invoiceLabel: string,
  status: number,
): string {
  const isNotFound = GDT_INVOICE_NOT_FOUND_PATTERNS.some((p) =>
    responseBody.toLowerCase().includes(p.toLowerCase()),
  );
  if (isNotFound) {
    return `Hoá đơn ${invoiceLabel} không còn tồn tại trên hệ thống GDT (đã bị thu hồi/xoá).`;
  }
  try {
    const parsed = JSON.parse(responseBody);
    return `GDT trả về lỗi (HTTP ${status}): ${parsed.message || responseBody.slice(0, 200)}`;
  } catch {
    return `GDT trả về lỗi (HTTP ${status}): ${responseBody.slice(0, 200)}`;
  }
}

/**
 * Extract response body từ axios error/response thành string an toàn.
 */
export function extractResponseBody(data: any): string {
  if (!data) return '(empty)';
  if (typeof data === 'string') return data.slice(0, 2000);
  if (Buffer.isBuffer(data)) return Buffer.from(data).toString('utf-8').slice(0, 2000);
  try {
    return JSON.stringify(data).slice(0, 2000);
  } catch {
    return String(data).slice(0, 2000);
  }
}
