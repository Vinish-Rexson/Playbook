// Turns Flash order state (or the paper simulator) into Playbook position status.
import type { Application, PositionStatus, TxRef } from '@/lib/types';

import { db } from './db';
import { getOrder, type FlashOrderDetail } from './flash';

const TERMINAL: PositionStatus[] = ['take_profit', 'stop_loss', 'cancelled', 'failed'];
export const isTerminal = (s: PositionStatus) => TERMINAL.includes(s);

const lastRefresh = new Map<string, number>();

/** Refresh one application; throttled to once per 4s per position. */
export async function refresh(app: Application): Promise<Application> {
  if (isTerminal(app.status)) return app;
  if (app.mode === 'paper') return refreshPaper(app);
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
  const txs: TxRef[] = entry.fills.map((f, i) => ({
    label: entry.fills.length > 1 ? `Buy fill ${i + 1}` : 'Bought ETH',
    hash: f.transactionId,
  }));
  let creatorFeeUsd = sumFees(entry);
  let status: PositionStatus = app.status;
  let filledPrice = app.filledPrice;
  let exitPrice = app.exitPrice;
  let pnlUsd = app.pnlUsd;
  const bracketOrderId = o.attachedBracket?.bracketOrderId ?? app.bracketOrderId ?? null;

  const hasFills = entry.fills.length > 0;
  if (hasFills) {
    status = 'filled';
    filledPrice = num(o.filled?.averageNotionalPrice) || num(entry.fills[0]?.fillPrice) || filledPrice;
  } else if (o.status === 'ORDER_STATUS_CANCELLED' || o.status === 'ORDER_STATUS_TERMINATED') {
    status = 'cancelled';
  } else if (o.status === 'ORDER_STATUS_REJECTED') {
    status = 'failed';
  } else {
    status = 'waiting';
  }

  if (hasFills && bracketOrderId) {
    const exit = await getOrder(bracketOrderId, app.funder);
    creatorFeeUsd += sumFees(exit);
    if (exit.fills.length > 0) {
      for (const f of exit.fills) txs.push({ label: 'Sold ETH', hash: f.transactionId });
      exitPrice = num(exit.order.filled?.averageNotionalPrice) || num(exit.fills[0]?.fillPrice);
      const midpoint = (app.takeProfitPrice + app.stopLossPrice) / 2;
      status = exitPrice >= midpoint ? 'take_profit' : 'stop_loss';
      const spent = num(o.filled?.contraAmount) || app.amountUsd;
      const received = num(exit.order.filled?.contraAmount);
      if (received) pnlUsd = received - spent;
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
    closeReason: o.closeReason,
  });
}

// ---- Paper mode: a deterministic, clearly-labelled simulation for judges without funds ----
const FILL_AFTER_MS = 4_000;
const EXIT_AFTER_MS = 14_000;

function refreshPaper(app: Application) {
  const age = Date.now() - app.createdAt;
  if (age < FILL_AFTER_MS) return app;
  const estEth = (app.amountUsd * (1 - app.cutBps / 10_000)) / app.entryPrice;
  if (age < EXIT_AFTER_MS) {
    if (app.status === 'filled') return app;
    return db.updateApplication(app.id, {
      status: 'filled',
      filledPrice: app.entryPrice,
      creatorFeeUsd: (app.amountUsd * app.cutBps) / 10_000,
    })!;
  }
  // 3 in 4 paper trades hit take-profit, decided by the id so it is stable across refreshes.
  const win = app.id.charCodeAt(app.id.length - 1) % 4 !== 0;
  const exitPrice = win ? app.takeProfitPrice : app.stopLossPrice;
  return db.updateApplication(app.id, {
    status: win ? 'take_profit' : 'stop_loss',
    filledPrice: app.entryPrice,
    exitPrice,
    pnlUsd: estEth * exitPrice - app.amountUsd,
    creatorFeeUsd: (app.amountUsd * app.cutBps) / 10_000,
  })!;
}
