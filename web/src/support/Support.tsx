import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, Popover, type MantineTransition } from '@mantine/core';
import { useMediaQuery, useReducedMotion } from '@mantine/hooks';
import { SUPPORT } from './config';
import { barState, loadTotal, loadZelle, money, onSupportRequest, type Total } from './api';
import classes from './Support.module.css';

export const PHONE_QUERY = '(max-width: 640px)';
const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

function Heart() {
  return (
    <svg className={classes.heart} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.8 1.3-1.7 2.9-2.8 4.9-2.8 3.5 0 5.7 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
    </svg>
  );
}

function Bar({ total }: { total: Total }) {
  const { fraction, now, label } = barState(total.raised, total.goal);
  // Start empty, then grow, so the fill animates in on open.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setGrown(true), 30);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className={classes.barWrap}>
      <p className={classes.barLabel}>{label}</p>
      <div className={classes.track} role="progressbar" aria-valuemin={0} aria-valuemax={total.goal} aria-valuenow={now} aria-label={label}>
        <div className={classes.fill} style={{ transform: `scaleX(${grown ? fraction : 0})` }} />
      </div>
    </div>
  );
}

type TotalState = { s: 'loading' } | { s: 'ok'; total: Total } | { s: 'error' };
type ZelleState = { s: 'idle' | 'loading' | 'gone' } | { s: 'shown'; number: string };

/** What the popover holds. Loads the total on mount; every payment button works whatever the total does. */
export function SupportPanel({ titleId }: { titleId: string }) {
  const [total, setTotal] = useState<TotalState>({ s: 'loading' });
  const [zelle, setZelle] = useState<ZelleState>({ s: 'idle' });
  const [copied, setCopied] = useState(false);
  const copyBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    loadTotal().then((t) => alive && setTotal({ s: 'ok', total: t }), () => alive && setTotal({ s: 'error' }));
    return () => { alive = false; };
  }, []);

  const reveal = async () => {
    setZelle({ s: 'loading' });
    const n = await loadZelle();
    setZelle(n ? { s: 'shown', number: n } : { s: 'gone' });
  };
  // The Show number button is gone once the number shows; keep focus in the popover.
  useEffect(() => { if (zelle.s === 'shown') copyBtn.current?.focus(); }, [zelle.s]);
  const copy = async (n: string) => {
    try {
      await navigator.clipboard.writeText(n);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* the number stays visible to copy by hand */ }
  };

  const goal = total.s === 'ok' ? total.total.goal : SUPPORT.goalUsd;
  const reached = total.s === 'ok' && barState(total.total.raised, total.total.goal).reached;

  return (
    <div className={classes.panel}>
      <h2 id={titleId} className={classes.title}>Support Chargeline</h2>
      <p className={classes.lead}>Chargeline cost {money(goal)} in AI credits to build. Any amount helps cover it. Nothing is promised in return.</p>

      {total.s === 'loading' && (
        <div className={classes.barWrap}>
          <p className={classes.barLabel}>Checking the total…</p>
          <div className={classes.track} aria-hidden="true" />
        </div>
      )}
      {total.s === 'ok' && (reached ? <p className={classes.reached}>Goal reached. Thank you.</p> : <Bar total={total.total} />)}

      <Button component="a" href={SUPPORT.kofi} {...ext} fullWidth h="auto" py={10} radius="xl" className={classes.primary}>
        <span className={classes.primaryInner}>
          <span>Card or Apple Pay</span>
          <span className={classes.via}>via Ko-fi</span>
        </span>
      </Button>
      <p className={classes.small}>Apple Pay shows at checkout on Apple devices in Safari. On Ko-fi you can leave a message or stay anonymous.</p>

      <h3 className={classes.sub}>Other ways</h3>
      <ul className={classes.rows}>
        <li className={classes.row}>
          <span className={classes.rowName}>Venmo</span>
          <a className={classes.rowLink} href={SUPPORT.venmo} {...ext}>{SUPPORT.venmoHandle}</a>
        </li>
        {zelle.s !== 'gone' && (
          <li className={classes.row}>
            <span className={classes.rowName}>Zelle</span>
            {zelle.s === 'shown' ? (
              <span className={classes.rowEnd}>
                <span className={classes.number}>{zelle.number}</span>
                <button ref={copyBtn} type="button" className={classes.rowBtn} onClick={() => copy(zelle.number)}>Copy</button>
              </span>
            ) : (
              <button type="button" className={classes.rowBtn} onClick={reveal} disabled={zelle.s === 'loading'}>Show number</button>
            )}
          </li>
        )}
        <li className={classes.row}>
          <span className={classes.rowName}>Buy Me a Coffee</span>
          <a className={classes.rowLink} href={SUPPORT.buyMeACoffee} {...ext}>buymeacoffee.com</a>
        </li>
      </ul>
      <p className={classes.copied} aria-live="polite">{copied ? 'Copied' : ''}</p>
      <p className={classes.small}>Venmo, Zelle and Buy Me a Coffee gifts are added to the bar by hand.</p>
      <p className={classes.fine}>This is a personal gift to the author, not a charity donation, and is not tax-deductible.</p>
    </div>
  );
}

/**
 * The header's Support button and its popover (a non-modal dialog). Esc or a click outside closes it;
 * focus moves in on open and back to whatever opened it (this button, or About's and the footer's links).
 */
export function SupportButton() {
  const [opened, setOpened] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const drop = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reduce = useReducedMotion();
  const phone = useMediaQuery(PHONE_QUERY);

  const open = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpened(true);
  }, []);
  const close = useCallback(() => {
    const el = document.activeElement;
    setOpened(false);
    // Hand focus back only if it was in the popover; a click elsewhere keeps its own focus.
    if (!el || el === document.body || drop.current?.contains(el)) opener.current?.focus();
  }, []);

  useEffect(() => onSupportRequest(open), [open]);
  useEffect(() => {
    if (!opened) return;
    const id = window.setTimeout(() => drop.current?.focus(), 0);
    // Esc closes wherever focus is, not only inside the dropdown (Mantine's own handler).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(id); window.removeEventListener('keydown', onKey); };
  }, [opened, close]);

  const scaleIn: MantineTransition = {
    in: { opacity: 1, transform: 'scale(1)' },
    out: { opacity: 0, transform: 'scale(0.96)' },
    common: { transformOrigin: phone ? 'bottom center' : 'top right' },
    transitionProperty: 'opacity, transform',
  };

  return (
    <Popover
      opened={opened}
      onChange={(o) => (o ? open() : close())}
      position="bottom-end"
      offset={8}
      width={360}
      shadow="md"
      radius="lg"
      zIndex={300}
      closeOnEscape={false}
      trapFocus={false}
      returnFocus={false}
      transitionProps={{ transition: reduce ? 'fade' : scaleIn, duration: 200, timingFunction: 'cubic-bezier(.23,1,.32,1)' }}
    >
      <Popover.Target>
        <button type="button" className={classes.trigger} onClick={() => (opened ? close() : open())} aria-label="Support Chargeline">
          <Heart />
          <span className={classes.triggerText}>Support</span>
        </button>
      </Popover.Target>
      <Popover.Dropdown ref={drop} tabIndex={-1} aria-labelledby={titleId} className={classes.drop}>
        <SupportPanel titleId={titleId} />
      </Popover.Dropdown>
    </Popover>
  );
}
