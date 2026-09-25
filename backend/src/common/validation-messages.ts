import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

/**
 * Dịch toàn bộ thông báo lỗi validation của class-validator (mặc định là
 * tiếng Anh) sang tiếng Việt. Được dùng làm `exceptionFactory` của
 * ValidationPipe trong main.ts.
 */

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Mật khẩu',
  confirmPassword: 'Mật khẩu xác nhận',
  currentPassword: 'Mật khẩu hiện tại',
  newPassword: 'Mật khẩu mới',
  fullName: 'Họ và tên',
  token: 'Token',
  refreshToken: 'Token làm mới',
  taxCode: 'Mã số thuế',
  lookupPassword: 'Mật khẩu tra cứu',
  name: 'Tên',
  loginMode: 'Chế độ đăng nhập',
  title: 'Tiêu đề',
  content: 'Nội dung',
  category: 'Danh mục',
  companyId: 'Mã công ty',
  startDate: 'Ngày bắt đầu',
  endDate: 'Ngày kết thúc',
  invoiceType: 'Loại hoá đơn',
  overwriteMode: 'Chế độ ghi đè',
  search: 'Từ khoá',
  sortBy: 'Tiêu chí sắp xếp',
  sortOrder: 'Thứ tự sắp xếp',
  status: 'Trạng thái',
  repeatMode: 'Chế độ lặp lại',
  cronExpression: 'Biểu thức cron',
  scheduledAt: 'Thời gian lên lịch',
  dateRangeDays: 'Số ngày',
  roleIds: 'Danh sách vai trò',
  roleId: 'Vai trò',
  permissionIds: 'Danh sách quyền',
  companyIds: 'Danh sách công ty',
  page: 'Trang',
  limit: 'Số lượng',
  description: 'Mô tả',
  group: 'Nhóm',
  avatar: 'Ảnh đại diện',
  type: 'Loại',
};

function label(field: string): string {
  return FIELD_LABELS[field] ?? (field || 'Trường dữ liệu');
}

/** Trích số từ message mặc định của class-validator (VD: "must not be less than 1" → 1) */
function extractNumber(message: string): string {
  return /\d+/.exec(message)?.[0] ?? '?';
}

/** Trích danh sách giá trị hợp lệ từ message của @IsIn (sau dấu ": ") */
function extractAllowedValues(message: string): string[] | null {
  const idx = message.indexOf(':');
  if (idx === -1) return null;
  return message
    .slice(idx + 1)
    .split(',')
    .map((v) => v.trim().replace(/'/g, ''))
    .filter(Boolean);
}

/** Kiểm tra message còn là tiếng Anh (không chứa ký tự có dấu tiếng Việt) */
function isAscii(message: string): boolean {
  return !/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(
    message,
  );
}

function translateConstraint(
  key: string,
  field: string,
  rawMessage: string,
): string {
  const f = label(field);

  // Message đã là tiếng Việt (custom đã dịch) → giữ nguyên
  if (!isAscii(rawMessage)) return rawMessage;

  switch (key) {
    case 'isString':
      return `${f} phải là chuỗi ký tự`;
    case 'isNotEmpty':
    case 'arrayNotEmpty':
      return `${f} không được để trống`;
    case 'isEmail':
      return `${f} không hợp lệ (ví dụ: user@example.com)`;
    case 'isDateString':
      return `${f} phải là ngày hợp lệ (định dạng ISO 8601)`;
    case 'isIn': {
      const allowed = extractAllowedValues(rawMessage);
      return allowed
        ? `${f} phải là một trong các giá trị: ${allowed.join(', ')}`
        : `${f} không hợp lệ`;
    }
    case 'isInt':
      return `${f} phải là số nguyên`;
    case 'min':
      return `${f} không được nhỏ hơn ${extractNumber(rawMessage)}`;
    case 'max':
      return `${f} không được lớn hơn ${extractNumber(rawMessage)}`;
    case 'minLength':
      return `${f} phải có ít nhất ${extractNumber(rawMessage)} ký tự`;
    case 'maxLength':
      return `${f} không được vượt quá ${extractNumber(rawMessage)} ký tự`;
    case 'matches':
      return `${f} không đúng định dạng yêu cầu`;
    case 'isArray':
      return `${f} phải là một mảng`;
    case 'isCuid':
      return `${f} phải là mã ID hợp lệ`;
    case 'isBoolean':
      return `${f} phải là true hoặc false`;
    case 'isNumber':
      return `${f} phải là số`;
    case 'whitelistValidation':
      return `${f} không được phép gửi lên`;
    default:
      return `${f} ${rawMessage.toLowerCase()}`;
  }
}

function collectMessages(
  errors: ValidationError[],
  out: string[] = [],
): string[] {
  for (const error of errors) {
    if (error.constraints) {
      for (const [key, message] of Object.entries(error.constraints)) {
        out.push(translateConstraint(key, error.property, message));
      }
    }
    if (Array.isArray(error.children) && error.children.length > 0) {
      collectMessages(error.children, out);
    }
  }
  return out;
}

/** exceptionFactory cho ValidationPipe: trả BadRequest với message tiếng Việt */
export const vietnameseValidationFactory = (errors: ValidationError[]) => {
  const messages = collectMessages(errors);
  return new BadRequestException(
    messages.length > 0 ? messages : 'Dữ liệu gửi lên không hợp lệ',
  );
};
