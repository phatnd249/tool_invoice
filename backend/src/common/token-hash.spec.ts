import { hashToken } from './token-hash';

describe('hashToken', () => {
  it('produces a deterministic 64-char hex digest', () => {
    const a = hashToken('abc');
    const b = hashToken('abc');
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('token-1')).not.toBe(hashToken('token-2'));
  });

  it('never returns the raw token', () => {
    const raw = 'raw-token-value';
    expect(hashToken(raw)).not.toContain(raw);
  });
});
