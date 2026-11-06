import type { Chain } from '@/lib/constants';
import { isSolanaAddress } from '@/wallet/solanaKeys';

import { FlashError } from './flash';

export const ok = (data: unknown, init?: ResponseInit) => Response.json(data, init);

export function fail(e: unknown) {
  if (e instanceof FlashError) {
    console.warn('[flash]', e.status, e.code, e.message);
    return Response.json(
      { error: `Flash: ${e.message}`, code: e.code, details: e.details ?? null },
      { status: e.status >= 500 ? 502 : e.status },
    );
  }
  const message = e instanceof Error ? e.message : String(e);
  console.warn('[api]', message);
  return Response.json({ error: message }, { status: 400 });
}

export const isAddress = (a: unknown): a is string => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

/** A wallet address on the given chain: 0x… on Base, base58 on Solana. */
export const isAddressOn = (chain: Chain, a: unknown): a is string => (chain === 'solana' ? isSolanaAddress(a) : isAddress(a));

export function parseChain(v: unknown): Chain {
  if (v === undefined || v === null || v === '' || v === 'base') return 'base';
  if (v === 'solana') return 'solana';
  throw new Error('Unknown network');
}
