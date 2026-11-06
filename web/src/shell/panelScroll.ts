// Sticky inputs panels (Studio, Data Center mode, Economics) scroll inside themselves. Browsers already bring a focused field into
// view; this makes it explicit so an input in the hidden part of the panel is never left out of sight (tab, Shift+Tab, a label click).
import type { FocusEvent } from 'react';

/** onFocus for the panel element: when the panel overflows, scroll the focused field to the nearest edge. */
export function revealFocused(e: FocusEvent<HTMLElement>): void {
  const panel = e.currentTarget;
  const target = e.target;
  if (!(target instanceof HTMLElement) || target === panel) return;
  if (panel.scrollHeight <= panel.clientHeight + 1) return; // nothing is hidden (also the case when the panel is not scrolling)
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
