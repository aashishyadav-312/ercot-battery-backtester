import { describe, expect, it } from 'vitest';
import { readAdvanced, writeAdvanced } from './advanced';
import { siteHash } from './siteTarget';

describe('siteHash', () => {
  it('opens the Atlas on the site, with four decimals', () => {
    expect(siteHash(31.5, -97.123456)).toBe('#/atlas?lat=31.5000&lon=-97.1235');
  });
});

describe('Atlas Advanced switch in the address', () => {
  it('reads adv=1 only', () => {
    expect(readAdvanced('#/atlas')).toBe(false);
    expect(readAdvanced('#/atlas?adv=0')).toBe(false);
    expect(readAdvanced('#/atlas?lat=1&adv=1')).toBe(true);
  });
  it('sets and removes it and keeps the other parameters', () => {
    expect(writeAdvanced('#/atlas', true)).toBe('#/atlas?adv=1');
    expect(writeAdvanced('#/atlas?lat=31&lon=-97', true)).toBe('#/atlas?lat=31&lon=-97&adv=1');
    expect(writeAdvanced('#/atlas?lat=31&adv=1&lon=-97', false)).toBe('#/atlas?lat=31&lon=-97');
    expect(writeAdvanced('#/atlas?adv=1', false)).toBe('#/atlas');
    expect(writeAdvanced('', true)).toBe('#/atlas?adv=1');
  });
});
