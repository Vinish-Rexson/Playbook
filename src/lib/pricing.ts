import { DEFINITIVE_ADVANCED_FEE_BPS } from './constants';
import type { ApplyPlan, Template } from './types';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Turn a template's percentages into real order prices at today's ETH price. */
export function buildPlan(
  t: Pick<Template, 'entryOffsetPct' | 'takeProfitPct' | 'stopLossPct' | 'cutPct'>,
  marketPrice: number,
  amountUsd: number,
): ApplyPlan {
  const orderType: ApplyPlan['orderType'] = t.entryOffsetPct < 0 ? 'limit' : 'market';
  const entryPrice = round2(marketPrice * (1 + t.entryOffsetPct / 100));
  const takeProfitPrice = round2(entryPrice * (1 + t.takeProfitPct / 100));
  const stopLossPrice = round2(entryPrice * (1 - t.stopLossPct / 100));
  const cutBps = Math.round(t.cutPct * 100);
  const creatorFeeUsd = (amountUsd * cutBps) / 10_000;
  // Definitive charges its fee on advanced orders; a market entry has no added fee (quote is all-in).
  const definitiveFeeUsd =
    orderType === 'limit' ? (amountUsd * DEFINITIVE_ADVANCED_FEE_BPS) / 10_000 : 0;
  const netUsd = amountUsd - creatorFeeUsd - definitiveFeeUsd;
  const estEth = netUsd / entryPrice;
  return {
    orderType,
    marketPrice,
    entryPrice,
    takeProfitPrice,
    stopLossPrice,
    amountUsd,
    cutBps,
    creatorFeeUsd,
    definitiveFeeUsd,
    estEth,
    profitAtTpUsd: estEth * takeProfitPrice - amountUsd,
    lossAtSlUsd: estEth * stopLossPrice - amountUsd,
  };
}

export const usd = (n: number, digits = 2) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

export const signedUsd = (n: number) => `${n >= 0 ? '+' : '-'}${usd(Math.abs(n))}`;

export const pct = (n: number, digits = 1) =>
  `${n > 0 ? '+' : ''}${n.toFixed(digits).replace(/\.0+$/, '')}%`;

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

export const timeAgo = (ts: number) => {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
