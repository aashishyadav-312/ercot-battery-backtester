import type { MoveDir } from '../../live/live';
import classes from './MoveArrow.module.css';

/** Up or down triangle before a price change, so direction never rests on colour alone. The sign carries it for screen readers. */
export function MoveArrow({ dir }: { dir: MoveDir }) {
  if (dir === 'flat') return null;
  return <span aria-hidden="true" className={classes.arrow}>{dir === 'up' ? '▲' : '▼'}</span>;
}
