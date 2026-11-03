import type { MouseEvent } from 'react';
import type { LiveChip as Model } from '../../live/chip';
import classes from './LiveChip.module.css';

/**
 * Live proof under the hero buttons. The dot is keyed on the snapshot time, so it remounts and pulses once each time
 * a new snapshot arrives, never on a loop. The chip jumps to the section with the hub prices (`targetId`).
 */
export function LiveChip({ chip, targetId }: { chip: Model; targetId: string }) {
  const jump = (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(targetId);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  };
  return (
    <a className={classes.chip} href="#/home" onClick={jump} data-state={chip.state} data-testid="live-chip">
      <span key={chip.stamp ?? chip.state} className={classes.dot} aria-hidden="true" />
      <span>{chip.text}</span>
    </a>
  );
}
