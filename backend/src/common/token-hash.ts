import { createHash } from 'crypto';

/**
 * Băm token xác thực / đặt lại mật khẩu trước khi lưu vào DB
 * (chống lộ token khi DB bị dump). Chỉ lưu hash, không bao giờ lưu plaintext.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
