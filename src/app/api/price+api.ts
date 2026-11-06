import { usingPublicDevKey } from '@/server/flash';
import { fail, ok, parseChain } from '@/server/http';
import { priceOf } from '@/server/price';

/** GET /api/price?chain=base|solana (default base): ETH or SOL in USD. */
export async function GET(request: Request) {
  try {
    const chain = parseChain(new URL(request.url).searchParams.get('chain'));
    const p = await priceOf(chain);
    return ok({ chain, price: p.price, change24h: p.change24h, at: p.at, devKey: usingPublicDevKey() });
  } catch (e) {
    return fail(e);
  }
}
