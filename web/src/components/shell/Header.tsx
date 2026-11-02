import type { Selection } from '../../data/types';
import { TABS, buildHash, viewsOf, type Tab } from '../../shell/route';
import type { Scheme } from '../../shell/scheme';
import { IconMoon, IconSun } from '../Icons';
import classes from './Header.module.css';

function Logo() {
  return (
    <svg className={classes.logo} width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.6" fill="currentColor" />
    </svg>
  );
}

interface Props {
  active: Tab;
  sel: Selection;
  scheme: Scheme;
  onToggleScheme: () => void;
}

/** Brand, the five tabs and the theme toggle. Tabs are real links; the current one carries aria-current. */
export function Header({ active, sel, scheme, onToggleScheme }: Props) {
  const next = scheme === 'dark' ? 'light' : 'dark';
  return (
    <header className={classes.header}>
      <div className={classes.inner}>
        <a className={classes.brand} href={buildHash(viewsOf('home')[0].page, sel)} aria-label="Chargeline, home">
          <Logo />
          <span className={classes.name}>Chargeline</span>
        </a>
        <nav className={classes.nav} aria-label="Primary">
          {TABS.map(({ tab, label, views }) => (
            <a key={tab} className={classes.tab} href={buildHash(views[0].page, sel)} aria-current={active === tab ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <button type="button" className={classes.toggle} onClick={onToggleScheme} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
          {scheme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </header>
  );
}
