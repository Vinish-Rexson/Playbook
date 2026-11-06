/// <reference types="node" />
// Real OHLC candles for the charts. Flash has no history endpoint, so this uses Coinbase Exchange's public
// market data (no key) and falls back to Binance. Cached per pair and timeframe so charts can poll.
import type { Chain } from '@/lib/constants';

export type Candle = { t: number; o: number; h: number; l: number; c: number };
export type Timeframe = '15m' | '1h' | '6h' | '1d';
export const TIMEFRAMES: Timeframe[] = ['15m', '1h', '6h', '1d'];

const SECONDS: Record<Timeframe, number> = { '15m': 900, '1h': 3600, '6h': 21600, '1d': 86400 };
const COINBASE: Record<Chain, string> = { base: 'ETH-USD', solana: 'SOL-USD' };
const BINANCE: Record<Chain, string> = { base: 'ETHUSDT', solana: 'SOLUSDT' };
/** Keep each timeframe fresh for about a quarter of a candle, at least 20s. */
const TTL_MS: Record<Timeframe, number> = { '15m': 20_000, '1h': 60_000, '6h': 120_000, '1d': 300_000 };

const cache = new Map<string, { at: number; candles: Candle[] }>();

async function coinbase(chain: Chain, tf: Timeframe): Promise<Candle[]> {
  const res = await fetch(
    `https://api.exchange.coinbase.com/products/${COINBASE[chain]}/candles?granularity=${SECONDS[tf]}`,
    { headers: { 'user-agent': 'playbook-app' } },
  );
  if (!res.ok) throw new Error(`Coinbase ${res.status}`);
  // [time, low, high, open, close, volume], newest first.
  const rows = (await res.json()) as [number, number, number, number, number, number][];
  return rows.map(([t, l, h, o, c]) => ({ t: t * 1000, o, h, l, c })).reverse();
}

async function binance(chain: Chain, tf: Timeframe): Promise<Candle[]> {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${BINANCE[chain]}&interval=${tf}&limit=350`);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const rows = (await res.json()) as [number, string, string, string, string][];
  return rows.map(([t, o, h, l, c]) => ({ t, o: +o, h: +h, l: +l, c: +c }));
}

/** Up to ~350 candles, oldest first. */
export async function candlesFor(chain: Chain, tf: Timeframe): Promise<Candle[]> {
  const key = `${chain}:${tf}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS[tf]) return hit.candles;
  try {
    let candles: Candle[];
    try {
      candles = await coinbase(chain, tf);
    } catch {
      candles = await binance(chain, tf);
    }
    if (!candles.length) throw new Error('No candles');
    cache.set(key, { at: Date.now(), candles });
    return candles;
  } catch (e) {
    if (hit) return hit.candles; // serve the last good set if both sources hiccup
    throw e;
  }
}
