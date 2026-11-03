// Support bar backend: Ko-fi's webhook records one-time USD donations, and the
// site reads the running total (plus gifts added by hand) and the Zelle number.
//
// Keys in SUPPORT_KV:
//   don:<kofi_transaction_id>  {"cents":300,"at":"…"}  counted, one key per payment
//   manual:<date>-<label>      "1500"                  counted, added with wrangler
//   review:<id>                {"cents":…,"currency":…} non-USD, kept for review, not counted
// One key per payment makes Ko-fi's retries idempotent without read-modify-write.
// No names, emails or messages are ever stored or returned.

export interface SupportEnv {
  SUPPORT_KV: KVNamespace;
  /** The only origin allowed to read from a browser (shared with /live.json). */
  ALLOWED_ORIGIN: string;
  /** Goal in whole dollars, a plain [vars] entry. */
  GOAL_USD: string;
  /** Secrets; unset until `wrangler secret put`. */
  KOFI_VERIFY_TOKEN?: string;
  ZELLE_NUMBER?: string;
}

/** The fields we read from Ko-fi's webhook (sent as form field `data`, a JSON string). */
interface KofiPayload {
  verification_token?: string;
  message_id?: string;
  kofi_transaction_id?: string;
  type?: string;
  is_subscription_payment?: boolean;
  amount?: string;
  currency?: string;
  timestamp?: string;
}

const enc = new TextEncoder();

/** Compares SHA-256 digests byte by byte without an early exit, so timing does not leak the token. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

const text = (body: string, status: number, headers: Record<string, string> = {}) => new Response(body, { status, headers });

export async function kofiWebhook(req: Request, env: SupportEnv): Promise<Response> {
  let p: KofiPayload;
  try {
    const form = await req.formData();
    p = JSON.parse(String(form.get('data') ?? ''));
  } catch {
    return text('Bad request', 400);
  }
  if (!env.KOFI_VERIFY_TOKEN || typeof p.verification_token !== 'string' || !(await safeEqual(p.verification_token, env.KOFI_VERIFY_TOKEN))) {
    return text('Unauthorized', 401);
  }
  // Only one-time tips count. Ko-fi expects 200 for everything else or it retries.
  if (p.type !== 'Donation' || p.is_subscription_payment) return text('ok', 200);
  const id = p.kofi_transaction_id || p.message_id;
  const cents = Math.round(Number(p.amount) * 100);
  if (!id || !Number.isFinite(cents) || cents <= 0) return text('ok', 200);
  const at = typeof p.timestamp === 'string' ? p.timestamp : new Date().toISOString();
  if (p.currency !== 'USD') {
    await env.SUPPORT_KV.put(`review:${id}`, JSON.stringify({ cents, currency: String(p.currency ?? ''), at }));
    return text('ok', 200);
  }
  await env.SUPPORT_KV.put(`don:${id}`, JSON.stringify({ cents, at }), { metadata: { cents } });
  return text('ok', 200);
}

/** Cents under one prefix, following list pagination. Donations carry cents in metadata; manual keys are read. */
async function sumPrefix(kv: KVNamespace, prefix: string): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await kv.list<{ cents?: number }>({ prefix, cursor });
    for (const k of page.keys) {
      let c = k.metadata?.cents;
      if (typeof c !== 'number') {
        const raw = await kv.get(k.name);
        c = prefix === 'don:' ? Number(raw ? (JSON.parse(raw) as { cents?: number }).cents : 0) : Number(raw);
      }
      if (Number.isFinite(c) && c > 0) total += Math.round(c);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return total;
}

export async function supportTotal(env: SupportEnv, cors: Record<string, string>): Promise<Response> {
  try {
    const cents = (await sumPrefix(env.SUPPORT_KV, 'don:')) + (await sumPrefix(env.SUPPORT_KV, 'manual:'));
    const body = { raised: cents / 100, goal: Number(env.GOAL_USD) || 0, updated: new Date().toISOString() };
    return Response.json(body, { headers: { ...cors, 'Cache-Control': 'public, max-age=60' } });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { ...cors, 'Cache-Control': 'no-store' } });
  }
}

export function supportZelle(req: Request, env: SupportEnv, cors: Record<string, string>): Response {
  const headers = { ...cors, 'Cache-Control': 'no-store' };
  if (req.headers.get('Origin') !== env.ALLOWED_ORIGIN) return Response.json({ error: 'forbidden' }, { status: 403, headers });
  if (!env.ZELLE_NUMBER) return Response.json({ error: 'not found' }, { status: 404, headers });
  return Response.json({ zelle: env.ZELLE_NUMBER }, { headers });
}
