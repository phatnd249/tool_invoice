import * as path from 'path';
import {
  resolveInvoicePath,
  getInvoiceRelativePath,
  sanitizeDirName,
} from './invoice-utils';

describe('resolveInvoicePath containment', () => {
  const base = path.resolve('D:/invoices');

  it('resolves a normal relative path inside baseDir', () => {
    const rel = path.join('Company_A', 'BanRa', '2026-01', 'inv.zip');
    const resolved = resolveInvoicePath(base, rel);
    expect(path.relative(base, resolved).startsWith('..')).toBe(false);
  });

  it('throws when relative path escapes baseDir via ..', () => {
    expect(() => resolveInvoicePath(base, '../../secret.txt')).toThrow(
      /ngoài phạm vi/i,
    );
  });

  it('throws when relative path is absolute', () => {
    expect(() =>
      resolveInvoicePath(base, 'C:/Windows/system32/evil.txt'),
    ).toThrow(/ngoài phạm vi/i);
  });
});

describe('getInvoiceRelativePath', () => {
  it('builds a safe company/type/month/file path', () => {
    const rel = getInvoiceRelativePath({
      companyName: 'Công Ty A!!@',
      type: 'SELL',
      invoiceDate: new Date('2026-01-15'),
      fileName: 'inv.zip',
    });
    expect(rel).toBe(path.join('Công_Ty_A', 'BanRa', '2026-01', 'inv.zip'));
    expect(rel.startsWith('..')).toBe(false);
  });
});

describe('sanitizeDirName', () => {
  it('strips special chars and limits length', () => {
    const name = sanitizeDirName('a/b\\c:*.d    e'.repeat(20));
    expect(name).not.toMatch(/[\\/:*?<>|]/);
    expect(name.length).toBeLessThanOrEqual(100);
  });
});
