import { describe, expect, it } from 'vitest';
import { V4_DEFAULT_ON, V5_DEFAULT_ON, v4Enabled, v5Enabled } from './features';

describe('V4 feature flag', () => {
  it('is off when nothing asks for it and the release switch is off', () => {
    expect(v4Enabled(undefined, '', '', false)).toBe(false);
    expect(v4Enabled('0', '?v4=0', '#/atlas', false)).toBe(false);
  });
  it('turns on from the build variable', () => {
    expect(v4Enabled('1', '', '')).toBe(true);
  });
  it('turns on from ?v4=1 before or after the hash', () => {
    expect(v4Enabled(undefined, '?v4=1', '#/atlas')).toBe(true);
    expect(v4Enabled(undefined, '', '#/atlas?v4=1&dur=2')).toBe(true);
  });
  it('the release switch turns it on for everyone, and ?v4=0 or VITE_V4=0 still turn it off', () => {
    expect(v4Enabled(undefined, '', '#/atlas', true)).toBe(true);
    expect(v4Enabled(undefined, '?v4=0', '#/atlas', true)).toBe(false);
    expect(v4Enabled(undefined, '', '#/atlas?v4=0', true)).toBe(false);
    expect(v4Enabled('0', '', '', true)).toBe(false);
    expect(v4Enabled('0', '?v4=1', '', true)).toBe(true);
  });
  it('without a request, the flag follows the release switch', () => {
    expect(v4Enabled(undefined, '', '', V4_DEFAULT_ON)).toBe(V4_DEFAULT_ON);
  });
});

describe('V5 feature flag', () => {
  it('is off when nothing asks for it and the release switch is off', () => {
    expect(v5Enabled(undefined, '', '', false)).toBe(false);
    expect(v5Enabled('0', '?v5=0', '#/atlas', false)).toBe(false);
  });
  it('turns on from the build variable', () => {
    expect(v5Enabled('1', '', '')).toBe(true);
  });
  it('turns on from ?v5=1 before or after the hash', () => {
    expect(v5Enabled(undefined, '?v5=1', '#/atlas')).toBe(true);
    expect(v5Enabled(undefined, '', '#/atlas?v5=1&dur=2')).toBe(true);
  });
  it('the release switch turns it on for everyone, and ?v5=0 or VITE_V5=0 still turn it off', () => {
    expect(v5Enabled(undefined, '', '#/atlas', true)).toBe(true);
    expect(v5Enabled(undefined, '?v5=0', '#/atlas', true)).toBe(false);
    expect(v5Enabled(undefined, '', '#/atlas?v5=0', true)).toBe(false);
    expect(v5Enabled('0', '', '', true)).toBe(false);
    expect(v5Enabled('0', '?v5=1', '', true)).toBe(true);
  });
  it('the address wins over the build variable, which wins over the default', () => {
    expect(v5Enabled('1', '?v5=0', '', false)).toBe(false);
    expect(v5Enabled('0', '', '#/home?v5=1', false)).toBe(true);
    expect(v5Enabled('1', '', '', false)).toBe(true);
  });
  it('is off whenever V4 is off, whatever asks for V5', () => {
    expect(v5Enabled('1', '?v5=1', '#/atlas?v5=1', true, false)).toBe(false);
  });
  it('without a request, the flag follows the release switch', () => {
    expect(v5Enabled(undefined, '', '', V5_DEFAULT_ON)).toBe(V5_DEFAULT_ON);
  });
});
