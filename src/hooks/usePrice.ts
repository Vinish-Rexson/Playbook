import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

type PriceState = { price: number; change24h: number; devKey: boolean } | null;

let shared: PriceState = null;
const listeners = new Set<(p: PriceState) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function tick() {
  try {
    const p = await api.price();
    shared = { price: p.price, change24h: p.change24h, devKey: p.devKey };
    listeners.forEach((l) => l(shared));
  } catch {
    // keep last price
  }
}

/** Live ETH price shared by every screen (one poll every 10s while anything is listening). */
export function usePrice() {
  const [p, setP] = useState<PriceState>(shared);
  useEffect(() => {
    listeners.add(setP);
    if (!timer) {
      tick();
      timer = setInterval(tick, 10_000);
    }
    return () => {
      listeners.delete(setP);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return p;
}
