// Read-only Base access for balances and approval receipts.
import { createPublicClient, erc20Abi, formatEther, formatUnits, http } from 'viem';
import { base } from 'viem/chains';

import { SOL_USDC, USDC, USDC_DECIMALS, WETH, WSOL } from './constants';

export const RPC_URL = process.env.EXPO_PUBLIC_BASE_RPC_URL || undefined;

export const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

export async function balancesOf(address: `0x${string}`) {
  const [eth, usdc, weth] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
    publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
  ]);
  return {
    eth: Number(formatEther(eth)),
    usdc: Number(formatUnits(usdc, USDC_DECIMALS)),
    weth: Number(formatEther(weth)),
  };
}

export const waitForTx = (hash: `0x${string}`) =>
  publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });

// ---- Solana JSON-RPC (balances; withdrawals in lib/transfers are broadcast from here too) ----

export const SOLANA_RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/** Plain-language versions of common Solana simulation errors. */
function solanaError(message: string, logs: string[] = []) {
  const all = `${message} ${logs.join(' ')}`;
  if (/no record of a prior credit|AccountNotFound/i.test(all)) return 'This wallet has no SOL for the network fee.';
  if (/insufficient lamports|InsufficientFundsForRent/i.test(all)) return 'Not enough SOL to cover this and the network fee.';
  // SPL Token error 0x1 is InsufficientFunds.
  if (/custom program error: 0x1(?![0-9a-f])|Error: insufficient funds/i.test(all)) return 'Not enough balance for this amount.';
  return message;
}

export async function solRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string; data?: { logs?: string[] } } };
  if (json.error) throw new Error(solanaError(json.error.message, json.error.data?.logs));
  return json.result as T;
}

/** Sum of a wallet's token accounts for one mint (UI amount, decimals applied). */
async function splBalance(owner: string, mint: string) {
  const r = await solRpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }[] }>(
    'getTokenAccountsByOwner',
    [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }],
  );
  return r.value.reduce((s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
}

export async function solBalancesOf(owner: string) {
  const [lamports, usdc, wsol] = await Promise.all([
    solRpc<{ value: number }>('getBalance', [owner, { commitment: 'confirmed' }]),
    splBalance(owner, SOL_USDC),
    splBalance(owner, WSOL),
  ]);
  return { sol: lamports.value / 1e9, usdc, wsol };
}
