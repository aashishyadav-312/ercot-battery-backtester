import { describe, expect, it } from 'vitest';
import { SCHEME_KEY, readStoredScheme, resolveScheme, storeScheme } from './scheme';

describe('colour scheme', () => {
  it('uses the saved choice over the system preference', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('follows the system preference when nothing is saved', () => {
    expect(resolveScheme(null, 'light')).toBe('light');
    expect(resolveScheme(null, 'dark')).toBe('dark');
  });

  it('reads only valid saved values, under the key earlier visits used', () => {
    expect(SCHEME_KEY).toBe('ebb-scheme');
    expect(readStoredScheme({ getItem: () => 'light' })).toBe('light');
    expect(readStoredScheme({ getItem: () => 'dark' })).toBe('dark');
    expect(readStoredScheme({ getItem: () => 'sepia' })).toBeNull();
    expect(readStoredScheme({ getItem: () => null })).toBeNull();
  });

  it('survives storage that throws (private window, blocked site data)', () => {
    const blocked = () => { throw new DOMException('blocked', 'SecurityError'); };
    expect(readStoredScheme({ getItem: blocked })).toBeNull();
    expect(() => storeScheme('light', { setItem: blocked })).not.toThrow();
  });

  it('saves the choice', () => {
    const saved: Record<string, string> = {};
    storeScheme('light', { setItem: (k, v) => { saved[k] = v; } });
    expect(saved).toEqual({ 'ebb-scheme': 'light' });
  });
});
