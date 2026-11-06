/// <reference types="node" />
// Server-side Solana: builds the one-time setup transaction (token accounts + Flash delegations)
// and broadcasts it once the wallet has signed. Talks to a Solana RPC over plain JSON-RPC.
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';

import {
  compileLegacyMessage,
  decodeLegacyMessage,
  PROGRAMS,
  SET_COMPUTE_UNIT_LIMIT,
  SET_COMPUTE_UNIT_PRICE,
  wireTransaction,
  type FlashSvmIx,
} from '@/lib/solanaTx';

const RPC = () => process.env.SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com';
/** Enough for two token-account creations and two approvals; priority fee keeps it landing quickly. */
const COMPUTE_UNITS = 150_000;
const PRIORITY_MICRO_LAMPORTS = 100_000;
const ALLOWED_PROGRAMS = new Set([PROGRAMS.computeBudget, PROGRAMS.ata, PROGRAMS.token, PROGRAMS.token2022]);

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json().catch(() => null)) as
    | { result?: T; error?: { message: string; data?: { err?: unknown; logs?: string[] } } }
    | null;
  if (!res.ok || !json || json.error) {
    const detail = json?.error?.data ? JSON.stringify(json.error.data.err ?? '') + (json.error.data.logs ?? []).join(' ') : '';
    throw new Error(friendly(`${json?.error?.message ?? res.statusText} ${detail}`));
  }
  return json.result as T;
}

/** Turns common simulation failures into something a person can act on. */
function friendly(raw: string) {
  if (/AccountNotFound|no record of a prior credit/i.test(raw)) {
    return 'This wallet has no SOL. Add about 0.01 SOL on Solana to pay for the one-time setup.';
  }
  if (/insufficient (funds|lamports)|InsufficientFundsForRent/i.test(raw)) {
    return 'Not enough SOL for the one-time setup (about 0.005 SOL for token accounts plus fees). Add a little SOL.';
  }
  return `Solana: ${raw.trim().slice(0, 300)}`;
}

/** Compiles setup instructions into an unsigned legacy message paid for and signed only by the funder. */
export async function buildSetupMessage(funder: string, ixs: FlashSvmIx[]) {
  for (const ix of ixs) {
    if (!ALLOWED_PROGRAMS.has(ix.programId)) throw new Error(`Unexpected program in setup: ${ix.programId}`);
    for (const a of ix.accounts) if (a.isSigner && a.pubkey !== funder) throw new Error('Setup needs a signer other than the wallet');
  }
  const { value } = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>('getLatestBlockhash', [
    { commitment: 'confirmed' },
  ]);
  const message = compileLegacyMessage(
    funder,
    [SET_COMPUTE_UNIT_LIMIT(COMPUTE_UNITS), SET_COMPUTE_UNIT_PRICE(PRIORITY_MICRO_LAMPORTS), ...ixs],
    value.blockhash,
  );
  return { message, lastValidBlockHeight: value.lastValidBlockHeight };
}

/** Checks the wallet's signature over the message, broadcasts it and waits for confirmation (about 30s max). */
export async function sendSigned(funder: string, message: Uint8Array, signatureBase58: string) {
  const decoded = decodeLegacyMessage(message);
  if (decoded.feePayer !== funder || decoded.signers.length !== 1) throw new Error('This transaction is not from your wallet');
  for (const ix of decoded.instructions) {
    if (!ALLOWED_PROGRAMS.has(ix.programId)) throw new Error(`Unexpected program in setup: ${ix.programId}`);
  }
  const sig = base58.decode(signatureBase58);
  if (sig.length !== 64 || !ed25519.verify(sig, message, base58.decode(funder))) {
    throw new Error('The wallet signature does not match this transaction');
  }
  const txId = await rpc<string>('sendTransaction', [
    wireTransaction(message, [sig]),
    { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 5 },
  ]);
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { value } = await rpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>(
      'getSignatureStatuses',
      [[txId]],
    );
    const st = value[0];
    if (st?.err) throw new Error(`The setup transaction failed on Solana: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return txId;
  }
  throw new Error('The setup transaction is taking long to confirm. Check Positions in a minute, then try again.');
}
