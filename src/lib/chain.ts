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

// ---- Solana (read-only JSON-RPC; transactions are broadcast by the Playbook server) ----

export const SOLANA_RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function solRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
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
