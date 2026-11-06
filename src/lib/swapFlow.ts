// Swaps on Base through the Uniswap API (v2 / v3 / v4 pools), from the built-in wallet:
//   quote → approval to Permit2 (first time per token) → Permit2 signature (when asked) → swap transaction.
// Every step goes through the wallet's confirmation sheet; the swap itself also asks for a fingerprint / PIN.
import { formatUnits } from 'viem';

import type { Wallet } from '@/wallet/WalletProvider';

import { api, type SwapSymbol, type UniswapPermit, type UniswapQuote } from './api';
import { waitForTx } from './chain';
import { UNISWAP_ROUTERS } from './constants';

export const SWAP_DECIMALS: Record<SwapSymbol, number> = { ETH: 18, USDC: 6, WETH: 18 };

/** Short human amount: up to 6 decimals, trailing zeros dropped. */
export const swapAmount = (units: string | bigint, symbol: SwapSymbol) => {
  const [i, f = ''] = formatUnits(BigInt(units), SWAP_DECIMALS[symbol]).split('.');
  const frac = f.slice(0, symbol === 'USDC' ? 2 : 6).replace(/0+$/, '');
  return frac ? `${i}.${frac}` : i;
};

/** Uniswap returns Permit2 data as { domain, types, values }; the wallet signs { domain, types, primaryType, message }. */
export function permitJson(p: UniswapPermit) {
  const referenced = new Set(Object.values(p.types).flatMap((fields) => fields.map((f) => f.type.replace(/\[\]$/, ''))));
  const primaryType = Object.keys(p.types).find((t) => t !== 'EIP712Domain' && !referenced.has(t)) ?? 'PermitSingle';
  return JSON.stringify({ domain: p.domain, types: p.types, primaryType, message: p.values });
}

export type SwapStatus = 'approve' | 'permit' | 'build' | 'confirm' | 'pending';

/**
 * Runs a quoted swap. `requote` gets a fresh quote after a first-time approval (the API wants quotes under
 * 30 seconds old, and the approval takes about that long). Returns the swap transaction hash.
 */
export async function runSwap(
  wallet: Wallet,
  first: UniswapQuote,
  requote: () => Promise<UniswapQuote>,
  onStatus: (s: SwapStatus) => void,
) {
  if (!wallet.address) throw new Error('Unlock your wallet first');
  let q = first;
  const sym = q.summary.tokenIn;

  if (q.approval) {
    onStatus('approve');
    const hash = await wallet.sendTransaction({ to: q.approval.to, data: q.approval.data, value: BigInt(q.approval.value || '0') });
    const r = await waitForTx(hash);
    if (r.status !== 'success') throw new Error(`The ${sym} approval failed on Base`);
    q = await requote();
  }

  let signature: string | undefined;
  if (q.permitData) {
    onStatus('permit');
    signature = await wallet.signTypedData(permitJson(q.permitData));
  }

  onStatus('build');
  const tx = await api.uniswapSwap({ quote: q.quote, signature, permitData: signature ? (q.permitData ?? undefined) : undefined });
  if (!UNISWAP_ROUTERS.includes(tx.to.toLowerCase())) throw new Error('Uniswap returned a transaction to an unknown contract. Not sent.');
  const value = BigInt(tx.value || '0');
  // Only an ETH sale sends ETH along, and never more than the quoted input.
  if (value > 0n && (sym !== 'ETH' || value > BigInt(q.summary.amountIn))) throw new Error('The swap asked for more ETH than quoted. Not sent.');

  onStatus('confirm');
  const s = q.summary;
  const hash = await wallet.sendTransaction(
    { to: tx.to, data: tx.data, value },
    {
      auth: 'Confirm this swap',
      swap: {
        sell: `${swapAmount(s.amountIn, s.tokenIn)} ${s.tokenIn}`,
        buy: `${swapAmount(s.amountOut, s.tokenOut)} ${s.tokenOut}`,
        minimum: `${swapAmount(s.minOut, s.tokenOut)} ${s.tokenOut}`,
      },
    },
  );
  onStatus('pending');
  const r = await waitForTx(hash);
  if (r.status !== 'success') throw new Error('The swap failed on Base (price moved past the 0.5% limit?). Nothing was traded.');
  return hash;
}
