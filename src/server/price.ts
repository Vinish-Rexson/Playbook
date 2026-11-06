import type { Chain } from '@/lib/constants';

import { searchPrice } from './flash';

type Cached = { price: number; change24h: number; at: number };
const cache = new Map<Chain, Cached>();

/** USD price of what playbooks buy on a chain (WETH on Base, SOL on Solana), cached 10s so screens can poll freely. */
export async function priceOf(chain: Chain): Promise<Cached> {
  const hit = cache.get(chain);
  if (hit && Date.now() - hit.at < 10_000) return hit;
  try {
    const p = await searchPrice(chain);
    cache.set(chain, { ...p, at: Date.now() });
  } catch (e) {
    if (!hit) throw e; // keep serving the last good price if Flash hiccups
  }
  return cache.get(chain)!;
}

export const ethPrice = () => priceOf('base');
