import { locFull, locName } from '../../data/site';
import { usd } from '../../data/format';
import { latest, moveDir, type LiveState } from '../../live/live';
import { MoveArrow } from './MoveArrow';
import classes from './HubTiles.module.css';

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${usd(Math.abs(v), 2)}`;

/** One tile's text, shared by the Live page and Home so both say the same thing about the same snapshot. */
export function tileOf(s: LiveState, loc: string) {
  const l = latest(s.today.rt[loc] ?? []);
  if (!l) return { loc, price: null, dir: 'flat' as const, change: 'No price posted yet today' };
  if (l.change == null) return { loc, price: usd(l.price, 2), dir: 'flat' as const, change: 'No earlier interval to compare' };
  return { loc, price: usd(l.price, 2), dir: moveDir(l.change), change: `${signed(l.change)} vs previous 15 min` };
}

/**
 * Latest real-time price at each hub. With `onSelect` each tile is a toggle button (Live page: picks the hub the charts
 * show); with `hrefFor` each is a link (Home: opens the Live view); otherwise plain text.
 * Up and down use --up and --down, the same green-up, red-down rule as the ticker.
 */
export function HubTiles({ s, selected, onSelect, hrefFor }: {
  s: LiveState;
  selected?: string;
  onSelect?: (loc: string) => void;
  hrefFor?: (loc: string) => string;
}) {
  return (
    <ul className={classes.grid} aria-label="Latest real-time price at each hub">
      {s.hubs.map((loc) => {
        const t = tileOf(s, loc);
        const body = (
          <>
            <span className={classes.name}>{locName(loc)}</span>
            <span className={classes.price}>
              {t.price ?? '–'}<span className={classes.unit}>/MWh</span>
            </span>
            <span className={classes.change} data-dir={t.dir}><MoveArrow dir={t.dir} />{t.change}</span>
          </>
        );
        return (
          <li key={loc}>
            {onSelect ? (
              <button type="button" className={classes.tile} data-interactive aria-pressed={selected === loc}
                aria-label={`${locFull(loc)}: ${t.price ?? 'no price'} per MWh, ${t.change}. Show in the charts`} onClick={() => onSelect(loc)}>
                {body}
              </button>
            ) : hrefFor ? (
              <a className={classes.tile} data-interactive href={hrefFor(loc)}>{body}</a>
            ) : (
              <div className={classes.tile}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
