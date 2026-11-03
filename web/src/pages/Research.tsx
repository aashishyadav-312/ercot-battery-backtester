import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state';
import { loadAncillary, loadAncillaryCapped, loadAncillaryRun, loadFindings, loadNodes, loadRtcb, loadRun, HUBS } from '../data/loader';
import { hashParam } from '../shell/route';
import { parseDoc, type Doc, type Section } from '../data/markdown';
import {
  FINDINGS, MODO_SOURCES, findRow, TOPICS, ancillaryChart, cappedTotals, captureChart, countWord, fallChart, fmtRange, stackTotals,
  standard, topicLabel, validationRows, windowEnd, windowRevenue, yearsOf,
  type ResearchData, type StackTotals, type Topic, type Windows, type Capped,
} from '../data/research';
import { usd } from '../data/format';
import type { IndexRun, NodesFile, Rtcb } from '../data/types';
import { Markdown } from '../components/Markdown';
import { CaptureBars, GroupedBars } from '../components/research/Charts';
import classes from './Research.module.css';

const pad = (n: number) => String(n).padStart(2, '0');

const METHOD = [
  { title: 'One day at a time', text: 'A linear program picks the charge and discharge for every 15 minutes of the day, starting and ending the day empty.' },
  { title: 'Price taker', text: 'The battery does not move prices. A real fleet does, so this overstates what any one battery would see.' },
  { title: 'Two strategies', text: 'Perfect foresight is the upper bound. The day-ahead strategy plans on hourly day-ahead prices and settles at real-time prices.' },
  { title: 'Negative prices', text: 'Days where charging and discharging would overlap are re-solved with a binary charge-or-discharge rule.' },
  { title: 'Descriptive, not causal', text: 'The results say what changed. They do not say why.' },
];

// ------------------------------------------------------------ data

/** The numbers every card and chart needs. The three that need many files fill in after the page is already readable. */
function useResearchData(index: IndexRun[] | null) {
  const [base, setBase] = useState<{ nodes: NodesFile; rtcb: Rtcb; doc: Doc } | { error: string } | null>(null);
  const [stack, setStack] = useState<{ stack: StackTotals[]; capped: Capped | null }>({ stack: [], capped: null });
  const [windows, setWindows] = useState<Windows | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([loadNodes(), loadRtcb(), loadFindings()])
      .then(([nodes, rtcb, md]) => live && setBase({ nodes, rtcb, doc: parseDoc(md) }))
      .catch((e) => live && setBase({ error: String(e) }));
    return () => { live = false; };
  }, []);

  const nodes = base && 'nodes' in base ? base.nodes : null;
  useEffect(() => {
    if (!index || !nodes) return;
    let live = true;
    const std = standard(nodes);
    const years = yearsOf(index);
    (async () => {
      const [file, capFile] = await Promise.all([loadAncillary(), loadAncillaryCapped().catch(() => null)]);
      const rows = years.map((y) => ({ y, row: findRow(index, 'HB_HOUSTON', y, std.durationH, std.deg) })).filter((x) => x.row && file.runs[x.row.file]);
      const runs = await Promise.all(rows.map(async (x) => ({ y: x.y, run: await loadAncillaryRun(file.runs[x.row!.file]) })));
      const capRow = findRow(index, 'HB_HOUSTON', std.year, std.durationH, std.deg);
      let capped: Capped | null = null;
      if (capFile && capRow && capFile.runs[capRow.file]) {
        const run = await loadAncillaryRun(capFile.runs[capRow.file]);
        capped = cappedTotals(std.year, capFile.meta?.max_as_share ?? 0, run.daily);
      }
      if (live) setStack({ stack: runs.map((r) => stackTotals(r.y, r.run.daily)), capped });
    })().catch(() => { /* the chart and the two teasers that need it say so below */ });

    (async () => {
      const end = windowEnd(index, std);
      if (!end) return;
      const byHub: Windows['byHub'] = {};
      await Promise.all(HUBS.flatMap((h) => years.map(async (y) => {
        const row = findRow(index, h, y, std.durationH, std.deg);
        if (!row) return;
        (byHub[h] ??= {})[y] = windowRevenue(await loadRun(row.file), end);
      })));
      if (live) setWindows({ end, years, byHub });
    })().catch(() => { /* likewise */ });
    return () => { live = false; };
  }, [index, nodes]);

  const data: ResearchData | null = useMemo(
    () => (index && base && 'nodes' in base ? { index, nodes: base.nodes, rtcb: base.rtcb, stack: stack.stack, capped: stack.capped, windows } : null),
    [index, base, stack, windows],
  );
  return { data, doc: base && 'doc' in base ? base.doc : null, error: base && 'error' in base ? base.error : null };
}

/** The finding number in the hash (`#/research?f=4`), kept in step with Back and Forward. */
function useFinding(): number | null {
  const read = () => {
    const n = Number(hashParam(window.location.hash, 'f'));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const [f, setF] = useState(read);
  useEffect(() => {
    const on = () => setF(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return f;
}

export default function Research() {
  const { index } = useApp();
  const { data, doc, error } = useResearchData(index);
  const finding = useFinding();
  if (error) return <p className={classes.lede}>Could not load the results for this page: {error}</p>;
  if (!data || !doc) return <div className={classes.loading} aria-busy="true">Loading results…</div>;
  return <ResearchView data={data} doc={doc} finding={finding} />;
}

// ------------------------------------------------------------ view

export function ResearchView({ data, doc, finding }: { data: ResearchData; doc: Doc; finding: number | null }) {
  const sections = useMemo(() => new Map(doc.sections.filter((s) => s.n != null).map((s) => [s.n!, s])), [doc]);
  const first = useRef(true);
  const readerHead = useRef<HTMLHeadingElement>(null);
  const listHead = useRef<HTMLHeadingElement>(null);
  const open = finding != null && sections.has(finding) && FINDINGS.some((f) => f.n === finding) ? finding : null;

  // Opening a finding starts at its heading; going back lands on the list. Neither runs on the first render.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (open != null) { window.scrollTo({ top: 0 }); readerHead.current?.focus({ preventScroll: true }); }
    else { listHead.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); listHead.current?.focus({ preventScroll: true }); }
  }, [open]);

  return open != null
    ? <Reader n={open} section={sections.get(open)!} head={readerHead} />
    : <Overview data={data} sections={sections} head={listHead} />;
}

function Overview({ data, sections, head }: { data: ResearchData; sections: Map<number, Section>; head: React.RefObject<HTMLHeadingElement | null> }) {
  const [topic, setTopic] = useState<Topic | 'all'>('all');
  const std = standard(data.nodes);
  const count = FINDINGS.length;
  const shown = FINDINGS.filter((f) => topic === 'all' || f.topic === topic);
  const ancillary = ancillaryChart(data);
  const capture = captureChart(data);
  const fall = fallChart(data);
  const rows = validationRows(data.index, std);
  const ancN = FINDINGS.find((f) => f.key === 'ancillary')!.n;

  return (
    <div className={classes.page}>
      <section className={classes.hero} aria-labelledby="research-title">
        <p className={classes.eyebrow}>Research · findings and method</p>
        <h1 id="research-title" className={classes.h1}>What the replay says, and where it stops.</h1>
        <p className={classes.lede} data-testid="lede">
          {countWord(count)} findings from replaying ERCOT prices against a grid battery, three charts that carry the story, and the limits that decide how far to trust it.
          The claims describe what changed, not why.
        </p>
      </section>

      <section className={classes.section} aria-labelledby="charts-title">
        <h2 id="charts-title" className={classes.eyebrow}>Three charts</h2>
        <div className={classes.pair}>
          {ancillary ? <GroupedBars id="chart-ancillary" chart={ancillary} /> : <Pending label="Loading the ancillary chart…" />}
          {capture ? <CaptureBars id="chart-capture" chart={capture} /> : <Pending label="Loading the capture chart…" />}
        </div>
        <div className={classes.wide}>
          {fall ? <GroupedBars id="chart-fall" chart={fall} wide /> : <Pending label="Loading the same-window chart…" />}
        </div>
      </section>

      <section className={classes.section} aria-labelledby="findings-title">
        <div className={classes.findingsHead}>
          <h2 id="findings-title" ref={head} tabIndex={-1} className={classes.h2}>All {countWord(count).toLowerCase()} findings</h2>
          <div className={classes.filters} role="group" aria-label="Filter findings by topic">
            <button type="button" className={classes.pill} aria-pressed={topic === 'all'} onClick={() => setTopic('all')}>All</button>
            {TOPICS.map((t) => (
              <button key={t.id} type="button" className={classes.pill} aria-pressed={topic === t.id} onClick={() => setTopic(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
        <p className={classes.sr} role="status">Showing {shown.length} of {count} findings</p>
        <ul className={classes.cards}>
          {shown.map((f) => {
            const s = sections.get(f.n);
            if (!s) return null;
            return (
              <li key={f.n} className={classes.card} data-testid={`finding-${f.n}`}>
                <div className={classes.cardTop}>
                  <span className={classes.num} aria-hidden="true">{pad(f.n)}</span>
                  <span className={classes.topic}>{topicLabel(f.topic)}</span>
                </div>
                <h3 className={classes.cardTitle}>{s.title}</h3>
                <p className={classes.teaser} data-testid={`teaser-${f.n}`}>{f.teaser(data)}</p>
                <a className={classes.read} href={`#/research?f=${f.n}`}>
                  Read finding <span className={classes.sr}>{f.n}, {s.title}</span><span aria-hidden="true"> →</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={classes.section} aria-labelledby="method-title">
        <h2 id="method-title" className={classes.eyebrow}>Method and validation</h2>
        <div className={classes.pair}>
          <article className={classes.panel}>
            <h3 className={classes.panelTitle}>How the replay works</h3>
            <ol className={classes.method}>
              {METHOD.map((m, i) => (
                <li key={m.title}>
                  <span className={classes.step} aria-hidden="true">{i + 1}</span>
                  <p><strong>{m.title}.</strong> {m.text}</p>
                </li>
              ))}
            </ol>
          </article>

          <article className={classes.panel}>
            <h3 className={classes.panelTitle}>Checked against real fleet revenue</h3>
            <p className={classes.meta}>$/kW-yr · {std.durationH}-hour hubs · fleet figures from Modo Energy</p>
            <div className={classes.tableBox} tabIndex={0} role="region" aria-label="Validation table, scrolls sideways when it does not fit">
              <table className={classes.table} data-testid="validation">
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col" className={classes.right}>Real fleet, all revenue</th>
                    <th scope="col" className={classes.right}>This model, {usd(std.deg, 0)} degradation</th>
                    <th scope="col" className={classes.right}>This model, {usd(0, 0)} degradation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.year} data-testid={`validation-${r.year}`}>
                      <th scope="row">{r.year}</th>
                      <td className={classes.right}>{r.fleet}</td>
                      <td className={classes.right}>{fmtRange(r.ours)}</td>
                      <td className={classes.right}>{fmtRange(r.oursNoDeg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={classes.panelText}>
              Real fleet revenue includes ancillary services, which the energy-only model leaves out, and real operators do not have perfect foresight. The figures are a
              plausibility check on the level, not a calibration.
            </p>
            <h4 className={classes.eyebrow}>Sources</h4>
            <ul className={classes.sources}>
              {MODO_SOURCES.map((s) => <li key={s.href}><a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a></li>)}
            </ul>
          </article>
        </div>

        <div className={classes.leaves} role="group" aria-labelledby="leaves-title">
          <div>
            <h3 id="leaves-title" className={classes.panelTitle}>What this model leaves out</h3>
            <p className={classes.panelText}>
              Forecast error in the perfect-foresight case, transmission and interconnection costs, and capacity fade. The base energy-only results leave out ancillary
              services; <a href={`#/research?f=${ancN}`}>finding {ancN}</a> adds them as a separate screen, with limits.
            </p>
          </div>
          <a className={classes.secondary} href="#/research/method">Full method <span aria-hidden="true">→</span></a>
        </div>
      </section>

      <section className={classes.section} aria-labelledby="explore-title">
        <h2 id="explore-title" className={classes.eyebrow}>One run at a time</h2>
        <p className={classes.sub}>
          Pick a location, year, duration and degradation cost and read the same run in detail.
        </p>
        <ul className={classes.explore}>
          <li><a href="#/research/revenue">Revenue</a></li>
          <li><a href="#/research/charging">Charging pattern</a></li>
          <li><a href="#/research/reality">Reality check</a></li>
        </ul>
      </section>
    </div>
  );
}

function Pending({ label }: { label: string }) {
  return <div className={classes.pending} role="status" aria-busy="true">{label}</div>;
}

function Reader({ n, section, head }: { n: number; section: Section; head: React.RefObject<HTMLHeadingElement | null> }) {
  const def = FINDINGS.find((f) => f.n === n)!;
  const prev = FINDINGS.find((f) => f.n === n - 1);
  const next = FINDINGS.find((f) => f.n === n + 1);
  return (
    <article className={classes.page} aria-labelledby="finding-title" data-testid="reader">
      <div className={classes.readerTop}>
        <a className={classes.back} href="#/research"><span aria-hidden="true">←</span> All {countWord(FINDINGS.length).toLowerCase()} findings</a>
        <p className={classes.eyebrow}>Finding {pad(n)} · {topicLabel(def.topic)}</p>
        <h1 id="finding-title" ref={head} tabIndex={-1} className={classes.h1Reader}>{section.title}</h1>
      </div>
      <Markdown blocks={section.body} />
      <nav className={classes.pager} aria-label="Other findings">
        {prev ? <a href={`#/research?f=${prev.n}`}><span aria-hidden="true">← </span>Finding {pad(prev.n)}</a> : <span />}
        {next ? <a href={`#/research?f=${next.n}`}>Finding {pad(next.n)}<span aria-hidden="true"> →</span></a> : <span />}
      </nav>
    </article>
  );
}
