// Where support goes. Only Ko-fi payments reach the bar automatically (worker/src/support.ts);
// Venmo, Zelle and Buy Me a Coffee gifts are added by hand. The Zelle number is never here:
// it lives in the Worker secret ZELLE_NUMBER and is fetched only when someone asks for it.
export const SUPPORT = {
  /** Fallback only, for the copy while the total loads or if it fails. The Worker's GOAL_USD wins. */
  goalUsd: 210,
  kofi: 'https://ko-fi.com/x0aashish',
  venmo: 'https://venmo.com/u/x0aashish',
  venmoHandle: '@x0aashish',
  buyMeACoffee: 'https://buymeacoffee.com/x0aashish',
} as const;
