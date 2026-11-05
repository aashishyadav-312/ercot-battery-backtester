// Method page, v4 Step 8: the revenue stack (C) and Data Center mode (D). Loaded lazily by pages/Method.tsx, only with V4 on.
// Every rule, rate, date and result figure is read from a config or a result file; the sentences around them are the only copy.
import { useEffect, useState } from 'react';
import { Alert, Anchor, Badge, List, Paper, Stack, Table, Text, Title } from '@mantine/core';
import dcRules from '../../custom/config/datacenter_rules.json';
import { Section } from '../../components/Section';
import { fmtDate } from '../../data/format';
import { loadAsRules, loadMethodFacts } from '../../data/loader';
import { TERMS } from '../../copy/terms';
import { AS_UPPER_BOUND_NOTE } from '../config';
import {
  asRulesAssumptions, coverageLines, dataCenterAssumptions, HEADROOM_LINES, parseMethodFacts, reserveDurations,
  type Assumption, type MethodFacts,
} from './methodFacts';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;
const scroller = (label: string, minWidth: number) => ({ minWidth, scrollAreaProps: { viewportProps: { tabIndex: 0, role: 'region', 'aria-label': label } } }) as const;

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Title order={3} fz={16}>{title}</Title>
      {children}
    </Stack>
  );
}

/** The site links nowhere on GitHub: a source that is a file in this repository shows as its path, not a link. */
const repoPath = (url: string): string | null => /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/(.+)$/.exec(url)?.[1] ?? null;

/** One ASSUMPTION item: its title, the config text, and the source and date when the config has them. */
function AssumptionItem({ a }: { a: Assumption }) {
  return (
    <List.Item data-testid="v4-assumption">
      <Text span size="sm" fw={600}>{a.title}</Text>{' '}
      <Badge size="sm" variant="dot" color="yellow">Assumption</Badge>
      <Text size="sm">{a.text}</Text>
      <Text size="xs" c="dimmed">
        <code>{a.file}</code> › <code>{a.path}</code>
        {a.source ? <> · {repoPath(a.source) ? `Source: ${repoPath(a.source)} in the repository` : <Anchor size="xs" href={a.source} {...ext}>Source</Anchor>}</> : ' · No source found'}
        {a.asOf ? ` · as of ${a.asOf}` : ''}
      </Text>
    </List.Item>
  );
}

function AssumptionList({ items, intro }: { items: Assumption[]; intro: string }) {
  return (
    <Stack gap="xs">
      <Text size="sm">{intro}</Text>
      <List size="sm" spacing="sm" listStyleType="none" data-testid="v4-assumptions">
        {items.map((a) => <AssumptionItem key={`${a.file}:${a.path}`} a={a} />)}
      </List>
    </Stack>
  );
}

export default function V4Method() {
  const [rules, setRules] = useState<unknown>(null);
  const [facts, setFacts] = useState<MethodFacts | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([loadAsRules(), loadMethodFacts()]).then(
      ([r, f]) => { if (live) { setRules(r); setFacts(parseMethodFacts(f)); } },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, []);

  const asRules = rules as { rtcb_go_live?: { date?: string; source?: string }; price_basis?: { foresight?: string; realistic?: string; sources?: string[] }; description?: string } | null;
  const reserve = rules ? reserveDurations(rules) : [];
  const asItems = rules ? asRulesAssumptions(rules) : [];
  const dcItems = dataCenterAssumptions(dcRules);
  const review = dcRules.fourCp.review;
  const goLive = asRules?.rtcb_go_live;

  return (
    <>
      <Section title="Revenue stack">
        <Text size="sm">
          The stack adds five ancillary services to energy: Reg Up, Reg Down, RRS, ECRS and Non-Spin. Each interval the battery splits its
          power between energy and these products. It must hold enough charge to back every award for the product’s duration. An award is
          paid the clearing price. The battery is a price taker, so these are backtests on historical prices, not forecasts.
        </Text>
        {failed && <Alert color="yellow">The stack rules and coverage could not be loaded. Reload the page to try again.</Alert>}
        {asRules?.price_basis && (
          <Sub title="Two modes">
            <Text size="sm"><b>{TERMS.perfectForesight.label}</b>. {asRules.price_basis.foresight}</Text>
            <Text size="sm"><b>{TERMS.dayAheadPlan.label}</b>. {asRules.price_basis.realistic}</Text>
          </Sub>
        )}
        <Sub title="Headroom rule">
          {HEADROOM_LINES.map((t) => <Text key={t} size="sm">{t}</Text>)}
        </Sub>
        {reserve.length > 0 && (
          <Sub title="RTC+B">
            <Text size="sm">
              ERCOT’s real-time co-optimization plus batteries went live on {goLive?.date ? fmtDate(goLive.date) : 'its go-live date'}
              {goLive?.source && <> (<Anchor size="sm" href={goLive.source} {...ext}>NPRR1282</Anchor>)</>}. From that day the model uses the shorter
              backing durations and real-time ancillary prices. Hours of stored energy that back one MW of award:
            </Text>
            <Table.ScrollContainer {...scroller('Reserve backing by product, scrolls sideways when it does not fit', 420)}>
              <Table withTableBorder data-testid="v4-reserve">
                <Table.Thead><Table.Tr><Table.Th>Product</Table.Th><Table.Th>Before RTC+B (h)</Table.Th><Table.Th>From RTC+B (h)</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {reserve.map((r) => (
                    <Table.Tr key={r.name}>
                      <Table.Td>{r.name}</Table.Td>
                      <Table.Td>{r.before}{r.beforeStatus === 'ASSUMPTION' ? ' (assumption)' : ''}</Table.Td>
                      <Table.Td>{r.from}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Sub>
        )}
        <Sub title="2023">
          <Text size="sm" data-testid="v4-method-2023">{AS_UPPER_BOUND_NOTE} Wherever a full-stack value for 2023 appears, it is labelled upper bound.</Text>
        </Sub>
        {asItems.length > 0 && (
          <Sub title="Assumptions in the stack">
            <AssumptionList items={asItems} intro="These items in the stack rules could not be verified from a primary source, so they use a conservative value. They are read from the config file." />
          </Sub>
        )}
        {facts && (
          <Sub title="Data gaps">
            <List size="sm" spacing={4} data-testid="v4-gaps">
              {coverageLines(facts).map((l) => <List.Item key={l}>{l}</List.Item>)}
            </List>
          </Sub>
        )}
        {asRules?.price_basis?.sources && (
          <Text size="xs" c="dimmed">
            Price reports: {asRules.price_basis.sources.map((s, i) => <span key={s}>{i > 0 && ', '}<Anchor size="xs" href={s} {...ext}>{s.split('id=')[1] ?? s}</Anchor></span>)}.
          </Text>
        )}
      </Section>

      <Section title="Data Center mode">
        <Text size="sm">
          Data Center mode values a battery next to a large load. It adds three things to the merchant result: ancillary services when a
          stack exists for the settings, the transmission charge the battery avoids at the four coincident peaks (4CP), and cover for the load
          while it is curtailed under Senate Bill 6 (SB 6). Without export, the battery can only discharge into the site’s own load.
        </Text>
        <Sub title="4CP">
          <Text size="sm">{dcRules.fourCp.method.text} <Text span size="xs" c="dimmed">({dcRules.fourCp.method.citation}, <Anchor size="xs" href={dcRules.fourCp.method.source} {...ext}>source</Anchor>)</Text></Text>
          <Text size="sm">
            Two strategies: <b>{TERMS.perfectForesight.label}</b> knows the peak intervals, and the realistic one discharges on days when the day’s
            peak load is close to the month’s highest so far. The realistic one counts only the intervals it actually covered.
          </Text>
          <Paper withBorder p="md" data-testid="v4-4cp-review" style={{ borderInlineStartWidth: 4, borderInlineStartColor: 'var(--mantine-color-yellow-6)' }}>
            <Text size="sm" fw={600} mb={4}>4CP may change</Text>
            <Text size="sm">{review.text}</Text>
            <List size="sm" spacing={2} mt={6}>
              {review.sources.map((s) => <List.Item key={s}><Anchor size="sm" href={s} {...ext}>{s}</Anchor></List.Item>)}
            </List>
            <Text size="xs" c="dimmed" mt={6}>Status as of {review.asOf}, from <code>datacenter_rules.json</code>.</Text>
          </Paper>
        </Sub>
        <Sub title="SB 6">
          <Text size="sm">
            {dcRules.sb6.statute.citation}. {dcRules.sb6.statute.text} Rulemaking status:
          </Text>
          <List size="sm" spacing={4} data-testid="v4-sb6-status">
            {dcRules.sb6.ruleStatus.map((r) => (
              <List.Item key={r.project}>Project {r.project}, {r.title}: {r.status} (as of {r.asOf}).</List.Item>
            ))}
          </List>
          <Text size="xs" c="dimmed">Source: <Anchor size="xs" href={dcRules.sb6.ruleStatusSource} {...ext}>ERCOT status report</Anchor>.</Text>
        </Sub>
        <Sub title="Assumptions in Data Center mode">
          <AssumptionList items={dcItems} intro="These defaults are labelled choices, not rules. Each can be changed in the Advanced inputs. They are read from the config file." />
        </Sub>
      </Section>
    </>
  );
}
