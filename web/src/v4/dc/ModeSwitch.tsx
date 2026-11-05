// Studio's mode switch (v4 Step 7): the battery form or Data Center mode. Its own file, so Studio can show it without loading
// Data Center mode itself.
import studio from '../../pages/Studio.module.css';
import classes from './DataCenter.module.css';

const hashQuery = () => window.location.hash.split('?')[1] ?? '';

/** Studio's mode switch: the battery form or Data Center mode. Shown only when V4 is on. */
export function ModeSwitch({ mode }: { mode: 'battery' | 'dc' }) {
  const go = (to: 'battery' | 'dc') => {
    if (to === mode) return;
    const loc = new URLSearchParams(hashQuery()).get('loc');
    const q = new URLSearchParams(to === 'dc' ? { mode: 'dc' } : {});
    if (loc) q.set('loc', loc);
    window.location.hash = `#/studio?${q}`;
  };
  return (
    <div className={`${studio.choices} ${classes.modes}`} role="group" aria-label="Studio mode">
      <button type="button" className={studio.choice} aria-pressed={mode === 'battery'} onClick={() => go('battery')} data-testid="mode-battery">Battery</button>
      <button type="button" className={studio.choice} aria-pressed={mode === 'dc'} onClick={() => go('dc')} data-testid="mode-dc">Data Center</button>
    </div>
  );
}
