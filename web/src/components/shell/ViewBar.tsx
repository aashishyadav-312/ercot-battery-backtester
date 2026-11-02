import type { ReactNode } from 'react';
import type { Selection } from '../../data/types';
import { TABS, buildHash, type Page, type Tab } from '../../shell/route';
import classes from './ViewBar.module.css';

/**
 * Sub-navigation for a tab that holds more than one of the existing pages (Studio, Research, Guide) until those
 * pages are redesigned. Hidden for single-view tabs. `children` carries the scenario selectors on pages that use them.
 */
export function ViewBar({ tab, page, sel, children }: { tab: Tab; page: Page; sel: Selection; children?: ReactNode }) {
  const { label, views } = TABS.find((t) => t.tab === tab)!;
  if (views.length < 2 && !children) return null;
  return (
    <div className={classes.bar}>
      {views.length > 1 && (
        <nav className={classes.views} aria-label={`${label} pages`}>
          {views.map((v) => (
            <a key={v.page} className={classes.view} href={buildHash(v.page, sel)} aria-current={v.page === page ? 'page' : undefined}>{v.label}</a>
          ))}
        </nav>
      )}
      {children}
    </div>
  );
}
