import { useEffect } from 'react';
import {
  ActionIcon, AppShell, Burger, Group, NavLink, Skeleton, Stack, Text, Title, Tooltip, useComputedColorScheme, useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useApp, type Page } from './state';
import { Selectors } from './components/Selectors';
import { IconBattery, IconCompare, IconDispatch, IconMethod, IconMoon, IconOverview, IconRevenue, IconSun } from './components/Icons';
import Overview from './pages/Overview';
import Revenue from './pages/Revenue';
import Dispatch from './pages/Dispatch';
import Compare from './pages/Compare';
import Method from './pages/Method';


const NAV: { page: Page; label: string; icon: () => React.JSX.Element }[] = [
  { page: 'overview', label: 'Overview', icon: IconOverview },
  { page: 'revenue', label: 'Revenue', icon: IconRevenue },
  { page: 'dispatch', label: 'Dispatch', icon: IconDispatch },
  { page: 'compare', label: 'Compare', icon: IconCompare },
  { page: 'method', label: 'Method', icon: IconMethod },
];

function SchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');
  const next = scheme === 'dark' ? 'light' : 'dark';
  return (
    <Tooltip label={`Switch to ${next} mode`}>
      <ActionIcon
        variant="default" size="lg" aria-label={`Switch to ${next} mode`}
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
  useEffect(() => { document.title = `${NAV.find((n) => n.page === page)!.label} · ERCOT Battery Backtester`; }, [page]);

  const Page = { overview: Overview, revenue: Revenue, dispatch: Dispatch, compare: Compare, method: Method }[page];
  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 232, breakpoint: 'md', collapsed: { mobile: !opened } }}
      padding={{ base: 'md', md: 'lg' }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" aria-label="Toggle navigation" />
            <Group gap={8} wrap="nowrap" c="accent" style={{ minWidth: 0 }}>
              <IconBattery />
              <Title order={1} fz={16} fw={650} c="var(--mantine-color-text)" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                ERCOT Battery Backtester
              </Title>
            </Group>
          </Group>
          <Group gap="sm" wrap="nowrap">
            {page !== 'method' && <Group visibleFrom="md"><Selectors /></Group>}
            <SchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" aria-label="Pages">
        <Stack gap={2}>
          {NAV.map(({ page: p, label, icon: Icon }) => (
            <NavLink
              key={p} label={label} leftSection={<Icon />} active={page === p} variant="light"
              onClick={() => { go(p); close(); }} component="button" style={{ borderRadius: 8 }}
            />
          ))}
        </Stack>
        <Text size="xs" c="dimmed" mt="auto" px="xs" lh={1.4}>
          Perfect-foresight energy arbitrage on ERCOT real-time prices. An upper bound, not a forecast.
        </Text>
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          {page !== 'method' && (
            <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
              <Group hiddenFrom="md"><div style={{ width: '100%' }}><Selectors fullWidth /></div></Group>
            </div>
          )}
          {error ? <Text c="red">Could not load results: {error}</Text> : !index && page === 'method' ? <Skeleton h={300} /> : <Page />}
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
