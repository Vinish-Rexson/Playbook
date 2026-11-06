// Signs locally with the unlocked key. Transactions are broadcast to Base through the RPC in lib/chain.
import { createWalletClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

import { RPC_URL } from '@/lib/chain';

import { parseTypedData } from './typedData';

export type Signer = {
  address: Address;
  signTypedData: (json: string) => Promise<Hex>;
  signMessage: (message: string) => Promise<Hex>;
  sendTransaction: (tx: { to: string; data: string }) => Promise<Hex>;
};

export function makeSigner(privateKey: Hex): Signer {
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
  return {
    address: account.address,
    signTypedData: (json) => account.signTypedData(parseTypedData(json) as Parameters<typeof account.signTypedData>[0]),
    signMessage: (message) => account.signMessage({ message }),
    sendTransaction: (tx) =>
      client.sendTransaction({ account, chain: base, to: tx.to as Address, data: tx.data as Hex, value: 0n }),
  };
}
