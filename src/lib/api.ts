// Client for Playbook's own API routes (src/app/api). Relative URLs resolve to the dev server
// in development; set the expo-router `origin` plugin option when the server is deployed.
import type { Chain, PlaybookNetwork } from './constants';
import type {
  Application,
  ApplyPlan,
  Earnings,
  TemplateWithMeta,
  Trader,
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

/** Wallet signature proving the caller owns the address (see lib/ownership). */
export type OwnerProof = { time: string; signature: string };

export type Candle = { t: number; o: number; h: number; l: number; c: number };
export type Timeframe = '15m' | '1h' | '6h' | '1d';

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
  }) => req<{ template: TemplateWithMeta }>('/api/templates', { body }),
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
};
