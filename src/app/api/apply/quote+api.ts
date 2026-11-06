// Step 1 of applying a playbook: build the Flash order from the template on the server
// (so the creator cut cannot be changed by the client) and request a Flash quote.
// Base buys WETH with USDC; Solana buys SOL (as wSOL) with USDC. Both carry the take-profit / stop-loss.
import { CHAIN, playbookChains, SOL_USDC, USDC, WETH, WSOL, type Chain } from '@/lib/constants';
import { buildPlan } from '@/lib/pricing';
import { db, type PendingSvm } from '@/server/db';
import { flash, type FlashQuote } from '@/server/flash';
import { fail, isAddressOn, ok, parseChain } from '@/server/http';
import { priceOf } from '@/server/price';

const ASSETS: Record<Chain, { target: string; contra: string }> = {
  base: { target: WETH, contra: USDC },
  solana: { target: WSOL, contra: SOL_USDC },
};

export async function POST(request: Request) {
  try {
    const b = await request.json();
    const chain = parseChain(b.chain);
    if (!isAddressOn(chain, b.funder)) {
      throw new Error(chain === 'solana' ? 'This wallet has no Solana address' : 'Connect a wallet first');
    }
    const template = await db.getTemplate(String(b.templateId));
    if (!template) throw new Error('Playbook not found');
    if (!playbookChains(template.chain).includes(chain)) {
      throw new Error(`${template.name} trades on ${template.chain === 'solana' ? 'Solana' : 'Base'} only`);
    }
    // No app minimum: Flash enforces its own order limits and its error is shown as is.
    const amountUsd = Math.round(Number(b.amountUsd) * 100) / 100;
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) throw new Error('Enter an amount');

    const { price } = await priceOf(chain);
    const plan = buildPlan(template, price, amountUsd);

    const body: Record<string, any> = {
      targetChain: chain === 'base' ? CHAIN : 'solana',
      contraChain: chain === 'base' ? CHAIN : 'solana',
      targetAsset: ASSETS[chain].target,
      contraAsset: ASSETS[chain].contra,
      side: 'buy',
      qty: amountUsd.toFixed(2),
      orderType: plan.orderType,
      funderAddress: b.funder,
      attachedBracket: {
        takeProfit: { notionalPrice: plan.takeProfitPrice.toFixed(2) },
        stopLoss: { notionalPrice: plan.stopLossPrice.toFixed(2) },
      },
    };
    // A limit entry carrying a bracket must use limitCrossPrice (USDC per unit bought), per the Flash bracket docs.
    if (plan.orderType === 'limit') body.limitCrossPrice = plan.entryPrice.toFixed(2);
    // Same string on /quote and /order (Monetize Your Integration docs).
    if (plan.cutBps > 0) body.flashIntegratorFeeBps = String(plan.cutBps);

    const q = await flash<FlashQuote>('/quote', { body });
    const ab = q.attachedBracket;
    const common = {
      quoteId: q.quoteId,
      chain,
      plan,
      estimatedFeeUsd: Number(q.fees?.estimatedFeeNotional ?? 0),
      receiveEth: Number(q.to?.amount ?? plan.estEth),
      priceImpact: q.estimatedPriceImpact === null ? null : Number(q.estimatedPriceImpact),
    };
    const bracket = ab ? { salt: ab.salt, deadline: ab.deadline, signedMaxFromAmount: ab.signedMaxFromAmount } : null;

    if (chain === 'solana') {
      if (!q.svm?.orderMessage) throw new Error('Flash returned no order to sign');
      if (!ab?.svm?.orderMessage) throw new Error('Flash returned no take-profit / stop-loss order to sign');
      if (q.svm.sponsoredDelegateTx && !q.svm.delegateIx) {
        throw new Error('Flash offered a sponsored approval, which Playbook does not support yet. Try again shortly.');
      }
      // Order matters: token accounts must exist before either delegation (Solana Overview docs).
      const setupIxs = [...(q.svm.ataSetupIxs ?? []), q.svm.delegateIx, ab.svm.delegateIx].filter((x) => !!x);
      const svm: PendingSvm = {
        orderMessage: q.svm.orderMessage,
        nonce: q.svm.nonce,
        deadline: q.svm.deadline,
        bracketOrderMessage: ab.svm.orderMessage,
        bracketNonce: ab.svm.nonce,
        setupIxs,
      };
      await db.putQuote({
        quoteId: q.quoteId,
        chain,
        templateId: template.id,
        funder: b.funder,
        body,
        plan,
        bracket,
        typed: { order: null, permit: null, bracketOrder: null, bracketPermit: null },
        svm,
        createdAt: Date.now(),
      });
      return ok({
        ...common,
        solana: {
          setupNeeded: setupIxs.length > 0,
          newTokenAccounts: q.svm.ataSetupIxs?.length ?? 0,
          orderMessage: svm.orderMessage,
          bracketOrderMessage: svm.bracketOrderMessage,
        },
      });
    }

    if (!q.evm?.orderTypedData) throw new Error('Flash returned no order to sign');
    if (!ab?.evm?.orderTypedData) throw new Error('Flash returned no take-profit / stop-loss order to sign');
    await db.putQuote({
      quoteId: q.quoteId,
      chain,
      templateId: template.id,
      funder: b.funder,
      body,
      plan,
      bracket,
      typed: {
        order: q.evm.orderTypedData,
        permit: q.evm.permitTypedData,
        bracketOrder: ab.evm.orderTypedData,
        bracketPermit: ab.evm.permitTypedData,
      },
      svm: null,
      createdAt: Date.now(),
    });

    return ok({
      ...common,
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
