import { Suspense, lazy, useEffect } from 'react';
import {
  ActionIcon, AppShell, Badge, Burger, Group, NavLink, Skeleton, Stack, Text, Tooltip, useComputedColorScheme, useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure, useWindowScroll } from '@mantine/hooks';
import { useApp, type Page } from './state';
import { Selectors } from './components/Selectors';
import { IconAbout, IconBattery, IconCompare, IconCustom, IconDispatch, IconEconomics, IconMap, IconMethod, IconMoon, IconOverview, IconRealism, IconRevenue, IconStart, IconSun } from './components/Icons';
import Start from './pages/Start';
const MapPage = lazy(() => import('./pages/Map')); // pulls in echarts' geo component; other pages don't need it
import Overview from './pages/Overview';
import Revenue from './pages/Revenue';
import Dispatch from './pages/Dispatch';
import Compare from './pages/Compare';
import Realism from './pages/Realism';
import Economics from './pages/Economics';
const Custom = lazy(() => import('./pages/Custom')); // the solver and worker load only when someone opens this page
import Method from './pages/Method';
import About from './pages/About';
import { SiteFooter } from './components/SiteFooter';
import { dataThrough } from './data/site';
import { fmtDate } from './data/format';


/** Pages without the top-bar scenario selectors (they have none, or their own inputs). */
const OWN_INPUTS: Page[] = ['method', 'about', 'start', 'custom'];

const NAV: { page: Page; label: string; icon: () => React.JSX.Element }[] = [
  { page: 'start', label: 'Start here', icon: IconStart },
  { page: 'map', label: 'Map', icon: IconMap },
  { page: 'overview', label: 'Overview', icon: IconOverview },
  { page: 'revenue', label: 'Revenue', icon: IconRevenue },
  { page: 'dispatch', label: 'Dispatch', icon: IconDispatch },
  { page: 'compare', label: 'Compare', icon: IconCompare },
  { page: 'realism', label: 'Realism', icon: IconRealism },
  { page: 'economics', label: 'Economics', icon: IconEconomics },
  { page: 'custom', label: 'Custom run', icon: IconCustom },
  { page: 'method', label: 'Method', icon: IconMethod },
  { page: 'about', label: 'About', icon: IconAbout },
];

/** "Data through <date>" badge, read from results/index.json (latest day across all runs). */
function DataBadge() {
  const { index } = useApp();
  if (!index) return null;
  const d = dataThrough(index);
  const detail = d.hubs && d.nodes && d.hubs !== d.nodes ? `Hubs through ${fmtDate(d.hubs)}, resource nodes through ${fmtDate(d.nodes)}.` : 'All locations covered through this date.';
  return (
    <Tooltip label={detail} events={{ hover: true, focus: true, touch: true }}>
      <Badge variant="light" color="gray" size="lg" radius="sm" tabIndex={0} style={{ textTransform: 'none', fontWeight: 560, flexShrink: 0, cursor: 'default' }}>
        <Text span visibleFrom="sm" inherit>Data through {fmtDate(d.all)}</Text>
        <Text span hiddenFrom="sm" inherit>Data to {fmtDate(d.all).replace(/, \d{4}$/, '')}</Text>
      </Badge>
    </Tooltip>
  );
}

function SchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');
  const next = scheme === 'dark' ? 'light' : 'dark';
  return (
    <Tooltip label={`Switch to ${next} mode`}>
      <ActionIcon
        variant="subtle" color="gray" size="lg" aria-label={`Switch to ${next} mode`}
        onClick={() => { setColorScheme(next); try { localStorage.setItem('ebb-scheme', next); } catch { /* storage unavailable */ } }}
      >
        {scheme === 'dark' ? <IconSun /> : <IconMoon />}
      </ActionIcon>
    </Tooltip>
  );
}

export default function App() {
  const { page, go, error, index } = useApp();
  const [opened, { toggle, close }] = useDisclosure();
  const [{ y }] = useWindowScroll();
  useEffect(() => {
    document.title = `${NAV.find((n) => n.page === page)!.label} · ERCOT Battery Backtester`;
    // GoatCounter (privacy-friendly, cookie-free): count each page view, since hash routing never reloads the page.
    // window.goatcounter is only defined in production (see index.html), so this is a no-op in dev and previews.
    try { (window as unknown as { goatcounter?: { count: (o: object) => void } }).goatcounter?.count({ path: `/${page}`, title: document.title }); } catch { /* blocked */ }
  }, [page]);

  const Page = { start: Start, map: MapPage, overview: Overview, revenue: Revenue, dispatch: Dispatch, compare: Compare, realism: Realism, economics: Economics, custom: Custom, method: Method, about: About }[page];
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 236, breakpoint: 'md', collapsed: { mobile: !opened } }}
      padding={{ base: 'md', md: 'xl' }}
      transitionDuration={260}
      transitionTimingFunction="cubic-bezier(0.22, 1, 0.36, 1)"
    >
      <AppShell.Header data-scrolled={y > 4 || undefined}>
        <Group h="100%" px={{ base: 'md', md: 'lg' }} justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" aria-label="Toggle navigation" />
            <Group gap={10} wrap="nowrap" c="accent" style={{ minWidth: 0 }}>
              <IconBattery />
              <Text fz={15} fw={640} c="bright" style={{ letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                ERCOT Battery Backtester
              </Text>
            </Group>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <DataBadge />
            {!OWN_INPUTS.includes(page) && <Group visibleFrom="md"><Selectors /></Group>}
            <SchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" pt="md" aria-label="Pages">
        <Stack gap={4}>
          {NAV.map(({ page: p, label, icon: Icon }) => (
            <NavLink
              key={p} label={label} leftSection={<Icon />} active={page === p}
              aria-current={page === p ? 'page' : undefined}
              onClick={() => { go(p); close(); }} component="button"
            />
          ))}
        </Stack>
        <Text size="xs" c="dimmed" mt="auto" px="sm" pb="xs" lh={1.5}>
          Perfect-foresight energy arbitrage on ERCOT real-time prices. An upper bound, not a forecast.
        </Text>
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          {!OWN_INPUTS.includes(page) && (
            <Group hiddenFrom="md" mb="md"><div style={{ width: '100%' }}><Selectors fullWidth /></div></Group>
          )}
          {/* Keyed by page so each page arrives with a short rise-and-fade (fade only under reduced motion). */}
          <div key={page} className="app-enter">
            {error ? <Text c="red">Could not load results: {error}</Text> : !index && (page === 'method' || page === 'about') ? <Skeleton h={300} radius="lg" /> : <Suspense fallback={<Skeleton h={400} radius="lg" />}><Page /></Suspense>}
          </div>
          <SiteFooter />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
