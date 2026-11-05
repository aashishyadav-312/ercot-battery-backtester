// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import Guide, { GUIDE_SECTIONS } from './Guide';
import { glossaryEntries } from '../data/site';
import { tourSteps, TOUR_STEPS } from '../components/tour/steps';

vi.mock('../config/features', () => ({ V4: true }));
vi.mock('../state', async () => {
  const route = await import('../shell/route');
  return { useApp: () => ({ go: () => {} }), buildHash: route.buildHash };
});
vi.mock('../hooks', () => ({ useWalkthrough: () => ({}) }));

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  Element.prototype.scrollIntoView ??= () => {};
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});

describe('Learn > Basics with V4 on', () => {
  it('adds a third section, Site screening, with three steps in order', () => {
    render(<MantineProvider><Guide /></MantineProvider>);
    expect(GUIDE_SECTIONS.map((s) => s.id)).toEqual(['ercot', 'money', 'screening']);
    expect(document.getElementById('screening')?.tagName).toBe('H2');
    const steps = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent).filter((t) => /^\d\. /.test(t ?? ''));
    expect(steps).toEqual(['1. Search a county or city', '2. Read the Site Value card', '3. Open Data Center mode']);
    expect(screen.getByText('Open Data Center mode →').getAttribute('href')).toBe('#/studio?mode=dc');
  });

  it('the glossary explains ancillary services, RTC+B, 4CP and SB 6', () => {
    const terms = glossaryEntries().map((g) => g.term);
    for (const t of ['Ancillary services', 'RTC+B', '4CP', 'SB 6']) expect(terms).toContain(t);
    for (const g of glossaryEntries().filter((x) => ['rtcb', 'fourcp', 'sb6', 'ancillary_services'].includes(x.id))) {
      expect(g.definition.includes('—'), g.id).toBe(false);
    }
  });
});

describe('tour', () => {
  it('changes only the Atlas step, and only with V4 on', () => {
    expect(tourSteps(false)).toEqual(TOUR_STEPS);
    const on = tourSteps(true);
    expect(on).toHaveLength(TOUR_STEPS.length);
    expect(on.map((s) => s.title)).toEqual(TOUR_STEPS.map((s) => s.title));
    expect(on.map((s) => s.anchor)).toEqual(TOUR_STEPS.map((s) => s.anchor));
    const changed = on.filter((s, i) => s.body !== TOUR_STEPS[i].body);
    expect(changed.map((s) => s.title)).toEqual(['Atlas']);
    expect(changed[0].body).toMatch(/search/);
  });
});
