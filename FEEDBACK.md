# Uniswap API: developer feedback

Feedback from integrating the **Uniswap API** (`trade-api.gateway.uniswap.org/v1`) into **Playbook**, a mobile
copy-trading app with a built-in self-custodial wallet (Expo / React Native, server routes on Vercel).

## What we built

- **In-app swaps on Base** (ETH, USDC, WETH) routed through Uniswap v2 / v3 / v4 pools. You can enter either side:
  the amount to pay (`EXACT_INPUT`) or the amount to receive (`EXACT_OUTPUT`).
- **"Get USDC with Uniswap" inside the main flow.** When a wallet doesn't hold enough USDC to apply a trading
  playbook, the app opens a swap for exactly the missing USDC (`EXACT_OUTPUT`, paid in ETH). After the swap, the
  playbook can be applied.
- **Wallet safety.** The phone checks every step before you sign it:
  - the Permit2 approval;
  - the Permit2 `PermitSingle` signature, shown as token, amount, spender and expiry;
  - the swap transaction, which must call a known Universal Router and may not send more ETH than quoted.

  The API key stays on the server. The app calls our own `/api/uniswap/quote` and `/api/uniswap/swap` routes.

Code: [src/server/uniswap.ts](src/server/uniswap.ts), [src/lib/swapFlow.ts](src/lib/swapFlow.ts),
[src/app/wallet/swap.tsx](src/app/wallet/swap.tsx). See the README section "Uniswap integration".

## What worked well

- **The flow is easy to follow:** `/check_approval` → `/quote` → (sign `permitData`) → `/swap`. It maps one-to-one
  onto a wallet's confirm steps.
- **`/swap` returns a ready-to-send transaction.** We didn't need router ABIs, path encoding or v4 hook handling
  on our side. That's the main reason the integration stayed small (about 450 lines including the UI).
- **`EXACT_OUTPUT` support.** It made "buy exactly the USDC you're missing" a one-screen feature.
- **Docs.** The `.md` versions of the docs pages and `llms.txt` made the docs easy to read for an AI coding agent.

## Friction we hit

1. **`permitData` has no `primaryType`.** It comes back as `{ domain, types, values }`, but most signers (viem,
   ethers v6, wallets that take EIP-712 JSON) expect `{ domain, types, primaryType, message }`. We had to work
   out the primary type (`PermitSingle`) from `types` ourselves
   ([`permitJson`](src/lib/swapFlow.ts)). Returning `primaryType`, or the standard EIP-712 shape, would remove
   that step for every integrator.
2. **Approval amount for `EXACT_OUTPUT`.** `/check_approval` needs the input amount, which isn't known until
   after `/quote`. So the call order is really `/quote` → `/check_approval` → re-quote, if the approval
   transaction took longer than the 30-second freshness window. A note in the integration guide would help, or an
   option for `/quote` to report the needed approval itself.
3. **Where the output amounts live.** The output appears in `quote.output`, `quote.aggregatedOutputs[]` and the
   legacy `portionAmount`, and `minAmount` only appears in `aggregatedOutputs`. A short "which field to display"
   table in the docs would prevent mistakes when showing users the minimum received.
4. **Confirming the transaction target.** We check that `/swap`'s `to` is a Universal Router before the user
   signs. A per-chain list of router addresses for each `x-universal-router-version`, in one machine-readable
   place, would make that check easy for wallets.
5. **`value` comes back as hex.** The docs describe `swap.value` as a wei string, but in our live responses it was
   hex (`0x038d7ea4c68000`, and `0x00` for ERC-20 input). That's fine with `BigInt()`, but it broke a test that
   compared against `'0'`. Stating the encoding in the docs, or always using decimal, would help.
6. **No Solana.** Our app trades on Base and Solana, so swaps are Base-only for now. Solana routing, even just
   quotes, would let one integration cover both of our networks.
7. **No sandbox key.** Testnets work, but a key that returns realistic mainnet quotes and never broadcasts would
   speed up early development and CI.

## Suggestions

- Return EIP-712 data in the standard `{ domain, types, primaryType, message }` shape, with `EIP712Domain` included.
- Add an example to the docs: "swap from a mobile self-custodial wallet, with the key on a backend proxy".
- Document the error codes for "amount too small" and "no route", with a suggested message to show users.
