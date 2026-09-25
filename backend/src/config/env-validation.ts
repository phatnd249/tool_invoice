/**
 * Validation cấu hình env lúc boot.
 * - Production: BẮT BUỘC JWT secrets mạnh (>= 32 ký tự, không phải giá trị demo).
 * - Dev: chỉ cảnh báo (không làm crash) — strategy fallback đã bị gỡ bỏ.
 */

const WEAK_SECRET_PATTERN =
  /change-me|your-super-secret|access-secret|refresh-secret/i;
const MIN_SECRET_LENGTH = 32;

function checkSecret(
  config: Record<string, unknown>,
  key: string,
  errors: string[],
): void {
  const value = typeof config[key] === 'string' ? config[key] : '';
  if (!value) {
    errors.push(`${key} is required`);
    return;
  }
  if (value.length < MIN_SECRET_LENGTH) {
    errors.push(`${key} must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  if (WEAK_SECRET_PATTERN.test(value)) {
    errors.push(`${key} uses a known/demo value — set a unique random secret`);
  }
}

export function validateEnv(config: Record<string, unknown>) {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];

  if (isProduction) {
    checkSecret(config, 'JWT_ACCESS_SECRET', errors);
    checkSecret(config, 'JWT_REFRESH_SECRET', errors);
  } else {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = typeof config[key] === 'string' ? config[key] : '';
      if (value && WEAK_SECRET_PATTERN.test(value)) {
        console.warn(
          `[env] WARNING: ${key} dùng giá trị demo ("change-me"/"your-super-secret"). Hãy đặt secret riêng trước khi deploy production.`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment: ${errors.join('; ')}`);
  }

  return config;
}
