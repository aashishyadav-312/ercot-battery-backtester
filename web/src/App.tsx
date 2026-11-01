import { useEffect } from 'react';
import {
  ActionIcon, AppShell, Burger, Group, NavLink, Skeleton, Stack, Text, Tooltip, useComputedColorScheme, useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure, useWindowScroll } from '@mantine/hooks';
import { useApp, type Page } from './state';
import { Selectors } from './components/Selectors';
import { IconBattery, IconCompare, IconDispatch, IconMethod, IconMoon, IconOverview, IconRealism, IconRevenue, IconSun } from './components/Icons';
import Overview from './pages/Overview';
import Revenue from './pages/Revenue';
import Dispatch from './pages/Dispatch';
import Compare from './pages/Compare';
import Realism from './pages/Realism';
import Method from './pages/Method';


const NAV: { page: Page; label: string; icon: () => React.JSX.Element }[] = [
  { page: 'overview', label: 'Overview', icon: IconOverview },
  { page: 'revenue', label: 'Revenue', icon: IconRevenue },
  { page: 'dispatch', label: 'Dispatch', icon: IconDispatch },
  { page: 'compare', label: 'Compare', icon: IconCompare },
  { page: 'realism', label: 'Realism', icon: IconRealism },
  { page: 'method', label: 'Method', icon: IconMethod },
];

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
  useEffect(() => { document.title = `${NAV.find((n) => n.page === page)!.label} · ERCOT Battery Backtester`; }, [page]);

  const Page = { overview: Overview, revenue: Revenue, dispatch: Dispatch, compare: Compare, realism: Realism, method: Method }[page];
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
            {page !== 'method' && <Group visibleFrom="md"><Selectors /></Group>}
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
          {page !== 'method' && (
            <Group hiddenFrom="md" mb="md"><div style={{ width: '100%' }}><Selectors fullWidth /></div></Group>
          )}
          {/* Keyed by page so each page arrives with a short rise-and-fade (fade only under reduced motion). */}
          <div key={page} className="app-enter">
            {error ? <Text c="red">Could not load results: {error}</Text> : !index && page === 'method' ? <Skeleton h={300} radius="lg" /> : <Page />}
          </div>
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
