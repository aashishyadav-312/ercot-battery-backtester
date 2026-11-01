import type { ReactNode } from 'react';

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const mk = (d: ReactNode) => () => <svg {...base}>{d}</svg>;

export const IconOverview = mk(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>);
export const IconRevenue = mk(<><path d="M3 20h18" /><path d="M6 16V10M12 16V5M18 16v-4" /></>);
export const IconDispatch = mk(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>);
export const IconCompare = mk(<><path d="M7 4v16M17 4v16" /><path d="M3 8l4-4 4 4M13 16l4 4 4-4" /></>);
export const IconRealism = mk(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>);
export const IconMethod = mk(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
export const IconDownload = mk(<><path d="M12 4v11M7 11l5 5 5-5" /><path d="M4 20h16" /></>);
export const IconExpand = mk(<><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></>);
export const IconSun = mk(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const IconMoon = mk(<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />);
export const IconWarn = mk(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>);
export const IconBattery = () => (
  <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="3" y="9" width="23" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <rect x="6" y="12" width="11" height="8" rx="1" fill="currentColor" />
    <rect x="27" y="13" width="3" height="6" rx="1" fill="currentColor" />
  </svg>
);
export const IconAbout = mk(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6v.01" /></>);
export const IconStart = mk(<><path d="M5 4v17" /><path d="M5 5h11l-2.5 4L16 13H5" /></>);
export const IconMap = mk(<><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></>);
export const IconPlus = mk(<path d="M12 5v14M5 12h14" />);
export const IconMinus = mk(<path d="M5 12h14" />);
export const IconReset = mk(<><path d="M4 12a8 8 0 1 0 2.5-5.8" /><path d="M4 4v4.5h4.5" /></>);
