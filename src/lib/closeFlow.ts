// Client side of "Close position": cancel the open orders (one signature), then sell what was bought at market
// (approval / setup only if Flash asks, then one signature), then submit. Mirrors server/close.ts.
import type { Wallet } from '@/wallet/WalletProvider';

import { api } from './api';
import { waitForTx } from './chain';
import type { Application } from './types';

export type CloseStepKey = 'cancel' | 'quote' | 'allow' | 'sign' | 'submit';
export type CloseStepState = 'pending' | 'active' | 'done' | 'skipped' | 'error';

export const CLOSE_STEPS: { key: CloseStepKey; label: string }[] = [
  { key: 'cancel', label: 'Cancel take-profit and stop' },
  { key: 'quote', label: 'Get best sell price from Flash' },
  { key: 'allow', label: 'Allow selling (only if needed)' },
  { key: 'sign', label: 'Sign the sell order' },
  { key: 'submit', label: 'Sell on Flash' },
];

type Report = (key: CloseStepKey, state: CloseStepState, detail?: string) => void;

/** Returns the updated position; `soldByProtection` when the take-profit / stop already sold it first. */
export async function runClose(p: Application, wallet: Wallet, onStep: Report): Promise<{ position: Application; soldByProtection: boolean }> {
  const signText = (m: string) => (p.chain === 'solana' ? wallet.signSolanaMessage(m) : wallet.signMessage(m));

  onStep('cancel', 'active');
  const prep = await api.closePrepare(p.id);
  if (prep.alreadyClosed && prep.position) {
    onStep('cancel', 'done', 'The take-profit or stop already sold this position');
    return { position: prep.position, soldByProtection: true };
  }
  if (prep.cancel) {
    const sig = await signText(prep.cancel.message);
    const r = await api.closeCancel(p.id, prep.cancel.orderIds, sig);
    if (r.alreadyClosed) {
      onStep('cancel', 'done', 'The take-profit or stop already sold this position');
      return { position: r.position, soldByProtection: true };
    }
    onStep('cancel', 'done', `${prep.cancel.orderIds.length === 1 ? '1 order' : `${prep.cancel.orderIds.length} orders`} cancelled`);
  } else {
    onStep('cancel', 'skipped', 'Nothing open');
  }
  if (prep.nothingBought) {
    // A buy that never filled: cancelling it was the whole close.
    for (const k of ['quote', 'allow', 'sign', 'submit'] as const) onStep(k, 'skipped');
    return { position: (await api.position(p.id)).position, soldByProtection: false };
  }

  onStep('quote', 'active');
  const q = await api.closeQuote(p.id);
  onStep('quote', 'done', `Selling ${q.qty} for about $${q.receiveUsd.toFixed(2)}`);

  const approvalTxs: string[] = [];
  let permitSignature: string | undefined;
  let userSignature: string;
  if ('actions' in q) {
    const a = q.actions;
    if (a.approveTx || a.permitTypedData) {
      onStep('allow', 'active');
      if (a.approveTx) {
        const hash = await wallet.sendTransaction(a.approveTx);
        onStep('allow', 'active', 'Confirming on Base…');
        const r = await waitForTx(hash);
        if (r.status !== 'success') throw new Error('The approval failed on Base');
        approvalTxs.push(hash);
      }
      if (a.permitTypedData) permitSignature = await wallet.signTypedData(a.permitTypedData);
      onStep('allow', 'done');
    } else onStep('allow', 'skipped', 'Already allowed');
    onStep('sign', 'active');
    userSignature = await wallet.signTypedData(a.orderTypedData);
  } else {
    if (q.solana.setupNeeded) {
      onStep('allow', 'active');
      const { message } = await api.solanaSetup(q.quoteId);
      if (message) {
        const signature = await wallet.signSolanaTransaction(message);
        onStep('allow', 'active', 'Confirming on Solana…');
        const { txId } = await api.solanaSend({ quoteId: q.quoteId, message, signature });
        approvalTxs.push(txId);
      }
      onStep('allow', 'done');
    } else onStep('allow', 'skipped', 'Already allowed');
    onStep('sign', 'active');
    userSignature = await wallet.signSolanaMessage(q.solana.orderMessage);
  }
  onStep('sign', 'done', 'Free, no fee');

  onStep('submit', 'active');
  const { position } = await api.closeSubmit(p.id, { quoteId: q.quoteId, userSignature, permitSignature, approvalTxs });
  onStep('submit', 'done', 'Sell placed. It fills in a few seconds.');
  return { position, soldByProtection: false };
}
