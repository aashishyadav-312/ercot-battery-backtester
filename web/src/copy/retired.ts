// Labels the shared vocabulary retired (docs/PLAN_V3_POLISH.md, Step 1). Only tests import this file, so it never ships.
// copy/terms.test.ts scans the UI source for them; the page tests check the text they render.

export const RETIRED: [string, RegExp][] = [
  ['Perfect hindsight', /perfect hindsight/i],
  ['DA-scheduled', /DA-scheduled/],
  ['DA-sched.', /DA-sched\./],
  ['Day-ahead schedule', /day-ahead schedule/i],
  ['Spike share', /\bSpike share\b/],
  ['Top 10 / Top 10 days / Top-10 days', /\bTop[ -]10\b(?!-day share)/],
  ['Kept', /\bKept\b/],
  ['Share kept', /Share kept/i],
  ['Capture (alone)', /(['"`>])Capture(['"`<])/],
  ['/kW-year', /kW-year/],
  ['Degr.', /Degr\./],
];

/** The retired labels that appear in rendered text. Plain text has no quotes around a label, so "Capture" alone is matched as a whole word. */
export function retiredIn(text: string): string[] {
  const plain: [string, RegExp][] = [...RETIRED.filter(([n]) => n !== 'Capture (alone)'), ['Capture (alone)', /\bCapture\b(?! rate)/]];
  return plain.filter(([, re]) => re.test(text)).map(([name]) => name);
}
