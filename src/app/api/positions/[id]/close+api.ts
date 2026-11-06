// Close a position early. POST { step, ... }:
//   prepare → { alreadyClosed, cancel: { orderIds, message } | null }   message to sign (batch cancel)
//   cancel  { orderIds, userSignature } → { alreadyClosed, position }
//   quote   → market sell quote of what the entry bought (Base actions or Solana message)
//   submit  { quoteId, userSignature, permitSignature?, approvalTxs? } → { position }
import { cancelForClose, prepareClose, quoteClose, submitClose } from '@/server/close';
import { db } from '@/server/db';
import { fail, ok } from '@/server/http';

export async function POST(request: Request, { id }: Record<string, string>) {
  try {
    const app = await db.getApplication(id);
    if (!app) throw new Error('Position not found');
    const b = await request.json();
    if (b.step === 'prepare') return ok(await prepareClose(app));
    if (b.step === 'cancel') return ok(await cancelForClose(app, b.orderIds, b.userSignature));
    if (b.step === 'quote') return ok(await quoteClose(app));
    if (b.step === 'submit') return ok({ position: await submitClose(app, b) });
    throw new Error('Unknown step');
  } catch (e) {
    return fail(e);
  }
}
