// V5 Step 5: 4CP and 12CP side by side on the same battery, load and prices. The selected rule drives the main result, the
// breakdown and the dispatch chart elsewhere on the page; this block always shows both. Every figure comes from runTwelveCpCase,
// every sentence about the rule from twelvecp_rules.json.
import { usd } from '../data/format';
import { money } from '../data/studio';
import type { TwelveCpComparison } from '../custom/twelvecp';
import type { Tcos } from '../v4/dc/dcForm';
import { TCOS_LABEL, tcosRows, tcosRuleText } from './tcos';
import studio from '../pages/Studio.module.css';
import classes from './TcosBlock.module.css';

export default function TcosBlock({ comparison: c, tcos }: { comparison: TwelveCpComparison; tcos: Tcos }) {
  const rows = tcosRows(c);
  const rule = tcosRuleText();
  const realistic = c.strategy === 'realistic';
  return (
    <section className={studio.card} aria-labelledby="dc-tcos-title" data-testid="dc-tcos">
      <h2 id="dc-tcos-title" className={studio.cardTitle}>Transmission charge: 4CP and 12CP</h2>
      <p className={studio.meta}>Same battery, load and prices, per kW of battery power per year. A backtest, not a forecast.</p>
      <div className={classes.pair}>
        {rows.map((x) => {
          const o = x.outcome;
          return (
            <div key={x.tcos} className={classes.opt} data-selected={x.tcos === tcos || undefined} data-testid={`dc-cmp-${x.tcos}`}>
              <div className={classes.head}>
                <h3 className={classes.name}>{x.label}</h3>
                {x.tcos === tcos && <span className={classes.pill}>Shown above</span>}
              </div>
              <dl className={classes.list}>
                <div className={classes.item}>
                  <dt>Avoided charge</dt>
                  <dd><span data-testid={`dc-cmp-${x.tcos}-avoided`}>{usd(o.avoidedPerKwYr, 1)}</span> $/kW-yr<small>{money(o.avoidedUsd)}/yr</small></dd>
                </div>
                <div className={classes.item}>
                  <dt>Alert days</dt>
                  <dd data-testid={`dc-cmp-${x.tcos}-alert`}>{realistic ? o.alertDays : 'n/a'}</dd>
                </div>
                <div className={classes.item}>
                  <dt>Energy revenue given up</dt>
                  <dd><span data-testid={`dc-cmp-${x.tcos}-given`}>{usd(o.energyGivenUpPerKwYr, 1)}</span> $/kW-yr<small>{money(o.energyGivenUpUsd)}/yr</small></dd>
                </div>
                <div className={`${classes.item} ${classes.net}`}>
                  <dt>Net value</dt>
                  <dd><span data-testid={`dc-cmp-${x.tcos}-net`}>{usd(o.netPerKwYr, 1)}</span> $/kW-yr<small>{money(o.netUsd)}/yr</small></dd>
                </div>
              </dl>
              <p className={classes.partial}>
                {usd(o.ratePerKw, 2)} per peak, {o.peaksInYear} peaks in a year.
                {x.partial && <span data-testid={`dc-cmp-${x.tcos}-partial`}> The data has only {x.partial}, so this covers those months and nothing more.</span>}
              </p>
            </div>
          );
        })}
      </div>
      <p className={studio.small}>
        Net value is the avoided charge less the energy and ancillary revenue the battery gives up to hold the cuts. {realistic
          ? 'Alert days are days the day-ahead plan held a cut.'
          : 'Perfect foresight knows every peak, so it has no alert days.'}
      </p>

      <div className={classes.rules} data-testid="dc-tcos-rules">
        <p className={studio.small} style={{ marginTop: 0 }}><b>{TCOS_LABEL['12cp']}: {rule.status.value}.</b> {rule.status.text}</p>
        <p className={studio.small}>{rule.method.text} ({rule.method.citation}.)</p>
        <p className={studio.small}>{rule.rate.text}</p>
        <p className={studio.small}>{rule.billing.text}</p>
        <ul className={classes.links}>
          {[...new Set([...rule.status.sources, rule.method.source])].map((u) => (
            <li key={u}><a href={u} target="_blank" rel="noreferrer">{u.replace(/^https:\/\/(www\.)?/, '')}</a></li>
          ))}
        </ul>
        <details className={classes.more}>
          <summary>What the 12CP model ignores</summary>
          <ul className={classes.bullets}>
            <li>{rule.resolution.text}</li>
            {rule.notModelled.map((n) => <li key={n.id}>{n.text}</li>)}
          </ul>
        </details>
        <p className={studio.small}>Status of 12CP checked {rule.asOf}: {rule.status.value}. A proposal can change before any adoption.</p>
      </div>
    </section>
  );
}
