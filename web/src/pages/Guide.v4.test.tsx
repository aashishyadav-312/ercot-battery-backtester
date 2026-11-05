// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import Guide, { GUIDE_SECTIONS } from './Guide';
import { Glossary } from './Learn';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { v4ConfigTerms } from '../v4/glossary';
import { GLOSSARY, glossaryEntries } from '../data/site';
import { tourSteps, TOUR_STEPS } from '../components/tour/steps';

const RULES = JSON.parse(readFileSync(resolve(process.cwd(), 'src/custom/config/datacenter_rules.json'), 'utf8'));
// The two original terms Studio's Ancillary card and the RTC+B cards use, as the glossary file holds them.
const ORIG = (JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/glossary.json'), 'utf8')) as { terms: Record<string, { definition: string }> }).terms;

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

  it('the glossary keeps the original ancillary services and RTC+B entries and lists no _v4 duplicate', () => {
    const entries = glossaryEntries();
    const ids = entries.map((g) => g.id);
    expect(ids).not.toContain('ancillary_services_v4');
    expect(ids).not.toContain('rtcb_v4');
    expect(GLOSSARY.ancillary_services.definition).toBe(ORIG.ancillary_services.definition);
    expect(GLOSSARY.ancillary_services.definition).toContain('does not simulate actual AS activation'); // the Studio Ancillary card caveat
    expect(GLOSSARY.rtcb.definition).toContain('went live on');
    expect(GLOSSARY.rtcb.definition).toBe(ORIG.rtcb.definition);
    expect(GLOSSARY.ancillary_services_v4.definition).not.toBe(GLOSSARY.ancillary_services.definition);
    for (const id of ['ancillary_services_v4', 'rtcb_v4']) expect(GLOSSARY[id].definition.includes('—'), id).toBe(false);
  });

  it('4CP and SB 6 are built from the rules config, with its source link and date', () => {
    const terms = v4ConfigTerms(RULES);
    for (const id of ['fourcp', 'sb6']) {
      expect(GLOSSARY[id].definition, id).toBe(terms[id].definition);
      expect(GLOSSARY[id].source, id).toMatch(/^https:\/\//);
      expect(GLOSSARY[id].asOf, id).toBeTruthy();
    }
    expect(GLOSSARY.fourcp.definition).toContain(RULES.fourCp.method.text);
    expect(GLOSSARY.fourcp.source).toBe(RULES.fourCp.method.source);
    expect(GLOSSARY.fourcp.asOf).toBe(RULES.fourCp.method.asOf);
    expect(GLOSSARY.sb6.definition).toContain(RULES.sb6.statute.citation);
    expect(GLOSSARY.sb6.source).toBe(RULES.sb6.statute.source);
    // The Glossary page shows the link and the date.
    render(<MantineProvider><Glossary /></MantineProvider>);
    const dd = [...document.querySelectorAll('dt')].find((t) => t.textContent === '4CP')!.nextElementSibling!;
    expect(dd.querySelector('a')!.getAttribute('href')).toBe(RULES.fourCp.method.source);
    expect(dd.textContent).toContain(`as of ${RULES.fourCp.method.asOf}`);
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
