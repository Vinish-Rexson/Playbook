// Client side of "Apply playbook": balance check → quote → approvals (first time only) → 2 signatures → submit.
// Mirrors the Flash attached-bracket flow: one quote, sign the entry and the protection, one submit.
import type { Wallet } from '@/wallet/WalletProvider';

import { api, type QuoteResult } from './api';
import { balancesOf, waitForTx } from './chain';
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

export async function runApply(opts: {
  templateId: string;
  amountUsd: number;
  wallet: Wallet;
  onStep: Report;
  onQuote?: (q: QuoteResult) => void;
}): Promise<Application> {
  const { wallet, onStep } = opts;
  if (!wallet.address || wallet.mode !== 'live') throw new Error('Unlock your wallet first');

  onStep('quote', 'active', 'Checking your balance…');
  const bal = await balancesOf(wallet.address);
  if (bal.usdc + 1e-9 < opts.amountUsd) {
    throw new Error(
      `You have ${bal.usdc.toFixed(2)} USDC on Base and this needs ${opts.amountUsd.toFixed(2)}. Add USDC from Profile → Receive.`,
    );
  }

  onStep('quote', 'active');
  const q = await api.quote({ templateId: opts.templateId, amountUsd: opts.amountUsd, funder: wallet.address });
  opts.onQuote?.(q);
  onStep('quote', 'done', q.priceImpact !== null ? `Price impact ${(q.priceImpact * 100).toFixed(2)}%` : undefined);

  const a = q.actions;
  const br = a.bracket;
  const approvals = (a.approveTx ? 1 : 0) + (br.approveTx ? 1 : 0);
  if (approvals > 0 && bal.eth <= 0) {
    throw new Error('Add a little ETH on Base (about $0.10) to pay for the one-time approvals.');
  }

  const approvalTxs: string[] = [];
  let permitSignature: string | undefined;
  let bracketPermitSignature: string | undefined;

  // Spent asset (USDC): approval transaction and/or Permit2 signature, only when Flash asks for it.
  if (a.approveTx || a.permitTypedData) {
    onStep('approveUsdc', 'active');
    if (a.approveTx) {
      const hash = await wallet.sendTransaction(a.approveTx);
      onStep('approveUsdc', 'active', 'Confirming on Base…');
      const r = await waitForTx(hash);
      if (r.status !== 'success') throw new Error('The USDC approval failed on Base');
      approvalTxs.push(hash);
    }
    if (a.permitTypedData) permitSignature = await wallet.signTypedData(a.permitTypedData);
    onStep('approveUsdc', 'done');
  } else onStep('approveUsdc', 'skipped', 'Already allowed');

  // Received asset (WETH): lets the take-profit / stop-loss sell it later.
  if (br.approveTx || br.permitTypedData) {
    onStep('approveWeth', 'active');
    if (br.approveTx) {
      const hash = await wallet.sendTransaction(br.approveTx);
      onStep('approveWeth', 'active', 'Confirming on Base…');
      const r = await waitForTx(hash);
      if (r.status !== 'success') throw new Error('The WETH approval failed on Base');
      approvalTxs.push(hash);
    }
    if (br.permitTypedData) bracketPermitSignature = await wallet.signTypedData(br.permitTypedData);
    onStep('approveWeth', 'done');
  } else onStep('approveWeth', 'skipped', 'Already allowed');

  onStep('signEntry', 'active');
  const userSignature = await wallet.signTypedData(a.orderTypedData);
  onStep('signEntry', 'done', 'Free, no gas');

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
