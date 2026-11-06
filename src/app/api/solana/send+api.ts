// Solana step 2b: broadcast the setup transaction the wallet signed, and wait until it confirms
// (Flash rejects the order while the delegations are not on-chain). POST { quoteId, message, signature }.
import { base64 } from '@scure/base';

import { db } from '@/server/db';
import { fail, ok } from '@/server/http';
import { sendSigned } from '@/server/solana';

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const q = await db.getQuote(String(b.quoteId));
    if (!q) throw new Error('This quote expired. Tap Apply again for a fresh price.');
    if (q.chain !== 'solana') throw new Error('Not a Solana quote');
    const txId = await sendSigned(q.funder, base64.decode(String(b.message)), String(b.signature));
    return ok({ txId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // An expired blockhash means the confirmation took longer than about a minute.
    if (/blockhash not found|block height exceeded/i.test(msg)) {
      return fail(new Error('The setup took too long to confirm and expired. Tap Apply again.'));
    }
    return fail(e);
  }
}
