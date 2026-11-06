// Turns Flash order state into Playbook position status (GET /orders/{id} for the entry and its bracket).
import type { Application, PositionStatus, TxRef } from '@/lib/types';

import { db } from './db';
import { FlashError, getOrder, type FlashOrderDetail } from './flash';

const TERMINAL: PositionStatus[] = ['take_profit', 'stop_loss', 'cancelled', 'failed', 'unprotected'];
export const isTerminal = (s: PositionStatus) => TERMINAL.includes(s);

const CLOSED = ['ORDER_STATUS_CANCELLED', 'ORDER_STATUS_REJECTED', 'ORDER_STATUS_TERMINATED'];
const lastRefresh = new Map<string, number>();

/** Refresh one position from Flash; throttled to once per 4s per position. */
export async function refresh(app: Application): Promise<Application> {
  if (isTerminal(app.status)) return app;
  const last = lastRefresh.get(app.id) ?? 0;
  if (Date.now() - last < 4000) return app;
  lastRefresh.set(app.id, Date.now());
  try {
    return (await refreshLive(app)) ?? app;
  } catch (e) {
    console.warn('[positions] refresh failed', app.id, e instanceof Error ? e.message : e);
    return app;
  }
}

const num = (s: string | null | undefined) => (s ? Number(s) : 0);
const sumFees = (d: FlashOrderDetail) => d.fills.reduce((s, f) => s + num(f.integratorFeeNotional), 0);

async function refreshLive(app: Application) {
  const entry = await getOrder(app.orderId, app.funder);
  const o = entry.order;
  const txs: TxRef[] = [
    ...app.txs.filter((t) => t.label === 'Approval'),
    ...entry.fills.map((f, i) => ({ label: entry.fills.length > 1 ? `Buy fill ${i + 1}` : 'Bought ETH', hash: f.transactionId })),
  ];
  let creatorFeeUsd = sumFees(entry);
  let status: PositionStatus;
  let filledPrice = app.filledPrice;
  let exitPrice = app.exitPrice;
  let pnlUsd = app.pnlUsd;
  let closeReason = o.closeReason;
  const bracketOrderId = o.attachedBracket?.bracketOrderId ?? app.bracketOrderId ?? null;

  const hasFills = entry.fills.length > 0;
  if (hasFills) {
    status = 'filled';
    filledPrice = num(o.filled?.averageNotionalPrice) || num(entry.fills[0]?.fillPrice) || filledPrice;
  } else if (o.status === 'ORDER_STATUS_REJECTED') {
    status = 'failed';
  } else if (CLOSED.includes(o.status)) {
    status = 'cancelled';
  } else {
    status = 'waiting';
  }

  if (hasFills && bracketOrderId) {
    let exit: FlashOrderDetail | null = null;
    try {
      exit = await getOrder(bracketOrderId, app.funder);
    } catch (e) {
      // Reads can trail activation by a second or two (Bracket Orders docs): try again next poll.
      if (!(e instanceof FlashError && e.status === 404)) throw e;
    }
    if (exit) {
      creatorFeeUsd += sumFees(exit);
      if (exit.fills.length > 0) {
        for (const f of exit.fills) txs.push({ label: 'Sold ETH', hash: f.transactionId });
        exitPrice = num(exit.order.filled?.averageNotionalPrice) || num(exit.fills[0]?.fillPrice);
        // One-cancels-other: whichever leg fired decides; the exit price sits near that leg's trigger.
        const midpoint = (app.takeProfitPrice + app.stopLossPrice) / 2;
        status = exitPrice >= midpoint ? 'take_profit' : 'stop_loss';
        const spent = num(o.filled?.contraAmount) || app.amountUsd;
        const received = num(exit.order.filled?.contraAmount);
        if (received) pnlUsd = received - spent;
        closeReason = exit.order.closeReason;
      } else if (CLOSED.includes(exit.order.status)) {
        // Protection closed without selling (e.g. the WETH left the wallet): the position is unprotected.
        status = 'unprotected';
        closeReason = exit.order.closeReason;
      }
    }
  }

  return db.updateApplication(app.id, {
    status,
    filledPrice,
    exitPrice,
    pnlUsd,
    bracketOrderId,
    creatorFeeUsd,
    txs,
    closeReason,
  });
}
