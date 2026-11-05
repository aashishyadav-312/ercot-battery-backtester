import type { StackFile } from './stack';
import { isFixture } from './stack';
import classes from './Stack.module.css';

/** Shown whenever a FIXTURE stack file is loaded (made-up numbers used while the Step 1 engine is unmerged). */
export function FixtureBanner({ files }: { files: (StackFile | null | undefined)[] }) {
  if (!files.some(isFixture)) return null;
  return (
    <p className={classes.fixture} role="note" data-testid="stack-fixture">
      FIXTURE data. These numbers are made up to build the interface. They are not results and not a forecast.
    </p>
  );
}

/** Assumptions and sources straight from the file's meta, so the page repeats what the engine wrote. */
export function StackNotes({ file }: { file: StackFile | null | undefined }) {
  if (!file) return null;
  return (
    <details className={classes.details} data-testid="stack-notes">
      <summary>Assumptions and sources</summary>
      <ul>
        {file.meta.assumptions.map((a) => <li key={a}>{a}</li>)}
        {file.meta.sources.map((s) => <li key={s}>Source: {s}</li>)}
      </ul>
    </details>
  );
}
