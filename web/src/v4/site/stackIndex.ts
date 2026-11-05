// Reads results/v4/stack/index.json. The card shows Full stack only for a combination this index lists.
import type { StackMode } from '../stack';

export interface StackKey { year: number; durationH: number; mode: StackMode }

const NAME = /(?:^|\/)(\d{4})_(\d+(?:\.\d+)?)h_(foresight|realistic)\.json$/;

/**
 * Accepts `{ files: [...] }` or a bare array. An entry is a file name or path ("2025_2h_realistic.json"), `{ file }`, or
 * `{ year, durationH, mode }`. Anything else is skipped, so a malformed or empty index simply lists nothing.
 */
export function parseStackIndex(raw: unknown): StackKey[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { files?: unknown }).files) ? (raw as { files: unknown[] }).files : [];
  const out: StackKey[] = [];
  for (const e of list) {
    let key: StackKey | null = null;
    const name = typeof e === 'string' ? e : e && typeof e === 'object' && typeof (e as { file?: unknown }).file === 'string' ? (e as { file: string }).file : null;
    if (name) {
      const m = NAME.exec(name);
      if (m) key = { year: Number(m[1]), durationH: Number(m[2]), mode: m[3] as StackMode };
    } else if (e && typeof e === 'object') {
      const o = e as { year?: unknown; durationH?: unknown; mode?: unknown };
      if (typeof o.year === 'number' && typeof o.durationH === 'number' && (o.mode === 'foresight' || o.mode === 'realistic')) key = { year: o.year, durationH: o.durationH, mode: o.mode };
    }
    if (key && !out.some((k) => k.year === key!.year && k.durationH === key!.durationH && k.mode === key!.mode)) out.push(key);
  }
  return out;
}

export const hasStack = (keys: StackKey[], year: number, durationH: number, mode: StackMode): boolean =>
  keys.some((k) => k.year === year && k.durationH === durationH && k.mode === mode);

/** The all-node file list from scripts/copy-data.mjs. */
export interface NodeFileKey { year: number; durationH: number; file: string }
export function parseNodesManifest(raw: unknown): NodeFileKey[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { files?: unknown }).files) ? (raw as { files: unknown[] }).files : [];
  return list.flatMap((e) => {
    const o = e as Partial<NodeFileKey> | null;
    return o && typeof o.year === 'number' && typeof o.durationH === 'number' && typeof o.file === 'string' ? [{ year: o.year, durationH: o.durationH, file: o.file }] : [];
  });
}
