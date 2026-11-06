// Self-custodial key storage. The recovery phrase / private key lives only on this phone, encrypted by
// SecureStore (Android Keystore, iOS Keychain), and is never sent to the Playbook server.
import { validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { toHex, type Address, type Hex } from 'viem';
import { english, generateMnemonic, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export type SecretKind = 'mnemonic' | 'privateKey';
export type WalletMeta = { address: Address; kind: SecretKind; backedUp: boolean; createdAt: number };
type StoredSecret = { v: 1; kind: SecretKind; mnemonic?: string; privateKey: Hex };
export type SecretInput = { kind: 'mnemonic'; mnemonic: string } | { kind: 'privateKey'; privateKey: Hex };

const SECRET_KEY = 'playbook.wallet.secret';
const META_KEY = 'playbook.wallet.meta';
// Never synced to cloud backups or other devices.
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const WORDLIST = english;
const WORD_SET = new Set<string>(english);
const PK_RE = /^(0x)?[0-9a-fA-F]{64}$/;
const PHRASE_LENGTHS = [12, 15, 18, 21, 24];

/** A fresh 12-word recovery phrase (128 bits of entropy). */
export const newMnemonic = () => generateMnemonic(english);

export const splitWords = (s: string) => s.trim().toLowerCase().split(/\s+/).filter(Boolean);

export type ParsedSecret =
  | ({ ok: true } & SecretInput)
  | { ok: false; reason: string; badWords?: string[] };

/** Accepts a 12–24 word recovery phrase or a 64-hex private key. */
export function parseSecret(input: string): ParsedSecret {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: '' };
  if (PK_RE.test(raw)) {
    const privateKey = (raw.startsWith('0x') ? raw : `0x${raw}`).toLowerCase() as Hex;
    try {
      privateKeyToAccount(privateKey);
    } catch {
      return { ok: false, reason: 'This private key is not valid.' };
    }
    return { ok: true, kind: 'privateKey', privateKey };
  }
  const words = splitWords(raw);
  const badWords = words.filter((w) => !WORD_SET.has(w));
  if (badWords.length) {
    return { ok: false, reason: `Not a recovery word: ${badWords.slice(0, 3).join(', ')}`, badWords };
  }
  if (!PHRASE_LENGTHS.includes(words.length)) {
    return { ok: false, reason: `${words.length} word${words.length === 1 ? '' : 's'} so far. Recovery phrases have 12 or 24 words.` };
  }
  const mnemonic = words.join(' ');
  if (!validateMnemonic(mnemonic, wordlist)) {
    return { ok: false, reason: 'The words are valid but the phrase does not check out. Check the order and spelling.' };
  }
  return { ok: true, kind: 'mnemonic', mnemonic };
}

function derive(secret: SecretInput): { stored: StoredSecret; address: Address } {
  if (secret.kind === 'privateKey') {
    const account = privateKeyToAccount(secret.privateKey);
    return { stored: { v: 1, kind: 'privateKey', privateKey: secret.privateKey }, address: account.address };
  }
  // Default path m/44'/60'/0'/0/0: the same first account MetaMask, Rabby and Rainbow use.
  const account = mnemonicToAccount(secret.mnemonic);
  const pk = account.getHdKey().privateKey;
  if (!pk) throw new Error('Could not derive a key from this phrase');
  return {
    stored: { v: 1, kind: 'mnemonic', mnemonic: secret.mnemonic, privateKey: toHex(pk) },
    address: account.address,
  };
}

/** Let a spinner paint before the (synchronous, CPU-heavy) phrase → key derivation. */
const yieldToUi = () => new Promise((r) => setTimeout(r, 50));

export async function saveWallet(secret: SecretInput, backedUp: boolean) {
  await yieldToUi();
  const { stored, address } = derive(secret);
  const meta: WalletMeta = { address, kind: stored.kind, backedUp, createdAt: Date.now() };
  await SecureStore.setItemAsync(SECRET_KEY, JSON.stringify(stored), OPTS);
  await SecureStore.setItemAsync(META_KEY, JSON.stringify(meta), OPTS);
  return { meta, privateKey: stored.privateKey };
}

export async function loadMeta(): Promise<WalletMeta | null> {
  const raw = await SecureStore.getItemAsync(META_KEY, OPTS);
  return raw ? (JSON.parse(raw) as WalletMeta) : null;
}

export async function saveMeta(meta: WalletMeta) {
  await SecureStore.setItemAsync(META_KEY, JSON.stringify(meta), OPTS);
}

export async function loadSecret(): Promise<StoredSecret | null> {
  const raw = await SecureStore.getItemAsync(SECRET_KEY, OPTS);
  return raw ? (JSON.parse(raw) as StoredSecret) : null;
}

export async function deleteWallet() {
  await SecureStore.deleteItemAsync(SECRET_KEY, OPTS);
  await SecureStore.deleteItemAsync(META_KEY, OPTS);
}

/** True when the phone has a fingerprint, face or PIN/pattern lock to check against. */
export async function deviceHasLock() {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** Fingerprint / face, falling back to the phone's PIN. Phones with no lock at all pass through. */
export async function authenticate(promptMessage: string) {
  if (!(await deviceHasLock())) return true;
  const r = await LocalAuthentication.authenticateAsync({ promptMessage });
  return r.success;
}
