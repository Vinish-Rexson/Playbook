// Turns raw wallet requests into a plain-language summary for the confirmation sheet.
import { decodeFunctionData, erc20Abi, formatUnits, maxUint256, type Address, type Hex } from 'viem';

import { base64 } from '@scure/base';

import {
  FLASH_SOLANA_DELEGATE,
  SOL_DECIMALS,
  SOL_USDC,
  TOKEN_ACCOUNT_RENT_SOL,
  USDC,
  USDC_DECIMALS,
  WETH,
  WSOL,
} from '@/lib/constants';
import { shortAddr } from '@/lib/pricing';
import { associatedTokenAddress, decodeLegacyMessage, messageFeeLamports, PROGRAMS } from '@/lib/solanaTx';

import { parseTypedData } from './typedData';

export type SignRequest =
  /** value: ETH sent, in wei, as a decimal string (plain ETH transfers). */
  | { kind: 'transaction'; to: Address; data: Hex; value?: string }
  | { kind: 'typedData'; json: string }
  | { kind: 'message'; message: string }
  /** Solana: Ed25519 over a UTF-8 message (Flash order or cancel). */
  | { kind: 'solMessage'; message: string }
  /**
   * Solana: a base64 legacy transaction message to sign (the one-time setup, or a send). `recipient` is the
   * wallet the app intends to pay; the sheet checks the decoded transaction really pays it.
   */
  | { kind: 'solTransaction'; message: string; recipient?: string };

export const isSolanaRequest = (r: SignRequest) => r.kind === 'solMessage' || r.kind === 'solTransaction';

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

function describeTx(to: Address, data: Hex, value?: string): Described {
  const token = TOKENS[to.toLowerCase()];
  const wei = value ? BigInt(value) : 0n;
  if ((data === '0x' || !data) && wei > 0n) {
    return {
      icon: 'approve',
      label: 'Transaction · Base',
      title: `Send ${formatUnits(wei, 18)} ETH`,
      subtitle: 'Sends ETH from this wallet. Transfers cannot be reversed, so check the address.',
      rows: [
        { k: 'Amount', v: `${formatUnits(wei, 18)} ETH` },
        { k: 'To', v: shortAddr(to) },
        { k: 'Network', v: 'Base' },
      ],
    };
  }
  try {
    const call = decodeFunctionData({ abi: erc20Abi, data });
    if (call.functionName === 'transfer') {
      const [recipient, amount] = call.args;
      const sym = token?.symbol ?? shortAddr(to);
      return {
        icon: 'approve',
        label: 'Transaction · Base',
        title: `Send ${formatUnits(amount, token?.decimals ?? 18)} ${sym}`,
        subtitle: 'Sends tokens from this wallet. Transfers cannot be reversed, so check the address.',
        rows: [
          { k: 'Amount', v: `${formatUnits(amount, token?.decimals ?? 18)} ${sym}` },
          { k: 'To', v: shortAddr(recipient) },
          { k: 'Network', v: 'Base' },
        ],
        warning: token ? undefined : 'This is not a token Playbook knows. Only confirm if you started it.',
      };
    }
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

const SOL_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [SOL_USDC]: { symbol: 'USDC', decimals: USDC_DECIMALS },
  [WSOL]: { symbol: 'wSOL', decimals: SOL_DECIMALS },
};

/** Flash's Solana order message: "DFS|m=<spent mint>|t=<total in base units>|h=<hash>" (Solana Overview docs). */
function describeSolMessage(message: string): Described {
  const order = /^DFS\|m=([1-9A-HJ-NP-Za-km-z]+)\|t=(\d+)\|h=/.exec(message);
  if (order) {
    const tok = SOL_TOKENS[order[1]];
    const amount = tok ? `${(Number(order[2]) / 10 ** tok.decimals).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${tok.symbol}` : `${order[2]} units`;
    const sellsBought = order[1] === WSOL;
    return {
      icon: 'sign',
      label: 'Signature request · Solana',
      title: sellsBought ? 'Sign take-profit + stop-loss' : 'Sign order',
      subtitle: sellsBought
        ? 'Lets Definitive Flash sell up to this much SOL when your take-profit or stop-loss price is reached. Free, no fee.'
        : 'Authorizes Definitive Flash to spend up to this amount at your playbook prices. Free, no fee.',
      rows: [
        { k: 'App', v: 'Definitive Flash' },
        { k: sellsBought ? 'Sells up to' : 'Spends up to', v: amount },
        { k: 'Token', v: tok?.symbol ?? shortAddr(order[1]) },
        { k: 'Network', v: 'Solana' },
      ],
    };
  }
  if (message.startsWith('Definitive Flash v1 — Cancel Order')) {
    return {
      icon: 'message',
      label: 'Signature request · Solana',
      title: 'Cancel order',
      subtitle: 'Asks Definitive Flash to cancel this waiting order. Free, moves no funds.',
      rows: [{ k: 'Order', v: message.split('Order: ')[1] ?? '' }],
    };
  }
  return {
    icon: 'message',
    label: 'Signature request · Solana',
    title: 'Sign message',
    subtitle: 'Proves you own this wallet. Free, moves no funds.',
    rows: [],
  };
}

/** What the setup transaction costs: network fee plus rent for any token accounts it creates. */
export function solanaTxCost(messageB64: string) {
  const m = decodeLegacyMessage(base64.decode(messageB64));
  const created = m.instructions.filter((i) => i.programId === PROGRAMS.ata).length;
  const feeSol = messageFeeLamports(m) / 1e9;
  const rentSol = created * TOKEN_ACCOUNT_RENT_SOL;
  // SOL leaving the wallet in plain transfers (SystemProgram.transfer = instruction 2, lamports u64 at byte 4).
  const sentSol =
    m.instructions
      .filter((i) => i.programId === PROGRAMS.system && i.data[0] === 2 && i.accounts[0]?.pubkey === m.feePayer)
      .reduce((sum, i) => sum + Number(new DataView(i.data.buffer, i.data.byteOffset, i.data.byteLength).getBigUint64(4, true)), 0) / 1e9;
  return { feeSol, rentSol, sentSol, totalSol: feeSol + rentSol + sentSol, payer: m.feePayer };
}

function describeSolTransaction(messageB64: string, recipient?: string): Described {
  try {
    const m = decodeLegacyMessage(base64.decode(messageB64));
    const owner = m.feePayer;
    const ataOf = new Map(
      [SOL_USDC, WSOL].map((mint) => [associatedTokenAddress(owner, mint), SOL_TOKENS[mint].symbol] as const),
    );
    const rows: { k: string; v: string }[] = [];
    let unknown = false;
    let send: string | null = null;
    const dv = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength);
    for (const ix of m.instructions) {
      if (ix.programId === PROGRAMS.computeBudget) continue;
      if (ix.programId === PROGRAMS.system && ix.data[0] === 2) {
        const sol = Number(dv(ix.data).getBigUint64(4, true)) / 1e9;
        const to = ix.accounts[1]?.pubkey ?? '';
        send = `Send ${sol} SOL`;
        rows.push({ k: 'Amount', v: `${sol} SOL` }, { k: 'To', v: shortAddr(to) });
        if (recipient && to !== recipient) unknown = true;
      } else if ((ix.programId === PROGRAMS.token || ix.programId === PROGRAMS.token2022) && ix.data[0] === 12) {
        const [, mintAcc, dest] = ix.accounts;
        const mint = mintAcc?.pubkey ?? '';
        const tok = SOL_TOKENS[mint];
        const amount = Number(dv(ix.data).getBigUint64(1, true)) / 10 ** ix.data[9];
        const sym = tok?.symbol ?? shortAddr(mint);
        send = `Send ${amount} ${sym}`;
        // The destination is the recipient's token account; confirm it belongs to the intended wallet.
        const paysRecipient = !!recipient && associatedTokenAddress(recipient, mint) === dest?.pubkey;
        rows.push({ k: 'Amount', v: `${amount} ${sym}` }, { k: 'To', v: paysRecipient ? shortAddr(recipient) : `token account ${shortAddr(dest?.pubkey)}` });
        if (!paysRecipient) unknown = true;
      } else if (ix.programId === PROGRAMS.ata) {
        const mint = ix.accounts[3]?.pubkey ?? '';
        const forOwner = ix.accounts[2]?.pubkey;
        rows.push({
          k: forOwner && forOwner !== owner ? `Create recipient's ${SOL_TOKENS[mint]?.symbol ?? shortAddr(mint)} account` : `Create ${SOL_TOKENS[mint]?.symbol ?? shortAddr(mint)} account`,
          v: 'Token account',
        });
      } else if ((ix.programId === PROGRAMS.token || ix.programId === PROGRAMS.token2022) && ix.data[0] === 4) {
        const [source, delegate] = ix.accounts;
        const who = delegate?.pubkey === FLASH_SOLANA_DELEGATE ? 'Definitive Flash' : shortAddr(delegate?.pubkey);
        rows.push({ k: `Allow ${ataOf.get(source?.pubkey) ?? shortAddr(source?.pubkey)} trading`, v: who });
        if (delegate?.pubkey !== FLASH_SOLANA_DELEGATE) unknown = true;
      } else {
        rows.push({ k: 'Call', v: shortAddr(ix.programId) });
        unknown = true;
      }
    }
    if (send) {
      return {
        icon: 'approve',
        label: 'Transaction · Solana',
        title: send,
        subtitle: 'Sends from this wallet. Transfers cannot be reversed, so check the address.',
        rows: [...rows, { k: 'Network', v: 'Solana' }],
        warning: unknown ? 'This transfer does not match the address you entered. Do not confirm it.' : undefined,
      };
    }
    return {
      icon: 'approve',
      label: 'Transaction · Solana',
      title: 'One-time setup',
      subtitle:
        'Creates the token accounts this trade needs and lets Definitive Flash trade USDC and SOL for you. Only needed the first time.',
      rows,
      warning: unknown ? 'This transaction does something Playbook did not expect. Only confirm if you started it.' : undefined,
    };
  } catch {
    return { icon: 'approve', label: 'Transaction · Solana', title: 'Solana transaction', subtitle: 'Could not read this transaction.', rows: [], warning: 'Only confirm transactions you started in Playbook.' };
  }
}

export function describe(req: SignRequest): Described {
  if (req.kind === 'solMessage') return describeSolMessage(req.message);
  if (req.kind === 'solTransaction') return describeSolTransaction(req.message, req.recipient);
  if (req.kind === 'transaction') return describeTx(req.to, req.data, req.value);
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
