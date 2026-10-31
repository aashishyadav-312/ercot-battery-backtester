import { Alert, Text } from '@mantine/core';
import type { Run } from '../data/types';
import { TOP_DAY_WARN, dataNote, topDay } from '../data/analytics';
import { fmtDate, pct, usd } from '../data/format';
import { IconWarn } from './Icons';

/** Shown on any run whose single best day is more than 20% of the period's revenue. */
export function DataQuality({ run }: { run?: Run }) {
  if (!run) return null;
  const t = topDay(run);
  if (!t || t.share <= TOP_DAY_WARN) return null;
  const extra = dataNote(run.meta.location, run.meta.year);
  const period = run.metrics.annualized ? 'year-to-date revenue' : 'annual revenue';
  return (
    <Alert color="orange" variant="light" icon={<IconWarn />} title="Data-quality note: one day dominates this result" radius="md">
      <Text size="sm">
        {fmtDate(t.date)} alone earned {usd(t.revenue / (run.meta.power_mw * 1000), 1)}/kW, which is{' '}
        <b>{pct(t.share, 0)}</b> of this run&rsquo;s {period} (flag threshold: {pct(TOP_DAY_WARN)}). A figure this
        dependent on a single price event is fragile; read it as &ldquo;what one spike was worth,&rdquo; not a
        typical year.
      </Text>
      {extra && <Text size="sm" mt={6}>{extra}</Text>}
    </Alert>
  );
}
