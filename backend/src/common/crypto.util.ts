import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Lấy encryption key 32 bytes từ biến môi trường hoặc fallback an toàn
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.BACKUP_ENCRYPTION_KEY ||
    process.env.JWT_ACCESS_SECRET ||
    'tool-invoice-backup-encryption-key-32-chars!!';
  return createHash('sha256').update(secret).digest();
}

/**
 * Mã hóa AES-256-GCM chuỗi nhạy cảm (như OAuth Refresh Token)
 * Format output: ivHex:authTagHex:encryptedHex
 */
export function encryptToken(text: string): string {
  if (!text) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Giải mã chuỗi AES-256-GCM
 */
export function decryptToken(encryptedText: string): string {
  if (!encryptedText) return '';
  const parts = encryptedText.split(':');
  // Nếu là token cũ dạng plaintext, fallback trả về nguyên bản
  if (parts.length !== 3) {
    return encryptedText;
  }
  const [ivHex, authTagHex, dataHex] = parts;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(dataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // Nếu giải mã lỗi, fallback trả về nguyên bản
    return encryptedText;
  }
}
