// Step 1 of applying a playbook: build the Flash order from the template on the server
// (so the creator cut cannot be changed by the client) and request a Flash quote.
import { CHAIN, MIN_APPLY_USD, USDC, WETH } from '@/lib/constants';
import { buildPlan } from '@/lib/pricing';
import { db } from '@/server/db';
import { flash, type FlashQuote } from '@/server/flash';
import { fail, isAddress, ok } from '@/server/http';
import { ethPrice } from '@/server/price';

export async function POST(request: Request) {
  try {
    const b = await request.json();
    if (!isAddress(b.funder)) throw new Error('Connect a wallet first');
    const template = await db.getTemplate(String(b.templateId));
    if (!template) throw new Error('Playbook not found');
    const amountUsd = Math.round(Number(b.amountUsd) * 100) / 100;
    if (!Number.isFinite(amountUsd) || amountUsd < MIN_APPLY_USD) {
      throw new Error(`Minimum amount is $${MIN_APPLY_USD}`);
    }

    const { price } = await ethPrice();
    const plan = buildPlan(template, price, amountUsd);

    // Flash quote request: buy WETH with USDC on Base, protected by an attached bracket.
    const body: Record<string, any> = {
      targetChain: CHAIN,
      contraChain: CHAIN,
      targetAsset: WETH,
      contraAsset: USDC,
      side: 'buy',
      qty: amountUsd.toFixed(2),
      orderType: plan.orderType,
      funderAddress: b.funder,
      attachedBracket: {
        takeProfit: { notionalPrice: plan.takeProfitPrice.toFixed(2) },
        stopLoss: { notionalPrice: plan.stopLossPrice.toFixed(2) },
      },
    };
    // A limit entry carrying a bracket must use limitCrossPrice (USDC per WETH), per the Flash bracket docs.
    if (plan.orderType === 'limit') body.limitCrossPrice = plan.entryPrice.toFixed(2);
    // Same string on /quote and /order (Monetize Your Integration docs).
    if (plan.cutBps > 0) body.flashIntegratorFeeBps = String(plan.cutBps);

    const q = await flash<FlashQuote>('/quote', { body });
    const ab = q.attachedBracket;
    if (!q.evm?.orderTypedData) throw new Error('Flash returned no order to sign');
    if (!ab?.evm?.orderTypedData) throw new Error('Flash returned no take-profit / stop-loss order to sign');

    await db.putQuote({
      quoteId: q.quoteId,
      templateId: template.id,
      funder: b.funder,
      body,
      plan,
      bracket: { salt: ab.salt, deadline: ab.deadline, signedMaxFromAmount: ab.signedMaxFromAmount },
      typed: {
        order: q.evm.orderTypedData,
        permit: q.evm.permitTypedData,
        bracketOrder: ab.evm.orderTypedData,
        bracketPermit: ab.evm.permitTypedData,
      },
      createdAt: Date.now(),
    });

    return ok({
      quoteId: q.quoteId,
      plan,
      estimatedFeeUsd: Number(q.fees?.estimatedFeeNotional ?? 0),
      receiveEth: Number(q.to?.amount ?? plan.estEth),
      priceImpact: q.estimatedPriceImpact === null ? null : Number(q.estimatedPriceImpact),
      actions: {
        approveTx: q.evm.approveTx,
        permitTypedData: q.evm.permitTypedData,
        orderTypedData: q.evm.orderTypedData,
        bracket: {
          approveTx: ab.evm.approveTx,
          permitTypedData: ab.evm.permitTypedData,
          orderTypedData: ab.evm.orderTypedData,
        },
      },
    });
  } catch (e) {
    return fail(e);
  }
}
