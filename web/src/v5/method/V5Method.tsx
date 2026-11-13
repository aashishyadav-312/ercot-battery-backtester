// Method page, V5 Step 6: the 12CP model and the EIA-860M storage data. Loaded lazily by pages/Method.tsx, only with V5 on.
// Every rule, date and count is read from twelvecp_rules.json, the 12CP result files, src/v5/config.json or the batteries file.
import { useEffect, useState } from 'react';
import { Anchor, List, Stack, Text, Title } from '@mantine/core';
import { Section } from '../../components/Section';
import { YEARS, loadTwelveCp } from '../../data/loader';
import { fmtDate, usd } from '../../data/format';
import { TWELVECP_RULES as r, defaultTwelveCpRate, type TwelveCpYear } from '../../custom/twelvecp';
import type { BatteriesFile } from '../nearby';
import { loadBatteries } from '../site/loadBatteries';
import { releaseLabel } from '../site/report';
import config from '../config.json';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Title order={3} fz={16}>{title}</Title>
      {children}
    </Stack>
  );
}

const Cite = ({ citation, source }: { citation?: string; source: string }) => (
  <Text span size="xs" c="dimmed">({citation ? `${citation}, ` : ''}<Anchor size="xs" href={source} {...ext}>source</Anchor>)</Text>
);

/** "2024: 12 monthly peaks" or "2026: 10 of 12 monthly peaks so far", from the result file. */
const coverage = (y: TwelveCpYear) => `${y.year}: ${y.complete ? `${y.intervals.length} monthly peaks` : `${y.intervals.length} of ${r.defaultRatePerKwPerPeak.divisor} monthly peaks so far`}`;

export default function V5Method() {
  const [years, setYears] = useState<TwelveCpYear[] | null>(null);
  const [batteries, setBatteries] = useState<BatteriesFile | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    Promise.all(YEARS.map((y) => loadTwelveCp(y).catch(() => null))).then((ys) => live && setYears(ys.filter((y): y is TwelveCpYear => !!y)));
    loadBatteries().then((b) => live && setBatteries(b));
    return () => { live = false; };
  }, []);
  const planned = batteries?.units.filter((u) => u.status === 'planned').length ?? 0;
  const operating = batteries ? batteries.units.length - planned : 0;

  return (
    <>
      <Section title="12CP in Data Center mode">
        <Text size="sm">
          Data Center mode can also value the transmission charge under 12CP, a proposed rule that would bill on ERCOT&rsquo;s 12 monthly
          peaks instead of the four summer ones. It runs on the same battery, load and prices as the 4CP case, and the page shows both.
          It is a screening backtest of a rule that is <b>{r.status.value}</b>.
        </Text>
        <Sub title="The proposed rule">
          <Text size="sm">{r.method.text} <Cite citation={r.method.citation} source={r.method.source} /></Text>
          <Text size="sm">{r.interval.text} <Cite citation={r.interval.citation} source={r.interval.source} /></Text>
          <Text size="sm">{r.status.text}</Text>
          <List size="sm" spacing={2}>
            {r.status.sources.map((s) => <List.Item key={s}><Anchor size="sm" href={s} {...ext}>{s.replace(/^https:\/\/(www\.)?/, '')}</Anchor></List.Item>)}
          </List>
          <Text size="xs" c="dimmed">Status checked {fmtDate(r.status.asOf)}, from <code>twelvecp_rules.json</code>.</Text>
        </Sub>
        <Sub title="How the model values it">
          <Text size="sm">
            {r.defaultRatePerKwPerPeak.text} With the default 4CP rate that is {usd(defaultTwelveCpRate(), 2)} per kW at each monthly peak.
          </Text>
          <Text size="sm">{r.realisticStrategy.text}</Text>
          <Text size="sm">{r.dataResolution.text}</Text>
          <Text size="sm">
            The monthly peaks come from ERCOT&rsquo;s hourly system load archive (<Anchor size="sm" href={r.dataResolution.source} {...ext}>load history</Anchor>).
            {years && years.length > 0 && <> Peaks in the data: {years.map(coverage).join('; ')}.</>}
          </Text>
        </Sub>
        <Sub title="What the 12CP model ignores">
          <List size="sm" spacing={4}>
            {r.notModelled.map((n) => <List.Item key={n.id}>{n.text}</List.Item>)}
          </List>
        </Sub>
      </Section>

      <Section title="Storage nearby (EIA-860M)">
        <Text size="sm">
          The site report counts the battery storage that operates, and is planned, near a point. The list comes from the EIA-860M monthly
          generator inventory: battery units in Texas inside ERCOT, one entry per plant. More storage nearby tends to narrow the price spreads a
          new battery can earn, so the count is a screening signal, not a forecast of prices.
        </Text>
        {batteries ? (
          <>
            <Text size="sm">{batteries.scope}</Text>
            <Text size="sm">
              This build uses the {releaseLabel(batteries.release)} release (as of {batteries.asOf}): {operating} operating and {planned} planned
              entries. <Anchor size="sm" href={batteries.sourceUrl} {...ext}>EIA-860M workbook</Anchor>.
            </Text>
          </>
        ) : batteries === null ? <Text size="sm" c="dimmed">The storage file did not load, so the site report hides its Storage nearby section.</Text> : null}
        <Text size="sm">
          The report counts every unit within {config.nearbyBatteries.defaultRadiusKm} km, by straight-line distance.
          {config.nearbyBatteries.assumption ? ' That radius is a screening choice, not a market rule.' : ''}
        </Text>
        <Text size="sm">
          Planned units may never be built. EIA does not say which will be, so the planned figure is an upper bound on what is coming.
          Planned entries have no energy (MWh) figure in EIA-860M.
        </Text>
      </Section>
    </>
  );
}
