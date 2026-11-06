# Playbook

An app store for trading strategies. Traders publish **playbooks** (entry, take-profit, stop-loss and their cut);
anyone applies one to their own wallet in one tap, as **ETH on Base** or **SOL on Solana**. Orders are executed by
**Definitive Flash** as a limit or market buy with an attached take-profit / stop-loss bracket, and the creator's
cut is charged through Flash's integrator fee.

Built for the ETHGlobal Mumbai **Definitive** track ("Best Use of Flash Advanced Orders in a Social App").

## How it works

| Step | What happens |
|---|---|
| Create | Trader creates a profile and publishes a playbook in percentages (e.g. buy −2%, TP +5%, SL −3%, 0.5% cut) |
| Apply | User enters an amount. The server turns the percentages into prices at the live ETH price and asks Flash for a quote with `attachedBracket` and `flashIntegratorFeeBps` |
| Sign | Base: first time only, USDC + WETH approvals; then two free EIP-712 signatures (entry + protection). Solana: first time only, one setup transaction (USDC/wSOL token accounts + Flash delegations); then two free Ed25519 signatures |
| Execute | Flash holds the order, fills the entry, then the bracket sells at take-profit or stop-loss |
| Earn | Each fill's `integratorFeeNotional` is credited to the playbook's creator |

Everything is live: prices, quotes, fills and fees come from Flash, balances from Base and Solana. There is no
simulated mode. Playbooks are percentages, so every playbook works on both networks; each position records its network.

## Stack

- Expo SDK 58 / React Native 0.88, Expo Router (screens in `src/app`, server routes in `src/app/api`)
- Built-in self-custodial wallet: create or import (12/24-word phrase or private key), keys encrypted on the phone
  with SecureStore, fingerprint/PIN unlock, every signature confirmed in an in-app sheet
- One phrase, two accounts (like MetaMask): Ethereum at `m/44'/60'/0'/0/0` (viem) and Solana at `m/44'/501'/0'/0'`
  (SLIP-0010 ed25519 via noble, same address as Phantom/Solflare). Private-key imports are Ethereum-only
- Solana without a web3 library: the server compiles the one-time setup transaction (`src/server/solana.ts`), the app
  decodes it again to show what it does, signs it locally, and the server broadcasts it
- Flash API called only from the server routes (`src/server/flash.ts`); the API key never ships in the app
- Supabase Postgres via `postgres` (`src/server/db.ts`). Tables (`traders`, `templates`, `applications`, `quotes`)
  are in `public`, defined in `supabase/migrations`. Row Level Security is on and the publishable key has no access,
  so only the server routes (connecting with `DATABASE_URL`) can read or write them

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in:
   - `DATABASE_URL`: Supabase → Connect → **Session pooler** connection string (IPv4). URL-encode special
     characters in the password (`@` → `%40`).
   - `FLASH_API_KEY`: your key from app.definitive.fi (More → Flash → Create Flash Key). Empty = the public dev key from the Flash docs (fees are not collected).
   - `EXPO_PUBLIC_BASE_RPC_URL` (optional): your own Base RPC. Empty = the public `mainnet.base.org` endpoint.
   - `SOLANA_RPC_URL` / `EXPO_PUBLIC_SOLANA_RPC_URL` (optional): Solana RPC for the server and the app. Empty = the
     public `api.mainnet-beta.solana.com` endpoint (rate-limited; use a provider such as Helius for real traffic).
3. `npm run db:push` applies `supabase/migrations` with the Supabase CLI (tables plus the starter playbooks).
   Only migrations the database hasn't recorded yet run. Add `-- --dry-run` to preview. For a schema change,
   add a new file with `npx supabase migration new <name>` and push again.
4. Android toolchain (Windows): set `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` and add `%ANDROID_HOME%\platform-tools` to `PATH`.

## Run

The wallet uses native modules (SecureStore, biometrics, quick-crypto), so the app needs a **development build** (Expo Go will not work):

```bash
npx expo run:android
```

After the first build, start the dev server (it also serves the API routes) with:

```bash
npx expo start
```

The phone must reach your laptop over the same Wi-Fi network.

## Share with friends (Android)

The API runs on Vercel and the app is a signed APK your friends install from a link. Both fit the free tiers.

**1. Host the API on Vercel (once).** `vercel.json` builds only the server (`expo export -p web --no-ssg`), and
`api/index.ts` serves it. There is no website.

```bash
npx vercel login
npx vercel deploy --prod
```

In the Vercel dashboard, open Project → Settings → Environment Variables and set `DATABASE_URL` (Supabase's
**Transaction pooler**, port 6543, for serverless), `FLASH_API_KEY` and `SOLANA_RPC_URL`, then deploy again. Put the
production URL in `.env` as `PLAYBOOK_API_ORIGIN`. Deploy again after any change under `src/server` or `src/app/api`.

**2. Release an APK.**

```bash
npm run release -- --notes "What changed"
```

The script checks that the API answers, bumps the version, builds a signed arm64 APK, and uploads it to Supabase
Storage (public bucket `releases`) with a `latest.json`. It prints the link to share (`.../releases/playbook.apk`).
Installed copies show **Update available** on Discover and download the new APK when tapped. The first run creates the
signing key at `~/.playbook/playbook-release.jks` and saves its password in `.env`. Back up both: every update must be
signed with the same key. If the upload fails after a build, run `npm run release -- --upload-only`.

A release APK is signed with a different key than a development build, so uninstall the dev build first. That deletes
the wallet on the phone, so write down its secret phrase first (Wallet → Security) and import it afterwards.

## Demo tips

- Use **Quick Scalp** (market buy, ±0.3%) so the fill and the take-profit happen on camera.
- Create a wallet in the app (or import a dedicated trading wallet), then fund it on Base with ~$30 USDC and a little ETH
  for the two one-time approvals (Profile → Receive).
- Fills link to Basescan from the Positions tab.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```
