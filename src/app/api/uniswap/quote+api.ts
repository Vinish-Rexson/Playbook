// Uniswap swap on Base, step 1: quote + the approval / Permit2 signature it needs.
// POST { swapper, tokenIn, tokenOut, type: 'EXACT_INPUT' | 'EXACT_OUTPUT', amount (base units) }.
import { fail, isAddress, ok } from '@/server/http';
import { isSwapSymbol, quoteSwap } from '@/server/uniswap';

export async function POST(request: Request) {
  try {
    const b = await request.json();
    if (!isAddress(b.swapper)) throw new Error('Connect a wallet first');
    if (!isSwapSymbol(b.tokenIn) || !isSwapSymbol(b.tokenOut) || b.tokenIn === b.tokenOut) throw new Error('Pick two different tokens');
    if (b.type !== 'EXACT_INPUT' && b.type !== 'EXACT_OUTPUT') throw new Error('Unknown swap type');
    if (typeof b.amount !== 'string' || !/^[1-9]\d{0,40}$/.test(b.amount)) throw new Error('Enter an amount');
    return ok(await quoteSwap({ swapper: b.swapper, tokenIn: b.tokenIn, tokenOut: b.tokenOut, type: b.type, amount: b.amount }));
  } catch (e) {
    return fail(e);
  }
}
