// backend/src/logger/logger.ts
import pino from 'pino';
import { randomUUID } from 'crypto';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Pino logger instance gốc.
 * - Dev: dùng pino-pretty để hiển thị màu sắc, dễ đọc
 * - Production: output JSON thuần
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat: '[{component}] {msg}',
      },
    },
  }),
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

/**
 * Tạo một child logger với component name (và tuỳ chọn correlationId).
 * Dùng trong mỗi class/service để tự động gắn tên component vào mọi log.
 *
 * @example
 *   const log = createLogger('DownloaderService');
 *   log.info({ mst: '0123456789' }, 'Bắt đầu tải');
 *
 *   // Với correlation ID:
 *   const ctxLog = createLogger('DownloaderService', 'abc123');
 *   ctxLog.error({ err, invNum: '000021' }, 'Lỗi tải ZIP');
 */
export function createLogger(component: string, correlationId?: string) {
  const ctx: Record<string, any> = { component };
  if (correlationId) {
    ctx.correlationId = correlationId;
  }
  return logger.child(ctx);
}

/**
 * Sinh một correlation ID ngắn (8 ký tự hex) để theo dõi một luồng xử lý.
 */
export function generateCorrelationId(): string {
  return randomUUID().slice(0, 8);
}
