import { Skeleton } from '@mantine/core';

const BARS = [0.42, 0.58, 0.5, 0.74, 0.9, 0.62, 0.55, 0.68, 0.48, 0.6, 0.52, 0.36];

/**
 * Chart-shaped placeholder: faint bars on a baseline, so the card keeps its final geometry
 * while data loads and the real chart grows into the same footprint.
 */
export function ChartSkeleton({ h = 280, variant = 'bars' }: { h?: number | string; variant?: 'bars' | 'grid' | 'block' }) {
  if (variant === 'block') return <Skeleton h={h} radius="md" />;
  if (variant === 'grid') {
    return (
      <div aria-hidden style={{ height: h, display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gridAutoRows: '1fr', gap: 3, padding: '4px 0 72px 36px' }}>
        {Array.from({ length: 24 * 12 }, (_, i) => <Skeleton key={i} radius={2} h="100%" animate={i % 7 === 0} />)}
      </div>
    );
  }
  return (
    <div aria-hidden style={{ height: h, display: 'flex', alignItems: 'flex-end', gap: '3%', padding: '12px 4px 28px 40px', boxSizing: 'border-box' }}>
      {BARS.map((v, i) => <Skeleton key={i} h={`${v * 100}%`} radius="4px 4px 0 0" style={{ flex: 1 }} />)}
    </div>
  );
}
