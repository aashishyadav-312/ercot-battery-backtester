import type { IndexRun, Selection } from '../../data/types';
import { dataThrough, SITE } from '../../data/site';
import { fmtDate } from '../../data/format';
import { buildHash } from '../../shell/route';
import { requestTour } from '../tour/steps';
import { requestSupport } from '../../support/api';
import classes from './Footer.module.css';

/** Disclaimer, who built it, the data cut-off and where to report problems. Shown under every page. */
export function Footer({ index, sel }: { index: IndexRun[] | null; sel: Selection }) {
  const d = index ? dataThrough(index) : null;
  const split = d && d.hubs && d.nodes && d.hubs !== d.nodes;
  return (
    <footer className={classes.footer}>
      <div className={classes.inner}>
        <p className={classes.lead}>
          Backtest of a price-taking battery on ERCOT public prices, with figures per kW of power capacity. A study of the past, not a forecast or investment advice.
        </p>
        <p className={classes.small}>
          {d && (
            <>
              <span>Data through {fmtDate(d.all)}</span>
              {split && <span> (hubs through {fmtDate(d.hubs!)}, resource nodes through {fmtDate(d.nodes!)})</span>}
              {' · '}
            </>
          )}
          Built by <b>{SITE.author}</b>, {SITE.role}.{' '}
          <a href={SITE.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a> ·{' '}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a> ·{' '}
          <a href={SITE.feedback}>Report an issue</a> ·{' '}
          <a href={buildHash('author', sel)}>About the author</a> ·{' '}
          <button type="button" className={classes.link} onClick={requestTour}>Take the tour</button> ·{' '}
          <button type="button" className={classes.link} onClick={requestSupport}>Support</button>
        </p>
        <p className={classes.small}>
          An independent project, not affiliated with ERCOT or any company. Prices are ERCOT public data. Results are illustrative models.
        </p>
      </div>
    </footer>
  );
}
