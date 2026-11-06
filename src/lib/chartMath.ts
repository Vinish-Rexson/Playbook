// Pure chart helpers: scales, axis ticks, and the chart reading used to turn price action into rules.
import type { Candle, Timeframe } from './api';

/** Rule limits, shared by the create page steppers and the chart's draggable lines. */
export const RULE_LIMITS = {
  dip: { min: 0, max: 15 },
  tp: { min: 0.1, max: 50 },
  sl: { min: 0.1, max: 30 },
} as const;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

/** "Nice" axis ticks covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4) {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 1) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

export const priceDigits = (p: number) => (p >= 1000 ? 0 : p >= 100 ? 1 : 2);
export const fmtPrice = (p: number) =>
  `$${p.toLocaleString('en-US', { minimumFractionDigits: priceDigits(p), maximumFractionDigits: priceDigits(p) })}`;

export function fmtTime(t: number, tf: Timeframe) {
  const d = new Date(t);
  const mon = d.toLocaleString('en-US', { month: 'short' });
  if (tf === '1d') return `${d.getDate()} ${mon}`;
  if (tf === '6h') return `${d.getDate()} ${mon} ${String(d.getHours()).padStart(2, '0')}h`;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Average true range over the last `n` candles, as % of the last close. */
export function atrPct(c: Candle[], n = 14) {
  const xs = c.slice(-n - 1);
  if (xs.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < xs.length; i++) {
    const p = xs[i - 1].c;
    sum += Math.max(xs[i].h - xs[i].l, Math.abs(xs[i].h - p), Math.abs(xs[i].l - p));
  }
  return (sum / (xs.length - 1) / xs[xs.length - 1].c) * 100;
}

export type ChartReading = {
  price: number;
  /** Lowest low / highest high over the lookback: the nearby support and resistance. */
  support: number;
  resistance: number;
  /** Typical candle move, % of price. */
  atr: number;
  /** Change over the lookback, %. */
  trendPct: number;
  lookback: number;
};

/** What the recent chart says: range, typical move and trend over the last `lookback` candles. */
export function readChart(c: Candle[], lookback = 48): ChartReading | null {
  if (c.length < 10) return null;
  const xs = c.slice(-lookback);
  const price = c[c.length - 1].c;
  return {
    price,
    support: Math.min(...xs.map((k) => k.l)),
    resistance: Math.max(...xs.map((k) => k.h)),
    atr: atrPct(c),
    trendPct: ((price - xs[0].o) / xs[0].o) * 100,
    lookback: xs.length,
  };
}

export type Rules = { dip: number; tp: number; sl: number };
export type Setup = { key: string; title: string; why: string; rules: Rules };

const fit = (r: Rules): Rules => ({
  dip: round1(clamp(r.dip, RULE_LIMITS.dip.min, RULE_LIMITS.dip.max)),
  tp: round1(clamp(r.tp, RULE_LIMITS.tp.min, RULE_LIMITS.tp.max)),
  sl: round1(clamp(r.sl, RULE_LIMITS.sl.min, RULE_LIMITS.sl.max)),
});

/** One-tap rule sets derived from the chart: buy support, ride momentum, or scalp the typical move. */
export function setupsFrom(r: ChartReading): Setup[] {
  const a = Math.max(r.atr, 0.2);
  const toSupport = ((r.price - r.support) / r.price) * 100;
  const entrySupport = r.support * 1.001;
  const toResistance = ((r.resistance - entrySupport) / entrySupport) * 100;
  return [
    {
      key: 'support',
      title: 'Buy the dip at support',
      why: `Limit buy near the range low ${fmtPrice(r.support)}, sell near the high ${fmtPrice(r.resistance)}, stop one typical move below support.`,
      rules: fit({ dip: Math.max(toSupport - 0.1, 0.5), tp: Math.max(toResistance * 0.9, a), sl: a + 0.3 }),
    },
    {
      key: 'momentum',
      title: r.trendPct >= 0 ? 'Ride the uptrend' : 'Catch the bounce',
      why: `Buy now, target three typical moves (${(a * 3).toFixed(1)}%), stop after one and a half (${(a * 1.5).toFixed(1)}%).`,
      rules: fit({ dip: 0, tp: a * 3, sl: a * 1.5 }),
    },
    {
      key: 'scalp',
      title: 'Quick scalp',
      why: `Buy now, take one typical move (${a.toFixed(1)}%) with a matching stop. Small targets fill often.`,
      rules: fit({ dip: 0, tp: a, sl: a }),
    },
  ];
}
