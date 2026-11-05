// Learn > Basics, section 3 (v4 Step 8): a short walk-through of site screening. Shown only with V4 on.
import type { ReactNode } from 'react';
import { Anchor, List, Paper, Stack, Text, Title } from '@mantine/core';
import { Info } from '../../components/Info';

const Step = ({ n, title, children, link }: { n: number; title: string; children: ReactNode; link: ReactNode }) => (
  <Paper withBorder p={{ base: 'md', sm: 'lg' }} component="li" style={{ listStyle: 'none' }}>
    <Stack gap={6}>
      <Title order={3} fz={20}>{n}. {title}</Title>
      <Text size="md" lh="lg" maw={720}>{children}</Text>
      <Text size="sm">{link}</Text>
    </Stack>
  </Paper>
);

export function Screening() {
  return (
    <Stack gap="md">
      <List component="ol" spacing="md" listStyleType="none" m={0} p={0} data-testid="screening-steps">
        <Step n={1} title="Search a county or city" link={<Anchor href="#/atlas">Open Atlas {'→'}</Anchor>}>
          Open Atlas and type a county, a city or a latitude and longitude in the search box. Press <kbd>/</kbd> to jump to the box.
          Pick a result and the map drops a pin and lists the nearest nodes with their distances.
        </Step>
        <Step n={2} title="Read the Site Value card" link={<Anchor href="#/atlas">Pin a site on Atlas {'→'}</Anchor>}>
          The card gives a range in $/kW-yr across the nearest nodes, with the median marked. Switch between Energy and Full stack, which adds
          ancillary services <Info terms="ancillary_services_v4" /> and shows the effect of RTC+B <Info terms="rtcb_v4" />. The year strip shows how the range moved.
          It is a backtest, not a forecast, and a nearby node is not an interconnection point.
        </Step>
        <Step n={3} title="Open Data Center mode" link={<Anchor href="#/studio?mode=dc">Open Data Center mode {'→'}</Anchor>}>
          From the card, choose Data Center mode, or open it in Studio. Enter the site’s load and the battery, then read how the value splits
          between energy, ancillary services, 4CP avoided <Info terms="fourcp" /> and cover during a curtailment under SB 6 <Info terms="sb6" />.
          Those rules are under review, so treat the rate and the curtailment hours as inputs you can change.
        </Step>
      </List>
    </Stack>
  );
}
