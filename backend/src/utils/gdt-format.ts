// backend/src/utils/gdt-format.ts
// Các hàm helper liên quan đến định dạng dữ liệu từ GDT portal

/**
 * Xác định mã kết quả từ thông tin hoá đơn GDT.
 * Dùng để đặt tên file ZIP/PDF.
 *
 * K = Không mã, C = Có mã, M = Máy tính tiền
 * GOC = Gốc, TT = Thay thế, DC = Điều chỉnh,
 * BTT = Bị thay thế, BDC = Bị điều chỉnh, HUY = Huỷ
 */
export function getResultCode(inv: {
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

  return baseCode;
}

/**
 * Map tthai (tình trạng hoá đơn) -> tiếng Việt
 */
export function getTthaiString(tthai: number | string | undefined): string {
  if (tthai === undefined || tthai === null) return 'Không xác định';
  const map: Record<string, string> = {
    '1': 'Hóa đơn mới',
    '2': 'Hóa đơn thay thế',
    '3': 'Hóa đơn điều chỉnh',
    '4': 'Hóa đơn đã bị thay thế',
    '5': 'Hóa đơn đã bị điều chỉnh',
    '6': 'Hóa đơn đã bị hủy',
  };
  return map[String(tthai)] || `TT ${tthai}`;
}

/**
 * Map ttxly (trạng thái xử lý) -> tiếng Việt
 */
export function getTtxlyString(ttxly: number | string | undefined): string {
  if (ttxly === undefined || ttxly === null) return 'Không xác định';
  const map: Record<string, string> = {
    '0': 'Hóa đơn không đủ điều kiện cấp mã',
    '4': 'Đang kiểm tra',
    '5': 'Đã cấp mã hóa đơn',
    '6': 'Cục Thuế đã nhận không mã',
    '7': 'Đã kiểm tra định kỳ HĐĐT không có mã',
    '8': 'Cục Thuế đã nhận hóa đơn có mã khởi tạo từ máy tính tiền',
  };
  return map[String(ttxly)] || `KQ ${ttxly}`;
}

/**
 * Parse ngày từ GDT response field (tdlap)
 * Hỗ trợ: ISO string, timestamp number, dd/MM/yyyy
 */
export function parseGdtDate(tdlap: any): Date {
  if (!tdlap) return new Date();
  const parsed = Date.parse(tdlap);
  return isNaN(parsed) ? new Date() : new Date(parsed);
}

/**
 * Format Date -> dd/MM/yyyyTHH:mm:ss dùng cho GDT API query
 */
export function formatGdtDateParam(d: Date, endOfDay: boolean): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const time = endOfDay ? 'T23:59:59' : 'T00:00:00';
  return `${dd}/${mm}/${yyyy}${time}`;
}

/**
 * Parse string dd/MM/yyyy -> Date. Throw nếu định dạng sai.
 */
export function parseDateString(dateStr: string): Date {
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}. Expected dd/MM/yyyy.`);
  }
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

/**
 * Format Date -> dd/MM/yyyy
 */
export function formatDateShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
