import type { Selection } from '../../data/types';
import { buildHash, tabsFor, viewsOf, type Tab } from '../../shell/route';
import type { Scheme } from '../../shell/scheme';
import { IconMoon, IconSun } from '../Icons';
import { SupportButton } from '../../support/Support';
import classes from './Header.module.css';

function Logo() {
  return (
    <svg className={classes.logo} width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#171A1D" />
      <path d="M41 20.1 A15.5 15.5 0 1 0 31 47.5 H47" fill="none" stroke="#F2A93B" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="52" cy="47.5" r="4" fill="#5FD6A4" />
    </svg>
  );
}

interface Props {
  active: Tab;
  sel: Selection;
  scheme: Scheme;
  onToggleScheme: () => void;
}

/** Brand, the tabs (five, or four with V5) and the theme toggle. Tabs are real links; the current one carries aria-current. */
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
          {tabsFor().map(({ tab, label, views }) => (
            <a key={tab} className={classes.tab} data-tour={`tab-${tab}`} href={buildHash(views[0].page, sel)} aria-current={active === tab ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div className={classes.actions}>
          <SupportButton />
          <button type="button" className={classes.toggle} onClick={onToggleScheme} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
            {scheme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </div>
    </header>
  );
}
