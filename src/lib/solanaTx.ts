// Minimal Solana legacy-transaction encoding and decoding (no web3 library needed).
// The server compiles the one-time setup transaction; the app decodes it again before signing
// so the confirmation sheet shows exactly what the bytes do.
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { base58, base64 } from '@scure/base';

export type SolAccountMeta = { pubkey: string; isSigner: boolean; isWritable: boolean };
/** Instruction shape Flash returns (svm.ataSetupIxs, svm.delegateIx): data is base58. */
export type FlashSvmIx = { programId: string; accounts: SolAccountMeta[]; data: string };
export type DecodedIx = { programId: string; accounts: SolAccountMeta[]; data: Uint8Array };
export type DecodedMessage = {
  feePayer: string;
  signers: string[];
  blockhash: string;
  instructions: DecodedIx[];
};

export const PROGRAMS = {
  system: '11111111111111111111111111111111',
  computeBudget: 'ComputeBudget111111111111111111111111111111',
  token: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  token2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  ata: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
};

function compactU16(n: number) {
  const out: number[] = [];
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    if (!n) {
      out.push(b);
      return out;
    }
    out.push(b | 0x80);
  }
}

/** Compiles a legacy message: fee payer first, then signers, then writable, then read-only accounts. */
export function compileLegacyMessage(feePayer: string, ixs: FlashSvmIx[], recentBlockhash: string): Uint8Array {
  const metas = new Map<string, { signer: boolean; writable: boolean }>();
  const add = (k: string, signer: boolean, writable: boolean) => {
    const m = metas.get(k);
    metas.set(k, { signer: (m?.signer ?? false) || signer, writable: (m?.writable ?? false) || writable });
  };
  add(feePayer, true, true);
  for (const ix of ixs) {
    for (const a of ix.accounts) add(a.pubkey, a.isSigner, a.isWritable);
    add(ix.programId, false, false);
  }
  const all = [...metas.entries()];
  const group = (s: boolean, w: boolean) => all.filter(([k, m]) => k !== feePayer && m.signer === s && m.writable === w).map(([k]) => k);
  const keys = [feePayer, ...group(true, true), ...group(true, false), ...group(false, true), ...group(false, false)];
  const index = new Map(keys.map((k, i) => [k, i]));
  const numSigners = 1 + group(true, true).length + group(true, false).length;

  const bytes: number[] = [numSigners, group(true, false).length, group(false, false).length];
  bytes.push(...compactU16(keys.length));
  for (const k of keys) {
    const raw = base58.decode(k);
    if (raw.length !== 32) throw new Error(`Bad account ${k}`);
    bytes.push(...raw);
  }
  const bh = base58.decode(recentBlockhash);
  if (bh.length !== 32) throw new Error('Bad blockhash');
  bytes.push(...bh);
  bytes.push(...compactU16(ixs.length));
  for (const ix of ixs) {
    const data = base58.decode(ix.data);
    bytes.push(index.get(ix.programId)!);
    bytes.push(...compactU16(ix.accounts.length));
    for (const a of ix.accounts) bytes.push(index.get(a.pubkey)!);
    bytes.push(...compactU16(data.length));
    bytes.push(...data);
  }
  return Uint8Array.from(bytes);
}

/** Decodes a legacy message (the setup transactions here never use versioned messages). */
export function decodeLegacyMessage(msg: Uint8Array): DecodedMessage {
  let o = 0;
  const u16 = () => {
    let v = 0;
    let s = 0;
    for (;;) {
      const b = msg[o++];
      v |= (b & 0x7f) << s;
      if (!(b & 0x80)) return v;
      s += 7;
    }
  };
  if (msg[0] & 0x80) throw new Error('Versioned transactions are not supported here');
  const [numSigners, roSigned, roUnsigned] = [msg[o++], msg[o++], msg[o++]];
  const n = u16();
  const keys: string[] = [];
  for (let i = 0; i < n; i++, o += 32) keys.push(base58.encode(msg.slice(o, o + 32)));
  const blockhash = base58.encode(msg.slice(o, o + 32));
  o += 32;
  const isSigner = (i: number) => i < numSigners;
  const isWritable = (i: number) => (i < numSigners ? i < numSigners - roSigned : i < n - roUnsigned);
  const instructions: DecodedIx[] = [];
  const count = u16();
  for (let i = 0; i < count; i++) {
    const programId = keys[msg[o++]];
    const na = u16();
    const accounts: SolAccountMeta[] = [];
    for (let j = 0; j < na; j++) {
      const k = msg[o++];
      accounts.push({ pubkey: keys[k], isSigner: isSigner(k), isWritable: isWritable(k) });
    }
    const dl = u16();
    instructions.push({ programId, accounts, data: msg.slice(o, o + dl) });
    o += dl;
  }
  if (o !== msg.length) throw new Error('Unexpected bytes after the instructions');
  return { feePayer: keys[0], signers: keys.slice(0, numSigners), blockhash, instructions };
}

/** Wire format: compact signature count, the signatures, then the message. */
export function wireTransaction(message: Uint8Array, signatures: Uint8Array[]): string {
  const head = compactU16(signatures.length);
  const out = new Uint8Array(head.length + 64 * signatures.length + message.length);
  out.set(head, 0);
  signatures.forEach((s, i) => out.set(s, head.length + 64 * i));
  out.set(message, head.length + 64 * signatures.length);
  return base64.encode(out);
}

const onCurve = (b: Uint8Array) => {
  try {
    ed25519.ExtendedPoint.fromHex(b);
    return true;
  } catch {
    return false;
  }
};

/** Program-derived address (findProgramAddress): highest bump whose hash is off the ed25519 curve. */
export function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const tag = new TextEncoder().encode('ProgramDerivedAddress');
  const pid = base58.decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), pid, tag];
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      buf.set(p, o);
      o += p.length;
    }
    const h = sha256(buf);
    if (!onCurve(h)) return base58.encode(h);
  }
  throw new Error('No program address found');
}

/** The wallet's associated token account for a mint (classic SPL Token program). */
export const associatedTokenAddress = (owner: string, mint: string) =>
  findProgramAddress([base58.decode(owner), base58.decode(PROGRAMS.token), base58.decode(mint)], PROGRAMS.ata);

/** Network fee of a single-signer message: 5000 lamports base + compute-unit price × limit. */
export function messageFeeLamports(m: DecodedMessage) {
  let units = 200_000 * m.instructions.filter((i) => i.programId !== PROGRAMS.computeBudget).length;
  let microLamports = 0n;
  for (const ix of m.instructions) {
    if (ix.programId !== PROGRAMS.computeBudget) continue;
    const dv = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    if (ix.data[0] === 2) units = dv.getUint32(1, true);
    if (ix.data[0] === 3) microLamports = dv.getBigUint64(1, true);
  }
  return 5000 * m.signers.length + Number((BigInt(units) * microLamports + 999_999n) / 1_000_000n);
}

export const SET_COMPUTE_UNIT_LIMIT = (units: number): FlashSvmIx => {
  const d = new Uint8Array(5);
  d[0] = 2;
  new DataView(d.buffer).setUint32(1, units, true);
  return { programId: PROGRAMS.computeBudget, accounts: [], data: base58.encode(d) };
};

export const SET_COMPUTE_UNIT_PRICE = (microLamports: number): FlashSvmIx => {
  const d = new Uint8Array(9);
  d[0] = 3;
  new DataView(d.buffer).setBigUint64(1, BigInt(microLamports), true);
  return { programId: PROGRAMS.computeBudget, accounts: [], data: base58.encode(d) };
};
