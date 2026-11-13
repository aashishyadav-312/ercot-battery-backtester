import type { ReactNode } from 'react';
import type { Selection } from '../../data/types';
import { buildHash, tabsFor, type Page, type Tab } from '../../shell/route';
import classes from './ViewBar.module.css';

/**
 * Sub-navigation for a tab that holds more than one of the existing pages (Studio, Research) until those
 * pages are redesigned. Hidden for single-view tabs. `children` carries the scenario selectors on pages that use them.
 */
export function ViewBar({ tab, page, sel, children }: { tab: Tab; page: Page; sel: Selection; children?: ReactNode }) {
  const { label, views: all } = tabsFor().find((t) => t.tab === tab)!;
  // V5: the Research pages sit inside Learn. The top row shows "Research" as one item (current on any of them) and a second row lists them.
  const views = all.filter((v) => !v.parent);
  const group = all.find((v) => v.page === page)?.parent ?? (all.some((v) => v.parent === page) ? page : null);
  const subs = group ? all.filter((v) => v.page === group || v.parent === group) : [];
  if (views.length < 2 && !children) return null;
  return (
    <div className={classes.bar}>
      {views.length > 1 && (
        <nav className={classes.views} aria-label={`${label} pages`}>
          {views.map((v) => (
            <a key={v.page} className={classes.view} href={buildHash(v.page, sel)} aria-current={v.page === page || v.page === group ? 'page' : undefined}>{v.label}</a>
          ))}
        </nav>
      )}
      {children}
      {subs.length > 0 && (
        <nav className={`${classes.views} ${classes.subViews}`} aria-label="Research pages">
          {subs.map((v) => (
            <a key={v.page} className={classes.view} href={buildHash(v.page, sel)} aria-current={v.page === page ? 'page' : undefined}>{v.subLabel ?? v.label}</a>
          ))}
        </nav>
      )}
    </div>
  );
}
