import { describe, expect, it } from 'vitest';
import { v4Enabled } from './features';

describe('V4 feature flag', () => {
  it('is off by default', () => {
    expect(v4Enabled(undefined, '', '')).toBe(false);
    expect(v4Enabled('0', '?v4=0', '#/atlas')).toBe(false);
  });
  it('turns on from the build variable', () => {
    expect(v4Enabled('1', '', '')).toBe(true);
  });
  it('turns on from ?v4=1 before or after the hash', () => {
    expect(v4Enabled(undefined, '?v4=1', '#/atlas')).toBe(true);
    expect(v4Enabled(undefined, '', '#/atlas?v4=1&dur=2')).toBe(true);
  });
});
