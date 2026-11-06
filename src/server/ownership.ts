import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { verifyMessage, type Address, type Hex } from 'viem';

import type { Chain } from '@/lib/constants';
import { ownershipMessage, OWNERSHIP_TTL_MS, type OwnerAction } from '@/lib/ownership';

/** True when `signature` over `message` was made by `address` (EIP-191 on Base, Ed25519 on Solana). */
export async function signedBy(chain: Chain, address: string, message: string, signature: unknown) {
  if (typeof signature !== 'string' || !signature) return false;
  try {
    if (chain === 'solana') {
      const sig = base58.decode(signature);
      return sig.length === 64 && ed25519.verify(sig, new TextEncoder().encode(message), base58.decode(address));
    }
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
    return await verifyMessage({ address: address as Address, message, signature: signature as Hex });
  } catch {
    return false;
  }
}

/** Throws unless the Base wallet signed this action for this address within the last 10 minutes. */
export async function assertOwner(action: OwnerAction, address: string, proof: { time?: unknown; signature?: unknown } | undefined) {
  const time = typeof proof?.time === 'string' ? proof.time : '';
  const at = Date.parse(time);
  if (!at || Math.abs(Date.now() - at) > OWNERSHIP_TTL_MS) throw new Error('Sign again with your wallet to confirm');
  if (!(await signedBy('base', address, ownershipMessage(action, address, time), proof?.signature))) {
    throw new Error('That signature is not from this wallet');
  }
}
