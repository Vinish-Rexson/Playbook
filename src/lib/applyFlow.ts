// Client side of "Apply playbook": quote → approvals (first time only) → 2 signatures → submit.
// Mirrors the Flash attached-bracket flow: one quote, sign the entry and the protection, one submit.
import type { Wallet } from '@/wallet/WalletProvider';

import { api, type QuoteResult } from './api';
import { waitForTx } from './chain';
import type { Application } from './types';

export type StepKey = 'quote' | 'approveUsdc' | 'approveWeth' | 'signEntry' | 'signProtect' | 'submit';
export type StepState = 'pending' | 'active' | 'done' | 'skipped' | 'error';

export const STEPS: { key: StepKey; label: string }[] = [
  { key: 'quote', label: 'Get best price from Flash' },
  { key: 'approveUsdc', label: 'Allow USDC (first time only)' },
  { key: 'approveWeth', label: 'Allow ETH exits (first time only)' },
  { key: 'signEntry', label: 'Sign the buy order' },
  { key: 'signProtect', label: 'Sign take-profit + stop-loss' },
  { key: 'submit', label: 'Place order on Flash' },
];

type Report = (key: StepKey, state: StepState, detail?: string) => void;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runApply(opts: {
  templateId: string;
  amountUsd: number;
  wallet: Wallet;
  onStep: Report;
  onQuote?: (q: QuoteResult) => void;
}): Promise<Application> {
  const { wallet, onStep } = opts;
  if (!wallet.address) throw new Error('Connect a wallet first');
  const paper = wallet.mode === 'paper';

  onStep('quote', 'active');
  const q = await api.quote({
    templateId: opts.templateId,
    amountUsd: opts.amountUsd,
    funder: wallet.address,
    mode: paper ? 'paper' : 'live',
  });
  opts.onQuote?.(q);
  onStep('quote', 'done');

  if (paper || !q.actions) {
    // Paper mode: nothing touches the chain; walk the same steps so the flow reads identically.
    onStep('approveUsdc', 'skipped', 'Not needed in Paper mode');
    onStep('approveWeth', 'skipped', 'Not needed in Paper mode');
    for (const k of ['signEntry', 'signProtect'] as const) {
      onStep(k, 'active');
      await pause(450);
      onStep(k, 'done', 'Simulated');
    }
    onStep('submit', 'active');
    const { position } = await api.submit({ quoteId: q.quoteId, funder: wallet.address });
    onStep('submit', 'done');
    return position;
  }

  const a = q.actions;
  const approvalTxs: string[] = [];
  let permitSignature: string | undefined;
  let bracketPermitSignature: string | undefined;

  // Spent asset (USDC): approval transaction and/or Permit2 signature, only when Flash asks for it.
  if (a.approveTx || a.permitTypedData) {
    onStep('approveUsdc', 'active');
    if (a.approveTx) {
      const hash = await wallet.sendTransaction(a.approveTx);
      onStep('approveUsdc', 'active', 'Confirming on Base…');
      await waitForTx(hash);
      approvalTxs.push(hash);
    }
    if (a.permitTypedData) permitSignature = await wallet.signTypedData(a.permitTypedData);
    onStep('approveUsdc', 'done');
  } else onStep('approveUsdc', 'skipped', 'Already allowed');

  // Received asset (WETH): lets the take-profit / stop-loss sell it later.
  const br = a.bracket;
  if (br && (br.approveTx || br.permitTypedData)) {
    onStep('approveWeth', 'active');
    if (br.approveTx) {
      const hash = await wallet.sendTransaction(br.approveTx);
      onStep('approveWeth', 'active', 'Confirming on Base…');
      await waitForTx(hash);
      approvalTxs.push(hash);
    }
    if (br.permitTypedData) bracketPermitSignature = await wallet.signTypedData(br.permitTypedData);
    onStep('approveWeth', 'done');
  } else onStep('approveWeth', 'skipped', 'Already allowed');

  onStep('signEntry', 'active');
  const userSignature = await wallet.signTypedData(a.orderTypedData);
  onStep('signEntry', 'done', 'Free, no gas');

  if (!br) throw new Error('Flash did not return the protection order to sign');
  onStep('signProtect', 'active');
  const bracketSignature = await wallet.signTypedData(br.orderTypedData);
  onStep('signProtect', 'done', 'Free, no gas');

  onStep('submit', 'active');
  const { position } = await api.submit({
    quoteId: q.quoteId,
    funder: wallet.address,
    userSignature,
    permitSignature,
    bracketSignature,
    bracketPermitSignature,
    approvalTxs,
  });
  onStep('submit', 'done');
  return position;
}
