import { usingPublicDevKey } from '@/server/flash';
import { fail, ok } from '@/server/http';
import { ethPrice } from '@/server/price';

export async function GET() {
  try {
    const p = await ethPrice();
    return ok({ price: p.price, change24h: p.change24h, at: p.at, devKey: usingPublicDevKey() });
  } catch (e) {
    return fail(e);
  }
}
