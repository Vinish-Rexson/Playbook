// Chain + token constants. Playbook trades ETH/USDC on Base and SOL/USDC on Solana through Definitive Flash.
export type Chain = 'base' | 'solana';
export const CHAINS: Chain[] = ['base', 'solana'];
/** A playbook's network setting: one chain, or both (the user picks when applying). */
export type PlaybookNetwork = Chain | 'both';
export const playbookChains = (n: PlaybookNetwork | undefined): Chain[] => (!n || n === 'both' ? CHAINS : [n]);

export const CHAIN = 'base' as const;
export const CHAIN_ID = 8453;
export const CHAIN_ID_HEX = '0x2105';

export const WETH = '0x4200000000000000000000000000000000000006' as const;
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const USDC_DECIMALS = 6;
/** Uniswap Universal Router deployments on Base (in-app swaps must call one of these). */
export const UNISWAP_ROUTERS = [
  '0x6ff5693b99212da76ad316178a184ab56d299b43', // v4 Universal Router
  '0xd6145b2d3f379919e8cdeda7b97e37c4b2ca9c40', // Universal Router 2.1.x
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad', // Universal Router 1.2
];

// Solana mints. Flash settles SOL as wrapped SOL (wSOL); bought SOL arrives as wSOL and the
// take-profit / stop-loss sells it back to USDC.
export const SOL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const WSOL = 'So11111111111111111111111111111111111111112';
export const SOL_DECIMALS = 9;
/** Delegate authority Flash's Solana program uses on token accounts (seen in live quotes). */
export const FLASH_SOLANA_DELEGATE = '3jBWeQrnfEhw5LY53hwcoYKQJsrTUbtLbmGrNYCr1Fiq';
/** Rent for one SPL token account (165 bytes), refunded if the account is ever closed. */
export const TOKEN_ACCOUNT_RENT_SOL = 0.00203928;

export type Network = {
  chain: Chain;
  name: string;
  /** What playbooks buy on this network, as shown to people. */
  asset: string;
  /** The token that actually lands in the wallet (wrapped form). */
  bought: string;
  /** Pays network fees. */
  gas: string;
  txUrl: (hash: string) => string;
  addressUrl: (address: string) => string;
};

export const NETWORKS: Record<Chain, Network> = {
  base: {
    chain: 'base',
    name: 'Base',
    asset: 'ETH',
    bought: 'WETH',
    gas: 'ETH',
    txUrl: (h) => `https://basescan.org/tx/${h}`,
    addressUrl: (a) => `https://basescan.org/address/${a}`,
  },
  solana: {
    chain: 'solana',
    name: 'Solana',
    asset: 'SOL',
    bought: 'wSOL',
    gas: 'SOL',
    txUrl: (h) => `https://solscan.io/tx/${h}`,
    addressUrl: (a) => `https://solscan.io/account/${a}`,
  },
};

export const EXPLORER = 'https://basescan.org';
export const txUrl = (hash: string, chain: Chain = 'base') => NETWORKS[chain].txUrl(hash);
export const addressUrl = (address: string, chain: Chain = 'base') => NETWORKS[chain].addressUrl(address);

// Definitive's promotional advanced-order fee through 31 Dec 2026 (Flash docs: Monetize Your Integration).
export const DEFINITIVE_ADVANCED_FEE_BPS = 10;
// Flash caps the integrator fee at 1000 bps (10%) per the quote schema.
export const MAX_CUT_PCT = 2;
