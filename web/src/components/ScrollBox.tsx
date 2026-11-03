import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text } from '@mantine/core';
import classes from './ScrollBox.module.css';

/**
 * Box for a wide table: it scrolls sideways when the table does not fit, and then says so under it and fades the
 * cut-off edge, so no column is clipped without a cue. Keyboard users can focus it and scroll with the arrow keys.
 */
export function ScrollBox({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [end, setEnd] = useState(false);
  const atEnd = (el: HTMLElement) => el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => { setOver(el.scrollWidth > el.clientWidth + 1); setEnd(atEnd(el)); };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div
        ref={ref} className={classes.box} tabIndex={0} role="region" aria-label={label}
        data-fade={(over && !end) || undefined}
        onScroll={(e) => setEnd(atEnd(e.currentTarget))}
      >
        {children}
      </div>
      {over && <Text size="xs" c="dimmed" mt={4} className={classes.hint}>Scroll sideways to see every column.</Text>}
    </>
  );
}
