// Uniswap swap on Base, step 2: the quote (plus the Permit2 signature when one was asked for) becomes the
// transaction the wallet sends. POST { quote, signature?, permitData? }. The phone checks the result before
// signing (it must call the Uniswap Universal Router).
import { fail, ok } from '@/server/http';
import { buildSwap } from '@/server/uniswap';

export async function POST(request: Request) {
  try {
    const b = await request.json();
    if (!b.quote || typeof b.quote !== 'object') throw new Error('This quote expired. Get a new one.');
    if (!!b.signature !== !!b.permitData) throw new Error('The Permit2 signature is missing');
    return ok(await buildSwap({ quote: b.quote, signature: b.signature, permitData: b.permitData }));
  } catch (e) {
    return fail(e);
  }
}
