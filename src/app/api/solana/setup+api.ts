// Solana step 2 (first time per token only): one transaction that creates the wallet's USDC / wSOL
// token accounts if missing and lets Flash's program spend USDC (the buy) and wSOL (the take-profit /
// stop-loss). POST { quoteId } → unsigned message for the wallet to sign.
import { base64 } from '@scure/base';

import { db } from '@/server/db';
import { fail, ok } from '@/server/http';
import { buildSetupMessage } from '@/server/solana';

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const q = await db.getQuote(String(b.quoteId));
    if (!q) throw new Error('This quote expired. Tap Apply again for a fresh price.');
    if (q.chain !== 'solana' || !q.svm) throw new Error('Not a Solana quote');
    if (!q.svm.setupIxs.length) return ok({ message: null });
    const { message } = await buildSetupMessage(q.funder, q.svm.setupIxs);
    return ok({ message: base64.encode(message) });
  } catch (e) {
    return fail(e);
  }
}
