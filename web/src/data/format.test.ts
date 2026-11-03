import { describe, expect, it } from 'vitest';
import { usd } from './format';

describe('usd', () => {
  it('puts the minus (U+2212) before the dollar sign', () => {
    expect(usd(-1.87, 2)).toBe('−$1.87');
    expect(usd(-1234.5, 1)).toBe('−$1,234.5');
    expect(usd(-1.87, 2)).not.toContain('$-');
  });

  it('shows zero, and values that round to zero, without a sign', () => {
    expect(usd(0, 2)).toBe('$0.00');
    expect(usd(-0, 1)).toBe('$0.0');
    expect(usd(-0.004, 2)).toBe('$0.00');
  });

  it('formats positive values with separators and fixed decimals', () => {
    expect(usd(48.71, 1)).toBe('$48.7');
    expect(usd(1234567, 0)).toBe('$1,234,567');
  });

  it('shows a dash for missing values', () => {
    expect(usd(null)).toBe('–');
    expect(usd(undefined)).toBe('–');
    expect(usd(Number.NaN)).toBe('–');
  });
});
