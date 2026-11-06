import { searchWethPrice } from './flash';

let cached: { price: number; change24h: number; at: number } | null = null;

/** WETH/USD from Flash search, cached for 10s so screens can poll freely. */
export async function ethPrice() {
  if (cached && Date.now() - cached.at < 10_000) return cached;
  try {
    const p = await searchWethPrice();
    cached = { ...p, at: Date.now() };
  } catch (e) {
    if (!cached) throw e; // keep serving the last good price if Flash hiccups
  }
  return cached!;
}
