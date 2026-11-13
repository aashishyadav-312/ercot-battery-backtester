// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tour } from './Tour';
import { PHONE_MAX, DONE_KEY, SHOWN_KEY, TOUR_STEPS, placePopover, requestTour, resetTourSession, shouldAutoStart } from './steps';

vi.mock('../../config/features', async (orig) => ({ ...(await orig<typeof import('../../config/features')>()), V5: false })); // these tests describe the shell with V5 off

let page = 'home';
const go = vi.fn((p: string) => { page = p; });
vi.mock('../../state', () => ({ useApp: () => ({ page, go }) }));

beforeEach(() => {
  vi.useFakeTimers();
  page = 'home';
  go.mockClear();
  resetTourSession();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
  document.body.innerHTML = '';
  const hero = document.createElement('section');
  hero.setAttribute('data-tour', 'hero');
  const btn = document.createElement('button');
  btn.textContent = 'Outside';
  document.body.append(hero, btn);
  for (const t of ['atlas', 'studio', 'research', 'learn']) {
    const a = document.createElement('a');
    a.setAttribute('data-tour', `tab-${t}`);
    document.body.append(a);
  }
  const support = document.createElement('button');
  support.setAttribute('data-tour', 'support');
  document.body.append(support);
  window.innerWidth = 1280;
  window.scrollTo = vi.fn() as never;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const mount = async () => {
  render(<Tour />);
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
};

describe('tour rules', () => {
  it('opens by itself on Home, with or without a query, until it has been seen', () => {
    expect(shouldAutoStart('home')).toBe(true);
    expect(shouldAutoStart('atlas')).toBe(false);
    sessionStorage.setItem(SHOWN_KEY, '1');
    expect(shouldAutoStart('home')).toBe(false);
    sessionStorage.clear();
    localStorage.setItem(DONE_KEY, '1');
    expect(shouldAutoStart('home')).toBe(false);
  });

  it('does not show again this session when storage fails', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(shouldAutoStart('home')).toBe(false);
    set.mockRestore();
  });

  it('copy: six steps with the exact titles', () => {
    expect(TOUR_STEPS.map((s) => s.title)).toEqual(['Welcome to Chargeline', 'Atlas', 'Studio', 'Research', 'Learn', 'Support']);
    expect(PHONE_MAX).toBe(640);
  });

  it('places the popover under a small anchor, and at the bottom edge when the anchor is too tall', () => {
    const vp = { width: 1280, height: 800 };
    const pop = { width: 340, height: 180 };
    const small = placePopover({ left: 600, top: 10, width: 60, height: 40 }, pop, vp);
    expect(small.top).toBe(62);
    expect(small.side).toBe('below');
    expect(small.left).toBe(630 - 170);
    const lower = placePopover({ left: 100, top: 414, width: 560, height: 460 }, pop, vp, 104);
    expect(lower.side).toBe('above');
    expect(lower.top + pop.height + 12).toBe(414);
    const tall = placePopover({ left: 40, top: 70, width: 900, height: 700 }, pop, vp, 104);
    expect(tall.side).toBe('over');
    expect(tall.top + pop.height).toBeLessThanOrEqual(vp.height);
    const edge = placePopover({ left: 1250, top: 10, width: 20, height: 40 }, pop, vp);
    expect(edge.left + pop.width).toBeLessThanOrEqual(vp.width);
  });
});

describe('Tour', () => {
  it('shows on a first Home visit as a named, non-modal dialog and remembers Skip', async () => {
    await mount();
    const d = screen.getByRole('dialog', { name: 'Welcome to Chargeline' });
    expect(d.getAttribute('aria-modal')).toBeNull();
    expect(screen.getByText('1 of 6')).toBeTruthy();
    expect(document.activeElement).toBe(d);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem(SHOWN_KEY)).toBe('1');
    expect(localStorage.getItem(DONE_KEY)).toBeNull(); // skipping is not finishing
    cleanup();
    resetTourSession(); // a refresh: same tab, so the session flag still holds
    await mount();
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    resetTourSession();
    sessionStorage.clear(); // the browser was closed and reopened: it shows again
    await mount();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows on Home even when the URL has a query', async () => {
    window.location.hash = '#/home?loc=HB_WEST&dur=2&year=2025&deg=10';
    await mount();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('does not show when already seen this session', async () => {
    sessionStorage.setItem(SHOWN_KEY, '1');
    await mount();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keyboard path: Next, Back and Done work and focus returns to where it was', async () => {
    const outside = screen.getByRole('button', { name: 'Outside' });
    outside.focus();
    await mount();
    const next = () => screen.getByRole('button', { name: 'Next' });
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    fireEvent.click(next(), { detail: 0 }); // a keyboard activation has detail 0
    expect(screen.getByRole('dialog', { name: 'Atlas' }).hasAttribute('data-animate')).toBe(false);
    expect(screen.getByText('2 of 6')).toBeTruthy();
    expect(document.querySelector('[data-tour="tab-atlas"]')!.hasAttribute('data-tour-active')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }), { detail: 0 });
    expect(screen.getByRole('dialog', { name: 'Welcome to Chargeline' })).toBeTruthy();
    for (let i = 0; i < 5; i++) fireEvent.click(next(), { detail: 0 });
    expect(screen.getByRole('dialog', { name: 'Support' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(outside);
    expect(localStorage.getItem(DONE_KEY)).toBe('1'); // finishing is remembered for good
    expect(document.querySelector('[data-tour-active]')).toBeNull();
  });

  it('Esc closes it and counts as seen', async () => {
    await mount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem(SHOWN_KEY)).toBe('1');
  });

  it('a replay request opens it again from step 1, and goes to Home first when needed', async () => {
    sessionStorage.setItem(SHOWN_KEY, '1');
    page = 'learn';
    const { rerender } = render(<Tour />);
    act(() => requestTour());
    expect(go).toHaveBeenCalledWith('home');
    rerender(<Tour />); // page is now home
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.getByRole('dialog', { name: 'Welcome to Chargeline' })).toBeTruthy();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});
