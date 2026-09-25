import { validateEnv } from './env-validation';

describe('validateEnv', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('throws in production when JWT_ACCESS_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateEnv({ JWT_REFRESH_SECRET: 'x'.repeat(40) })).toThrow(
      /JWT_ACCESS_SECRET is required/,
    );
  });

  it('throws in production for weak/demo secrets', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      validateEnv({
        JWT_ACCESS_SECRET: 'change-me-access-secret',
        JWT_REFRESH_SECRET: 'change-me-refresh-secret',
      }),
    ).toThrow(/demo/i);
  });

  it('throws in production for secrets shorter than 32 chars', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      validateEnv({
        JWT_ACCESS_SECRET: 'short-secret',
        JWT_REFRESH_SECRET: 'also-short',
      }),
    ).toThrow(/at least 32/);
  });

  it('accepts strong secrets in production', () => {
    process.env.NODE_ENV = 'production';
    const config = {
      JWT_ACCESS_SECRET: 'a'.repeat(40),
      JWT_REFRESH_SECRET: 'b'.repeat(40),
    };
    expect(validateEnv(config)).toBe(config);
  });

  it('does not throw in dev for missing secrets (only warns)', () => {
    process.env.NODE_ENV = 'development';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateEnv({})).not.toThrow();
    warn.mockRestore();
  });
});
