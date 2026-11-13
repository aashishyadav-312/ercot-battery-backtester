// The Atlas "Advanced" switch lives in the address as `adv=1`, so a shared link opens the same view.

const split = (hash: string): [string, URLSearchParams] => {
  const i = hash.indexOf('?');
  return i < 0 ? [hash, new URLSearchParams()] : [hash.slice(0, i), new URLSearchParams(hash.slice(i + 1))];
};

export function readAdvanced(hash: string): boolean {
  return split(hash)[1].get('adv') === '1';
}

/** The hash with `adv=1` set or removed. Every other parameter stays, in order. */
export function writeAdvanced(hash: string, on: boolean): string {
  const [path, q] = split(hash || '#/atlas');
  if (on) q.set('adv', '1'); else q.delete('adv');
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
