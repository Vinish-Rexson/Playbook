// Cancel a resting entry. Flash requires a personal_sign over an exact plaintext message
// (Cancelling Orders docs): "Definitive Flash v1 — Cancel Order\nOrder: <orderId>".
import { cancelMessageFor } from '@/lib/flashMessages';
import { db } from '@/server/db';
import { flash } from '@/server/flash';
import { fail, ok } from '@/server/http';

export async function POST(request: Request, { id }: Record<string, string>) {
  try {
    const app = await db.getApplication(id);
    if (!app) throw new Error('Position not found');
    if (app.status !== 'waiting') throw new Error('Only a waiting entry can be cancelled');
    const b = await request.json();
    if (!b.userSignature) throw new Error('Signature required');
    await flash(`/orders/${app.orderId}/cancel`, {
      body: { cancelMessage: cancelMessageFor(app.orderId), userSignature: b.userSignature },
    });
    return ok({ position: await db.updateApplication(id, { status: 'cancelled', closeReason: 'REASON_USER_REQUESTED' }) });
  } catch (e) {
    return fail(e);
  }
}
