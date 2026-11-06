// Step 2 of applying a playbook: submit the signed entry + bracket to Flash and record the position.
// The order body is the exact request the server built for the quote (fee included), so the client
// only contributes signatures and cannot change the creator cut or the prices.
import { db, newId } from '@/server/db';
import { flash } from '@/server/flash';
import { fail, ok } from '@/server/http';

const isSig = (s: unknown): s is string => typeof s === 'string' && /^0x[0-9a-fA-F]{130,}$/.test(s);
const isHash = (s: unknown): s is string => typeof s === 'string' && /^0x[0-9a-fA-F]{64}$/.test(s);

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const pq = await db.takeQuote(String(b.quoteId));
    if (!pq) throw new Error('This quote expired. Tap Apply again for a fresh price.');
    if (String(b.funder).toLowerCase() !== pq.funder.toLowerCase()) throw new Error('Wallet changed since the quote');
    const template = await db.getTemplate(pq.templateId);
    if (!template) throw new Error('Playbook not found');
    if (!isSig(b.userSignature) || !isSig(b.bracketSignature)) throw new Error('Both order signatures are required');
    if (!pq.typed.order || !pq.bracket) throw new Error('This quote has no protection order. Tap Apply again.');

    const order: Record<string, any> = {
      ...pq.body,
      quoteId: pq.quoteId,
      userSignature: b.userSignature,
      evmOrderTypedData: pq.typed.order,
      attachedBracket: {
        ...pq.body.attachedBracket,
        userSignature: b.bracketSignature,
        salt: pq.bracket.salt,
        deadline: pq.bracket.deadline,
        signedMaxFromAmount: pq.bracket.signedMaxFromAmount,
      },
    };
    if (pq.typed.permit) {
      if (!isSig(b.permitSignature)) throw new Error('The USDC permit signature is missing');
      order.evmPermitTypedData = pq.typed.permit;
      order.evmPermitSignature = b.permitSignature;
    }
    if (pq.typed.bracketPermit) {
      if (!isSig(b.bracketPermitSignature)) throw new Error('The WETH permit signature is missing');
      order.attachedBracket.evmPermitTypedData = pq.typed.bracketPermit;
      order.attachedBracket.evmPermitSignature = b.bracketPermitSignature;
    }

    const res = await flash<{ orderId: string; attachedBracket?: { status: string } }>('/order', { body: order });

    const now = Date.now();
    const position = await db.addApplication({
      id: newId('pos'),
      templateId: template.id,
      templateName: template.name,
      creator: template.creator,
      funder: pq.funder,
      amountUsd: pq.plan.amountUsd,
      orderType: pq.plan.orderType,
      marketPriceAtApply: pq.plan.marketPrice,
      entryPrice: pq.plan.entryPrice,
      takeProfitPrice: pq.plan.takeProfitPrice,
      stopLossPrice: pq.plan.stopLossPrice,
      cutBps: pq.plan.cutBps,
      orderId: res.orderId,
      bracketOrderId: null,
      status: 'waiting',
      creatorFeeUsd: 0,
      txs: (Array.isArray(b.approvalTxs) ? b.approvalTxs : []).filter(isHash).map((hash: string) => ({ label: 'Approval', hash })),
      createdAt: now,
      updatedAt: now,
    });
    return ok({ position });
  } catch (e) {
    return fail(e);
  }
}
