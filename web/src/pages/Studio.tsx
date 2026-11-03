import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeSelect, NumberInput, TextInput } from '@mantine/core';
import { useApp } from '../state';
import { loadPriceIndex, loadRun as loadRunFile } from '../data/loader';
import { MONTHS, fmtDate, num, pct, usd } from '../data/format';
import { locFull, locName } from '../data/site';
import { degNote, yearNote } from '../data/notes';
import type { IndexRun, NodeSelection, Run } from '../data/types';
import {
  INPUT_STEP, applyPatch, batteryDiffers, compareRows, durationTradeoff, initialForm, monthlyBars, money, nearest, presetFor, presetGaps,
  pricesEnd, resultKey, scaleRun, totals, yearRange, type Source,
} from '../data/studio';
import { FORM_DEFAULTS, LIMITS, PRECOMPUTED, formQuery, toParams, type Coverage, type CustomForm } from '../custom/params';
import { cancelRun, runInWorker, type CustomRunResult, type RunProgress } from '../custom/client';
import { DataQuality } from '../components/DataQuality';
import { CumulativeCard, HeatmapCard, NodeHubCard, TopDaysCard } from '../components/cards';
import classes from './Studio.module.css';
import { NODES_LABEL, PER_KW_PER_YEAR, TERMS } from '../copy/terms';

/** What Studio needs to solve a run: the worker in the app, a direct solver in the tests. */
export type Solve = (form: CustomForm, onProgress: (p: RunProgress) => void) => Promise<{ result: CustomRunResult; ms: number }>;
const solveInWorker: Solve = (form, onProgress) => runInWorker(toParams(form), onProgress);

interface Shown {
  source: Source;
  /** The inputs this result was made with (power is applied at display time, see scaleRun). */
  form: CustomForm;
  key: string;
  run: Run;
  /** Preset: the precomputed file. Solved: time taken, and days the solver skipped. */
  file?: string;
  ms?: number;
  skippedDays?: string[];
  daSkippedDays?: string[];
}

type Solving = { status: 'idle' } | { status: 'running'; progress?: RunProgress } | { status: 'error'; message: string };

const hashQuery = () => window.location.hash.split('?')[1] ?? '';
const writeHash = (f: CustomForm) => history.replaceState(null, '', `#/studio?${formQuery(f)}`);

export default function Studio() {
  const { index, nodes } = useApp();
  const [coverage, setCoverage] = useState<Coverage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadPriceIndex()
      .then((ix) => setCoverage(ix.files.map((f) => ({ location: f.location, year: f.year, first: f.rt_first_day, last: f.rt_last_day }))))
      .catch((e) => setError(String(e)));
  }, []);
  if (error) return <p className={classes.lede}>Could not load the price files: {error}</p>;
  if (!index || !coverage) return <div className={classes.loading} aria-busy="true">Loading Studio…</div>;
  return <StudioView index={index} nodes={nodes} coverage={coverage} />;
}

export function StudioView({ index, nodes, coverage, loadRun = loadRunFile, solve = solveInWorker }: {
  index: IndexRun[];
  nodes: NodeSelection | null;
  coverage: Coverage[];
  loadRun?: (file: string) => Promise<Run>;
  solve?: Solve;
}) {
  const [form, setForm] = useState<CustomForm>(() => initialForm(hashQuery(), coverage, index));
  const [shown, setShown] = useState<Shown | null>(null);
  const [solving, setSolving] = useState<Solving>({ status: 'idle' });
  /** A solved result for these inputs is wanted even though they match a preset ("check it in my browser"). */
  const [check, setCheck] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const solvedRef = useRef<Shown | null>(null);
  const autoRan = useRef(false);

  const key = resultKey(form);
  const preset = presetFor(form, index);
  const current = !!shown && shown.key === key && (shown.source === 'preset' ? !!preset && check !== key : true);

  const set = useCallback((patch: Partial<CustomForm>) => {
    setForm((cur) => {
      const next = applyPatch(cur, patch, index, coverage);
      writeHash(next); // replaceState: typing stays out of the history and fires no hashchange
      return next;
    });
  }, [index, coverage]);

  // A pasted link or the back button changes the hash: read the inputs again.
  useEffect(() => {
    const on = () => {
      if (!/^#\/(studio|custom|compare)(\/|\?|$)/.test(window.location.hash)) return;
      autoRan.current = false;
      setForm(initialForm(hashQuery(), coverage, index));
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [coverage, index]);

  // Presets show as soon as their file arrives (it is a few hundred kB at most, and cached after the first time).
  useEffect(() => {
    if (!preset || check === key) return;
    let live = true;
    setLoadError(null);
    loadRun(preset.file)
      .then((run) => live && setShown({ source: 'preset', form, key, run, file: preset.file }))
      .catch((e) => live && setLoadError(String(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.file, key, check]);

  // A solved result for the current inputs (e.g. after going back to them) shows again without solving.
  useEffect(() => {
    const s = solvedRef.current;
    if (!preset && s && s.key === key && shown?.key !== key) setShown(s);
  }, [key, preset, shown]);

  const run = useCallback(() => {
    const f = form;
    const k = resultKey(f);
    setSolving({ status: 'running' });
    solve(f, (progress) => setSolving((s) => (s.status === 'running' ? { status: 'running', progress } : s)))
      .then(({ result, ms }) => {
        const s: Shown = { source: 'solved', form: f, key: k, run: result.run, ms, skippedDays: result.skippedDays, daSkippedDays: result.daSkippedDays };
        solvedRef.current = s;
        setShown(s);
        setSolving({ status: 'idle' });
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setSolving({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      });
  }, [form, solve]);

  const cancel = () => {
    cancelRun();
    setSolving({ status: 'idle' });
  };

  // A shared link with inputs that are not precomputed solves on arrival, so it opens with its result.
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    writeHash(form);
    if (!presetFor(form, index)) run();
  }, [form, index, run]);
  useEffect(() => () => cancelRun(), []); // leaving the page stops a run in progress

  const checkInBrowser = () => {
    setCheck(key);
    run();
  };

  const running = solving.status === 'running';
  const view = useMemo(() => (shown ? scaleRun(shown.run, form.powerMw) : null), [shown, form.powerMw]);

  return (
    <div className={classes.page}>
      <section className={classes.hero} aria-labelledby="studio-title">
        <p className={classes.eyebrow}>Studio · your battery on real ERCOT prices</p>
        <h1 id="studio-title" className={classes.h1}>Run your own battery.</h1>
        <p className={classes.lede}>
          Choose a location, a year and a battery. Studio replays the prices day by day and shows what it would have earned, and
          how much of that a day-ahead plan keeps. Precomputed runs show at once; any other inputs are solved in your browser
          with the same model. Nothing is sent to a server, and the address bar keeps your inputs.
        </p>
      </section>

      <div className={classes.layout}>
        <Inputs form={form} coverage={coverage} index={index} set={set} preset={preset} />

        <div className={classes.results}>
          <RunSummary
            form={form} shown={shown} current={current} preset={preset} solving={solving} running={running} checking={check === key}
            onRun={run} onCancel={cancel} onCheck={checkInBrowser} loadError={loadError}
          />
          {view && shown && (
            <div className={classes.stack} data-stale={!current || undefined} aria-busy={running || undefined}>
              <TotalsCard run={view} powerMw={form.powerMw} />
              <MonthlyCard run={view} strategy={form.strategy} onStrategy={(strategy) => set({ strategy })} />
              <DurationCard index={index} form={shown.form} onPick={(durationH) => set({ durationH })} />
              <OperatedCard run={view} />
              <DataQuality run={view} />
              <p className={classes.small}>
                Price-taking battery, energy arbitrage only: no ancillary services, and forecast error only in the day-ahead strategy.
                Revenue is net of the degradation cost. A study of the past, not a forecast.
              </p>
            </div>
          )}
        </div>
      </div>

      {view && shown && (
        <section className={classes.section} aria-labelledby="more-title">
          <p className={classes.eyebrow}>Day by day</p>
          <h2 id="more-title" className={classes.h2}>Inside this run</h2>
          <p className={classes.sub}>The running total, the ten best days and the average charge and discharge by hour and month.</p>
          <div className={classes.pair} data-stale={!current || undefined}>
            <CumulativeCard run={view} />
            <TopDaysCard run={view} />
          </div>
          <div className={classes.full} data-stale={!current || undefined}><HeatmapCard run={view} /></div>
        </section>
      )}

      <CompareSection index={index} nodes={nodes} form={form} onPick={(location) => set({ location })} />
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

function Choice<T extends string | number>({ label, options, value, onPick, name }: {
  label: string; name: string; options: { value: T; label: string }[]; value: T | null; onPick: (v: T) => void;
}) {
  return (
    <div className={classes.choices} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)} type="button" className={classes.choice} aria-pressed={value === o.value}
          onClick={() => onPick(o.value)} data-testid={`${name}-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Num({ label, value, onChange, lim, step, prefix, suffix, hint, testId }: {
  label: string; value: number; onChange: (v: number) => void; lim: { min: number; max: number }; step: number;
  prefix?: string; suffix?: string; hint?: string; testId: string;
}) {
  return (
    <NumberInput
      label={label} description={hint} value={value} onChange={(v) => typeof v === 'number' && onChange(v)}
      min={lim.min} max={lim.max} step={step} prefix={prefix} suffix={suffix} allowNegative={false} clampBehavior="blur"
      inputMode="decimal" classNames={{ label: classes.label, description: classes.hint }} data-testid={testId}
    />
  );
}

function Inputs({ form, coverage, index, set, preset }: {
  form: CustomForm; coverage: Coverage[]; index: IndexRun[]; set: (p: Partial<CustomForm>) => void; preset: IndexRun | null;
}) {
  const locations = [...new Set(coverage.map((c) => c.location))];
  const hubs = locations.filter((l) => l.startsWith('HB_'));
  const others = locations.filter((l) => !l.startsWith('HB_'));
  const years = coverage.filter((c) => c.location === form.location).sort((a, b) => a.year - b.year);
  const year = Number(form.startDate.slice(0, 4));
  const cov = years.find((c) => c.year === year);
  const gaps = presetGaps(form, index);
  const end = pricesEnd(form, coverage);
  const range = yearRange(form.location, year, index, coverage);
  return (
    <section className={classes.inputs} aria-labelledby="battery-title">
      <div className={classes.inputsHead}>
        <h2 id="battery-title" className={classes.cardTitle}>Battery</h2>
        <button type="button" className={classes.quiet} onClick={() => set({ ...FORM_DEFAULTS, ...yearRange(FORM_DEFAULTS.location, Number(FORM_DEFAULTS.startDate.slice(0, 4)), index, coverage) })}>
          Reset
        </button>
      </div>

      <NativeSelect
        label="Location" value={form.location} onChange={(e) => set({ location: e.currentTarget.value })}
        classNames={{ label: classes.label, description: classes.hint }} data-testid="location"
        description={`${locations.length} locations have price files: ${hubs.length} trading hubs and ${others.length} resource nodes. Every node is in the Atlas, for one standard battery.`}
        data={[
          { group: 'Trading hubs', items: hubs.map((c) => ({ value: c, label: `${locName(c)} · ${c}` })) },
          { group: NODES_LABEL, items: others.map((c) => ({ value: c, label: `${locName(c)} · ${c}` })) },
        ]}
      />

      <div className={classes.field}>
        <span className={classes.label}>Year</span>
        <Choice
          label="Year" name="year" value={year} onPick={(y) => { const r = yearRange(form.location, y, index, coverage); if (r) set(r); }}
          options={years.map((c) => ({ value: c.year, label: String(c.year) }))}
        />
        {yearNote(index, year) && <p className={classes.hint} data-testid="year-note">{yearNote(index, year)}</p>}
      </div>

      <div className={classes.dates}>
        <TextInput
          label="From" type="date" value={form.startDate} min={cov?.first} max={cov?.last} classNames={{ label: classes.label }}
          onChange={(e) => e.currentTarget.value && set({ startDate: e.currentTarget.value })} data-testid="from"
        />
        <TextInput
          label="To" type="date" value={form.endDate} min={cov?.first} max={cov?.last} classNames={{ label: classes.label }}
          onChange={(e) => e.currentTarget.value && set({ endDate: e.currentTarget.value })} data-testid="to"
        />
      </div>
      {range && end && range.endDate < end && (
        <p className={classes.hint}>
          Prices run to {fmtDate(end)}; the precomputed run ends {fmtDate(range.endDate)}. Set the end date later to solve the extra days
          in your browser.
        </p>
      )}

      <div className={classes.field}>
        <Num
          label="Power (MW)" value={form.powerMw} onChange={(powerMw) => set({ powerMw })} lim={LIMITS.powerMw} step={INPUT_STEP.powerMw}
          hint="Scales dollar totals. Revenue per kW does not depend on power, so changing it never needs a new run." testId="power"
        />
        <input
          type="range" className={classes.range} min={LIMITS.powerMw.min} max={LIMITS.powerMw.max} step={INPUT_STEP.powerMw}
          value={form.powerMw} onChange={(e) => set({ powerMw: Number(e.currentTarget.value) })} aria-label="Power (MW), slider"
        />
      </div>

      <div className={classes.field}>
        <span className={classes.label}>Duration</span>
        <Choice
          label="Duration presets" name="dur" value={form.durationH} onPick={(durationH) => set({ durationH })}
          options={PRECOMPUTED.durations.map((h) => ({ value: h, label: `${h} hour${h === 1 ? '' : 's'}` }))}
        />
        <Num label="Hours of storage" value={form.durationH} onChange={(durationH) => set({ durationH })} lim={LIMITS.durationH} step={INPUT_STEP.durationH} suffix=" h" testId="duration" />
      </div>

      <div className={classes.field}>
        <span className={classes.label}>Degradation cost</span>
        <Choice
          label="Degradation cost presets" name="deg" value={form.degCost} onPick={(degCost) => set({ degCost })}
          options={PRECOMPUTED.degs.map((d) => ({ value: d, label: `$${d}/MWh` }))}
        />
        <p className={classes.hint} data-testid="deg-note">{degNote(PRECOMPUTED.degs)} Any value works here; costs without a preset are solved in your browser.</p>
        <Num
          label="Cost per MWh discharged" value={form.degCost} onChange={(degCost) => set({ degCost })} lim={LIMITS.degCost}
          step={INPUT_STEP.degCost} prefix="$" testId="deg"
        />
      </div>

      <Num
        label="Round-trip efficiency (%)" value={form.rtePct} onChange={(rtePct) => set({ rtePct })} lim={LIMITS.rtePct} step={INPUT_STEP.rtePct}
        suffix="%" hint="Share of the energy bought that comes back out. Losses are split evenly between charge and discharge." testId="rte"
      />
      <Num
        label="Start charge (% of energy)" value={form.socPct} onChange={(socPct) => set({ socPct })} lim={LIMITS.socPct} step={INPUT_STEP.socPct}
        suffix="%" hint="Each day starts and ends at this charge, so no energy carries from one day to the next." testId="soc"
      />

      <div className={classes.match} data-preset={!!preset || undefined} data-testid="preset-note">
        {preset ? (
          <p>These inputs match a precomputed run, so the result shows at once.</p>
        ) : (
          <>
            <p>Not precomputed, so Studio solves these inputs in your browser:</p>
            <ul>{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ run summary and progress */

function inputsLine(f: CustomForm, powerMw: number) {
  const energy = powerMw * f.durationH;
  return `${num(powerMw, powerMw % 1 ? 1 : 0)} MW / ${num(energy, energy % 1 ? 1 : 0)} MWh · ${locFull(f.location)} · `
    + `${fmtDate(f.startDate)} to ${fmtDate(f.endDate)} · ${num(f.rtePct, f.rtePct % 1 ? 1 : 0)}% round trip · `
    + `${usd(f.degCost, f.degCost % 1 ? 2 : 0)}/MWh degradation · starts ${num(f.socPct, f.socPct % 1 ? 1 : 0)}% charged`;
}

function RunSummary({ form, shown, current, preset, solving, running, checking, onRun, onCancel, onCheck, loadError }: {
  form: CustomForm; shown: Shown | null; current: boolean; preset: IndexRun | null; solving: Solving; running: boolean; checking: boolean;
  onRun: () => void; onCancel: () => void; onCheck: () => void; loadError: string | null;
}) {
  const r = shown?.run;
  const days = r?.meta.days_solved;
  return (
    <section className={classes.card} aria-labelledby="summary-title" data-testid="run-summary">
      <h2 id="summary-title" className={classes.eyebrowMuted}>Run summary</h2>
      {shown && r ? (
        <>
          <p className={classes.inputsLine} data-testid="summary-inputs">{inputsLine(shown.form, form.powerMw)}</p>
          <p className={classes.status} data-source={shown.source} data-testid="summary-source">
            <span className={classes.dot} aria-hidden="true" />
            {shown.source === 'preset'
              ? <>Precomputed · {num(days)} days · results/{shown.file}</>
              : <>Solved in your browser · {num(days)} days in {num((shown.ms ?? 0) / 1000, 1)} s{r.metrics.milp_days ? ` · ${num(r.metrics.milp_days)} re-solved as MILP` : ''}</>}
          </p>
          {shown.source === 'solved' && <SolvedNotes shown={shown} preset={preset} current={current} />}
          {!current && !running && !checking && (
            <p className={classes.staleNote} role="status" data-testid="stale">
              These figures are for the inputs above, not the ones you set now. {preset ? 'Loading the precomputed run…' : 'Press Run to solve the new inputs.'}
            </p>
          )}
        </>
      ) : (
        <p className={classes.inputsLine}>{inputsLine(form, form.powerMw)}</p>
      )}

      <div className={classes.actions}>
        {!preset && !(current && shown?.source === 'solved') && (
          <button type="button" className={classes.primary} onClick={onRun} disabled={running} data-testid="run">
            {shown ? 'Run with these inputs' : 'Run in your browser'}
          </button>
        )}
        {preset && !running && !(current && shown?.source === 'solved') && (
          <button type="button" className={classes.secondary} onClick={onCheck} data-testid="check">Check it: solve in your browser</button>
        )}
        {running && <button type="button" className={classes.secondary} onClick={onCancel}>Cancel</button>}
      </div>
      {running && <Progress progress={solving.status === 'running' ? solving.progress : undefined} />}
      {solving.status === 'error' && <p className={classes.error} role="alert">The run failed: {solving.message}</p>}
      {loadError && <p className={classes.error} role="alert">Could not load the precomputed run: {loadError}</p>}
    </section>
  );
}

function SolvedNotes({ shown, preset, current }: { shown: Shown; preset: IndexRun | null; current: boolean }) {
  const m = shown.run.metrics;
  const skipped = shown.skippedDays ?? [];
  const daSkipped = shown.daSkippedDays ?? [];
  // A preset with the same inputs and days: say how close the browser came to the Python model.
  const same = current && preset && preset.first_day === shown.run.meta.first_day && preset.last_day === shown.run.meta.last_day ? preset : null;
  return (
    <>
      {(skipped.length > 0 || daSkipped.length > 0) && (
        <p className={classes.small}>
          {skipped.length > 0 && `Skipped for missing prices: ${skipped.map(fmtDate).join(', ')}. `}
          {daSkipped.length > 0 && `The day-ahead plan skipped ${num(daSkipped.length)} day(s) whose day-ahead prices were incomplete.`}
        </p>
      )}
      {same && (
        <p className={classes.small} data-testid="check-result">
          Precomputed in Python: {usd(same.revenue_per_kw_year, 2)}/kW-yr perfect foresight
          {same.da_rt_revenue_per_kw_year != null && <> and {usd(same.da_rt_revenue_per_kw_year, 2)} day-ahead plan</>}. Your browser: {usd(m.revenue_per_kw_year, 2)}
          {m.da_rt_revenue_per_kw_year != null && <> and {usd(m.da_rt_revenue_per_kw_year, 2)}</>}.
        </p>
      )}
    </>
  );
}

function Progress({ progress: p }: { progress?: RunProgress }) {
  const solving = p?.stage === 'solving' && p.daysTotal > 0; // progress arrives as each month starts
  const share = solving ? p.daysDone / p.daysTotal : 0;
  const month = solving && p.month ? `${MONTHS[Number(p.month.slice(5, 7)) - 1]} ${p.month.slice(0, 4)}` : '';
  return (
    <div className={classes.progress} aria-live="polite" data-testid="progress">
      <div className={classes.progressHead}>
        <span>{solving ? (p.daysDone < p.daysTotal ? `Solving ${month}` : 'Finishing…') : 'Loading prices and the solver…'}</span>
        {solving && <span className={classes.mono}>{num(p.daysDone)} of {num(p.daysTotal)} days</span>}
      </div>
      <div
        className={classes.track} role="progressbar" aria-label="Run progress" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)} data-indeterminate={!solving || undefined}
      >
        <div className={classes.progressFill} style={{ transform: `scaleX(${share})` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ result cards */

function Bar({ label, value, share, tone, testId }: { label: string; value: string; share: number; tone: 'mint' | 'amber' | 'grey'; testId?: string }) {
  return (
    <div className={classes.hbar}>
      <div className={classes.hbarHead}><span>{label}</span><span className={classes.mono} data-tone={tone} data-testid={testId}>{value}</span></div>
      <div className={classes.barTrack} aria-hidden="true"><div className={classes.fill} data-tone={tone} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} /></div>
    </div>
  );
}

function periodLabel(run: Run) {
  const { first_day: a, last_day: b } = run.meta;
  return !run.metrics.annualized && a.endsWith('01-01') && b.endsWith('12-31') ? `a year (${a.slice(0, 4)})` : `${fmtDate(a)} to ${fmtDate(b)}`;
}

function TotalsCard({ run, powerMw }: { run: Run; powerMw: number }) {
  const t = totals(run, powerMw);
  const max = Math.max(t.pfYear, t.daYear ?? 0);
  const ann = t.annualized ? ' (annualized)' : '';
  return (
    <section className={classes.card} aria-labelledby="totals-title">
      <h2 id="totals-title" className={classes.visuallyHidden}>Revenue, perfect foresight and day-ahead plan</h2>
      <div className={classes.totals}>
        <div>
          <p className={classes.eyebrowMuted}>{TERMS.perfectForesight.label}, {periodLabel(run)}</p>
          <p className={classes.money} data-tone="mint" data-testid="total-pf">{money(t.pf)}</p>
          <p className={classes.monoSmall}>{usd(t.pfYear, 1)} {PER_KW_PER_YEAR}{ann}</p>
          <p className={classes.small}>An upper bound no operator can reach.</p>
        </div>
        <div>
          <p className={classes.eyebrowMuted}>{TERMS.dayAheadPlan.label}, {periodLabel(run)}</p>
          <p className={classes.money} data-tone="amber" data-testid="total-da">{money(t.da)}</p>
          <p className={classes.monoSmall}>{usd(t.daYear, 1)} {PER_KW_PER_YEAR}{ann}{t.kept != null && <> · <span data-testid="kept">{pct(t.kept)}</span> {TERMS.captureRate.label.toLowerCase()}</>}</p>
          <p className={classes.small}>Planned the day before on day-ahead prices, settled in real time.</p>
        </div>
      </div>
      <Bar label={`${TERMS.perfectForesight.label}, ${TERMS.revenueUnit.label}`} value={usd(t.pfYear, 1)} share={max > 0 ? t.pfYear / max : 0} tone="mint" />
      {t.daYear != null && <Bar label={`${TERMS.dayAheadPlan.label}, ${TERMS.revenueUnit.label}`} value={usd(t.daYear, 1)} share={max > 0 ? t.daYear / max : 0} tone="amber" />}
      {t.kept != null && (
        <p className={classes.small}>{TERMS.captureRate.label} compares the two on the {num(run.metrics.da_days_matched ?? run.meta.days_solved)} days both strategies solved.</p>
      )}
    </section>
  );
}

function MonthlyCard({ run, strategy, onStrategy }: { run: Run; strategy: 'pf' | 'da'; onStrategy: (s: 'pf' | 'da') => void }) {
  const bars = monthlyBars(run, strategy);
  const max = Math.max(0, ...bars.map((b) => b.value ?? 0));
  const min = Math.min(0, ...bars.map((b) => b.value ?? 0));
  const span = max - min || 1;
  return (
    <section className={classes.card} aria-labelledby="monthly-title">
      <div className={classes.cardHead}>
        <div>
          <h2 id="monthly-title" className={classes.cardTitle}>Revenue by month</h2>
          <p className={classes.meta}>$/kW · {strategy === 'pf' ? 'perfect foresight' : 'day-ahead plan'}</p>
        </div>
        <Choice
          label="Strategy" name="strat" value={strategy} onPick={onStrategy}
          options={[{ value: 'pf', label: TERMS.perfectForesight.label }, { value: 'da', label: TERMS.dayAheadPlan.label }]}
        />
      </div>
      <ol className={classes.vbars} aria-label={`Revenue by month, $/kW, ${strategy === 'pf' ? 'perfect foresight' : 'day-ahead plan'}`} data-testid="monthly">
        {bars.map((b) => {
          const v = b.value ?? 0;
          return (
            <li key={b.month} className={classes.vbar}>
              <span className={classes.vcol} aria-hidden="true">
                <span
                  className={classes.vfill} data-neg={v < 0 || undefined} data-tone={strategy === 'pf' ? 'mint' : 'amber'}
                  style={{ height: `${(Math.abs(v) / span) * 100}%`, bottom: `${((Math.min(0, v) - min) / span) * 100}%` }}
                />
                <span className={classes.vval} style={{ bottom: `${((Math.max(0, v) - min) / span) * 100}%` }}>{b.value == null ? '–' : num(v, 1)}</span>
              </span>
              <span className={classes.vlabel} aria-hidden="true">{MONTHS[b.month - 1].slice(0, 1)}</span>
              <span className={classes.visuallyHidden}>{MONTHS[b.month - 1]}: {b.value == null ? 'no days' : `${usd(v, 1)} per kW`}</span>
            </li>
          );
        })}
      </ol>
      {strategy === 'da' && <p className={classes.small}>Days the day-ahead plan skipped count as zero.</p>}
    </section>
  );
}

function DurationCard({ index, form, onPick }: { index: IndexRun[]; form: CustomForm; onPick: (h: number) => void }) {
  const year = Number(form.startDate.slice(0, 4));
  const deg = nearest(form.degCost, PRECOMPUTED.degs);
  const rows = durationTradeoff(index, form.location, year, deg);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.pf));
  const differs = batteryDiffers(form) || deg !== form.degCost;
  return (
    <section className={classes.card} aria-labelledby="duration-title">
      <h2 id="duration-title" className={classes.cardTitle}>Duration trade-off</h2>
      <p className={classes.meta}>Precomputed · {locName(form.location)} · {year}{rows[0].annualized ? ' (annualized)' : ''} · {usd(deg, 0)}/MWh · {TERMS.revenueUnit.label} · $/kWh</p>
      <ul className={classes.durList}>
        {rows.map((r) => (
          <li key={r.hours}>
            <button type="button" className={classes.durRow} aria-pressed={r.hours === form.durationH} onClick={() => onPick(r.hours)} data-testid={`dur-row-${r.hours}`}>
              <Bar
                label={`${r.hours} hour${r.hours === 1 ? '' : 's'}`} value={`${usd(r.pf, 1)} · ${usd(r.perKwh, 1)}/kWh`}
                share={r.pf / max} tone={r.hours === form.durationH ? 'amber' : 'grey'}
              />
            </button>
          </li>
        ))}
      </ul>
      <p className={classes.small}>
        Longer batteries earn more per kW and less per kWh of storage. Pick a row to load it.
        {differs && ` These rows are the precomputed runs (${PRECOMPUTED.rtePct}% round trip, empty start, ${usd(deg, 0)}/MWh), not your other inputs.`}
      </p>
    </section>
  );
}

function OperatedCard({ run }: { run: Run }) {
  const m = run.metrics;
  const stats: { label: string; value: string; sub: string; id: string }[] = [
    { id: 'cycles', label: 'Cycles a year', value: num(m.cycles_per_year, 0), sub: `full charge and discharge${m.annualized ? ', annualized' : ''}` },
    { id: 'buy', label: 'Avg charge price', value: usd(m.avg_charge_price, 0), sub: 'per MWh' },
    { id: 'sell', label: 'Avg discharge price', value: usd(m.avg_discharge_price, 0), sub: 'per MWh' },
    { id: 'spread', label: 'Spread captured', value: usd(m.avg_spread_captured, 0), sub: 'per MWh, discharge minus charge' },
    { id: 'top10', label: TERMS.top10DayShare.label, value: pct(m.top10_day_share), sub: "of the period's revenue" },
    ...(m.da_losing_days != null ? [{ id: 'losing', label: 'Day-ahead losing days', value: num(m.da_losing_days), sub: `of ${num(m.da_days_matched)} scheduled` }] : []),
  ];
  return (
    <section className={classes.card} aria-labelledby="operated-title">
      <h2 id="operated-title" className={classes.cardTitle}>How it operated</h2>
      <dl className={classes.stats}>
        {stats.map((s) => (
          <div key={s.id}>
            <dt className={classes.eyebrowMuted}>{s.label}</dt>
            <dd className={classes.statValue} data-testid={`op-${s.id}`}>{s.value}</dd>
            <dd className={classes.statSub}>{s.sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ compare presets */

function CompareSection({ index, nodes, form, onPick }: { index: IndexRun[]; nodes: NodeSelection | null; form: CustomForm; onPick: (loc: string) => void }) {
  const year = Number(form.startDate.slice(0, 4));
  const duration = nearest(form.durationH, PRECOMPUTED.durations);
  const deg = nearest(form.degCost, PRECOMPUTED.degs);
  const rows = compareRows(index, nodes, year, duration, deg);
  const sel = { location: form.location, duration, year, deg };
  const ends = [...new Set(rows.map((r) => r.lastDay))].sort();
  return (
    <section className={classes.section} aria-labelledby="compare-title">
      <p className={classes.eyebrow}>Compare presets</p>
      <h2 id="compare-title" className={classes.h2}>Every location with the same battery</h2>
      <p className={classes.sub}>
        {duration}-hour battery · {year}{rows.some((r) => r.annualized) ? ` (annualized, runs end ${ends.map(fmtDate).join(' or ')})` : ''} ·{' '}
        {usd(deg, 0)}/MWh degradation · {PRECOMPUTED.rtePct}% round trip. Ranked by perfect foresight, {TERMS.revenueUnit.label}. Pick a location to load it.
      </p>
      <div className={classes.card}>
        <div className={classes.tableBox} tabIndex={0} role="region" aria-label="Every-location comparison table, scrolls sideways when it does not fit">
          <table className={classes.table} data-testid="compare-table">
            <thead>
              <tr>
                <th scope="col">#</th><th scope="col">Location</th>
                <th scope="col" className={classes.num}>{TERMS.perfectForesight.label}</th><th scope="col" className={classes.num}>{TERMS.dayAheadPlan.label}</th>
                <th scope="col" className={classes.num}>{TERMS.captureRate.label}</th><th scope="col" className={classes.num}>{TERMS.top10DayShare.label}</th>
                <th scope="col" className={classes.num}>vs its hub</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.location} data-on={r.location === form.location || undefined} data-testid={`cmp-${r.location}`}>
                  <td className={classes.num}>{i + 1}</td>
                  <th scope="row">
                    <button type="button" className={classes.rowBtn} onClick={() => onPick(r.location)} aria-pressed={r.location === form.location}>
                      <span>{locName(r.location)}</span> <span className={classes.code}>{r.location} · {r.type === 'hub' ? 'hub' : 'node'}</span>
                    </button>
                  </th>
                  <td className={classes.num}>{usd(r.pf, 1)}</td>
                  <td className={classes.num}>{usd(r.da, 1)}</td>
                  <td className={classes.num}>{pct(r.kept)}</td>
                  <td className={classes.num}>{pct(r.top10)}</td>
                  <td className={classes.num}>{r.vsHub != null ? `${num(r.vsHub, 2)}x ${r.hub}` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={classes.small}>
          Node vs hub divides two detailed runs; the hub runs use ERCOT's archive prices, as in finding 6. The Atlas divides by the all-node
          run's hub figures instead, so its ratios can differ slightly.
        </p>
      </div>
      <div className={classes.full}><NodeHubCard sel={sel} index={index} nodes={nodes} /></div>
    </section>
  );
}
