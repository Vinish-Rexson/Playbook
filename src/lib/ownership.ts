// Proof that a wallet owns an address before the server saves a creator profile or publishes a playbook
// under it. The wallet signs this plain-text message (EIP-191); the server checks signer and freshness.
export type OwnerAction = 'Save creator profile' | 'Publish playbook';

/** Valid for 10 minutes after `time`. */
export const OWNERSHIP_TTL_MS = 10 * 60_000;

export const ownershipMessage = (action: OwnerAction, address: string, time: string) =>
  `Playbook\nAction: ${action}\nAddress: ${address}\nTime: ${time}\n\nFree signature. It moves no funds.`;

/** Asks the wallet to sign the ownership message (the confirmation sheet shows it first). */
export async function proveOwner(sign: (message: string) => Promise<string>, action: OwnerAction, address: string) {
  const time = new Date().toISOString();
  return { time, signature: await sign(ownershipMessage(action, address, time)) };
}
