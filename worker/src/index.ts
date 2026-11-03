// "Today in ERCOT" backend: a Cron Trigger refreshes one KV key with live
// prices, and GET /live.json serves it to the GitHub Pages site.
//
// Free-tier budget: one KV write per cron run (every 5 minutes = 288/day of
// the 1,000/day limit); reads are cached at the edge for 60 s.
import { ercotApi, type Credentials } from './ercot';
import { refresh, type LiveState } from './live';
import { kofiWebhook, supportTotal, supportZelle, type SupportEnv } from './support';

export interface Env extends Credentials, SupportEnv {
  LIVE: KVNamespace;
  /** The only origin allowed to read the JSON from a browser. */
  ALLOWED_ORIGIN: string;
}

const KEY = 'live';

function cors(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
}

/** Support routes (src/support.ts); null when the path is not one of them. */
async function support(req: Request, env: Env, path: string): Promise<Response | null> {
  if (path === '/support/kofi') return req.method === 'POST' ? kofiWebhook(req, env) : new Response('Method not allowed', { status: 405 });
  if (req.method !== 'GET') return null;
  if (path === '/support/total') return supportTotal(env, cors(env));
  if (path === '/support/zelle') return supportZelle(req, env, cors(env));
  return null;
}

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const prev = await env.LIVE.get<LiveState>(KEY, 'json');
    const next = await refresh(prev, Date.now(), ercotApi(env));
    await env.LIVE.put(KEY, JSON.stringify(next));
    if (next.errors.length) console.warn('refresh errors', next.errors);
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (url.pathname.startsWith('/support/')) {
      const res = await support(req, env, url.pathname);
      if (res) return res;
    }
    if (req.method !== 'GET' || url.pathname !== '/live.json') return new Response('Not found', { status: 404 });
    const body = await env.LIVE.get(KEY, { cacheTtl: 60 });
    if (!body) {
      return Response.json({ error: 'No snapshot yet; the first cron run has not finished.' }, { status: 503, headers: cors(env) });
    }
    return new Response(body, {
      headers: { ...cors(env), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    });
  },
} satisfies ExportedHandler<Env>;
