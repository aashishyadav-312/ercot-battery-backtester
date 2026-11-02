import { useState } from 'react';
import { useLiveFeed } from '../../live/useLiveFeed';
import { tickerModel, type TickerModel } from '../../shell/ticker';
import classes from './Ticker.module.css';

/** Presentational strip. Takes a model so the states (live, delayed, saved, unavailable) can be rendered and tested without a network. */
export function TickerView({ model }: { model: TickerModel }) {
  const [paused, setPaused] = useState(false);
  const moving = model.items.length > 0;
  const list = (hidden: boolean) => (
    <ul className={classes.list} aria-hidden={hidden || undefined} data-copy={hidden ? 'dup' : undefined}>
      {model.items.map((it) => (
        <li key={it.loc} className={classes.item}>
          <span className={classes.sym}>{it.loc}</span>
          <span className={classes.px}>{it.price}</span>
          {it.change !== null && <span className={classes.chg} data-dir={it.dir}>{it.change}</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <section className={classes.ticker} aria-label="Live hub prices" data-status={model.status} data-paused={paused || undefined}>
      <div className={classes.lead}>
        <span className={classes.dot} aria-hidden="true" data-live={model.status === 'live' || undefined} />
        <span className={classes.title}>{model.status === 'cached' ? 'Hubs' : 'Live hubs'}</span>
        {model.badge && <span className={classes.badge}>{model.badge}</span>}
      </div>
      <div className={classes.viewport}>
        {moving ? (
          <div className={classes.track}>{list(false)}{list(true)}</div>
        ) : (
          <p className={classes.note}>{model.summary}</p>
        )}
      </div>
      <div className={classes.tail}>
        {moving && (
          <button type="button" className={classes.pause} aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
            {paused ? 'Play' : 'Pause'}
          </button>
        )}
        <span className={classes.unit} aria-label="dollars per megawatt-hour">$/MWh</span>
      </div>
      {/* One plain sentence for screen readers; the moving strip itself is not announced. */}
      <p className={classes.sr}>{moving ? model.summary : ''}</p>
    </section>
  );
}

export function Ticker() {
  const { load, now } = useLiveFeed();
  return <TickerView model={tickerModel(load, now)} />;
}
