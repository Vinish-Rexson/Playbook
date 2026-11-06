import { useCallback, useSyncExternalStore } from 'react';

import { api } from '@/lib/api';
import type { Chain } from '@/lib/constants';

type PriceState = { price: number; change24h: number; devKey: boolean } | null;

type Feed = { value: PriceState; listeners: Set<() => void>; timer: ReturnType<typeof setInterval> | null };
const feeds: Record<Chain, Feed> = {
  base: { value: null, listeners: new Set(), timer: null },
  solana: { value: null, listeners: new Set(), timer: null },
};

async function tick(chain: Chain) {
  try {
    const p = await api.price(chain);
    const f = feeds[chain];
    f.value = { price: p.price, change24h: p.change24h, devKey: p.devKey };
    f.listeners.forEach((l) => l());
  } catch {
    // keep last price
  }
}

function subscribe(chain: Chain, onChange: () => void) {
  const f = feeds[chain];
  f.listeners.add(onChange);
  if (!f.timer) {
    tick(chain);
    f.timer = setInterval(() => tick(chain), 10_000);
  }
  return () => {
    f.listeners.delete(onChange);
    if (f.listeners.size === 0 && f.timer) {
      clearInterval(f.timer);
      f.timer = null;
    }
  };
}

/** Live price of what playbooks buy on a network (ETH on Base, SOL on Solana), one poll every 10s per network. */
export function usePrice(chain: Chain = 'base') {
  const sub = useCallback((cb: () => void) => subscribe(chain, cb), [chain]);
  const snap = useCallback(() => feeds[chain].value, [chain]);
  return useSyncExternalStore(sub, snap, snap);
}
