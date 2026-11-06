// One wallet interface for the whole app, backed by the built-in self-custodial wallet.
// One recovery phrase, two accounts (like MetaMask): Ethereum on Base and Solana. Keys stay on this phone.
import * as SecureStore from 'expo-secure-store';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Address, Hex } from 'viem';

import { base64 } from '@scure/base';

import type { SignRequest, SwapSummary } from './describe';
import {
  addSolanaIfMissing,
  authenticate,
  deleteWallet,
  deviceHasLock,
  loadMeta,
  loadSecret,
  parseSecret,
  saveMeta,
  saveWallet,
  type SecretKind,
  type StoredSecret,
  type WalletMeta,
} from './keys';
import { makeSigner, type Signer } from './signer';
import { makeSolanaSigner, type SolanaSigner } from './solanaKeys';
import { SignSheet } from './SignSheet';

export type WalletMode = 'live';
/** loading → none (onboarding) | locked (unlock screen) | unlocked (live) */
export type WalletStatus = 'loading' | 'none' | 'locked' | 'unlocked';

export type Wallet = {
  ready: boolean;
  status: WalletStatus;
  mode: WalletMode | null;
  /** Ethereum account (Base). Also the creator identity for published playbooks. */
  address: Address | null;
  /** Solana account from the same phrase; null for wallets imported from an Ethereum private key. */
  solAddress: string | null;
  meta: WalletMeta | null;
  deviceSecure: boolean;
  createWallet: (mnemonic: string, backedUp: boolean) => Promise<void>;
  importWallet: (input: string) => Promise<void>;
  unlock: () => Promise<boolean>;
  lock: () => void;
  revealSecret: () => Promise<{ kind: SecretKind; value: string } | null>;
  markBackedUp: () => Promise<void>;
  removeWallet: () => Promise<boolean>;
  signTypedData: (json: string) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  /**
   * Base transaction (value: ETH in wei). `opts.auth` adds a fingerprint / PIN check after the user confirms
   * the sheet, used for withdrawals.
   */
  sendTransaction: (tx: { to: string; data: string; value?: bigint }, opts?: SendOpts) => Promise<Hex>;
  /** Solana: Ed25519 over a UTF-8 message (Flash orders and cancels); base58 signature. */
  signSolanaMessage: (message: string) => Promise<string>;
  /** Solana: signs a base64 transaction message after the user confirms it; base58 signature. */
  signSolanaTransaction: (messageB64: string, opts?: SendOpts & { recipient?: string }) => Promise<string>;
};

/**
 * auth: prompt shown for the fingerprint / PIN check after the sheet is confirmed.
 * swap: the Uniswap quote, shown on the sheet when the transaction calls the Uniswap Universal Router.
 */
type SendOpts = { auth?: string; swap?: SwapSummary };

const WalletContext = createContext<Wallet | null>(null);

export function useWallet() {
  const w = useContext(WalletContext);
  if (!w) throw new Error('useWallet must be used inside WalletProvider');
  return w;
}

// Keys from the old Paper mode; cleared on launch.
const LEGACY_KEYS = ['playbook.paperAddress', 'playbook.mode'];
/** Lock again when the app comes back after this long in the background. */
const AUTO_LOCK_MS = 5 * 60_000;

type Pending = { id: number; req: SignRequest; resolve: () => void; reject: (e: Error) => void };
let nextRequestId = 1;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<WalletMeta | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deviceSecure, setDeviceSecure] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  // Unlocked keys live only in memory, never in React state or storage outside SecureStore.
  const signer = useRef<Signer | null>(null);
  const solSigner = useRef<SolanaSigner | null>(null);

  useEffect(() => {
    (async () => {
      const [m, secure] = await Promise.all([loadMeta().catch(() => null), deviceHasLock()]);
      setMeta(m);
      setDeviceSecure(secure);
      LEGACY_KEYS.forEach((k) => SecureStore.deleteItemAsync(k).catch(() => {}));
      setLoaded(true);
    })();
  }, []);

  const forget = useCallback(() => {
    signer.current = null;
    solSigner.current = null;
  }, []);

  useEffect(() => {
    let hiddenAt = 0;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') hiddenAt = Date.now();
      if (s === 'active') {
        if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS && signer.current) {
          forget();
          setUnlocked(false);
        }
        hiddenAt = 0;
      }
    });
    return () => sub.remove();
  }, [forget]);

  const status: WalletStatus = !loaded ? 'loading' : meta ? (unlocked ? 'unlocked' : 'locked') : 'none';
  const mode: WalletMode | null = status === 'unlocked' ? 'live' : null;
  const address: Address | null = meta ? meta.address : null;
  const solAddress: string | null = meta?.solAddress ?? null;

  const activate = useCallback((m: WalletMeta, stored: StoredSecret) => {
    signer.current = makeSigner(stored.privateKey);
    solSigner.current = stored.solSecret ? makeSolanaSigner(stored.solSecret) : null;
    setMeta(m);
    setUnlocked(true);
  }, []);

  const confirm = useCallback(
    (req: SignRequest) =>
      new Promise<void>((resolve, reject) => setPending({ id: nextRequestId++, req, resolve, reject })),
    [],
  );

  const value = useMemo<Wallet>(() => {
    const live = () => {
      const s = signer.current;
      if (!s) throw new Error('Unlock your wallet first.');
      return s;
    };
    const sol = () => {
      const s = solSigner.current;
      if (!s) throw new Error(signer.current ? 'This wallet has no Solana account.' : 'Unlock your wallet first.');
      return s;
    };
    return {
      ready: loaded,
      status,
      mode,
      address,
      solAddress,
      meta,
      deviceSecure,
      createWallet: async (mnemonic, backedUp) => {
        const r = await saveWallet({ kind: 'mnemonic', mnemonic }, backedUp);
        activate(r.meta, r.stored);
      },
      importWallet: async (input) => {
        const p = parseSecret(input);
        if (!p.ok) throw new Error(p.reason || 'Enter a recovery phrase or private key');
        const r = await saveWallet(p, true);
        activate(r.meta, r.stored);
      },
      unlock: async () => {
        if (!(await authenticate('Unlock your Playbook wallet'))) return false;
        const s = await loadSecret();
        if (!s || !meta) throw new Error('The wallet key is missing from this phone. Import it again with your recovery phrase.');
        // Wallets made before Solana support get their Solana account here, once.
        const r = await addSolanaIfMissing(s, meta);
        activate(r.meta, r.stored);
        return true;
      },
      lock: () => {
        forget();
        setUnlocked(false);
      },
      revealSecret: async () => {
        if (!(await authenticate('Show your recovery phrase'))) return null;
        const s = await loadSecret();
        if (!s) return null;
        return s.kind === 'mnemonic' && s.mnemonic
          ? { kind: 'mnemonic', value: s.mnemonic }
          : { kind: 'privateKey', value: s.privateKey };
      },
      markBackedUp: async () => {
        if (!meta) return;
        const m = { ...meta, backedUp: true };
        await saveMeta(m);
        setMeta(m);
      },
      removeWallet: async () => {
        if (!(await authenticate('Remove the wallet from this phone'))) return false;
        await deleteWallet();
        forget();
        setUnlocked(false);
        setMeta(null);
        return true;
      },
      signTypedData: async (json) => {
        const s = live();
        await confirm({ kind: 'typedData', json });
        return s.signTypedData(json);
      },
      signMessage: async (message) => {
        const s = live();
        await confirm({ kind: 'message', message });
        return s.signMessage(message);
      },
      sendTransaction: async (tx, opts) => {
        const s = live();
        await confirm({ kind: 'transaction', to: tx.to as Address, data: tx.data as Hex, value: tx.value ? tx.value.toString() : undefined, swap: opts?.swap });
        if (opts?.auth && !(await authenticate(opts.auth))) throw new Error('Not confirmed with your fingerprint or PIN.');
        return s.sendTransaction(tx);
      },
      signSolanaMessage: async (message) => {
        const s = sol();
        await confirm({ kind: 'solMessage', message });
        return s.signMessage(message);
      },
      signSolanaTransaction: async (messageB64, opts) => {
        const s = sol();
        await confirm({ kind: 'solTransaction', message: messageB64, recipient: opts?.recipient });
        if (opts?.auth && !(await authenticate(opts.auth))) throw new Error('Not confirmed with your fingerprint or PIN.');
        return s.signBytes(base64.decode(messageB64));
      },
    };
  }, [loaded, status, mode, address, solAddress, meta, deviceSecure, activate, confirm, forget]);

  return (
    <WalletContext.Provider value={value}>
      {children}
      <SignSheet
        request={pending}
        from={status === 'unlocked' ? address : null}
        solFrom={status === 'unlocked' ? solAddress : null}
        onApprove={() => {
          pending?.resolve();
          setPending(null);
        }}
        onReject={() => {
          pending?.reject(new Error('You rejected the request in your wallet.'));
          setPending(null);
        }}
      />
    </WalletContext.Provider>
  );
}
