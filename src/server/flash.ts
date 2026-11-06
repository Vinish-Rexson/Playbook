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

export async function flash<T = any>(path: string, init: FlashInit = {}): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
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
  if (!res.ok) {
    const err = json?.error;
    throw new FlashError(
      res.status,
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? (text.slice(0, 200) || res.statusText),
      err?.details,
    );
  }
  return json as T;
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
