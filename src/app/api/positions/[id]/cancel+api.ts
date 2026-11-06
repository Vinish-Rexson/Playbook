// Cancel a resting entry. Flash requires a signature over an exact plaintext message (Cancelling Orders docs):
// "Definitive Flash v1 — Cancel Order\nOrder: <orderId>" — EIP-191 on Base, Ed25519 (base58) on Solana.
// The signature is checked against the position's own wallet here first, so only that wallet can cancel.
import { cancelMessageFor } from '@/lib/flashMessages';
import { db } from '@/server/db';
import { flash } from '@/server/flash';
import { fail, ok } from '@/server/http';
import { signedBy } from '@/server/ownership';

export async function POST(request: Request, { id }: Record<string, string>) {
  try {
    const app = await db.getApplication(id);
    if (!app) throw new Error('Position not found');
    if (app.status !== 'waiting') throw new Error('Only a waiting entry can be cancelled');
    const b = await request.json();
    const message = cancelMessageFor(app.orderId);
    if (!(await signedBy(app.chain, app.funder, message, b.userSignature))) {
      throw new Error('This cancel was not signed by the wallet that placed the order');
    }
    await flash(`/orders/${app.orderId}/cancel`, { body: { cancelMessage: message, userSignature: b.userSignature } });
    return ok({ position: await db.updateApplication(id, { status: 'cancelled', closeReason: 'REASON_USER_REQUESTED' }) });
  } catch (e) {
    return fail(e);
  }
}
