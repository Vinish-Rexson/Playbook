// Chain + token constants. Playbook trades ETH/USDC on Base (cheapest Ethereum chain Flash supports).
export const CHAIN = 'base' as const;
export const CHAIN_ID = 8453;
export const CHAIN_ID_HEX = '0x2105';

export const WETH = '0x4200000000000000000000000000000000000006' as const;
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const USDC_DECIMALS = 6;

export const EXPLORER = 'https://basescan.org';
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;

// Definitive's promotional advanced-order fee through 31 Dec 2026 (Flash docs: Monetize Your Integration).
export const DEFINITIVE_ADVANCED_FEE_BPS = 10;
// Flash caps the integrator fee at 1000 bps (10%) per the quote schema.
export const MAX_CUT_PCT = 2;
export const MIN_APPLY_USD = 5;
