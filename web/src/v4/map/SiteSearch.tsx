import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { searchSites, type SearchHit, type SearchIndex } from '../geo/search';
import classes from './AtlasSite.module.css';

const OUTSIDE = 'Outside Texas';

/**
 * Search over the map: a county, a city or "lat, long". `/` focuses the box from anywhere on the page (not while typing in a
 * field), arrows move through the results, Enter picks, Esc clears the box (and, when it is already empty, the pinned site).
 */
export function SiteSearch({ index, onPick, onClear, label = 'Find a place' }: { index: SearchIndex | null; onPick: (hit: SearchHit) => void; onClear: () => void; label?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => (index ? searchSites(index, query) : []), [index, query]);
  const showList = open && query.trim() !== '' && hits.length > 0;
  const optionId = (i: number) => `${id}-opt-${i}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pick = (hit: SearchHit | undefined) => {
    if (!hit || hit.sub === OUTSIDE) return;
    setQuery(hit.label);
    setOpen(false);
    onPick(hit);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!hits.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % hits.length : (a - 1 + hits.length) % hits.length));
    } else if (e.key === 'Enter') {
      if (hits.length) { e.preventDefault(); pick(hits[Math.min(active, hits.length - 1)]); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) { setQuery(''); setOpen(false); setActive(0); } else onClear();
    }
  };

  const status = !index ? 'Loading places' : query.trim() === '' ? '' : hits.length ? `${hits.length} ${hits.length === 1 ? 'result' : 'results'}` : 'No match';

  return (
    <div className={classes.search}>
      <label className={classes.searchLabel} htmlFor={`${id}-in`}>{label}</label>
      <div className={classes.searchBox}>
        <input
          ref={input} id={`${id}-in`} className={classes.searchInput} type="text" role="combobox" autoComplete="off" spellCheck={false}
          placeholder="County, city, or lat, long" value={query} aria-expanded={showList} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={showList ? optionId(Math.min(active, hits.length - 1)) : undefined}
          onChange={(e) => { setQuery(e.currentTarget.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
        />
        <kbd className={classes.slash} aria-hidden="true">/</kbd>
        {showList && (
          <ul id={`${id}-list`} className={classes.results} role="listbox" aria-label="Places">
            {hits.map((h, i) => (
              <li
                key={`${h.kind}-${h.label}-${i}`} id={optionId(i)} role="option" aria-selected={i === Math.min(active, hits.length - 1)} aria-disabled={h.sub === OUTSIDE || undefined}
                className={classes.result} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)} onMouseEnter={() => setActive(i)}
              >
                <span className={classes.resultName}>{h.label}</span>
                <span className={classes.resultSub}>{h.sub}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={classes.srOnly} role="status">{status}</p>
      {query.trim() !== '' && index && hits.length === 0 && <p className={classes.searchNote}>No county or city matches. Try a county name, or a point like 33.2, -98.2.</p>}
    </div>
  );
}
