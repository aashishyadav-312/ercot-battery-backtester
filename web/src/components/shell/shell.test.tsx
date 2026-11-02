// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TickerView } from './Ticker';
import { Header } from './Header';
import { ViewBar } from './ViewBar';
import { tickerModel } from '../../shell/ticker';
import { TABS } from '../../shell/route';
import type { LiveState } from '../../live/live';

afterEach(cleanup);

const STATE: LiveState = {
  version: 1,
  checkedAt: '2026-11-03T18:05:00.000Z',
  errors: [],
  hubs: ['HB_HOUSTON', 'HB_WEST'],
  nodes: [],
  today: { date: '2026-11-03', startUtc: '2026-11-03T06:00:00.000Z', hours: 24, rt: { HB_HOUSTON: [30.9, 31.4], HB_WEST: [25.1, 24.7] }, da: null },
  tomorrow: { date: '2026-11-04', startUtc: '2026-11-04T06:00:00.000Z', hours: 24, da: null, daFirstSeenAt: null },
};
const NOW = Date.parse('2026-11-03T12:30:00.000Z');

describe('Ticker', () => {
  it('prints the latest hub prices from the snapshot, and nothing else', () => {
    render(<TickerView model={tickerModel({ source: 'worker', state: STATE }, NOW)} />);
    const strip = screen.getByRole('region', { name: 'Live hub prices' });
    for (const loc of STATE.hubs) {
      const prices = STATE.today.rt[loc] as number[];
      const li = within(strip).getAllByText(loc)[0].closest('li')!;
      expect(li.textContent).toContain(prices.at(-1)!.toFixed(2));
    }
  });

  it('copies the strip once for a seamless loop and hides the copy from assistive technology', () => {
    const { container } = render(<TickerView model={tickerModel({ source: 'worker', state: STATE }, NOW)} />);
    const lists = container.querySelectorAll('ul');
    expect(lists).toHaveLength(2);
    expect(lists[0].getAttribute('aria-hidden')).toBeNull();
    expect(lists[1].getAttribute('aria-hidden')).toBe('true');
  });

  it('has a Pause button that toggles and says what state it is in', () => {
    render(<TickerView model={tickerModel({ source: 'worker', state: STATE }, NOW)} />);
    const btn = screen.getByRole('button', { name: 'Pause' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('region', { name: 'Live hub prices' }).hasAttribute('data-paused')).toBe(true);
  });

  it('shows "Live prices unavailable" and no digits, no Pause button, when there is no feed', () => {
    render(<TickerView model={tickerModel({ source: 'none', reason: 'the live service could not be reached' }, NOW)} />);
    const strip = screen.getByRole('region', { name: 'Live hub prices' });
    expect(within(strip).getByText('Live prices unavailable')).toBeTruthy();
    expect(strip.textContent!.replace('$/MWh', '')).not.toMatch(/\d/);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('marks saved prices as saved, with their age', () => {
    render(<TickerView model={tickerModel({ source: 'cache', state: STATE, reason: 'x' }, Date.parse(STATE.checkedAt) + 2 * 60 * 60_000)} />);
    expect(screen.getByText('Saved 2 h ago')).toBeTruthy();
  });
});

describe('Header', () => {
  const sel = { location: 'HB_WEST', duration: 4, year: 2025, deg: 10 };

  it('has the five tabs as real links, in order, with the current one marked', () => {
    render(<Header active="research" sel={sel} scheme="dark" onToggleScheme={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Atlas', 'Studio', 'Research', 'Guide']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '#/home?loc=HB_WEST&dur=4&year=2025&deg=10',
      '#/atlas?loc=HB_WEST&dur=4&year=2025&deg=10',
      '#/studio/custom?loc=HB_WEST&dur=4&year=2025&deg=10',
      '#/research/overview?loc=HB_WEST&dur=4&year=2025&deg=10',
      '#/guide/start?loc=HB_WEST&dur=4&year=2025&deg=10',
    ]);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual(['Research']);
  });

  it('has a theme toggle that names the theme it switches to', () => {
    const on = vi.fn();
    const { rerender } = render(<Header active="home" sel={sel} scheme="dark" onToggleScheme={on} />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(on).toHaveBeenCalledTimes(1);
    rerender(<Header active="home" sel={sel} scheme="light" onToggleScheme={on} />);
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
  });
});

describe('ViewBar', () => {
  const sel = { location: 'HB_HOUSTON', duration: 2, year: 2025, deg: 10 };

  it('lists the pages of a multi-page tab and marks the current one', () => {
    render(<ViewBar tab="research" page="dispatch" sel={sel} />);
    const nav = screen.getByRole('navigation', { name: 'Research pages' });
    const names = within(nav).getAllByRole('link').map((l) => l.textContent);
    expect(names).toEqual(TABS.find((t) => t.tab === 'research')!.views.map((v) => v.label));
    expect(within(nav).getByRole('link', { name: 'Dispatch' }).getAttribute('aria-current')).toBe('page');
  });

  it('renders nothing for a single-page tab with no selectors', () => {
    const { container } = render(<ViewBar tab="atlas" page="map" sel={sel} />);
    expect(container.firstChild).toBeNull();
  });
});
