import classes from './ErrorDetails.module.css';

/**
 * Raw messages from ERCOT or the live service, folded under a "Details" control. The sentence before it says what
 * happened in plain words; the raw text is there for anyone who wants to report or debug it.
 */
export function ErrorDetails({ items }: { items: string[] }) {
  const shown = items.filter((s) => s.trim() !== '');
  if (!shown.length) return null;
  return (
    <details className={classes.details}>
      <summary className={classes.summary}>Details</summary>
      <ul className={classes.list}>
        {shown.map((s, i) => <li key={i}><code className={classes.raw}>{s}</code></li>)}
      </ul>
    </details>
  );
}
