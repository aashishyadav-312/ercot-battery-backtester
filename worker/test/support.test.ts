import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';

const ORIGIN = 'https://site.example';
const TOKEN = 'test-token-0000';

/** In-memory KV with small list pages, so pagination is exercised. */
class FakeKV {
  map = new Map<string, { value: string; metadata?: unknown }>();
  fail = false;
  async get(k: string) { if (this.fail) throw new Error('kv down'); return this.map.get(k)?.value ?? null; }
  async put(k: string, value: string, opts?: { metadata?: unknown }) { this.map.set(k, { value, metadata: opts?.metadata }); }
  async list({ prefix = '', cursor }: { prefix?: string; cursor?: string }) {
    if (this.fail) throw new Error('kv down');
    const names = [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const keys = names.slice(start, start + 2).map((name) => ({ name, metadata: this.map.get(name)!.metadata }));
    const done = start + 2 >= names.length;
    return { keys, list_complete: done, cursor: done ? undefined : String(start + 2) };
  }
}

function setup(extra: Partial<Env> = {}) {
  const kv = new FakeKV();
  const env = { SUPPORT_KV: kv, ALLOWED_ORIGIN: ORIGIN, GOAL_USD: '210', KOFI_VERIFY_TOKEN: TOKEN, ZELLE_NUMBER: '000-000-0000', ...extra } as unknown as Env;
  const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://w.example${path}`, init), env);
  return { kv, env, call };
}

const tip = (over: Record<string, unknown> = {}) => ({
  verification_token: TOKEN, message_id: 'msg-1', timestamp: '2026-11-02T15:00:00Z', type: 'Donation', is_public: true,
  from_name: 'Jo Example', message: 'Secret hello', amount: '3.00', email: 'jo@example.com', currency: 'USD',
  is_subscription_payment: false, is_first_subscription_payment: false, kofi_transaction_id: 'tx-1', shop_items: null, tier_name: null, shipping: null,
  ...over,
});
const post = (data: unknown) => ({ method: 'POST', body: new URLSearchParams({ data: JSON.stringify(data) }) });
const total = async (call: ReturnType<typeof setup>['call']) => (await call('/support/total')).json() as Promise<{ raised: number; goal: number }>;

describe('POST /support/kofi', () => {
  it('records a valid donation as cents with no personal fields', async () => {
    const { kv, call } = setup();
    const res = await call('/support/kofi', post(tip()));
    expect(res.status).toBe(200);
    expect(JSON.parse(kv.map.get('don:tx-1')!.value)).toEqual({ cents: 300, at: '2026-11-02T15:00:00Z' });
    expect(await total(call)).toMatchObject({ raised: 3, goal: 210 });
  });

  it('rejects a bad token with 401 and stores nothing', async () => {
    const { kv, call } = setup();
    expect((await call('/support/kofi', post(tip({ verification_token: 'wrong' })))).status).toBe(401);
    expect((await call('/support/kofi', post(tip({ verification_token: undefined })))).status).toBe(401);
    expect(kv.map.size).toBe(0);
  });

  it('counts a retried payment once', async () => {
    const { kv, call } = setup();
    await call('/support/kofi', post(tip()));
    await call('/support/kofi', post(tip()));
    expect(kv.map.size).toBe(1);
    expect((await total(call)).raised).toBe(3);
  });

  it('does not count non-USD or non-donation payments', async () => {
    const { kv, call } = setup();
    for (const p of [tip({ currency: 'EUR', kofi_transaction_id: 'tx-eur' }), tip({ type: 'Subscription', kofi_transaction_id: 'tx-s' }),
      tip({ is_subscription_payment: true, kofi_transaction_id: 'tx-m' }), tip({ type: 'Shop Order', kofi_transaction_id: 'tx-shop' })]) {
      expect((await call('/support/kofi', post(p))).status).toBe(200);
    }
    expect([...kv.map.keys()]).toEqual(['review:tx-eur']);
    expect((await total(call)).raised).toBe(0);
  });
});

describe('GET /support/total', () => {
  it('sums don: and manual: keys across pages', async () => {
    const { kv, call } = setup();
    for (const id of ['a', 'b', 'c']) await call('/support/kofi', post(tip({ kofi_transaction_id: id, amount: '5.50' })));
    await kv.put('manual:2026-11-01-venmo', '2000');
    await kv.put('manual:2026-11-02-zelle', '1000');
    await kv.put('manual:2026-11-02-bmc', '500');
    await kv.put('review:x', JSON.stringify({ cents: 9999 }));
    const res = await call('/support/total');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await res.json()).toMatchObject({ raised: 51.5, goal: 210 });
  });

  it('returns 503 with no details when KV fails', async () => {
    const { kv, call } = setup();
    kv.fail = true;
    const res = await call('/support/total');
    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(/kv down/);
  });
});

describe('GET /support/zelle', () => {
  it('answers only the site origin, never cached', async () => {
    const { call } = setup();
    const bad = await call('/support/zelle', { headers: { Origin: 'https://evil.example' } });
    expect(bad.status).toBe(403);
    expect(await bad.text()).not.toContain('000-000-0000');
    expect((await call('/support/zelle')).status).toBe(403);
    const ok = await call('/support/zelle', { headers: { Origin: ORIGIN } });
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(await ok.json()).toEqual({ zelle: '000-000-0000' });
  });

  it('is 404 when the secret is unset', async () => {
    const { call } = setup({ ZELLE_NUMBER: undefined });
    expect((await call('/support/zelle', { headers: { Origin: ORIGIN } })).status).toBe(404);
  });
});

it('never returns or stores a name, email or message', async () => {
  const { kv, call } = setup();
  const bodies = [
    await (await call('/support/kofi', post(tip()))).text(),
    await (await call('/support/kofi', post(tip({ currency: 'GBP', kofi_transaction_id: 'tx-gbp' })))).text(),
    await (await call('/support/total')).text(),
    ...[...kv.map.values()].map((v) => v.value + JSON.stringify(v.metadata ?? null)),
  ].join('\n');
  for (const s of ['Jo Example', 'jo@example.com', 'Secret hello', 'from_name', 'email', 'message']) expect(bodies).not.toContain(s);
});
