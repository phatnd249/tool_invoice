import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
}

export const RATE_LIMIT_KEY = 'rateLimit';

export function RateLimit(options: RateLimitOptions) {
  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, options),
    UseGuards(RateLimitGuard),
  );
}

/**
 * Rate limiter nhẹ, in-memory (fixed window) theo IP + keyPrefix.
 * Đủ dùng cho phương án hardening; có thể thay bằng @nestjs/throttler về sau.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private static store = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const key = `${ip}:${options.keyPrefix ?? 'rate'}`;

    const now = Date.now();
    const entry = RateLimitGuard.store.get(key);

    if (!entry || entry.resetAt <= now) {
      RateLimitGuard.store.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return true;
    }

    if (entry.count >= options.limit) {
      throw new HttpException(
        'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count++;
    return true;
  }
}
