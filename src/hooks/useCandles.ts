import { useCallback, useSyncExternalStore } from 'react';

import { api, type Candle, type Timeframe } from '@/lib/api';
import type { Chain } from '@/lib/constants';

type Feed = { value: Candle[] | null; listeners: Set<() => void>; timer: ReturnType<typeof setInterval> | null };
const feeds = new Map<string, Feed>();
const POLL_MS: Record<Timeframe, number> = { '15m': 30_000, '1h': 60_000, '6h': 120_000, '1d': 300_000 };

const feedFor = (key: string) => {
  let f = feeds.get(key);
  if (!f) {
    f = { value: null, listeners: new Set(), timer: null };
    feeds.set(key, f);
  }
  return f;
};

async function load(chain: Chain, tf: Timeframe) {
  const f = feedFor(`${chain}:${tf}`);
  try {
    const { candles } = await api.candles(chain, tf);
    f.value = candles;
    f.listeners.forEach((l) => l());
  } catch {
    // keep the last candles
  }
}

/** Real OHLC candles (oldest first), shared by every chart on screen and refreshed while visible. */
export function useCandles(chain: Chain, tf: Timeframe) {
  const key = `${chain}:${tf}`;
  const subscribe = useCallback(
    (cb: () => void) => {
      const f = feedFor(key);
      f.listeners.add(cb);
      if (!f.timer) {
        load(chain, tf);
        f.timer = setInterval(() => load(chain, tf), POLL_MS[tf]);
      }
      return () => {
        f.listeners.delete(cb);
        if (!f.listeners.size && f.timer) {
          clearInterval(f.timer);
          f.timer = null;
        }
      };
    },
    [key, chain, tf],
  );
  const snap = useCallback(() => feedFor(key).value, [key]);
  return useSyncExternalStore(subscribe, snap, snap);
}
