import { candlesFor, TIMEFRAMES, type Timeframe } from '@/server/candles';
import { fail, ok, parseChain } from '@/server/http';

/** GET /api/candles?chain=base|solana&tf=15m|1h|6h|1d → { candles: [{ t, o, h, l, c }] } oldest first. */
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const chain = parseChain(q.get('chain'));
    const tf = (q.get('tf') ?? '1h') as Timeframe;
    if (!TIMEFRAMES.includes(tf)) throw new Error('Unknown timeframe');
    return ok({ chain, tf, candles: await candlesFor(chain, tf) });
  } catch (e) {
    return fail(e);
  }
}
