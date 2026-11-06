// @vitest-environment jsdom
// v4 Step 9: the sticky inputs panels (Studio, Data Center mode, Economics assumptions) are capped to the viewport and scroll inside
// themselves; a field that gets focus in the hidden part is scrolled into view; below 1000px nothing is sticky.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { revealFocused } from './panelScroll';

afterEach(cleanup);
const css = (f: string) => readFileSync(resolve(process.cwd(), 'src', f), 'utf8');

/** The declarations of the first rule for `selector` inside the media block that starts with `media`, or at top level when null. */
function block(source: string, media: string | null, selector: string): string {
  let scope = source;
  if (media) {
    const at = source.indexOf(`@media (${media})`);
    expect(at, `@media (${media})`).toBeGreaterThan(-1);
    scope = source.slice(at, source.indexOf('\n}', at));
  }
  const re = new RegExp(`(?:^|\\n)\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`); // the rule that starts with this selector, not a shared one
  const m = re.exec(scope);
  expect(m, selector).not.toBeNull();
  return m![1];
}

describe.each([
  ['Studio inputs', 'pages/Studio.module.css', '.inputs'],
  ['Economics assumptions', 'pages/Economics.module.css', '.assumptions'],
])('%s panel styles', (_name, file, sel) => {
  const source = css(file);
  const wide = block(source, 'min-width: 1000px', sel);

  it('is sticky below the header, capped to the viewport, and scrolls inside itself', () => {
    expect(wide).toMatch(/position:\s*sticky/);
    expect(wide).toMatch(/top:\s*calc\(var\(--app-header-h, 72px\) \+ 16px\)/);
    expect(wide).toMatch(/max-height:\s*calc\(100dvh - var\(--app-header-h, 72px\) - 32px\)/);
    expect(wide).toMatch(/overflow-y:\s*auto/);
    expect(wide).toMatch(/overscroll-behavior:\s*contain/);
    expect(wide).toMatch(/scroll-padding-block/);
  });

  it('only becomes sticky at 1000px and wider, so narrower screens stack normally', () => {
    const base = block(source, null, sel);
    expect(base).not.toMatch(/position:\s*sticky/);
    expect(base).not.toMatch(/max-height/);
    expect(base).not.toMatch(/overflow-y/);
  });

  it('draws a soft edge at the bottom that a content-attached cover hides at the end', () => {
    const base = block(source, null, sel);
    expect(base).toMatch(/\blocal\b|background-attachment:\s*local/);
    expect(base).toMatch(/\bscroll\b|background-attachment:[^;]*scroll/);
    expect(base).toMatch(/bottom/);
  });
});

describe('Studio layout', () => {
  it('puts the panel above the results below 1000px', () => {
    const source = css('pages/Studio.module.css');
    expect(block(source, 'max-width: 999px', '.layout')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(source).not.toMatch(/\.inputs\s*\{\s*position:\s*static/); // the old 900px rule is gone
  });
});

describe('focus brings a hidden input into view', () => {
  function Panel({ overflowing }: { overflowing: boolean }) {
    return (
      <section data-testid="panel" onFocus={revealFocused} ref={(el) => {
        if (!el) return;
        Object.defineProperty(el, 'clientHeight', { configurable: true, value: 300 });
        Object.defineProperty(el, 'scrollHeight', { configurable: true, value: overflowing ? 900 : 300 });
      }}>
        <label>First <input /></label>
        <label>Last <input /></label>
      </section>
    );
  }

  it('scrolls the focused field to the nearest edge when the panel overflows', () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    render(<Panel overflowing />);
    fireEvent.focus(screen.getByLabelText('Last'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('does nothing when the panel does not scroll (stacked, or short)', () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    render(<Panel overflowing={false} />);
    fireEvent.focus(screen.getByLabelText('Last'));
    expect(spy).not.toHaveBeenCalled();
  });
});
