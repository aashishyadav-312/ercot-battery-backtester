import { useMemo } from 'react';
import { Alert, Text } from '@mantine/core';
import { Card } from '../components/Card';
import { Chart, axisBase, legendBase, tooltipBase, type ChartTheme } from '../components/Chart';
import { useApp } from '../state';
import { fmtDate, usd } from '../data/format';
import { RTCB_GO_LIVE } from './config';
import { locFull } from '../data/site';
import { alpha } from '../theme/chartColors';
import { PRODUCTS, PRODUCT_LABEL, PRODUCT_TOKEN, eraLabel, stackCsv, totalRange, yearStacks, yearTag, type YearStack } from './stack';
import { useStackSet } from './useStack';
import { FixtureBanner, StackNotes } from './Parts';
import { V4 } from './flag';
import classes from './Stack.module.css';

const UPPER = 'Upper bound (perfect foresight)';
const axisYear = (y: YearStack) => `${y.meta.partialYear ? `${y.year} YTD` : y.year}\n${eraLabel(y.meta.rtcb)}`;

/** Chart options, kept apart from the component so the test can check the series against the files. */
export function buildStackOption(t: ChartTheme, years: YearStack[], expanded = false) {
  const cats = years.map(axisYear);
  const shown = PRODUCTS.filter((p) => years.some((y) => (y.realistic?.[p] ?? 0) !== 0));
  const post = years.map((y, i) => (y.meta.rtcb === 'post' ? cats[i] : null)).filter((c): c is string => !!c);
  const upper = years.map((y) => y.foresight?.total ?? null);
  const hasUpper = upper.some((v) => v != null);
  return {
    tooltip: { ...tooltipBase(t), trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => usd(v, 1) },
    legend: { ...legendBase(t), type: 'scroll', data: [...shown.map((p) => PRODUCT_LABEL[p]), ...(hasUpper ? [UPPER] : [])] },
    grid: { left: 56, right: 16, top: 56, bottom: 54 },
    xAxis: { ...axisBase(t), type: 'category', data: cats, axisLabel: { color: t.muted, fontSize: 11, margin: 10, lineHeight: 15 } },
    yAxis: { ...axisBase(t), type: 'value', name: '$/kW-yr', nameGap: 14 },
    series: [
      ...shown.map((p, i) => ({
        name: PRODUCT_LABEL[p], type: 'bar', stack: 'realistic', itemStyle: { color: t[PRODUCT_TOKEN[p]] },
        data: years.map((y) => y.realistic?.[p] ?? null), barMaxWidth: expanded ? 110 : 64,
        // After-go-live years sit in a tinted band; one series carries it.
        ...(i === 0 && post.length ? { markArea: { silent: true, itemStyle: { color: alpha(t.blue, 0.07) }, label: { show: false }, data: post.map((c) => [{ xAxis: c }, { xAxis: c }]) } } : {}),
      })),
      ...(hasUpper ? [{
        name: UPPER, type: 'scatter', symbol: 'diamond', symbolSize: 12, z: 5, data: upper,
        itemStyle: { color: t.surface, borderColor: t.text, borderWidth: 2 },
      }] : []),
    ],
  };
}

/** Location detail (hub or node): realistic stack by product for each year, the perfect-foresight total as the upper bound. */
export function StackByYear() {
  const { sel } = useApp();
  const { set, loading } = useStackSet(sel.duration, undefined, V4);
  const years = useMemo(() => (set ? yearStacks(sel.location, set) : []), [set, sel.location]);
  if (!V4) return null;
  const latest = [...years].reverse().find((y) => y.realistic) ?? years[years.length - 1];
  const range = latest ? totalRange(latest.realistic, latest.foresight) : null;
  const files = set ? [...set.realistic.values(), ...set.foresight.values()] : [];
  const where = `${locFull(sel.location)}, ${sel.duration}-hour battery`;
  return (
    <Card
      title="Revenue stack by year" terms={['ancillary_services', 'rtcb']}
      subtitle={`${where}. Energy plus ancillary services, $/kW-yr.`}
      look={years.length ? 'Bars are realistic revenue by product. The diamond is the perfect-foresight ceiling. Tinted years are after RTC+B.' : undefined}
      csv={years.length ? () => ({ filename: `stack_${sel.location}_${sel.duration}h.csv`, ...stackCsv(years) }) : undefined}
    >
      {(expanded) => (
        <>
          <FixtureBanner files={files} />
          {loading ? <Text c="dimmed">Loading the revenue stack…</Text>
            : !years.length ? <Alert color="yellow" data-testid="stack-empty">No revenue stack for this location and battery size yet. Missing results are never shown as zero.</Alert>
            : (
              <>
                {range && range.low != null && (
                  <p className={classes.range} data-testid="stack-range">
                    <span className={classes.rangeNum}>{usd(range.low, 1)}{range.high != null && <> to {usd(range.high, 1)}</>}</span>
                    <span className={classes.rangeCap}>
                      {latest && yearTag(latest.meta)}: {range.high != null ? 'realistic to perfect-foresight upper bound' : 'realistic; no upper bound computed for this location'}
                    </span>
                  </p>
                )}
                <Chart height={expanded ? '65vh' : 360} label={`Revenue stack by year for ${where}: stacked bars by product with the perfect-foresight total marked`} build={(t) => buildStackOption(t, years, expanded)} />
                <Text size="xs" c="dimmed" mt="xs">
                  Backtest, not a forecast. Ancillary prices are thin and fall as more batteries offer them. The tint marks years that start after RTC+B went live on {fmtDate(RTCB_GO_LIVE)}; the year it went live spans both.
                  A year-to-date figure covers only the months shown.
                </Text>
                <StackNotes file={(set && (set.realistic.get(latest!.year) ?? set.foresight.get(latest!.year))) ?? null} />
              </>
            )}
        </>
      )}
    </Card>
  );
}
