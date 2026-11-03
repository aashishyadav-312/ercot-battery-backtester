import { num, pct, usd } from '../../data/format';
import type { CaptureChart, GroupedChart } from '../../data/research';
import classes from './Charts.module.css';

/** Every chart is a figure with a one-sentence summary for screen readers and its numbers as a table. */
function Frame({ chart, id, wide, summary, children, table }: {
  chart: { title: string; meta: string; note: string };
  id: string;
  wide?: boolean;
  summary: string;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <figure className={classes.figure} data-wide={wide || undefined} aria-labelledby={`${id}-t`} data-testid={id}>
      <figcaption>
        <h3 id={`${id}-t`} className={classes.title} data-testid={`${id}-title`}>{chart.title}</h3>
        <p className={classes.meta}>{chart.meta}</p>
      </figcaption>
      <div role="img" aria-label={summary}>{children}</div>
      <details className={classes.details}>
        <summary>Show the numbers as a table</summary>
        <div className={classes.tableBox} tabIndex={0} role="region" aria-label={`${chart.title} Table`}>{table}</div>
      </details>
      <p className={classes.note} data-testid={`${id}-note`}>{chart.note}</p>
    </figure>
  );
}

function Legend({ items }: { items: { name: string; tone: string }[] }) {
  return (
    <ul className={classes.legend} aria-hidden="true">
      {items.map((s) => <li key={s.name}><span className={classes.swatch} data-tone={s.tone} />{s.name}</li>)}
    </ul>
  );
}

/** Vertical bars grouped by label, one bar per series. Heights share one scale; values print above the bars. */
export function GroupedBars({ id, chart, wide }: { id: string; chart: GroupedChart; wide?: boolean }) {
  const max = Math.max(1e-9, ...chart.groups.flatMap((g) => g.values.filter((v): v is number => v != null)));
  const summary = `${chart.title} ${chart.groups.map((g) => `${g.label}: ${g.values.map((v, i) => `${chart.series[i].name} ${usd(v, 0)}`).join(', ')}.`).join(' ')}`;
  return (
    <Frame
      id={id} chart={chart} wide={wide} summary={summary}
      table={(
        <table className={classes.table}>
          <thead>
            <tr><th scope="col">Group</th>{chart.series.map((s) => <th key={s.name} scope="col" className={classes.num}>{s.name}</th>)}</tr>
          </thead>
          <tbody>
            {chart.groups.map((g) => (
              <tr key={g.label}>
                <th scope="row">{g.label}</th>
                {g.values.map((v, i) => <td key={i} className={classes.num}>{usd(v, 1)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    >
      <ol className={classes.groups} aria-hidden="true">
        {chart.groups.map((g) => (
          <li key={g.label} className={classes.group}>
            <div className={classes.bars}>
              {g.values.map((v, i) => (
                <span key={i} className={classes.bar} data-tone={chart.series[i].tone}>
                  <span className={classes.val}>{v == null ? '' : num(v, 0)}</span>
                  <span className={classes.fill} style={{ height: `${v == null ? 0 : (v / max) * 100}%` }} />
                </span>
              ))}
            </div>
            <span className={classes.glabel}>{g.label}</span>
          </li>
        ))}
      </ol>
      <Legend items={chart.series} />
    </Frame>
  );
}

/** Before and after capture rate, two bars per hub. */
export function CaptureBars({ id, chart }: { id: string; chart: CaptureChart }) {
  const series = [{ name: chart.before, tone: 'dot' }, { name: chart.after, tone: 'blue' }];
  const summary = `${chart.title} ${chart.rows.map((r) => `${r.code}: ${pct(r.before)} before, ${pct(r.after)} after.`).join(' ')}`;
  return (
    <Frame
      id={id} chart={chart} summary={summary}
      table={(
        <table className={classes.table}>
          <thead>
            <tr><th scope="col">Hub</th><th scope="col" className={classes.num}>Before</th><th scope="col" className={classes.num}>After</th><th scope="col" className={classes.num}>Change, points</th></tr>
          </thead>
          <tbody>
            {chart.rows.map((r) => (
              <tr key={r.code}><th scope="row">{r.code}</th><td className={classes.num}>{pct(r.before)}</td><td className={classes.num}>{pct(r.after)}</td><td className={classes.num}>{num(r.pts, 1)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    >
      <ul className={classes.hrows} aria-hidden="true">
        {chart.rows.map((r) => (
          <li key={r.code} className={classes.hrow}>
            <div className={classes.hhead}><span>{r.code}</span><span className={classes.hval}>{pct(r.before)} to <b>{pct(r.after)}</b></span></div>
            <div className={classes.track}><span className={classes.hfill} data-tone="dot" style={{ width: `${r.before * 100}%` }} /></div>
            <div className={classes.track}><span className={classes.hfill} data-tone="blue" style={{ width: `${r.after * 100}%` }} /></div>
          </li>
        ))}
      </ul>
      <Legend items={series} />
    </Frame>
  );
}
