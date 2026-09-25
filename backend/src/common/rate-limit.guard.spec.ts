import { HttpException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimit, RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let context: ExecutionContext;

  beforeEach(() => {
    jest.useFakeTimers();
    (RateLimitGuard as any).store.clear();
    guard = new RateLimitGuard(new Reflector());
    context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ ip: '1.2.3.4' }),
      }),
    } as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    (RateLimitGuard as any).store.clear();
  });

  it('passes requests below the limit', () => {
    const options = { limit: 2, windowMs: 1000, keyPrefix: 'test' };
    (guard as any).reflector.getAllAndOverride = () => options;

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks requests above the limit', () => {
    const options = { limit: 1, windowMs: 1000, keyPrefix: 'test' };
    (guard as any).reflector.getAllAndOverride = () => options;

    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });

  it('resets the window after windowMs elapses', () => {
    const options = { limit: 1, windowMs: 1000, keyPrefix: 'test' };
    (guard as any).reflector.getAllAndOverride = () => options;

    expect(guard.canActivate(context)).toBe(true);
    jest.advanceTimersByTime(1001);
    expect(guard.canActivate(context)).toBe(true);
  });
});

describe('RateLimit decorator', () => {
  it('is a decorator factory returning decorators', () => {
    const decorators = RateLimit({ limit: 5, windowMs: 1000 });
    expect(typeof decorators).toBe('function');
  });
});
