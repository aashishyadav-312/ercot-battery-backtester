// ERCOT public API client: the B2C password (ROPC) token flow plus the
// subscription key, as in gridstatus' ErcotAPI, which data/fetch_prices.py uses.
// Credentials come from Worker secrets only.

const TOKEN_URL =
  'https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token';
const CLIENT_ID = 'fec253ea-0d06-4272-a5e6-b478baeecd70';
const BASE = 'https://api.ercot.com/api/public-reports';

export interface Credentials {
  ERCOT_API_USERNAME: string;
  ERCOT_API_PASSWORD: string;
  ERCOT_API_SUBSCRIPTION_KEY: string;
}

export type Row = Record<string, string | number | boolean | null>;

/** What the live refresh needs from ERCOT; tests pass a fake. */
export interface Api {
  rows(path: string, params: Record<string, string>): Promise<Row[]>;
}

// Tokens last an hour. A cron isolate is often reused, so keep one in memory
// rather than spending a KV write on it.
let cached: { token: string; expires: number } | null = null;

async function token(creds: Credentials): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.token;
  const body = new URLSearchParams({
    username: creds.ERCOT_API_USERNAME,
    password: creds.ERCOT_API_PASSWORD,
    grant_type: 'password',
    scope: `openid ${CLIENT_ID} offline_access`,
    client_id: CLIENT_ID,
    response_type: 'id_token',
  });
  const r = await fetch(TOKEN_URL, { method: 'POST', body });
  if (!r.ok) throw new Error(`ERCOT token: HTTP ${r.status}`);
  const j = (await r.json()) as { id_token?: string; expires_in?: string | number };
  if (!j.id_token) throw new Error('ERCOT token: no id_token in response');
  const ttl = Number(j.expires_in) || 3600;
  cached = { token: j.id_token, expires: Date.now() + (ttl - 300) * 1000 };
  return j.id_token;
}

interface Page {
  fields: { name: string }[];
  data: (string | number | boolean | null)[][];
  _meta: { totalPages: number; currentPage: number };
}

export function ercotApi(creds: Credentials): Api {
  async function get(path: string, params: Record<string, string>): Promise<Page> {
    const url = `${BASE}/${path}?${new URLSearchParams(params)}`;
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${await token(creds)}`, 'Ocp-Apim-Subscription-Key': creds.ERCOT_API_SUBSCRIPTION_KEY },
      });
      if (r.ok) return (await r.json()) as Page;
      if (r.status === 401) cached = null;
      if (attempt === 0 && (r.status === 401 || r.status === 429 || r.status >= 500)) {
        await new Promise((ok) => setTimeout(ok, 2000));
        continue;
      }
      throw new Error(`${path}: HTTP ${r.status}`);
    }
  }
  return {
    async rows(path, params) {
      const out: Row[] = [];
      for (let page = 1, pages = 1; page <= pages; page++) {
        const j = await get(path, { ...params, page: String(page) });
        const names = j.fields.map((f) => f.name);
        for (const d of j.data) out.push(Object.fromEntries(d.map((v, i) => [names[i], v])));
        pages = j._meta.totalPages;
      }
      return out;
    },
  };
}
