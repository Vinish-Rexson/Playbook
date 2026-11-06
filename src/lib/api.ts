// Client for Playbook's own API routes (src/app/api). Relative URLs resolve to the dev server
// in development; set the expo-router `origin` plugin option when the server is deployed.
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
export type QuoteResult = {
  quoteId: string;
  mode: 'live' | 'paper';
  plan: ApplyPlan;
  estimatedFeeUsd: number;
  receiveEth: number;
  actions: {
    approveTx: TxAction;
    permitTypedData: string | null;
    orderTypedData: string;
    bracket: { approveTx: TxAction; permitTypedData: string | null; orderTypedData: string } | null;
  } | null;
};

export const api = {
  price: () => req<{ price: number; change24h: number; at: number; devKey: boolean }>('/api/price'),
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
  }) => req<{ template: TemplateWithMeta }>('/api/templates', { body }),
  trader: (address: string) =>
    req<{ trader: Trader | null; templates: TemplateWithMeta[]; earnings: Earnings; recent: Application[] }>(
      `/api/traders/${address}`,
    ),
  saveTrader: (body: { address: string; name: string; handle?: string; bio: string; avatar: string }) =>
    req<{ trader: Trader }>('/api/traders', { body }),
  quote: (body: { templateId: string; amountUsd: number; funder: string; mode: 'live' | 'paper' }) =>
    req<QuoteResult>('/api/apply/quote', { body }),
  submit: (body: {
    quoteId: string;
    funder: string;
    userSignature?: string;
    permitSignature?: string;
    bracketSignature?: string;
    bracketPermitSignature?: string;
    approvalTxs?: string[];
  }) => req<{ position: Application }>('/api/apply/submit', { body }),
  positions: (address: string) =>
    req<{ positions: Application[] }>(`/api/positions?address=${address}`),
  cancel: (id: string, userSignature?: string) =>
    req<{ position: Application }>(`/api/positions/${id}/cancel`, { body: { userSignature: userSignature ?? '' } }),
};
