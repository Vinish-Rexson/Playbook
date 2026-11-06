import type { Chain } from '@/lib/constants';

import { searchPrice } from './flash';

type Cached = { price: number; change24h: number; at: number };
const cache = new Map<Chain, Cached>();
const FRESH_MS = 10_000;
/** If Flash's price search is down, the last good price is served for at most this long. */
const MAX_STALE_MS = 2 * 60_000;

/** USD price of what playbooks buy on a chain (WETH on Base, SOL on Solana), cached 10s so screens can poll freely. */
export async function priceOf(chain: Chain): Promise<Cached> {
  const hit = cache.get(chain);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit;
  try {
    const p = await searchPrice(chain);
    const next = { ...p, at: Date.now() };
    cache.set(chain, next);
    return next;
  } catch (e) {
    // Quotes are priced from this, so never fall back to an old price for long.
    if (hit && Date.now() - hit.at < MAX_STALE_MS) return hit;
    throw e;
  }
}

export const ethPrice = () => priceOf('base');
