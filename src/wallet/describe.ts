// Turns raw wallet requests into a plain-language summary for the confirmation sheet.
import { decodeFunctionData, erc20Abi, formatUnits, maxUint256, type Address, type Hex } from 'viem';

import { USDC, USDC_DECIMALS, WETH } from '@/lib/constants';
import { shortAddr } from '@/lib/pricing';

import { parseTypedData } from './typedData';

export type SignRequest =
  | { kind: 'transaction'; to: Address; data: Hex }
  | { kind: 'typedData'; json: string }
  | { kind: 'message'; message: string };

export type Described = {
  icon: 'approve' | 'sign' | 'message';
  label: string;
  title: string;
  subtitle: string;
  rows: { k: string; v: string }[];
  warning?: string;
};

const PERMIT2 = '0x000000000022d473030f116ddee9f6b43ac78ba3';
// Spender in Flash's approveTx and verifyingContract of its order payloads on Base (seen in live quotes).
const FLASH_ALLOWANCE = '0x5d00000873b6bf41539e6f5365b0ff7d3c368f78';

const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [USDC.toLowerCase()]: { symbol: 'USDC', decimals: USDC_DECIMALS },
  [WETH.toLowerCase()]: { symbol: 'WETH', decimals: 18 },
};

const nameOf = (addr: string) => {
  const a = addr.toLowerCase();
  if (a === FLASH_ALLOWANCE) return 'Definitive Flash';
  if (a === PERMIT2) return 'Permit2 (Uniswap)';
  return TOKENS[a]?.symbol ?? shortAddr(addr);
};

function describeTx(to: Address, data: Hex): Described {
  const token = TOKENS[to.toLowerCase()];
  try {
    const call = decodeFunctionData({ abi: erc20Abi, data });
    if (call.functionName === 'approve') {
      const [spender, amount] = call.args;
      const sym = token?.symbol ?? shortAddr(to);
      const unlimited = amount >= maxUint256 / 2n;
      return {
        icon: 'approve',
        label: 'Transaction',
        title: `Allow ${sym}`,
        subtitle: 'One-time approval so Definitive Flash can trade this token for you. Costs a small ETH network fee.',
        rows: [
          { k: 'Token', v: sym },
          { k: 'Spender', v: nameOf(spender) },
          { k: 'Amount', v: unlimited ? 'Unlimited' : `${formatUnits(amount, token?.decimals ?? 18)} ${sym}` },
          { k: 'Network', v: 'Base' },
        ],
      };
    }
  } catch {
    // Not an ERC-20 call; fall through to the generic view.
  }
  return {
    icon: 'approve',
    label: 'Transaction',
    title: 'Send transaction',
    subtitle: 'A contract call on Base. Costs a small ETH network fee.',
    rows: [
      { k: 'To', v: nameOf(to) },
      { k: 'Data', v: `${data.slice(0, 10)}… (${(data.length - 2) / 2} bytes)` },
      { k: 'Network', v: 'Base' },
    ],
    warning: token ? undefined : 'Only confirm calls you started in Playbook.',
  };
}

const scalar = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

function fmtValue(v: unknown) {
  const s = String(v);
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return nameOf(s);
  if (s.length > 22) return `${s.slice(0, 10)}…${s.slice(-6)}`;
  return s;
}

const humanize = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function describeTypedData(json: string): Described {
  const td = parseTypedData(json);
  const app = typeof td.domain.name === 'string' ? td.domain.name : 'Unknown app';
  const isPermit = /permit/i.test(app) || /permit/i.test(td.primaryType);
  const fields = Object.entries(td.message)
    .filter(([, v]) => scalar(v))
    .slice(0, 4)
    .map(([k, v]) => ({ k: humanize(k), v: fmtValue(v) }));
  return {
    icon: 'sign',
    label: 'Signature request',
    title: isPermit ? 'Permit token spending' : 'Sign order',
    subtitle: isPermit
      ? 'Lets the order pull exactly what it needs from your wallet. Free, no gas.'
      : 'Authorizes Definitive Flash to fill this order at your prices. Free, no gas.',
    rows: [
      { k: 'App', v: app },
      ...(typeof td.domain.verifyingContract === 'string' ? [{ k: 'Contract', v: nameOf(td.domain.verifyingContract) }] : []),
      { k: 'Type', v: td.primaryType },
      ...fields,
    ],
    warning: td.domain.chainId !== undefined && td.domain.chainId !== 8453 ? `This is for chain ${td.domain.chainId}, not Base.` : undefined,
  };
}

export function describe(req: SignRequest): Described {
  if (req.kind === 'transaction') return describeTx(req.to, req.data);
  if (req.kind === 'typedData') {
    try {
      return describeTypedData(req.json);
    } catch {
      return { icon: 'sign', label: 'Signature request', title: 'Sign data', subtitle: 'Could not read this request.', rows: [] };
    }
  }
  return {
    icon: 'message',
    label: 'Signature request',
    title: 'Sign message',
    subtitle: 'Proves you own this wallet. Free, no gas, moves no funds.',
    rows: [],
  };
}
