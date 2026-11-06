// Withdrawals from the built-in wallet: send USDC, ETH or WETH on Base, and USDC, SOL or wSOL on Solana.
// Everything here runs on the phone: Base transactions go through viem, Solana transactions are compiled
// locally (lib/solanaTx), signed by the wallet and broadcast to the Solana RPC. No server is involved.
import { base58, base64 } from '@scure/base';
import { encodeFunctionData, erc20Abi, isAddress as isEvmAddress, parseUnits, type Address, type Hex } from 'viem';

import { publicClient, solRpc } from './chain';
import { SOL_DECIMALS, SOL_USDC, USDC, USDC_DECIMALS, WETH, WSOL, type Chain } from './constants';
import {
  associatedTokenAddress,
  compileLegacyMessage,
  PROGRAMS,
  SET_COMPUTE_UNIT_LIMIT,
  SET_COMPUTE_UNIT_PRICE,
  wireTransaction,
  type FlashSvmIx,
} from './solanaTx';
import { isSolanaAddress } from '@/wallet/solanaKeys';

export type SendToken = {
  symbol: string;
  name: string;
  decimals: number;
  /** null = the chain's native coin (ETH on Base, SOL on Solana). */
  address: string | null;
  /** Bought by playbooks: moving it ends the take-profit / stop of open positions on this chain. */
  boughtByPlaybooks?: boolean;
};

export const SEND_TOKENS: Record<Chain, SendToken[]> = {
  base: [
    { symbol: 'USDC', name: 'USD Coin', decimals: USDC_DECIMALS, address: USDC },
    { symbol: 'ETH', name: 'Ether', decimals: 18, address: null },
    { symbol: 'WETH', name: 'Wrapped ETH', decimals: 18, address: WETH, boughtByPlaybooks: true },
  ],
  solana: [
    { symbol: 'USDC', name: 'USD Coin', decimals: USDC_DECIMALS, address: SOL_USDC },
    { symbol: 'SOL', name: 'Solana', decimals: SOL_DECIMALS, address: null },
    { symbol: 'wSOL', name: 'Wrapped SOL', decimals: SOL_DECIMALS, address: WSOL, boughtByPlaybooks: true },
  ],
};

export const isRecipientValid = (chain: Chain, to: string) => (chain === 'solana' ? isSolanaAddress(to) : isEvmAddress(to));

/** Parses a typed amount into base units; null when it is not a positive number with allowed decimals. */
export function toUnits(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!/^\d*\.?\d*$/.test(t) || !t || t === '.') return null;
  const [, frac = ''] = t.split('.');
  if (frac.length > decimals) return null;
  try {
    const v = parseUnits(t, decimals);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

// ---- Balances in base units (exact, for Max and checks) ----

async function solTokenUnits(owner: string, mint: string) {
  const r = await solRpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }>(
    'getTokenAccountsByOwner',
    [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }],
  );
  return r.value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
}

/** Balance of each sendable token, in base units. */
export async function unitBalances(chain: Chain, owner: string): Promise<Record<string, bigint>> {
  if (chain === 'solana') {
    const [lamports, usdc, wsol] = await Promise.all([
      solRpc<{ value: number }>('getBalance', [owner, { commitment: 'confirmed' }]),
      solTokenUnits(owner, SOL_USDC),
      solTokenUnits(owner, WSOL),
    ]);
    return { SOL: BigInt(lamports.value), USDC: usdc, wSOL: wsol };
  }
  const a = owner as Address;
  const [eth, usdc, weth] = await Promise.all([
    publicClient.getBalance({ address: a }),
    publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] }),
    publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: 'balanceOf', args: [a] }),
  ]);
  return { ETH: eth, USDC: usdc, WETH: weth };
}

// ---- Base ----

/** The transaction for a Base send: a plain ETH transfer or an ERC-20 transfer call. */
export function baseSendTx(token: SendToken, to: string, amount: bigint): { to: Address; data: Hex; value: bigint } {
  if (!token.address) return { to: to as Address, data: '0x', value: amount };
  return {
    to: token.address as Address,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to as Address, amount] }),
    value: 0n,
  };
}

/** Largest ETH amount that still leaves room for the transfer's own network fee (with 30% headroom). */
export async function maxEthSendable(owner: string, balance: bigint) {
  const fees = await publicClient.estimateFeesPerGas();
  const fee = (21_000n * (fees.maxFeePerGas ?? 0n) * 13n) / 10n;
  return balance > fee ? balance - fee : 0n;
}

// ---- Solana ----

const SOL_FEE_BUFFER = 20_000n; // lamports: base fee + small priority fee

const u64le = (v: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
};

/** SystemProgram.transfer: instruction 2, lamports as u64. */
const systemTransfer = (from: string, to: string, lamports: bigint): FlashSvmIx => ({
  programId: PROGRAMS.system,
  accounts: [
    { pubkey: from, isSigner: true, isWritable: true },
    { pubkey: to, isSigner: false, isWritable: true },
  ],
  data: base58.encode(Uint8Array.from([2, 0, 0, 0, ...u64le(lamports)])),
});

/** Associated Token Account program, CreateIdempotent (instruction 1): safe if the account already exists. */
const createAtaIdempotent = (payer: string, ata: string, owner: string, mint: string): FlashSvmIx => ({
  programId: PROGRAMS.ata,
  accounts: [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: PROGRAMS.system, isSigner: false, isWritable: false },
    { pubkey: PROGRAMS.token, isSigner: false, isWritable: false },
  ],
  data: base58.encode(Uint8Array.of(1)),
});

/** SPL Token TransferChecked (instruction 12): amount u64 + decimals u8. */
const tokenTransferChecked = (source: string, mint: string, dest: string, owner: string, amount: bigint, decimals: number): FlashSvmIx => ({
  programId: PROGRAMS.token,
  accounts: [
    { pubkey: source, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: dest, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: false },
  ],
  data: base58.encode(Uint8Array.from([12, ...u64le(amount), decimals])),
});

async function accountExists(address: string) {
  const r = await solRpc<{ value: unknown | null }>('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }]);
  return r.value !== null;
}

/** Largest SOL amount sendable: the balance minus the transfer's fee. */
export const maxSolSendable = (lamports: bigint) => (lamports > SOL_FEE_BUFFER ? lamports - SOL_FEE_BUFFER : 0n);

/**
 * Compiles a Solana send, ready to sign. A token send creates the recipient's token account when it is missing
 * (the sender pays its rent, about 0.002 SOL).
 */
export async function buildSolanaSend(owner: string, token: SendToken, to: string, amount: bigint) {
  const ixs: FlashSvmIx[] = [SET_COMPUTE_UNIT_LIMIT(token.address ? 60_000 : 2_000), SET_COMPUTE_UNIT_PRICE(50_000)];
  let createsAccount = false;
  if (!token.address) {
    ixs.push(systemTransfer(owner, to, amount));
  } else {
    const source = associatedTokenAddress(owner, token.address);
    const dest = associatedTokenAddress(to, token.address);
    if (!(await accountExists(dest))) {
      ixs.push(createAtaIdempotent(owner, dest, to, token.address));
      createsAccount = true;
    }
    ixs.push(tokenTransferChecked(source, token.address, dest, owner, amount, token.decimals));
  }
  const { value } = await solRpc<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const message = compileLegacyMessage(owner, ixs, value.blockhash);
  return { message: base64.encode(message), createsAccount };
}

/** Broadcasts a signed Solana message and waits (up to ~45s) for confirmation. Returns the transaction id. */
export async function sendSolanaSigned(messageB64: string, signatureB58: string) {
  const wire = wireTransaction(base64.decode(messageB64), [base58.decode(signatureB58)]);
  const txId = await solRpc<string>('sendTransaction', [wire, { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 5 }]);
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { value } = await solRpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>('getSignatureStatuses', [[txId]]);
    const st = value[0];
    if (st?.err) throw new Error(`The transfer failed on Solana: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return txId;
  }
  return txId; // sent but not yet confirmed; the explorer link will show it
}
