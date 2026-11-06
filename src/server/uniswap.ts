/// <reference types="node" />
// Uniswap API client (server only: the API key never ships in the app).
// Swaps on Base route through Uniswap's v2 / v3 / v4 pools: /check_approval → /quote → /swap.
// Docs: https://developers.uniswap.org/docs/trading/swapping-api/start-building/integration-guide
import { USDC, WETH } from '@/lib/constants';

const API = 'https://trade-api.gateway.uniswap.org/v1';
const BASE_CHAIN_ID = 8453;
const NATIVE = '0x0000000000000000000000000000000000000000';

/** Tokens the in-app swap offers on Base. */
export const SWAP_TOKENS = {
  ETH: { address: NATIVE, decimals: 18 },
  USDC: { address: USDC, decimals: 6 },
  WETH: { address: WETH, decimals: 18 },
} as const;
export type SwapSymbol = keyof typeof SWAP_TOKENS;
export const isSwapSymbol = (s: unknown): s is SwapSymbol => typeof s === 'string' && s in SWAP_TOKENS;

export class UniswapError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// The API allows 6 requests / second per key: keep a small gap between calls and retry a 429 once.
let last = 0;
async function call<T>(path: string, body: unknown, retried = false): Promise<T> {
  const key = process.env.UNISWAP_API_KEY?.trim();
  if (!key) throw new UniswapError('Server is missing UNISWAP_API_KEY (see .env.example)', 500);
  const wait = last + 200 - Date.now();
  last = Math.max(Date.now(), last + 200);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 429 && !retried) {
    await new Promise((r) => setTimeout(r, 1000));
    return call(path, body, true);
  }
  if (!res.ok) {
    const code = json?.errorCode ?? '';
    const friendly =
      code === 'QUOTE_ERROR' || code === 'ResourceNotFound' || res.status === 404
        ? 'Uniswap found no route for this amount. Try a different amount.'
        : json?.detail || code || `Uniswap API error (${res.status})`;
    throw new UniswapError(String(friendly), res.status === 404 ? 400 : res.status);
  }
  return json as T;
}

type Tx = { to: string; from?: string; data: string; value?: string; chainId?: number; gasLimit?: string };
export type PermitData = { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; values: Record<string, unknown> };
type QuoteResponse = {
  requestId?: string;
  routing: string;
  permitData: PermitData | null;
  quote: {
    input?: { amount: string; token: string };
    output?: { amount: string; token: string; recipient?: string };
    priceImpact?: number;
    gasFeeUSD?: string;
    routeString?: string;
    slippage?: number;
    aggregatedOutputs?: { amount: string; minAmount?: string; token: string }[];
    [k: string]: unknown;
  };
};

/**
 * Everything the app needs to show and run one swap: the approval Permit2 needs (if any), the quote to pass
 * back to /swap, the Permit2 message to sign (if any), and a summary for the screen.
 */
export async function quoteSwap(p: { swapper: string; tokenIn: SwapSymbol; tokenOut: SwapSymbol; type: 'EXACT_INPUT' | 'EXACT_OUTPUT'; amount: string }) {
  const tin = SWAP_TOKENS[p.tokenIn];
  const tout = SWAP_TOKENS[p.tokenOut];
  const q = await call<QuoteResponse>('/quote', {
    type: p.type,
    amount: p.amount,
    tokenInChainId: BASE_CHAIN_ID,
    tokenOutChainId: BASE_CHAIN_ID,
    tokenIn: tin.address,
    tokenOut: tout.address,
    swapper: p.swapper,
    slippageTolerance: 0.5,
    routingPreference: 'BEST_PRICE',
    // Classic AMM routing only (v2 / v3 / v4 pools): the result is one transaction the wallet sends.
    protocols: ['V2', 'V3', 'V4'],
  });
  if (!['CLASSIC', 'WRAP', 'UNWRAP'].includes(q.routing)) {
    throw new UniswapError(`Uniswap returned an unsupported route (${q.routing})`, 502);
  }

  const out = q.quote.aggregatedOutputs?.[0];
  const amountIn = q.quote.input?.amount ?? p.amount;
  // Native ETH needs no approval; an ERC-20 is approved once to Permit2 (checked for the quoted input amount).
  const approval =
    tin.address === NATIVE
      ? null
      : (await call<{ approval: Tx | null }>('/check_approval', { walletAddress: p.swapper, token: tin.address, amount: amountIn, chainId: BASE_CHAIN_ID }))
          .approval;
  const amountOut = out?.amount ?? q.quote.output?.amount ?? '0';
  return {
    quote: q.quote,
    routing: q.routing,
    approval: approval ? { to: approval.to, data: approval.data, value: approval.value ?? '0' } : null,
    permitData: q.permitData ?? null,
    summary: {
      tokenIn: p.tokenIn,
      tokenOut: p.tokenOut,
      amountIn,
      amountOut,
      /** Least the swap can pay out after 0.5% slippage (same as amountOut for wrap / unwrap). */
      minOut: out?.minAmount ?? amountOut,
      priceImpact: typeof q.quote.priceImpact === 'number' ? q.quote.priceImpact : null,
      gasFeeUsd: q.quote.gasFeeUSD ? Number(q.quote.gasFeeUSD) : null,
      route: routeLabel(q.quote.routeString, q.routing),
    },
  };
}

/** "[v3] 100.00% = [0.01%] 0x…" → "Uniswap v3"; a split across versions → "Uniswap v3 + v4". */
function routeLabel(routeString: string | undefined, routing: string) {
  if (routing === 'WRAP' || routing === 'UNWRAP') return `${routing === 'WRAP' ? 'Wrap' : 'Unwrap'} (WETH contract)`;
  const versions = [...new Set([...(routeString ?? '').matchAll(/\[(v\d)\]/gi)].map((m) => m[1].toLowerCase()))].sort();
  return versions.length ? `Uniswap ${versions.join(' + ')}` : 'Uniswap';
}

/** Turns a quote (plus the Permit2 signature when one was needed) into the transaction the wallet sends. */
export async function buildSwap(p: { quote: unknown; signature?: string; permitData?: PermitData | null }) {
  const body: Record<string, unknown> = { quote: p.quote, refreshGasPrice: true };
  if (p.signature && p.permitData) {
    body.signature = p.signature;
    body.permitData = p.permitData;
  }
  const { swap } = await call<{ swap: Tx }>('/swap', body);
  if (!swap?.data || swap.data === '0x') throw new UniswapError('Uniswap returned an empty swap transaction', 502);
  return { to: swap.to, data: swap.data, value: swap.value ?? '0', gasLimit: swap.gasLimit ?? null };
}
