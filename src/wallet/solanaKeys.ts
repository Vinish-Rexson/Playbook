// Solana keys from the same recovery phrase as the Ethereum account, the way MetaMask and Phantom do it:
// BIP-39 seed → SLIP-0010 (ed25519) at m/44'/501'/0'/0'. Pure JS (noble/scure), no native code.
import { ed25519 } from '@noble/curves/ed25519';
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';
import { base58 } from '@scure/base';

/** First Solana account, as shown by Phantom, Solflare and MetaMask for the same phrase. */
export const SOLANA_PATH = "m/44'/501'/0'/0'";

const HARDENED = 0x80000000;
const enc = new TextEncoder();

/** SLIP-0010 ed25519 derivation (hardened indexes only, as the spec requires for ed25519). */
export function slip10Ed25519(seed: Uint8Array, path: string = SOLANA_PATH): Uint8Array {
  const parts = path.split('/');
  if (parts[0] !== 'm') throw new Error('Path must start with m');
  let I = hmac(sha512, enc.encode('ed25519 seed'), seed);
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const p of parts.slice(1)) {
    if (!p.endsWith("'")) throw new Error('ed25519 supports hardened indexes only');
    const index = (Number(p.slice(0, -1)) + HARDENED) >>> 0;
    const data = new Uint8Array(37);
    data.set(key, 1); // 0x00 || key || index (big-endian)
    new DataView(data.buffer).setUint32(33, index, false);
    I = hmac(sha512, chain, data);
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return key;
}

/** 32-byte ed25519 private key (seed) → base58 Solana address. */
export const solanaAddressOf = (secret: Uint8Array) => base58.encode(ed25519.getPublicKey(secret));

export const isSolanaAddress = (a: unknown): a is string => {
  if (typeof a !== 'string' || a.length < 32 || a.length > 44) return false;
  try {
    return base58.decode(a).length === 32;
  } catch {
    return false;
  }
};

/** A base58 64-byte ed25519 signature, the format Flash takes for Solana orders and cancels. */
export const isSolanaSignature = (s: unknown): s is string => {
  if (typeof s !== 'string' || s.length < 64 || s.length > 90) return false;
  try {
    return base58.decode(s).length === 64;
  } catch {
    return false;
  }
};

export type SolanaSigner = {
  address: string;
  /** Ed25519 over the UTF-8 bytes; base58 signature (Flash order and cancel messages). */
  signMessage: (message: string) => string;
  /** Ed25519 over raw bytes (a transaction message); base58 signature. */
  signBytes: (bytes: Uint8Array) => string;
};

export function makeSolanaSigner(secretBase58: string): SolanaSigner {
  const secret = base58.decode(secretBase58);
  if (secret.length !== 32) throw new Error('Invalid Solana key');
  return {
    address: solanaAddressOf(secret),
    signMessage: (message) => base58.encode(ed25519.sign(enc.encode(message), secret)),
    signBytes: (bytes) => base58.encode(ed25519.sign(bytes, secret)),
  };
}
