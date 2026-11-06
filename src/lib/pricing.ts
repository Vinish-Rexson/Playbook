import { DEFINITIVE_ADVANCED_FEE_BPS } from './constants';
import type { ApplyPlan, Template } from './types';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Order type for a playbook: its entry type, or (older playbooks) limit when it buys below the price. */
export function entryTypeOf(t: Pick<Template, 'entryOffsetPct'> & Partial<Pick<Template, 'entryType'>>): ApplyPlan['orderType'] {
  if (t.entryType === 'twap') return 'twap';
  if (t.entryType === 'market') return 'market';
  return t.entryOffsetPct < 0 ? 'limit' : 'market';
}

/**
 * Turn a playbook's percentages into real order prices at today's price.
 * Market buys at the price; limit buys at the dip; DCA (TWAP) buys over time, capped at the dip when there is one.
 * Take profit and stop are measured from that entry price.
 */
export function buildPlan(
  t: Pick<Template, 'entryOffsetPct' | 'takeProfitPct' | 'stopLossPct' | 'cutPct'> & Partial<Pick<Template, 'entryType'>>,
  marketPrice: number,
  amountUsd: number,
): ApplyPlan {
  const orderType = entryTypeOf(t);
  const offset = orderType === 'market' ? 0 : Math.min(0, t.entryOffsetPct);
  const entryPrice = round2(marketPrice * (1 + offset / 100));
  const takeProfitPrice = round2(entryPrice * (1 + t.takeProfitPct / 100));
  const stopLossPrice = round2(entryPrice * (1 - t.stopLossPct / 100));
  const cutBps = Math.round(t.cutPct * 100);
  const creatorFeeUsd = (amountUsd * cutBps) / 10_000;
  // Definitive charges its fee on advanced orders (limit, TWAP); a market entry has no added fee (quote is all-in).
  const definitiveFeeUsd = orderType !== 'market' ? (amountUsd * DEFINITIVE_ADVANCED_FEE_BPS) / 10_000 : 0;
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

/** 90 → "1.5h", 1440 → "1d", 10 → "10m". */
export const durationLabel = (minutes: number) =>
  minutes >= 1440 && minutes % 1440 === 0
    ? `${minutes / 1440}d`
    : minutes >= 60
      ? `${+(minutes / 60).toFixed(1)}h`
      : `${Math.max(1, Math.round(minutes))}m`;
