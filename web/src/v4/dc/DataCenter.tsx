// Data Center mode (v4 Step 7): the value of a battery co-located with a large load, in Studio. The engine is runDataCenterCase
// (custom/datacenter.ts, Step 2); it runs in a Web Worker. Every number on screen comes from the engine or the rules config.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NativeSelect, NumberInput } from '@mantine/core';
import rules from '../../custom/config/datacenter_rules.json';
import { DC_LIMITS, parseLoadCsv, type DataCenterResult, type FourCpYear } from '../../custom/datacenter';
import { defaultTwelveCpRate, type TwelveCpComparison, type TwelveCpYear } from '../../custom/twelvecp';
import { Chart } from '../../components/Chart';
import { downloadCsv, fmtDate, num, usd } from '../../data/format';
import { money } from '../../data/studio';
import { locName } from '../../data/site';
import { DURATIONS, YEARS, loadFourCp, loadStack, loadStackIndex, loadTwelveCp } from '../../data/loader';
import { TERMS } from '../../copy/terms';
import { isUpperBoundYear, type StackRow } from '../stack';
import { AS_UPPER_BOUND_NOTE } from '../config';
import { V5 } from '../../config/features';
import TcosBlock from '../../v5/TcosBlock';
import { TCOS_LABEL, TCOS_SHORT, tcosRows } from '../../v5/tcos';
import { revealFocused } from '../../shell/panelScroll';
import { setDcCase } from './dcCase';
import { economicsLink } from '../revenueSource';
import { buildHash } from '../../shell/route';
import { parseStackIndex, type StackKey } from '../site/stackIndex';
import {
  DC_ASSUMPTIONS, DC_DEFAULTS, DC_STEP, breakdownRows, dcCsv, dcLocations, dcQuery, dcYears, defaultYear, durationOf, fitWindow,
  hourLabel, isDcHash, parseDcQuery, stackChoice, toAsStack, toEngineInputs, validateDcForm, windowMisses, yearLabel,
  type DcCoverage, type DcForm, type DcStrategy, type Tcos,
} from './dcForm';
import { buildDispatchOption, buildWaterfallOption } from './dcCharts';
import { solveDcInWorker, type DcSolve } from './dcClient';
import studio from '../../pages/Studio.module.css';
import site from '../site/SiteCard.module.css';
import classes from './DataCenter.module.css';

export interface DcDeps {
  solve: DcSolve;
  loadFourCp: (year: number) => Promise<FourCpYear>;
  /** V5: ERCOT's 12 monthly peaks for a year. Without it (or with V5 off) the page runs 4CP only, as before. */
  loadTwelveCp?: (year: number) => Promise<TwelveCpYear>;
  loadStackKeys: () => Promise<StackKey[]>;
  loadStackRow: (key: StackKey, loc: string) => Promise<StackRow | null>;
}

export const REAL_DC_DEPS: DcDeps = {
  solve: solveDcInWorker,
  loadFourCp,
  loadTwelveCp,
  loadStackKeys: () => loadStackIndex().then(parseStackIndex),
  loadStackRow: (k, loc) => loadStack(k.year, k.durationH, k.mode).then((f) => f.nodes[loc] ?? null),
};

/** Wait after the last edit before solving, so typing a number does not start a run per key. */
const DEBOUNCE_MS = 350;
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const STRATEGY_LABEL: Record<DcStrategy, string> = { realistic: TERMS.dayAheadPlan.label, foresight: TERMS.perfectForesight.label };
const sb6Threshold = rules.sb6.provisions.find((p) => p.id === 'threshold');

const hashQuery = () => window.location.hash.split('?')[1] ?? '';
// With V5 off the page never writes (or reads) tcos, so its links are the ones it has always written.
const writeHash = (f: DcForm) => history.replaceState(null, '', `#/studio?${dcQuery(V5 ? f : { ...f, tcos: DC_DEFAULTS.tcos })}`);

interface Shown { key: string; form: DcForm; result: DataCenterResult; comparison?: TwelveCpComparison; ms: number; stackNote: string | null; year: string; upperBound: boolean; profile: string | null }
type Run = { status: 'idle' } | { status: 'running' } | { status: 'error'; message: string };

export default function DataCenterView({ coverage, deps = REAL_DC_DEPS, top }: { coverage: DcCoverage[]; deps?: DcDeps; top?: ReactNode }) {
  const [form, setForm] = useState<DcForm>(() => parseDcQuery(hashQuery(), coverage));
  const [profile, setProfile] = useState<{ name: string; values: number[] } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [keys, setKeys] = useState<StackKey[] | null>(null);
  const [fourCp, setFourCp] = useState<{ year: number; data: FourCpYear | null; error?: string } | null>(null);
  const [twelve, setTwelve] = useState<{ year: number; data: TwelveCpYear | null; error?: string } | null>(null);
  const [stackRow, setStackRow] = useState<{ key: string; row: StackRow | null } | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [run, setRun] = useState<Run>({ status: 'idle' });
  const latest = useRef('');

  useEffect(() => { writeHash(form); }, [form]);
  useEffect(() => {
    const on = () => { if (isDcHash(window.location.hash)) setForm(parseDcQuery(hashQuery(), coverage)); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [coverage]);

  const set = useCallback((patch: Partial<DcForm>) => {
    setForm((cur) => {
      const next = { ...cur, ...patch };
      if (patch.loc && !dcYears(coverage, next.loc).some((c) => c.year === next.year)) next.year = defaultYear(coverage, next.loc) ?? next.year;
      return next;
    });
  }, [coverage]);

  useEffect(() => {
    let live = true;
    deps.loadStackKeys().then((k) => live && setKeys(k), () => live && setKeys([]));
    return () => { live = false; };
  }, [deps]);

  useEffect(() => {
    let live = true;
    deps.loadFourCp(form.year).then(
      (data) => live && setFourCp({ year: form.year, data }),
      (e) => live && setFourCp({ year: form.year, data: null, error: String(e) }),
    );
    return () => { live = false; };
  }, [deps, form.year]);

  const wantTwelve = V5 && !!deps.loadTwelveCp;
  useEffect(() => {
    if (!wantTwelve) return;
    let live = true;
    deps.loadTwelveCp!(form.year).then(
      (data) => live && setTwelve({ year: form.year, data }),
      (e) => live && setTwelve({ year: form.year, data: null, error: String(e) }),
    );
    return () => { live = false; };
  }, [deps, form.year, wantTwelve]);

  const choice = useMemo(() => stackChoice(form, keys ?? []), [form, keys]);
  const rowKey = choice.status === 'match' ? `${choice.key.year}_${choice.key.durationH}h_${choice.key.mode}|${form.loc}` : '';
  useEffect(() => {
    if (choice.status !== 'match') return;
    let live = true;
    deps.loadStackRow(choice.key, form.loc).then((row) => live && setStackRow({ key: rowKey, row }), () => live && setStackRow({ key: rowKey, row: null }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey, deps]);

  const row = choice.status === 'match' && stackRow?.key === rowKey ? stackRow.row : null;
  const rowReady = choice.status !== 'match' || stackRow?.key === rowKey;
  const stackNote = choice.status === 'none'
    ? `Energy only. ${choice.reason}`
    : choice.status === 'match' && rowReady && !row ? `Energy only. The precomputed stack has no row for ${form.loc}.` : null;

  const errors = useMemo(() => validateDcForm(form, coverage, profile?.values ?? null), [form, coverage, profile]);
  const cp = fourCp?.year === form.year ? fourCp.data : null;
  const cov = dcYears(coverage, form.loc).find((c) => c.year === form.year);
  const label = yearLabel(cov, form.year, !!row && isUpperBoundYear(form.year));
  const tw = wantTwelve && twelve?.year === form.year ? twelve : null;
  const twelveReady = !wantTwelve || !!tw;
  const twelveData = tw?.data ?? null;
  const ready = !errors.length && !!cp && keys !== null && rowReady && twelveReady;
  const misses = cp ? windowMisses(cp.intervals, form.windowStartHour, form.windowEndHour) : [];

  const inputs = useMemo(() => (ready && cp ? toEngineInputs(form, cp, row ? toAsStack(row) : null, profile?.values ?? null) : null), [ready, cp, form, row, profile]);
  // The rule shown is picked from a run that holds both, so switching it does not solve again: tcos stays out of the key.
  const key = useMemo(
    () => (inputs ? JSON.stringify({ ...form, tcos: DC_DEFAULTS.tcos, site: null, profile: profile?.name ?? null, as: !!row, tc: !!twelveData }) : ''),
    [inputs, form, profile, row, twelveData],
  );

  useEffect(() => {
    if (!inputs || !key || shown?.key === key) return;
    latest.current = key;
    const snapshot = { form, stackNote, year: label, upperBound: !!row && isUpperBoundYear(form.year), profile: profile?.name ?? null };
    const timer = setTimeout(() => {
      setRun({ status: 'running' });
      deps.solve(inputs, twelveData ?? undefined).then(
        ({ result, ms, comparison }) => {
          if (latest.current !== key) return;
          setShown({ key, result, ms, ...(comparison ? { comparison } : {}), ...snapshot });
          setRun({ status: 'idle' });
        },
        (e: unknown) => latest.current === key && setRun({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, inputs]);

  const current = !!shown && shown.key === key;
  const tcos: Tcos = V5 ? form.tcos : DC_DEFAULTS.tcos;
  const onFile = async (file: File | undefined) => {
    setCsvError(null);
    if (!file) return;
    try {
      setProfile({ name: file.name, values: parseLoadCsv(await file.text()) });
    } catch (e) {
      setProfile(null);
      setCsvError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={studio.page}>
      <section className={studio.hero} aria-labelledby="dc-title">
        {top}
        <p className={studio.eyebrow}>Studio · Data Center mode</p>
        <h1 id="dc-title" className={studio.h1}>A battery at a large load.</h1>
        <p className={studio.lede}>
          A battery beside a data center can trade energy, sell ancillary services, cut the site's share of transmission cost at the
          4CP peaks, and carry the load through a curtailment. Studio replays one year of prices with the site's load and adds the four
          parts up. It runs in your browser.
        </p>
        {form.site && <SiteLine form={form} />}
      </section>

      <div className={studio.layout}>
        <Inputs
          form={form} set={set} coverage={coverage} profile={profile} csvError={csvError} onFile={onFile}
          clearProfile={() => { setProfile(null); setCsvError(null); }} stackNote={stackNote} choice={choice.status} misses={misses.length}
          fit={cp ? fitWindow(cp.intervals, form.windowStartHour, form.windowEndHour) : null}
          twelve={wantTwelve ? { loaded: !!twelveData, error: tw && !tw.data ? tw.error ?? 'no file' : null } : null}
        />

        <div className={studio.results}>
          <section className={studio.card} aria-live="polite">
            {errors.length > 0 ? (
              <ul className={classes.errors} data-testid="dc-errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            ) : fourCp?.year === form.year && !cp ? (
              <p className={studio.error}>Could not load the 4CP data for {form.year}: {fourCp.error}</p>
            ) : run.status === 'error' ? (
              <p className={studio.error} data-testid="dc-error">{run.message}</p>
            ) : !shown ? (
              <p className={classes.status} data-testid="dc-status">Solving {label} at {form.loc}…</p>
            ) : (
              <p className={classes.status} data-testid="dc-status">
                {current ? `Solved ${shown.result.daysSolved} days in ${num(shown.ms / 1000, 1)} s in your browser.` : 'Updating for the new inputs…'}
              </p>
            )}
          </section>
          {shown && <Results shown={shown} stale={!current} tcos={tcos} />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ site and inputs */

function SiteLine({ form }: { form: DcForm }) {
  const s = form.site!;
  return (
    <p className={classes.siteLine} data-testid="dc-site">
      Site: <strong>{s.label}</strong> ({s.lat.toFixed(3)}, {s.lon.toFixed(3)})
      {s.node && <>. Nearest node {s.node}{s.km != null ? `, ${num(s.km, 1)} km` : ''}</>}.
      {' '}Prices from {form.loc}{s.node && s.node !== form.loc ? `: ${s.node} has no price file for Studio, and ${form.loc} is the nearest place that does` : ''}.
    </p>
  );
}

function Tag({ source, note }: { source: string; note: string }) {
  return (
    <p className={classes.note}>
      <span className={classes.tag}>assumption</span> {note} <a href={source} target="_blank" rel="noreferrer">Source</a>
    </p>
  );
}

function Num({ label, value, onChange, lim, step, suffix, prefix, hint, testId }: {
  label: string; value: number; onChange: (v: number) => void; lim: { min: number; max: number }; step: number;
  suffix?: string; prefix?: string; hint?: ReactNode; testId: string;
}) {
  return (
    <NumberInput
      label={label} description={hint} value={value} onChange={(v) => typeof v === 'number' && onChange(v)}
      min={lim.min} max={lim.max} step={step} prefix={prefix} suffix={suffix} allowNegative={false} clampBehavior="blur" inputMode="decimal"
      classNames={{ label: studio.label, description: studio.hint }} data-testid={testId}
    />
  );
}

function Pick<T extends string | boolean>({ label, name, value, options, onPick }: {
  label: string; name: string; value: T; options: { value: T; label: string }[]; onPick: (v: T) => void;
}) {
  return (
    <div className={studio.choices} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={studio.choice} aria-pressed={value === o.value} onClick={() => onPick(o.value)} data-testid={`${name}-${String(o.value)}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Inputs({ form, set, coverage, profile, csvError, onFile, clearProfile, stackNote, choice, misses, fit, twelve }: {
  form: DcForm; set: (p: Partial<DcForm>) => void; coverage: DcCoverage[]; profile: { name: string; values: number[] } | null;
  csvError: string | null; onFile: (f: File | undefined) => void; clearProfile: () => void; stackNote: string | null;
  choice: 'off' | 'none' | 'match'; misses: number; fit: [number, number] | null;
  /** V5: null when the control is not offered (V5 off). */
  twelve: { loaded: boolean; error: string | null } | null;
}) {
  const locs = dcLocations(coverage);
  const years = dcYears(coverage, form.loc);
  const dur = durationOf(form);
  const a = DC_ASSUMPTIONS;
  const peak = profile ? Math.max(...profile.values) : null;
  return (
    <section className={studio.inputs} aria-labelledby="dc-inputs-title" onFocus={revealFocused}>
      <div className={studio.inputsHead}>
        <h2 id="dc-inputs-title" className={studio.cardTitle}>Inputs</h2>
        <button type="button" className={studio.quiet} onClick={() => set({ ...DC_DEFAULTS })}>Reset</button>
      </div>

      <NativeSelect
        label="Prices from" value={form.loc} onChange={(e) => set({ loc: e.currentTarget.value })} data-testid="dc-loc"
        classNames={{ label: studio.label, description: studio.hint }}
        data={locs.map((c) => ({ value: c, label: `${locName(c)} · ${c}` }))}
      />
      <div className={studio.field}>
        <span className={studio.label}>Year</span>
        <Pick label="Year" name="dc-year" value={String(form.year)} onPick={(y) => set({ year: Number(y) })} options={years.map((c) => ({ value: String(c.year), label: String(c.year) }))} />
        {years.find((c) => c.year === form.year) && yearLabel(years.find((c) => c.year === form.year), form.year) !== String(form.year) && (
          <p className={studio.hint}>Prices run to {fmtDate(years.find((c) => c.year === form.year)!.last)}. Energy and ancillary revenue are annualized; 4CP covers June to September.</p>
        )}
      </div>

      <fieldset className={classes.group}>
        <legend className={classes.legend}>Site</legend>
        <Num
          label="Site load (MW)" value={form.siteLoadMw} onChange={(siteLoadMw) => set({ siteLoadMw })} lim={DC_LIMITS.siteLoadMw} step={DC_STEP.siteLoadMw} testId="dc-load"
          hint={sb6Threshold ? `SB 6 large-load standards apply to a site above ${sb6Threshold.valueMw} MW, unless the PUCT sets a lower threshold.` : undefined}
        />
        <Num label="Load factor" value={form.loadFactor} onChange={(loadFactor) => set({ loadFactor })} lim={DC_LIMITS.loadFactor} step={DC_STEP.loadFactor} testId="dc-lf" hint="Share of the site load drawn in every hour of a flat profile." />
        <div className={studio.field}>
          <label className={studio.label} htmlFor="dc-csv">Hourly load (optional CSV)</label>
          <input id="dc-csv" type="file" accept=".csv,text/csv,text/plain" className={classes.file} onChange={(e) => onFile(e.currentTarget.files?.[0])} data-testid="dc-csv" />
          {profile && (
            <p className={studio.hint} data-testid="dc-profile">
              {profile.name}: {num(profile.values.length)} hours, peak {num(peak, 1)} MW. It replaces the flat load and is not saved in the link.{' '}
              <button type="button" className={studio.quiet} onClick={clearProfile}>Remove</button>
            </p>
          )}
          {csvError && <p className={studio.error} role="alert">{csvError}</p>}
          {!profile && !csvError && <p className={studio.hint}>8760 or 8784 values in MW, one per hour from January 1, 00:00 Central Standard Time.</p>}
        </div>
        <div className={studio.field}>
          <span className={studio.label}>Export to the grid</span>
          <Pick label="Export to the grid" name="dc-exp" value={form.exportAllowed} onPick={(exportAllowed) => set({ exportAllowed })} options={[{ value: false, label: 'No export' }, { value: true, label: 'Export' }]} />
          <p className={studio.hint}>Without export the battery never discharges more than the site is drawing.</p>
        </div>
      </fieldset>

      <fieldset className={classes.group}>
        <legend className={classes.legend}>Battery</legend>
        <Num label="Power (MW)" value={form.batteryMw} onChange={(batteryMw) => set({ batteryMw })} lim={DC_LIMITS.batteryMw} step={DC_STEP.batteryMw} testId="dc-mw" />
        <Num label="Energy (MWh)" value={form.batteryMwh} onChange={(batteryMwh) => set({ batteryMwh })} lim={DC_LIMITS.batteryMwh} step={DC_STEP.batteryMwh} testId="dc-mwh" hint={`${num(dur, 2)} hours at full power.`} />
        <Num label="Round-trip efficiency" value={form.rte} onChange={(rte) => set({ rte })} lim={DC_LIMITS.rte} step={DC_STEP.rte} testId="dc-rte" hint={`A share from ${DC_LIMITS.rte.min} to ${DC_LIMITS.rte.max}. Ancillary services need the default, the efficiency the precomputed stack used.`} />
      </fieldset>

      {twelve && (
        <fieldset className={classes.group} data-testid="dc-tcos-control">
          <legend className={classes.legend}>Transmission charge</legend>
          <Pick label="Transmission charge" name="dc-tcos" value={form.tcos} onPick={(tcos) => set({ tcos })}
            options={[{ value: '4cp', label: TCOS_LABEL['4cp'] }, { value: '12cp', label: TCOS_LABEL['12cp'] }]} />
          <p className={studio.hint}>
            {twelve.error
              ? `The 12CP peaks for ${form.year} did not load (${twelve.error}), so only 4CP is shown.`
              : form.tcos === '12cp'
                ? 'Shows the proposed rule: the battery cuts the site load at ERCOT\'s monthly peaks. Both rules are compared below.'
                : 'Shows today\'s rule: the battery cuts the site load at the four summer peaks. Both rules are compared below.'}
          </p>
        </fieldset>
      )}

      <details className={classes.advanced} data-testid="dc-advanced">
        <summary className={classes.summary}>Advanced</summary>
        <div className={classes.advancedBody}>
          <div className={studio.field}>
            <Num label="4CP rate ($/kW per 4CP)" value={form.fourCpRatePerKw} onChange={(fourCpRatePerKw) => set({ fourCpRatePerKw })} lim={DC_LIMITS.fourCpRatePerKw} step={DC_STEP.fourCpRatePerKw} prefix="$" testId="dc-rate" />
            <Tag source={a.rate.source} note={`Default ${usd(a.rate.value, 2)}: the ERCOT-wide postage stamp rate over 4. Your utility's tariff can differ.`} />
            {twelve && <p className={studio.hint}>The 12CP case bills the same annual amount over 12 monthly peaks: {usd(defaultTwelveCpRate(form.fourCpRatePerKw), 2)} per peak.</p>}
          </div>
          <div className={studio.field}>
            <span className={studio.label}>4CP strategy</span>
            <Pick label="4CP strategy" name="dc-strat" value={form.fourCpStrategy} onPick={(fourCpStrategy) => set({ fourCpStrategy })}
              options={[{ value: 'realistic', label: STRATEGY_LABEL.realistic }, { value: 'foresight', label: STRATEGY_LABEL.foresight }]} />
            <p className={studio.hint}>
              {form.fourCpStrategy === 'realistic'
                ? `Plans on day-ahead prices. On alert days (ERCOT's daily peak at least ${a.strategy.thresholdPct}% of the month's highest so far) it holds an even cut through the window.`
                : 'Knows each 4CP interval in advance: an upper bound.'}
            </p>
          </div>
          <div className={studio.field}>
            <span className={studio.label} id="dc-window-label">4CP alert window (local time)</span>
            <div className={studio.dates} role="group" aria-labelledby="dc-window-label">
              <NativeSelect label="From" value={String(form.windowStartHour)} onChange={(e) => set({ windowStartHour: Number(e.currentTarget.value) })}
                data={HOURS.slice(0, 24).map((h) => ({ value: String(h), label: hourLabel(h) }))} classNames={{ label: studio.label }} data-testid="dc-ws" />
              <NativeSelect label="To" value={String(form.windowEndHour)} onChange={(e) => set({ windowEndHour: Number(e.currentTarget.value) })}
                data={HOURS.slice(1).map((h) => ({ value: String(h), label: hourLabel(h) }))} classNames={{ label: studio.label }} data-testid="dc-we" />
            </div>
            {misses > 0 && fit && (
              <p className={studio.hint} data-testid="dc-window-miss">
                {misses} of this year's 4CP intervals fall outside {hourLabel(form.windowStartHour)} to {hourLabel(form.windowEndHour)}.{' '}
                <button type="button" className={studio.quiet} onClick={() => set({ windowStartHour: fit[0], windowEndHour: fit[1] })}>Widen to {hourLabel(fit[0])} to {hourLabel(fit[1])}</button>
              </p>
            )}
            <Tag source={a.strategy.source} note={`Default ${a.strategy.windowStartLocal} to ${a.strategy.windowEndLocal}, checked against the official 2023 to 2025 4CP intervals: all fall inside. Used by the day-ahead plan only.`} />
            {twelve && <p className={studio.hint}>The 12CP case uses its own season windows from the 12CP rules, not this window.</p>}
          </div>
          <div className={studio.field}>
            <Num label="Curtailment hours per year" value={form.curtailmentHoursPerYear} onChange={(curtailmentHoursPerYear) => set({ curtailmentHoursPerYear })} lim={DC_LIMITS.curtailmentHoursPerYear} step={DC_STEP.curtailmentHoursPerYear} testId="dc-ch" />
            <Tag source={a.curtailment.source} note={`Default ${a.curtailment.value} hours: no public source forecasts SB 6 curtailment.`} />
          </div>
          <div className={studio.field}>
            <Num label="Value of lost load ($/MWh)" value={form.valueOfLostLoad} onChange={(valueOfLostLoad) => set({ valueOfLostLoad })} lim={DC_LIMITS.valueOfLostLoad} step={DC_STEP.valueOfLostLoad} prefix="$" testId="dc-voll" />
            <Tag source={a.voll.source} note={`Default ${usd(a.voll.value, 0)}/MWh: ${a.voll.label}.`} />
          </div>
          <div className={studio.field}>
            <span className={studio.label}>Ancillary services</span>
            <Pick label="Ancillary services" name="dc-as" value={form.asEnabled} onPick={(asEnabled) => set({ asEnabled })} options={[{ value: true, label: 'On' }, { value: false, label: 'Off' }]} />
            <p className={studio.hint} data-testid="dc-as-note">
              {choice === 'off' ? 'Energy only.' : stackNote ?? (choice === 'match' ? 'From the precomputed revenue stack for this year, duration and mode.' : 'Looking for a precomputed stack…')}
              {choice === 'match' && !stackNote && isUpperBoundYear(form.year) && <> {AS_UPPER_BOUND_NOTE}</>}
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

/* ------------------------------------------------------------------ results */

function Results({ shown, stale, tcos }: { shown: Shown; stale: boolean; tcos: Tcos }) {
  const { comparison } = shown;
  // The selected rule's run. Without a comparison (V5 off, or no 12CP file) it is the 4CP run, as it has always been.
  const sel: Tcos = comparison ? tcos : '4cp';
  const r = comparison && sel === '12cp' ? comparison.twelveCp.result : shown.result;
  const f = shown.form;
  const peak = comparison ? TCOS_SHORT[sel] : '4CP';
  const rows = breakdownRows(r, peak);
  const max = Math.max(r.perKwYr, r.standalone.perKwYr, 0) || 1;
  const diff = r.perKwYr - r.standalone.perKwYr;
  const s = r.dispatchSample;
  // The 12CP run's own notes can repeat the comparison's, so each sentence is listed once.
  const notes = [...new Set([...(shown.stackNote ? [shown.stackNote] : []), ...(shown.upperBound ? [AS_UPPER_BOUND_NOTE] : []), ...r.notes, ...(comparison && sel === '12cp' ? comparison.notes : [])])];
  // Project economics can use this case's total as its "Data Center site" revenue source.
  const label = `${num(f.batteryMw)} MW / ${num(f.batteryMwh)} MWh at ${locName(f.loc)}, ${shown.year}${comparison ? `, ${TCOS_LABEL[sel]}` : ''}`;
  const dur = durationOf(f);
  const carried: Tcos | undefined = comparison ? sel : undefined;
  useEffect(() => { setDcCase({ perKwYr: r.perKwYr, label, durationH: dur, ...(carried ? { tcos: carried } : {}) }); }, [r.perKwYr, label, dur, carried]);
  const econHref = economicsLink(buildHash('economics', {
    location: f.loc, duration: DURATIONS.includes(dur) ? dur : 2, year: YEARS.includes(f.year) ? f.year : 2025, deg: 10,
  }), r.perKwYr, dur, carried);
  const csv = () => {
    const { headers, rows: out } = dcCsv({ ...f, tcos: sel }, r, { yearLabel: shown.year, stackNote: shown.stackNote, profileName: shown.profile, comparison });
    downloadCsv(`chargeline-datacenter-${f.loc}-${f.year}.csv`, headers, out);
  };
  return (
    <div className={studio.stack} data-stale={stale || undefined} data-testid="dc-results">
      <section className={studio.card} aria-labelledby="dc-head">
        <p id="dc-head" className={studio.eyebrowMuted}>Battery value at this site · {shown.year}</p>
        <div className={studio.totals}>
          <div>
            <p className={studio.money} data-testid="dc-perkw">{usd(r.perKwYr, 1)}</p>
            <p className={studio.monoSmall}>{TERMS.revenueUnit.label}</p>
          </div>
          <div>
            <p className={studio.money} data-tone="blue" data-testid="dc-total">{money(r.totalUsd)}</p>
            <p className={studio.monoSmall}>per year, {num(f.batteryMw)} MW / {num(f.batteryMwh)} MWh</p>
          </div>
        </div>
        <p className={studio.small}>{STRATEGY_LABEL[f.fourCpStrategy]} · {f.exportAllowed ? 'export allowed' : 'no export'} · prices from {f.loc}{comparison ? ` · ${TCOS_LABEL[sel]}` : ''}. A backtest of past prices, not a forecast.</p>
      </section>

      {comparison && <TcosBlock comparison={comparison} tcos={sel} />}

      <section className={studio.card} aria-labelledby="dc-bd-title">
        <h2 id="dc-bd-title" className={studio.cardTitle}>Where the value comes from</h2>
        <p className={studio.meta}>{TERMS.revenueUnit.label}</p>
        <p className={classes.look}>Each bar starts where the last ended. The grey bar is the total.</p>
        <Chart height={260} label={`Waterfall of battery value by source: energy, ancillary services, ${peak} avoided, reliability, and the total`} build={(t) => buildWaterfallOption(t, r.breakdownPerKwYr, peak)} />
        <ul className={classes.rows}>
          {rows.map((x) => (
            <li key={x.key} className={classes.row} data-testid={`dc-row-${x.key}`}>
              <span className={classes.swatch} data-key={x.key} aria-hidden="true" />
              <span>{x.label}</span>
              <span className={classes.rowVal} data-testid={`dc-row-${x.key}-perkw`}>{usd(x.perKw, 1)}</span>
              <span className={classes.rowSub} data-testid={`dc-row-${x.key}-usd`}>{money(x.usd)}/yr</span>
            </li>
          ))}
          <li className={classes.row} data-testid="dc-row-total">
            <span className={classes.swatch} data-key="total" aria-hidden="true" />
            <span>Total</span>
            <span className={classes.rowVal}>{usd(r.perKwYr, 1)}</span>
            <span className={classes.rowSub}>{money(r.totalUsd)}/yr</span>
          </li>
        </ul>
        {f.curtailmentHoursPerYear > 0 && <p className={studio.small}>Reliability is a user assumption: it comes from the curtailment hours and value of lost load you entered.</p>}
      </section>

      <section className={studio.card} aria-labelledby="dc-cmp-title">
        <h2 id="dc-cmp-title" className={studio.cardTitle}>Compared with standalone</h2>
        <p className={studio.meta}>The same battery at {f.loc} with no site: no load cap, no {peak}</p>
        <Bar label="At this site" value={usd(r.perKwYr, 1)} share={r.perKwYr / max} tone="blue" />
        <Bar label={`Standalone at ${f.loc}`} value={usd(r.standalone.perKwYr, 1)} share={r.standalone.perKwYr / max} tone="grey" testId="dc-standalone" />
        <p className={studio.small} data-testid="dc-diff">
          {diff >= 0 ? `The site adds ${usd(diff, 1)}` : `The site costs ${usd(-diff, 1)}`} {TERMS.revenueUnit.label}
          {f.site?.node && f.site.node !== f.loc ? `. ${f.site.node}, the nearest node, has no price file here, so both use ${f.loc}.` : '.'}
        </p>
      </section>

      <section className={studio.card} aria-labelledby="dc-day-title">
        <h2 id="dc-day-title" className={studio.cardTitle}>One {s?.fourCp ? peak : 'alert'} day</h2>
        {s ? (
          <>
            <p className={studio.meta}>{fmtDate(s.date)} · MW, 15-minute intervals</p>
            <p className={classes.look}>The dark band is the counted {peak} interval{s.window || s.windows ? `; the light ${s.windows && s.windows.length > 1 ? 'bands are the hold windows' : 'band is the alert window'}` : ''}. Grid draw is the load less the battery.</p>
            <Chart height={300} label={`Dispatch on ${s.date}: site load, grid draw, battery charge and discharge, with the ${peak} interval marked`} build={(t) => buildDispatchOption(t, s, peak)} />
          </>
        ) : <p className={studio.small}>No {peak} or alert day in the period, so there is no day to show.</p>}
        <div className={studio.tableBox}>
          <table className={studio.table} data-testid="dc-4cp">
            <caption className={studio.visuallyHidden}>{peak} intervals and the cut held</caption>
            <thead><tr><th scope="col">{peak} interval (ending)</th><th scope="col">Cut held</th><th scope="col">Value</th></tr></thead>
            <tbody>
              {r.fourCpDetail.map((d) => (
                <tr key={d.month}>
                  <td>{d.intervalEndingLocal.replace('T', ' ')}</td>
                  <td>{d.covered ? `${num(d.cutMw, 1)} MW` : 'not covered'}</td>
                  <td>{money(d.valueUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {notes.length > 0 && (
        <section className={studio.card} aria-labelledby="dc-notes-title">
          <h2 id="dc-notes-title" className={studio.cardTitle}>Notes on this run</h2>
          <ul className={classes.notes} data-testid="dc-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      )}

      <RulesNote />

      <div className={studio.actions}>
        <button type="button" className={studio.secondary} onClick={csv} data-testid="dc-csv-out">Download CSV</button>
        <button type="button" className={studio.secondary} onClick={() => window.print()}>Print</button>
        <a className={studio.secondary} href={econHref} data-testid="dc-to-economics">Use in Project economics</a>
      </div>
      <DcPrint shown={shown} r={r} sel={sel} />
    </div>
  );
}

function Bar({ label, value, share, tone, testId }: { label: string; value: string; share: number; tone: 'blue' | 'grey'; testId?: string }) {
  return (
    <div className={studio.hbar}>
      <div className={studio.hbarHead}><span>{label}</span><span data-tone={tone} data-testid={testId}>{value}</span></div>
      <div className={studio.barTrack}><div className={studio.fill} data-tone={tone} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} /></div>
    </div>
  );
}

/** 4CP is under PUCT review and SB 6 is being implemented: the text and links come from the rules config. */
function RulesNote() {
  const review = rules.fourCp.review;
  const sb6 = rules.sb6;
  return (
    <section className={studio.card} aria-labelledby="dc-rules-title" data-testid="dc-rules">
      <h2 id="dc-rules-title" className={studio.cardTitle}>Rules are changing</h2>
      <p className={studio.small}>{review.text}</p>
      <ul className={classes.links}>
        {review.sources.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{u.replace(/^https:\/\/(www\.)?/, '')}</a></li>)}
      </ul>
      <p className={studio.small}>SB 6 ({sb6.statute.citation}) is being implemented. Status as of {sb6.ruleStatus[0]?.asOf}:</p>
      <ul className={classes.notes}>
        {sb6.ruleStatus.map((x) => <li key={x.project}>Project {x.project}, {x.title}: {x.status}.</li>)}
      </ul>
      <ul className={classes.links}>
        <li><a href={sb6.statute.billText} target="_blank" rel="noreferrer">SB 6 bill text</a></li>
        <li><a href={sb6.ruleStatusSource} target="_blank" rel="noreferrer">ERCOT status report</a></li>
      </ul>
      <p className={studio.small}>{sb6.batteryNote.text}</p>
    </section>
  );
}

/** A one-page print sheet. It reuses the Site Value card's print classes, so the two sheets never hide each other. */
function DcPrint({ shown, r, sel }: { shown: Shown; r: DataCenterResult; sel: Tcos }) {
  const { form: f, comparison } = shown;
  const peak = comparison ? TCOS_SHORT[sel] : '4CP';
  const today = new Date().toISOString().slice(0, 10);
  return createPortal(
    <div className={site.sheet} data-testid="dc-print">
      <p className={site.sheetKicker}>Chargeline · Data Center mode · {today}</p>
      <h1 className={site.sheetTitle}>{f.site?.label ?? `Battery at ${f.loc}`}</h1>
      <p>{shown.year} · prices from {f.loc} · {STRATEGY_LABEL[f.fourCpStrategy]} · {f.exportAllowed ? 'export allowed' : 'no export'}{comparison ? ` · ${TCOS_LABEL[sel]}` : ''}</p>
      <p className={site.sheetBig}>{usd(r.perKwYr, 1)} {TERMS.revenueUnit.label} · {money(r.totalUsd)} per year</p>
      <table className={site.sheetTable}>
        <thead><tr><th>Source</th><th>{TERMS.revenueUnit.label}</th><th>$/yr</th></tr></thead>
        <tbody>
          {breakdownRows(r, peak).map((x) => <tr key={x.key}><td>{x.label}</td><td>{usd(x.perKw, 1)}</td><td>{money(x.usd)}</td></tr>)}
          <tr><td>Total at this site</td><td>{usd(r.perKwYr, 1)}</td><td>{money(r.totalUsd)}</td></tr>
          <tr><td>Standalone at {f.loc}</td><td>{usd(r.standalone.perKwYr, 1)}</td><td>{money(r.standalone.totalUsd)}</td></tr>
        </tbody>
      </table>
      {comparison && (
        <table className={site.sheetTable} data-testid="dc-print-tcos">
          <thead><tr><th>Transmission charge</th><th>Avoided {TERMS.revenueUnit.label}</th><th>Avoided $/yr</th><th>Alert days</th><th>Energy given up $/yr</th><th>Net {TERMS.revenueUnit.label}</th><th>Net $/yr</th></tr></thead>
          <tbody>
            {tcosRows(comparison).map((x) => (
              <tr key={x.tcos}>
                <td>{x.label}{x.partial ? `, ${x.partial}` : ''}</td><td>{usd(x.outcome.avoidedPerKwYr, 1)}</td><td>{money(x.outcome.avoidedUsd)}</td>
                <td>{f.fourCpStrategy === 'realistic' ? x.outcome.alertDays : 'n/a'}</td><td>{money(x.outcome.energyGivenUpUsd)}</td>
                <td>{usd(x.outcome.netPerKwYr, 1)}</td><td>{money(x.outcome.netUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>Site load {num(f.siteLoadMw)} MW × {num(f.loadFactor, 2)}{shown.profile ? ` (hourly profile ${shown.profile})` : ''} · battery {num(f.batteryMw)} MW / {num(f.batteryMwh)} MWh · efficiency {num(f.rte, 2)} · 4CP rate {usd(f.fourCpRatePerKw, 2)}/kW · window {hourLabel(f.windowStartHour)} to {hourLabel(f.windowEndHour)} · curtailment {num(f.curtailmentHoursPerYear)} h · value of lost load {usd(f.valueOfLostLoad, 0)}/MWh</p>
      <ul>{[...new Set([...(shown.stackNote ? [shown.stackNote] : []), ...(shown.upperBound ? [AS_UPPER_BOUND_NOTE] : []), ...r.notes, ...(comparison ? comparison.notes : []), rules.fourCp.review.text])].map((n) => <li key={n}>{n}</li>)}</ul>
      <p className={site.sheetLink}>{window.location.href}</p>
    </div>,
    document.body,
  );
}
