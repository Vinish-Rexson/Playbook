/// <reference types="node" />
// Closing a position early, in this order so nothing can sell twice:
//   1. cancel the open Flash orders (the take-profit / stop pair, and a DCA entry still buying) with one batch
//      cancel the wallet signs. If the pair already fired, the position is already closed: stop there.
//   2. quote a market sell of what the entry bought, back to USDC.
//   3. submit the sell the wallet signed, and track it on the position (status closing → closed).
import { SOL_DECIMALS, SOL_USDC, USDC, WETH, WSOL } from '@/lib/constants';
import { batchCancelMessageFor } from '@/lib/flashMessages';
import type { Application } from '@/lib/types';
import { isSolanaSignature } from '@/wallet/solanaKeys';

import { db, type PendingSvm } from './db';
import { FlashError, flash, getOrder, type FlashQuote } from './flash';
import { signedBy } from './ownership';
import { refresh } from './positions';

const ACTIVE = ['ORDER_STATUS_PENDING', 'ORDER_STATUS_ACCEPTED', 'ORDER_STATUS_PARTIALLY_FILLED', 'ORDER_STATUS_UNSPECIFIED'];
const isEvmSig = (s: unknown): s is string => typeof s === 'string' && /^0x[0-9a-fA-F]{130,}$/.test(s);
const quoteTag = (app: Application) => `close:${app.id}`;

/** Orders still open for this position, and whether the take-profit / stop already sold. */
async function openOrders(app: Application) {
  const entry = await getOrder(app.orderId, app.funder);
  const ids: string[] = [];
  if (ACTIVE.includes(entry.order.status)) ids.push(app.orderId);
  const bracketId = entry.order.attachedBracket?.bracketOrderId ?? app.bracketOrderId ?? null;
  let bracketSold = false;
  if (bracketId) {
    const pair = await getOrder(bracketId, app.funder).catch((e) => {
      if (e instanceof FlashError && e.status === 404) return null;
      throw e;
    });
    if (pair && pair.fills.length > 0) bracketSold = true;
    else if (!pair || ACTIVE.includes(pair.order.status)) ids.push(bracketId);
  } else if (entry.order.attachedBracket?.status === 'pending_activation' && entry.fills.length > 0) {
    // Filled but the pair is not readable yet (it activates on the first fill): try again in a moment.
    throw new Error('Protection is still activating. Try closing again in a few seconds.');
  }
  return { entry, ids, bracketSold };
}

/** Step 1a: the batch cancel message to sign (null when nothing is open). */
export async function prepareClose(app: Application) {
  if (!['filled', 'unprotected', 'waiting', 'closing'].includes(app.status)) throw new Error('This position is already closed');
  if (app.status === 'closing') throw new Error('This position is already being closed');
  const { ids, bracketSold, entry } = await openOrders(app);
  if (bracketSold) return { alreadyClosed: true, position: await refresh(app, true) };
  if (entry.fills.length === 0 && app.status === 'waiting' && !ids.length) throw new Error('Nothing to close');
  return { alreadyClosed: false, cancel: ids.length ? { orderIds: ids, message: batchCancelMessageFor(ids) } : null, nothingBought: entry.fills.length === 0 };
}

/** Step 1b: cancel those orders with the wallet's signature (checked here first, then by Flash). */
export async function cancelForClose(app: Application, orderIds: unknown, signature: unknown) {
  if (!Array.isArray(orderIds) || !orderIds.length || orderIds.length > 25) throw new Error('No orders to cancel');
  const ids = orderIds.map(String);
  const allowed = new Set([app.orderId, app.bracketOrderId].filter(Boolean));
  const { ids: open } = await openOrders(app);
  for (const id of ids) {
    if (!allowed.has(id) && !open.includes(id)) throw new Error('That order does not belong to this position');
  }
  const message = batchCancelMessageFor(ids);
  if (!(await signedBy(app.chain, app.funder, message, signature))) {
    throw new Error('This cancel was not signed by the wallet that placed the order');
  }
  const res = await flash<{ results: { orderId: string; ok: boolean; errorCode?: string }[] }>('/orders/cancel', {
    body: { orderIds: ids.map((i) => i.toLowerCase()), cancelMessage: message, userSignature: signature },
  });
  // If the take-profit / stop filled before the cancel landed, the position is already closed: do not sell.
  const pairFilled = res.results.some((r) => r.orderId !== app.orderId && r.errorCode === 'ALREADY_FILLED');
  const failed = res.results.filter((r) => !r.ok && !['ALREADY_FILLED', 'PENDING_CANCEL', 'REJECTED'].includes(r.errorCode ?? ''));
  if (failed.length) throw new Error(`Flash could not cancel: ${failed.map((f) => f.errorCode).join(', ')}. Try again.`);
  return { alreadyClosed: pairFilled, position: await refresh(app, true) };
}

/** Step 2: market sell quote for everything the entry bought. */
export async function quoteClose(app: Application) {
  const entry = await getOrder(app.orderId, app.funder);
  if (ACTIVE.includes(entry.order.status)) throw new Error('Cancel the open orders first');
  const decimals = app.chain === 'solana' ? SOL_DECIMALS : 18;
  const raw = entry.order.filled?.targetAmount ?? '0';
  const [i, f = ''] = raw.split('.');
  const qty = f ? `${i}.${f.slice(0, decimals)}` : i;
  if (!(Number(qty) > 0)) throw new Error('This position bought nothing, so there is nothing to sell');
  return quoteSell(app, qty);
}

/** Market sell quote for `qty` of the position's asset (WETH on Base, wSOL on Solana) back to USDC. */
export async function quoteSell(app: Application, qty: string) {
  const body: Record<string, any> = {
    targetChain: app.chain,
    contraChain: app.chain,
    targetAsset: app.chain === 'solana' ? WSOL : WETH,
    contraAsset: app.chain === 'solana' ? SOL_USDC : USDC,
    side: 'sell',
    qty,
    orderType: 'market',
    funderAddress: app.funder,
  };
  const q = await flash<FlashQuote>('/quote', { body });
  const common = { quoteId: q.quoteId, chain: app.chain, qty: Number(qty), receiveUsd: Number(q.to?.amount ?? 0) };

  if (app.chain === 'solana') {
    if (!q.svm?.orderMessage) throw new Error('Flash returned no sell order to sign');
    const svm: PendingSvm = {
      orderMessage: q.svm.orderMessage,
      nonce: q.svm.nonce,
      deadline: q.svm.deadline,
      bracketOrderMessage: '',
      bracketNonce: '',
      setupIxs: [...(q.svm.ataSetupIxs ?? []), ...(q.svm.delegateIx ? [q.svm.delegateIx] : [])],
    };
    await db.putQuote({ quoteId: q.quoteId, chain: 'solana', templateId: quoteTag(app), funder: app.funder, body, plan: {} as never, bracket: null, typed: { order: null, permit: null, bracketOrder: null, bracketPermit: null }, svm, createdAt: Date.now() });
    return { ...common, solana: { setupNeeded: svm.setupIxs.length > 0, orderMessage: svm.orderMessage } };
  }
  if (!q.evm?.orderTypedData) throw new Error('Flash returned no sell order to sign');
  await db.putQuote({
    quoteId: q.quoteId,
    chain: 'base',
    templateId: quoteTag(app),
    funder: app.funder,
    body,
    plan: {} as never,
    bracket: null,
    typed: { order: q.evm.orderTypedData, permit: q.evm.permitTypedData, bracketOrder: null, bracketPermit: null },
    svm: null,
    createdAt: Date.now(),
  });
  return { ...common, actions: { approveTx: q.evm.approveTx, permitTypedData: q.evm.permitTypedData, orderTypedData: q.evm.orderTypedData } };
}

/** Step 3: submit the signed sell and mark the position as closing. */
export async function submitClose(app: Application, b: Record<string, any>) {
  const pq = await db.takeQuote(String(b.quoteId));
  if (!pq || pq.templateId !== quoteTag(app)) throw new Error('This sell quote expired. Try closing again.');
  const order: Record<string, any> = { ...pq.body, quoteId: pq.quoteId, userSignature: b.userSignature };
  if (pq.chain === 'solana') {
    if (!isSolanaSignature(b.userSignature) || !pq.svm) throw new Error('The sell order signature is missing');
    order.svmNonce = pq.svm.nonce;
    order.svmDeadline = pq.svm.deadline;
  } else {
    if (!isEvmSig(b.userSignature) || !pq.typed.order) throw new Error('The sell order signature is missing');
    order.evmOrderTypedData = pq.typed.order;
    if (pq.typed.permit) {
      if (!isEvmSig(b.permitSignature)) throw new Error('The WETH permit signature is missing');
      order.evmPermitTypedData = pq.typed.permit;
      order.evmPermitSignature = b.permitSignature;
    }
  }
  const res = await flash<{ orderId: string }>('/order', { body: order });
  const txs = [...app.txs, ...(Array.isArray(b.approvalTxs) ? b.approvalTxs : []).map((hash: string) => ({ label: 'Approval', hash }))];
  return db.updateApplication(app.id, { closeOrderId: res.orderId, status: 'closing', txs });
}
