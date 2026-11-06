// Read-only Base access for balances and approval receipts.
import { createPublicClient, erc20Abi, formatEther, formatUnits, http } from 'viem';
import { base } from 'viem/chains';

import { USDC, USDC_DECIMALS, WETH } from './constants';

export const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.EXPO_PUBLIC_BASE_RPC_URL || undefined),
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
