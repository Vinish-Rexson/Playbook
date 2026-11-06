// Client for Playbook's own API routes (src/app/api). Relative URLs resolve to the dev server
// in development; set the expo-router `origin` plugin option when the server is deployed.
import type { Chain, PlaybookNetwork } from './constants';
import type {
  Application,
  ApplyPlan,
  Earnings,
  OrderOptions,
  TemplateWithMeta,
  Trader,
  TraderSummary,
} from './types';

async function req<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

export type TxAction = { to: string; data: string } | null;

type QuoteCommon = {
  quoteId: string;
  plan: ApplyPlan;
  estimatedFeeUsd: number;
  /** Amount of the bought asset (ETH or SOL) Flash expects to deliver. */
  receiveEth: number;
  priceImpact: number | null;
};

export type BaseQuote = QuoteCommon & {
  chain: 'base';
  actions: {
    approveTx: TxAction;
    permitTypedData: string | null;
    orderTypedData: string;
    bracket: { approveTx: TxAction; permitTypedData: string | null; orderTypedData: string };
  };
};

export type SolanaQuote = QuoteCommon & {
  chain: 'solana';
  solana: {
    /** A one-time setup transaction (token accounts + Flash delegations) is needed first. */
    setupNeeded: boolean;
    newTokenAccounts: number;
    orderMessage: string;
    bracketOrderMessage: string;
  };
};

export type QuoteResult = BaseQuote | SolanaQuote;

/** Market sell quote for closing a position: `qty` of the bought asset for about `receiveUsd` USDC. */
export type CloseQuote = { quoteId: string; chain: Chain; qty: number; receiveUsd: number } & (
  | { actions: { approveTx: TxAction; permitTypedData: string | null; orderTypedData: string } }
  | { solana: { setupNeeded: boolean; orderMessage: string } }
);

/** Wallet signature proving the caller owns the address (see lib/ownership). */
export type OwnerProof = { time: string; signature: string };

export type Candle = { t: number; o: number; h: number; l: number; c: number };
export type Timeframe = '15m' | '1h' | '6h' | '1d';

/** Uniswap swap on Base (server proxies the Uniswap API so its key stays off the phone). */
export type SwapSymbol = 'ETH' | 'USDC' | 'WETH';
export type UniswapPermit = { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; values: Record<string, unknown> };
export type UniswapQuote = {
  quote: unknown;
  routing: string;
  approval: { to: string; data: string; value: string } | null;
  permitData: UniswapPermit | null;
  summary: {
    tokenIn: SwapSymbol;
    tokenOut: SwapSymbol;
    /** Base units, as strings. */
    amountIn: string;
    amountOut: string;
    minOut: string;
    priceImpact: number | null;
    gasFeeUsd: number | null;
    route: string | null;
  };
};

export const api = {
  candles: (chain: Chain, tf: Timeframe) => req<{ candles: Candle[] }>(`/api/candles?chain=${chain}&tf=${tf}`),
  price: (chain: Chain = 'base') =>
    req<{ price: number; change24h: number; at: number; devKey: boolean }>(`/api/price?chain=${chain}`),
  templates: () => req<{ templates: TemplateWithMeta[] }>('/api/templates'),
  template: (id: string) =>
    req<{ template: TemplateWithMeta; recent: Application[] }>(`/api/templates/${id}`),
  createTemplate: (body: {
    creator: string;
    name: string;
    description: string;
    entryOffsetPct: number;
    takeProfitPct: number;
    stopLossPct: number;
    cutPct: number;
    chain: PlaybookNetwork;
    proof: OwnerProof;
  } & Partial<OrderOptions>) => req<{ template: TemplateWithMeta }>('/api/templates', { body }),
  /** Creators by name or handle (empty query: most applied first). */
  traders: (q = '') => req<{ traders: TraderSummary[] }>(`/api/traders?q=${encodeURIComponent(q)}`),
  trader: (address: string) =>
    req<{ trader: Trader | null; templates: TemplateWithMeta[]; earnings: Earnings; recent: Application[] }>(
      `/api/traders/${address}`,
    ),
  saveTrader: (body: { address: string; name: string; handle?: string; bio: string; avatar: string; proof: OwnerProof }) =>
    req<{ trader: Trader }>('/api/traders', { body }),
  quote: (body: { templateId: string; amountUsd: number; funder: string; chain: Chain }) =>
    req<QuoteResult>('/api/apply/quote', { body }),
  /** Solana: unsigned one-time setup message (base64) for the wallet to sign. */
  solanaSetup: (quoteId: string) => req<{ message: string | null }>('/api/solana/setup', { body: { quoteId } }),
  /** Solana: broadcast the signed setup and wait for confirmation. */
  solanaSend: (body: { quoteId: string; message: string; signature: string }) =>
    req<{ txId: string }>('/api/solana/send', { body }),
  submit: (body: {
    quoteId: string;
    funder: string;
    userSignature?: string;
    permitSignature?: string;
    bracketSignature?: string;
    bracketPermitSignature?: string;
    approvalTxs?: string[];
  }) => req<{ position: Application }>('/api/apply/submit', { body }),
  /** Positions for all of the wallet's addresses (its Base and Solana accounts). */
  positions: (addresses: string[]) =>
    req<{ positions: Application[] }>(`/api/positions?${addresses.map((a) => `address=${encodeURIComponent(a)}`).join('&')}`),
  cancel: (id: string, userSignature: string) =>
    req<{ position: Application }>(`/api/positions/${id}/cancel`, { body: { userSignature } }),
  /** One position, refreshed from Flash (detail page). */
  position: (id: string) => req<{ position: Application }>(`/api/positions/${id}`),
  closePrepare: (id: string) =>
    req<{ alreadyClosed: boolean; position?: Application; cancel?: { orderIds: string[]; message: string } | null; nothingBought?: boolean }>(
      `/api/positions/${id}/close`,
      { body: { step: 'prepare' } },
    ),
  closeCancel: (id: string, orderIds: string[], userSignature: string) =>
    req<{ alreadyClosed: boolean; position: Application }>(`/api/positions/${id}/close`, { body: { step: 'cancel', orderIds, userSignature } }),
  closeQuote: (id: string) => req<CloseQuote>(`/api/positions/${id}/close`, { body: { step: 'quote' } }),
  closeSubmit: (id: string, body: { quoteId: string; userSignature: string; permitSignature?: string; approvalTxs?: string[] }) =>
    req<{ position: Application }>(`/api/positions/${id}/close`, { body: { step: 'submit', ...body } }),
  uniswapQuote: (body: { swapper: string; tokenIn: SwapSymbol; tokenOut: SwapSymbol; type: 'EXACT_INPUT' | 'EXACT_OUTPUT'; amount: string }) =>
    req<UniswapQuote>('/api/uniswap/quote', { body }),
  uniswapSwap: (body: { quote: unknown; signature?: string; permitData?: UniswapPermit }) =>
    req<{ to: string; data: string; value: string; gasLimit: string | null }>('/api/uniswap/swap', { body }),
};
