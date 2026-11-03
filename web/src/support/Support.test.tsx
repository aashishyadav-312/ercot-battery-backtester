// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { SupportButton, SupportPanel } from './Support';
import { barState } from './api';

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
  window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** A fake Worker: `total` and `zelle` are the JSON bodies, or a status number for a failure. */
function mockWorker({ total = { raised: 52.5, goal: 210 } as object | number, zelle = { zelle: '000-000-0000' } as object | number } = {}) {
  const reply = (b: object | number) => (typeof b === 'number' ? new Response('', { status: b }) : Response.json(b));
  const f = vi.fn(async (url: string) => (url.includes('/support/total') ? reply(total) : url.includes('/support/zelle') ? reply(zelle) : new Response('', { status: 404 })));
  vi.stubGlobal('fetch', f);
  return f;
}
const view = (ui: React.ReactElement) => render(<MantineProvider env="test">{ui}</MantineProvider>);

describe('bar math', () => {
  it('fills from zero, partway, and caps over the goal at 100%', () => {
    expect(barState(0, 210)).toEqual({ fraction: 0, now: 0, label: '$0 of $210', reached: false });
    expect(barState(52.5, 210)).toEqual({ fraction: 0.25, now: 52.5, label: '$52.50 of $210', reached: false });
    expect(barState(300, 210)).toEqual({ fraction: 1, now: 210, label: '$300 of $210', reached: true });
  });
});

describe('popover states', () => {
  it('shows a labelled progress bar and the goal from the Worker', async () => {
    mockWorker({ total: { raised: 52.5, goal: 240 } });
    view(<SupportPanel titleId="t" />);
    const bar = await screen.findByRole('progressbar');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('240');
    expect(bar.getAttribute('aria-valuenow')).toBe('52.5');
    expect(bar.getAttribute('aria-label')).toBe('$52.50 of $240');
    expect(screen.getByText(/Chargeline cost \$240 in AI credits/)).toBeTruthy();
  });

  it('says the goal is reached instead of the bar, and keeps the links', async () => {
    mockWorker({ total: { raised: 215, goal: 210 } });
    view(<SupportPanel titleId="t" />);
    expect(await screen.findByText('Goal reached. Thank you.')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('link', { name: /Card or Apple Pay/ }).getAttribute('href')).toBe('https://ko-fi.com/x0aashish');
    expect(screen.getByRole('link', { name: '@x0aashish' })).toBeTruthy();
  });

  it('hides the bar and amount when the total fails, and keeps the buttons', async () => {
    const f = mockWorker({ total: 503 });
    view(<SupportPanel titleId="t" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Checking the total…')).toBeNull());
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/ of \$/)).toBeNull();
    const kofi = screen.getByRole('link', { name: /Card or Apple Pay/ });
    expect(kofi.getAttribute('target')).toBe('_blank');
    expect(kofi.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('Zelle', () => {
  it('reveals the number on request and copies it', async () => {
    mockWorker();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    view(<SupportPanel titleId="t" />);
    expect(screen.queryByText('000-000-0000')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show number' }));
    expect(await screen.findByText('000-000-0000')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied')).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith('000-000-0000');
  });

  it('removes the row when the number cannot be fetched', async () => {
    mockWorker({ zelle: 404 });
    view(<SupportPanel titleId="t" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show number' }));
    await waitFor(() => expect(screen.queryByText('Zelle')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Show number' })).toBeNull();
  });
});

describe('header button', () => {
  it('opens a dialog that takes focus, and Esc closes it and returns focus', async () => {
    mockWorker();
    view(<SupportButton />);
    const btn = screen.getByRole('button', { name: 'Support Chargeline' });
    btn.focus();
    fireEvent.click(btn);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(dialog.getAttribute('aria-labelledby')).toBe(screen.getByRole('heading', { name: 'Support Chargeline' }).id);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(btn);
  });
});
