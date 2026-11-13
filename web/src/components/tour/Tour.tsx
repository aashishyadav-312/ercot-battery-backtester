import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../../state';
import { PHONE_MAX, tourSteps, markTourSeen, onTourRequest, placePopover, shouldAutoStart, type Placement } from './steps';
import { V4, V5 } from '../../config/features';
import classes from './Tour.module.css';

const STEPS = tourSteps(V4, V5);

const anchorOf = (id: string) => document.querySelector<HTMLElement>(`[data-tour="${id}"]`);

/**
 * The five-step first-visit tour. A non-modal dialog: no scrim, no focus trap, a soft outline on the element it points at.
 * Own component rather than Mantine's Popover, which is built for one fixed target and not for one popover that moves.
 */
export function Tour() {
  const { page, go } = useApp();
  const [step, setStep] = useState<number | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const [phone, setPhone] = useState(false);
  const [animate, setAnimate] = useState(true);
  const dialog = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  // Decided once, from the page the visitor arrived on.
  const auto = useRef<boolean | null>(null);
  if (auto.current === null) auto.current = shouldAutoStart(page);
  const startPage = useRef(page);
  const [wanted, setWanted] = useState(false); // a start was requested; open as soon as Home and its hero exist

  const open = step !== null;
  const close = useCallback((completed = false) => {
    markTourSeen(completed);
    setStep(null);
    setWanted(false);
    // preventScroll: a replay from the footer must not drag the page back down to the footer link.
    returnTo.current?.focus?.({ preventScroll: true });
    returnTo.current = null;
  }, []);

  // Start: on the first visit, or when the footer / Learn ask for a replay (which first goes to Home).
  useEffect(() => { if (auto.current) setWanted(true); }, []);
  useEffect(() => onTourRequest(() => { setWanted(true); }), []);
  useEffect(() => {
    if (!wanted || open) return;
    if (page !== 'home') { go('home'); return; }
    let tries = 0;
    const t = window.setInterval(() => {
      if (anchorOf('hero') || ++tries > 50) {
        window.clearInterval(t);
        if (anchorOf('hero')) {
          returnTo.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
          startPage.current = page;
          window.scrollTo({ top: 0 });
          setAnimate(true);
          setStep(0);
        }
        auto.current = false;
        setWanted(false);
      }
    }, 200);
    return () => window.clearInterval(t);
  }, [wanted, open, page, go]);

  // Leaving Home while the tour is open (a tab click) ends it.
  useEffect(() => { if (open && page !== startPage.current) close(false); }, [page, open, close]);

  // Outline the anchor.
  useEffect(() => {
    if (step === null) return;
    const el = anchorOf(STEPS[step].anchor);
    el?.setAttribute('data-tour-active', '');
    return () => el?.removeAttribute('data-tour-active');
  }, [step]);

  // Keep the popover at its anchor through resize and scroll.
  const reposition = useCallback(() => {
    const d = dialog.current;
    if (!d || step === null) return;
    const vp = { width: window.innerWidth, height: window.innerHeight };
    const anchor = STEPS[step].anchor;
    const el = anchorOf(anchor);
    // On a phone only the first step docks to the bottom; the tab steps sit under their tab, which stays put in the sticky header.
    const docked = vp.width < PHONE_MAX && anchor === 'hero';
    setPhone(docked);
    if (docked || !el) { setPlace(null); return; }
    const r = el.getBoundingClientRect();
    setPlace(placePopover({ left: r.left, top: r.top, width: r.width, height: r.height }, { width: d.offsetWidth, height: d.offsetHeight }, vp, (document.querySelector('header')?.getBoundingClientRect().bottom ?? 0) + 8));
  }, [step]);
  useLayoutEffect(reposition, [reposition]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
  }, [open, reposition]);

  // Focus moves into the dialog on open and on any step that left it without a home (Back vanishing on step 1).
  useEffect(() => {
    const d = dialog.current;
    if (step !== null && d && !d.contains(document.activeElement)) d.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  // A click with detail 0 came from the keyboard: those steps change without the grow animation.
  const move = (to: number) => (e: React.MouseEvent) => { setAnimate(e.detail > 0); setStep(to); };
  const style = phone || !place
    ? undefined
    : { left: place.left, top: place.top, transformOrigin: `${place.originX}px ${place.originY}px` };

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      tabIndex={-1}
      className={classes.tour}
      data-phone={phone || undefined}
      data-animate={animate || undefined}
      style={style}
    >
      {place && place.side !== 'over' && !phone && <span className={`${classes.pointer} ${place.side === 'above' ? classes.pointerBottom : classes.pointerTop}`} style={{ left: place.originX }} aria-hidden="true" />}
      <div aria-live="polite" aria-atomic="true">
        <p className={classes.count}>{step + 1} of {STEPS.length}</p>
        <h2 id="tour-title" className={classes.title}>{s.title}</h2>
        <p id="tour-body" className={classes.body}>{s.body}</p>
      </div>
      <div className={classes.actions}>
        <button type="button" className={classes.skip} onClick={() => close(false)}>Skip tour</button>
        <span className={classes.spacer} />
        {step > 0 && <button type="button" className={classes.btn} onClick={move(step - 1)}>Back</button>}
        <button type="button" className={`${classes.btn} ${classes.primary}`} onClick={last ? () => close(true) : move(step + 1)}>{last ? 'Done' : 'Next'}</button>
      </div>
    </div>
  );
}
