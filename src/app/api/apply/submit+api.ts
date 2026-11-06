// Step 2 of applying a playbook: submit the signed entry + bracket to Flash and record the position.
import type { Application } from '@/lib/types';
import { db, newId } from '@/server/db';
import { flash } from '@/server/flash';
import { fail, ok } from '@/server/http';

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const pq = db.takeQuote(String(b.quoteId));
    if (!pq) throw new Error('This quote expired. Tap Apply again for a fresh price.');
    if (String(b.funder).toLowerCase() !== pq.funder.toLowerCase()) throw new Error('Wallet changed since the quote');
    const template = db.getTemplate(pq.templateId);
    if (!template) throw new Error('Playbook not found');

    let orderId: string;
    let txs: Application['txs'] = [];

    if (pq.mode === 'paper') {
      orderId = newId('paperorder');
    } else {
      if (!b.userSignature || !b.bracketSignature) throw new Error('Both signatures are required');
      const order: Record<string, any> = {
        ...pq.body,
        quoteId: pq.quoteId,
        userSignature: b.userSignature,
        evmOrderTypedData: pq.typed.order,
        attachedBracket: {
          ...pq.body.attachedBracket,
          userSignature: b.bracketSignature,
          salt: pq.bracket?.salt,
          deadline: pq.bracket?.deadline,
          signedMaxFromAmount: pq.bracket?.signedMaxFromAmount,
        },
      };
      if (pq.typed.permit && b.permitSignature) {
        order.evmPermitTypedData = pq.typed.permit;
        order.evmPermitSignature = b.permitSignature;
      }
      if (pq.typed.bracketPermit && b.bracketPermitSignature) {
        order.attachedBracket.evmPermitTypedData = pq.typed.bracketPermit;
        order.attachedBracket.evmPermitSignature = b.bracketPermitSignature;
      }
      const res = await flash<{ orderId: string }>('/order', { body: order });
      orderId = res.orderId;
      txs = (b.approvalTxs ?? []).map((hash: string) => ({ label: 'Approval', hash }));
    }

    const now = Date.now();
    const app = db.addApplication({
      id: newId('pos'),
      templateId: template.id,
      templateName: template.name,
      creator: template.creator,
      funder: pq.funder,
      mode: pq.mode,
      amountUsd: pq.plan.amountUsd,
      orderType: pq.plan.orderType,
      marketPriceAtApply: pq.plan.marketPrice,
      entryPrice: pq.plan.entryPrice,
      takeProfitPrice: pq.plan.takeProfitPrice,
      stopLossPrice: pq.plan.stopLossPrice,
      cutBps: pq.plan.cutBps,
      orderId,
      bracketOrderId: null,
      status: 'waiting',
      creatorFeeUsd: 0,
      txs,
      createdAt: now,
      updatedAt: now,
    });
    return ok({ position: app });
  } catch (e) {
    return fail(e);
  }
}
