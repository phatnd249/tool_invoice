import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Auth guard dành riêng cho SSE endpoints.
 * Cho phép lấy JWT từ:
 * 1. Query parameter ?token=xxx (EventSource không gửi được custom headers)
 * 2. Authorization header (fallback)
 */
@Injectable()
export class SseAuthGuard extends AuthGuard('sse-jwt') {}
