import { usd } from '../data/format';
import { locName } from '../data/site';
import type { CustomForm } from '../custom/params';
import { PRODUCTS, PRODUCT_LABEL, PRODUCT_TOKEN, eraLabel, yearTag, type StackMode } from './stack';
import { useStackSet } from './useStack';
import { FixtureBanner, StackNotes } from './Parts';
import { V4 } from './flag';
import classes from './Stack.module.css';

/** Studio's strategy names map to the two stack modes. */
export const stackModeOf = (strategy: CustomForm['strategy']): StackMode => (strategy === 'pf' ? 'foresight' : 'realistic');

/** The year a Studio run covers, or null when the dates span two years. */
export const formYear = (f: Pick<CustomForm, 'startDate' | 'endDate'>): number | null => {
  const a = Number(f.startDate.slice(0, 4));
  return a && a === Number(f.endDate.slice(0, 4)) ? a : null;
};

/**
 * Studio solves energy only in the browser, so there is no Ancillary services switch here. This card shows the precomputed
 * full stack for the matching settings (location, year, battery size, strategy) and says that it is precomputed.
 */
export function StackNote({ form }: { form: CustomForm }) {
  const year = formYear(form);
  const mode = stackModeOf(form.strategy);
  const { set, loading } = useStackSet(form.durationH, year ? [year] : [], V4);
  if (!V4) return null;
  const file = year && set ? set[mode].get(year) : undefined;
  const row = file?.nodes[form.location];
  const label = `${locName(form.location)}, ${form.durationH}-hour battery${year ? `, ${year}` : ''}`;
  return (
    <section className={classes.note} aria-labelledby="stack-note-title" data-testid="stack-note">
      <h3 id="stack-note-title" className={classes.title}>Ancillary services</h3>
      <p className={classes.sub}>
        This browser run is energy only. The figures below are precomputed outside the browser for the same settings, in {mode === 'foresight' ? 'perfect foresight' : 'the realistic mode'}.
      </p>
      <FixtureBanner files={[file]} />
      {loading ? <p className={classes.small}>Loading the revenue stack…</p>
        : !year ? <p className={classes.small}>Precomputed stacks cover one year at a time. Pick dates inside one year to see it.</p>
        : !row || !file ? <p className={classes.small} data-testid="stack-note-empty">No precomputed full stack for {label}. Missing results are never shown as zero.</p>
        : (
          <>
            <p className={classes.small}>{locName(form.location)}, {form.durationH}-hour battery, {yearTag(file.meta)}. {eraLabel(file.meta.rtcb)}. $/kW-yr.</p>
            <ul className={classes.rows} aria-label="Revenue by product">
              {PRODUCTS.map((p) => (
                <li key={p} className={classes.row}>
                  <span className={classes.swatch} style={{ ['--c' as string]: `var(--chart-${PRODUCT_TOKEN[p]})` }} aria-hidden="true" />
                  <span>{PRODUCT_LABEL[p]}</span>
                  <span className={classes.val} data-testid={`stack-note-${p}`}>{usd(row[p], 1)}</span>
                </li>
              ))}
              <li className={`${classes.row} ${classes.total}`}>
                <span aria-hidden="true" />
                <span>Full stack</span>
                <span className={classes.val} data-testid="stack-note-total">{usd(row.total, 1)}</span>
              </li>
            </ul>
            <StackNotes file={file} />
          </>
        )}
    </section>
  );
}
