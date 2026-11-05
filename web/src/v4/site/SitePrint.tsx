import { createPortal } from 'react-dom';
import { usd } from '../../data/format';
import { TERMS } from '../../copy/terms';
import type { Point, Settings } from './siteValue';
import classes from './SiteCard.module.css';

export interface SheetSite { name: string; lat: number; lon: number; county: string | null; city: string | null; basisLabel: string; modeLabel: string; link: string; caveats: string[]; sources: string[] }

/** A clean one-page result for the browser's print dialog. Hidden on screen; when printing, the rest of the page is hidden and this shows. */
export function SitePrint({ site, s, strip, today }: { site: SheetSite; s: Settings; strip: Point[]; today: string }) {
  const cur = strip.find((p) => p.year === s.year);
  const r = cur?.range;
  return createPortal(
    <div className={classes.sheet} data-testid="site-print">
      <p className={classes.sheetKicker}>Chargeline · Site value · {today}</p>
      <h1 className={classes.sheetTitle}>{site.name}</h1>
      <p>{[site.county ? `${site.county} County` : null, `${site.lat.toFixed(3)}, ${site.lon.toFixed(3)}`, site.city].filter(Boolean).join(' · ')}</p>
      <p>{site.basisLabel} · {site.modeLabel} · {s.durationH}-hour battery · {cur?.label ?? s.year} · {TERMS.revenueUnit.label}</p>
      <p className={classes.sheetBig}>{r ? `${usd(r.min, 1)} to ${usd(r.max, 1)}` : cur?.hub != null ? usd(cur.hub, 1) : 'No result'}</p>
      {r && <p>Median {usd(r.median, 1)} over the {r.n} of {r.of} nearest nodes that have a result.</p>}
      {!r && cur?.hub != null && <p>Nearest hub {cur.hubCode}. No all-node result for these settings.</p>}
      {r && (
        <table className={classes.sheetTable}>
          <thead><tr><th>Node</th><th>Distance (km)</th><th>{TERMS.revenueUnit.label}</th></tr></thead>
          <tbody>{r.nodes.map((n) => <tr key={n.code}><td>{n.code}</td><td>{n.km.toFixed(1)}</td><td>{usd(n.value, 1)}</td></tr>)}</tbody>
        </table>
      )}
      <table className={classes.sheetTable}>
        <thead><tr><th>Year</th><th>Range</th><th>Median</th><th>Nearest hub</th></tr></thead>
        <tbody>
          {strip.map((p) => (
            <tr key={p.year}>
              <td>{p.label}</td>
              <td>{p.range ? `${usd(p.range.min, 1)} to ${usd(p.range.max, 1)}` : '–'}</td>
              <td>{p.range ? usd(p.range.median, 1) : '–'}</td>
              <td>{p.hub != null ? `${usd(p.hub, 1)} (${p.hubCode})` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>{site.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
      {site.sources.length > 0 && <p>Sources: {site.sources.join('; ')}</p>}
      <p className={classes.sheetLink}>{site.link}</p>
    </div>,
    document.body,
  );
}
