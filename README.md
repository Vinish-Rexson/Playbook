# Playbook

An app store for trading strategies. Traders publish **playbooks** (entry, take-profit, stop-loss and their cut);
anyone applies one to their own wallet in one tap. Orders are executed by **Definitive Flash** on **Base**
as a limit or market buy with an attached take-profit / stop-loss bracket, and the creator's cut is charged
through Flash's integrator fee.

Built for the ETHGlobal Mumbai **Definitive** track ("Best Use of Flash Advanced Orders in a Social App").

## How it works

| Step | What happens |
|---|---|
| Create | Trader creates a profile and publishes a playbook in percentages (e.g. buy −2%, TP +5%, SL −3%, 0.5% cut) |
| Apply | User enters an amount. The server turns the percentages into prices at the live ETH price and asks Flash for a quote with `attachedBracket` and `flashIntegratorFeeBps` |
| Sign | First time only: USDC + WETH approvals. Then two free EIP-712 signatures (entry + protection) |
| Execute | Flash holds the order, fills the entry, then the bracket sells at take-profit or stop-loss |
| Earn | Each fill's `integratorFeeNotional` is credited to the playbook's creator |

Paper mode runs the same flow with live prices but simulated fills, so judges can try it without funds.

## Stack

- Expo SDK 58 / React Native 0.88, Expo Router (screens in `src/app`, server routes in `src/app/api`)
- Privy embedded wallets (email login) on Base, viem for reads and receipts
- Flash API called only from the server routes (`src/server/flash.ts`); the API key never ships in the app
- JSON file store in `./data` for the hackathon (swap for Supabase before deploying)

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in:
   - `FLASH_API_KEY`: your key from app.definitive.fi (More → Flash → Create Flash Key). Empty = the public dev key from the Flash docs (fees are not collected).
   - `EXPO_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_CLIENT_ID`: from dashboard.privy.io. Add an Android app client for `com.playbook.app`. Empty = Paper mode only.
3. Android toolchain (Windows): set `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk` and add `%ANDROID_HOME%\platform-tools` to `PATH`.

## Run

Privy uses native modules, so the app needs a **development build** (Expo Go will not work):

```bash
npx expo run:android
```

After the first build, start the dev server (it also serves the API routes) with:

```bash
npx expo start
```

The phone must reach your laptop over the same Wi-Fi network.

## Demo tips

- Use **Quick Scalp** (market buy, ±0.3%) so the fill and the take-profit happen on camera.
- Fund the demo wallet on Base with ~$30 USDC and a little ETH for the two one-time approvals (Profile → QR).
- Fills link to Basescan from the Positions tab.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```
