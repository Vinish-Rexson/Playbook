// One wallet interface for the whole app, backed by either a Privy embedded wallet (live trades on
// Base) or Paper mode (simulated fills, no funds, for judges and dry runs).
import { PrivyProvider, useEmbeddedEthereumWallet, usePrivy } from '@privy-io/expo';
import * as SecureStore from 'expo-secure-store';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { base } from 'viem/chains';

import { CHAIN_ID_HEX } from '@/lib/constants';

import { normalizeTypedData } from './typedData';

export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? '';
export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '';
export const privyEnabled = PRIVY_APP_ID.length > 0;

export type WalletMode = 'privy' | 'paper';

export type Wallet = {
  privyEnabled: boolean;
  ready: boolean;
  mode: WalletMode | null;
  address: `0x${string}` | null;
  enterPaper: () => Promise<void>;
  logout: () => Promise<void>;
  signTypedData: (json: string) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  sendTransaction: (tx: { to: string; data: string }) => Promise<`0x${string}`>;
};

const WalletContext = createContext<Wallet | null>(null);

export function useWallet() {
  const w = useContext(WalletContext);
  if (!w) throw new Error('useWallet must be used inside WalletProvider');
  return w;
}

type PrivyBits = {
  ready: boolean;
  address: `0x${string}` | null;
  logout: () => Promise<void>;
  request: ((method: string, params: unknown[]) => Promise<any>) | null;
};

// Providers already switched to Base (module scope: survives re-renders, no mutation in render).
const switchedProviders = new WeakSet<object>();

const PAPER_KEY = 'playbook.paperAddress';
const MODE_KEY = 'playbook.mode';

function randomAddress(): `0x${string}` {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function CoreWallet({ privy, children }: { privy: PrivyBits | null; children: ReactNode }) {
  const [paperAddress, setPaperAddress] = useState<`0x${string}` | null>(null);
  const [paperOn, setPaperOn] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [addr, mode] = await Promise.all([
        SecureStore.getItemAsync(PAPER_KEY),
        SecureStore.getItemAsync(MODE_KEY),
      ]);
      if (addr) setPaperAddress(addr as `0x${string}`);
      setPaperOn(mode === 'paper');
      setLoaded(true);
    })();
  }, []);

  const enterPaper = useCallback(async () => {
    let addr = paperAddress;
    if (!addr) {
      addr = randomAddress();
      await SecureStore.setItemAsync(PAPER_KEY, addr);
      setPaperAddress(addr);
    }
    await SecureStore.setItemAsync(MODE_KEY, 'paper');
    setPaperOn(true);
  }, [paperAddress]);

  const mode: WalletMode | null = privy?.address ? 'privy' : paperOn && paperAddress ? 'paper' : null;
  const address = mode === 'privy' ? privy!.address : mode === 'paper' ? paperAddress : null;

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(MODE_KEY);
    setPaperOn(false);
    if (privy?.address) await privy.logout();
  }, [privy]);

  const needLive = useCallback(() => {
    if (mode !== 'privy' || !privy?.request || !address) {
      throw new Error('Paper mode cannot sign real orders. Log in with email to trade live.');
    }
    return { request: privy.request, address };
  }, [mode, privy, address]);

  const value = useMemo<Wallet>(
    () => ({
      privyEnabled,
      ready: loaded && (privy ? privy.ready : true),
      mode,
      address,
      enterPaper,
      logout,
      signTypedData: async (json) => {
        const w = needLive();
        return w.request('eth_signTypedData_v4', [w.address, normalizeTypedData(json)]);
      },
      signMessage: async (message) => {
        const w = needLive();
        return w.request('personal_sign', [message, w.address]);
      },
      sendTransaction: async (tx) => {
        const w = needLive();
        return w.request('eth_sendTransaction', [{ from: w.address, to: tx.to, data: tx.data, value: '0x0' }]);
      },
    }),
    [loaded, privy, mode, address, enterPaper, logout, needLive],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function PrivyBridge({ children }: { children: ReactNode }) {
  const { user, isReady, logout } = usePrivy();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const embedded = wallets[0];

  // createOnLogin covers new users; this also covers older users who never got a wallet.
  useEffect(() => {
    if (isReady && user && wallets.length === 0) create().catch(() => {});
  }, [isReady, user, wallets.length, create]);

  const request = useMemo(() => {
    if (!embedded) return null;
    return async (method: string, params: unknown[]) => {
      const provider = await embedded.getProvider();
      if (!switchedProviders.has(provider)) {
        // Make sure approvals land on Base.
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] }).catch(() => {});
        switchedProviders.add(provider);
      }
      return provider.request({ method, params } as any);
    };
  }, [embedded]);

  const bits: PrivyBits = {
    ready: isReady,
    address: user && embedded ? (embedded.address as `0x${string}`) : null,
    logout,
    request,
  };
  return <CoreWallet privy={bits}>{children}</CoreWallet>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!privyEnabled) return <CoreWallet privy={null}>{children}</CoreWallet>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID || undefined}
      supportedChains={[base]}
      config={{ embedded: { ethereum: { createOnLogin: 'users-without-wallets' } } }}>
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
