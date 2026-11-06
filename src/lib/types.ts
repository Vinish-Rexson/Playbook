export type Trader = {
  address: string;
  name: string;
  handle: string;
  bio: string;
  /** Avatar tone key (lime, ink, sand, sky, rose, mint); older profiles hold an emoji, mapped to a tone. */
  avatar: string;
  createdAt: number;
  /** Playbook's own starter strategies (no individual creator). */
  official?: boolean;
};

/** How the buy is placed: at market, as a limit below the price, or as DCA (Flash TWAP) over time. */
export type EntryType = 'market' | 'limit' | 'twap';

/** Flash order options a playbook can carry beyond its three price rules. */
export type OrderOptions = {
  entryType: EntryType;
  /** DCA only: spread the buy over this many minutes (Flash minimum 5). */
  twapMinutes: number | null;
  /** DCA only: number of slices (Flash allows 2–2560). */
  twapSlices: number | null;
  /** Limit only: the buy expires after this many hours; null = good until cancelled. */
  entryExpiryHours: number | null;
  /** Take-profit / stop protection expires after this many days; null = never. */
  bracketExpiryDays: number | null;
  /** Market only: slippage cap in %; null = Flash's recommended value. */
  maxSlippagePct: number | null;
};

export type Template = OrderOptions & {
  id: string;
  creator: string; // trader address
  name: string;
  description: string;
  /** 0 = no dip; negative = buy that far below the current price (e.g. -2). DCA uses it as a price cap. */
  entryOffsetPct: number;
  /** Take profit, % above the entry price. */
  takeProfitPct: number;
  /** Stop-loss, % below the entry price (stored positive). */
  stopLossPct: number;
  /** Creator's cut, % of each applied trade (sent to Flash as flashIntegratorFeeBps). */
  cutPct: number;
  /** Where it trades: ETH on Base, SOL on Solana, or both (the user picks when applying). */
  chain: import('./constants').PlaybookNetwork;
  createdAt: number;
};

export type TemplateStats = {
  applies: number;
  wins: number;
  losses: number;
  open: number;
  volumeUsd: number;
  /** Realized profit and loss over closed (take-profit / stop) positions, in USD. */
  pnlUsd: number;
  /** USDC committed to those closed positions; pnlUsd / closedUsd is the realized return. */
  closedUsd: number;
};

export type PositionStatus =
  | 'waiting' // entry resting at Flash
  | 'filled' // bought, take-profit / stop-loss watching
  | 'take_profit'
  | 'stop_loss'
  | 'cancelled'
  | 'unprotected' // bought, but the take-profit / stop-loss closed without selling
  | 'failed'
  | 'closing' // closed early by the user: the market sell is submitted, not filled yet
  | 'closed'; // closed early by the user and sold

export type TxRef = { label: string; hash: string };

export type Application = {
  id: string;
  /** Network the position runs on (ETH on Base or SOL on Solana). */
  chain: import('./constants').Chain;
  templateId: string;
  templateName: string;
  creator: string;
  funder: string;
  amountUsd: number;
  orderType: EntryType;
  marketPriceAtApply: number;
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  cutBps: number;
  orderId: string;
  bracketOrderId?: string | null;
  status: PositionStatus;
  filledPrice?: number;
  exitPrice?: number;
  pnlUsd?: number;
  creatorFeeUsd: number;
  txs: TxRef[];
  closeReason?: string | null;
  /** Flash order id of the market sell when the user closed the position early. */
  closeOrderId?: string | null;
  /** Asset received by the entry (from Flash fills), e.g. 0.0022 ETH. */
  boughtAmount?: number | null;
  /** USDC the entry actually spent (from Flash fills). */
  spentUsd?: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TemplateWithMeta = Template & { trader: Trader | null; stats: TemplateStats };

/** A creator with totals across their playbooks (search and profile pages). */
export type TraderSummary = Trader & { playbooks: number; applies: number; wins: number; losses: number };

export type ApplyPlan = {
  orderType: EntryType;
  marketPrice: number;
  entryPrice: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  amountUsd: number;
  cutBps: number;
  creatorFeeUsd: number;
  definitiveFeeUsd: number;
  estEth: number;
  profitAtTpUsd: number;
  lossAtSlUsd: number;
};

export type Earnings = {
  /** Integrator fees Flash reported on this creator's fills (integratorFeeNotional), in USD. */
  feesUsd: number;
  applies: number;
};
