// Server-only client for Definitive's Flash API (https://flash.definitive.fi/docs).
// The API key lives here, inside the API routes, and is never bundled into the mobile app.

const BASE_URL = 'https://flash.definitive.fi/v1';
// Public integrator key published in the Flash docs as "safe for development".
// Fees collected with it do NOT reach you: set FLASH_API_KEY to your own key.
const PUBLIC_DEV_KEY = 'dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b';

export const flashKey = () => process.env.FLASH_API_KEY?.trim() || PUBLIC_DEV_KEY;
export const usingPublicDevKey = () => !process.env.FLASH_API_KEY?.trim();

export class FlashError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type FlashInit = { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> };

// ---- Rate limiting (Flash docs, Rate Limits: 5 requests/second per endpoint per API key) ----
// Every call waits for a slot in its endpoint's 1-second window (4 per second, leaving headroom for other
// processes sharing the key). A 429 is retried after RateLimit-Reset with exponential backoff and jitter:
// Flash rejects a rate-limited request before processing it, so a retry cannot double-submit.
const PER_SECOND = 4;
const MAX_RETRIES = 4;
const windows = new Map<string, number[]>();

/** Endpoint bucket: /quote, /order, /search, /setup-transaction, get order, cancel. */
const bucketOf = (method: string, path: string) =>
  /^\/orders\/[^/]+\/cancel/.test(path) ? 'cancel' : /^\/orders\/[^/]+$/.test(path) ? `${method} order` : path;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function takeSlot(bucket: string) {
  for (;;) {
    const now = Date.now();
    const recent = (windows.get(bucket) ?? []).filter((t) => now - t < 1000);
    if (recent.length < PER_SECOND) {
      recent.push(now);
      windows.set(bucket, recent);
      return;
    }
    windows.set(bucket, recent);
    await sleep(1000 - (now - recent[0]) + 5);
  }
}

// Identical GETs in flight at the same moment share one request (several screens polling one order).
const inflight = new Map<string, Promise<unknown>>();

export async function flash<T = any>(path: string, init: FlashInit = {}): Promise<T> {
  const method = init.method ?? (init.body ? 'POST' : 'GET');
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  if (method === 'GET') {
    const key = url.toString();
    const shared = inflight.get(key);
    if (shared) return shared as Promise<T>;
    const p = send<T>(method, path, url, init).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  return send<T>(method, path, url, init);
}

async function send<T>(method: string, path: string, url: URL, init: FlashInit): Promise<T> {
  const bucket = bucketOf(method, path);
  for (let attempt = 0; ; attempt++) {
    await takeSlot(bucket);
    const res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-definitive-api-key': flashKey(),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON error body
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const reset = Number(res.headers.get('ratelimit-reset')) || 1;
      await sleep(reset * 1000 * 2 ** attempt + Math.random() * 250);
      continue;
    }
    if (!res.ok) {
      const err = json?.error;
      throw new FlashError(
        res.status,
        err?.code ?? `HTTP_${res.status}`,
        res.status === 429
          ? 'Definitive Flash is busy right now (rate limited). Try again in a few seconds.'
          : err?.message ?? (text.slice(0, 200) || res.statusText),
        err?.details,
      );
    }
    return json as T;
  }
}

// ---- Typed shapes we rely on (subset of the OpenAPI schema) ----

export type FlashQuote = {
  quoteId: string;
  orderType: string;
  from: { asset: string; amount: string; notional: string };
  to: { asset: string; amount: string; notional: string };
  fees: { estimatedFeeNotional: string };
  estimatedPriceImpact: string | null;
  evm: {
    approveTx: { to: string; data: string } | null;
    permitTypedData: string | null;
    orderTypedData: string;
  } | null;
  svm: FlashSvm | null;
  setupTxs?: string[] | null;
  attachedBracket?: {
    svm?: { orderMessage: string; nonce: string; delegateIx: FlashSvmIx | null } | null;
    evm: {
      approveTx: { to: string; data: string } | null;
      permitTypedData: string | null;
      orderTypedData: string;
    } | null;
    salt: string | null;
    deadline: string;
    signedMaxFromAmount: string;
  } | null;
};

export type FlashSvmIx = {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
};

/** Solana signing and funding material on a quote (Flash docs: Solana Overview). */
export type FlashSvm = {
  orderMessage: string;
  nonce: string;
  deadline: string;
  ataSetupIxs: FlashSvmIx[] | null;
  delegateIx: FlashSvmIx | null;
  sponsoredDelegateTx: string | null;
};

export type FlashOrderStatus =
  | 'ORDER_STATUS_UNSPECIFIED'
  | 'ORDER_STATUS_PENDING'
  | 'ORDER_STATUS_ACCEPTED'
  | 'ORDER_STATUS_PARTIALLY_FILLED'
  | 'ORDER_STATUS_FILLED'
  | 'ORDER_STATUS_CANCELLED'
  | 'ORDER_STATUS_REJECTED'
  | 'ORDER_STATUS_TERMINATED';

export type FlashFill = {
  transactionId: string;
  fillPrice: string;
  contraAmount: string;
  targetAmount: string;
  integratorFeeNotional: string;
  filledAt: string;
  venues: string[];
};

export type FlashOrderDetail = {
  order: {
    orderId: string;
    status: FlashOrderStatus;
    closeReason: string | null;
    filled: {
      targetAmount: string | null;
      contraAmount: string | null;
      averagePrice: string | null;
      averageNotionalPrice: string | null;
    } | null;
    attachedBracket?: {
      status: 'pending_activation' | 'never_activated' | 'active';
      bracketOrderId: string | null;
    } | null;
  };
  fills: FlashFill[];
};

export const getOrder = (orderId: string, funderAddress: string) =>
  flash<FlashOrderDetail>(`/orders/${orderId}`, { query: { funderAddress } });

const PRICE_ASSET = {
  base: { query: 'weth', address: '0x4200000000000000000000000000000000000006', label: 'WETH' },
  solana: { query: 'sol', address: 'So11111111111111111111111111111111111111112', label: 'SOL' },
} as const;

/** Current price of the asset playbooks buy on a chain (WETH on Base, SOL on Solana) via GET /search. */
export async function searchPrice(chain: 'base' | 'solana'): Promise<{ price: number; change24h: number }> {
  const a = PRICE_ASSET[chain];
  const res = await flash<{ assets: { address: string; chain: string; price: string; priceChange24h?: string }[] }>(
    '/search',
    { query: { query: a.query, chain } },
  );
  const hit = res.assets.find((x) => x.address.toLowerCase() === a.address.toLowerCase());
  const price = Number(hit?.price ?? 0);
  if (!price) throw new FlashError(502, 'NO_PRICE', `Flash returned no ${a.label} price`);
  return { price, change24h: Number(hit?.priceChange24h ?? 0) };
}
