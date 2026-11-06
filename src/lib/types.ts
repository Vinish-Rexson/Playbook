export type Trader = {
  address: string;
  name: string;
  handle: string;
  bio: string;
  avatar: string; // emoji
  createdAt: number;
  /** Playbook's own starter strategies (no individual creator). */
  official?: boolean;
};

export type Template = {
  id: string;
  creator: string; // trader address
  name: string;
  description: string;
  /** 0 = market buy now; negative = limit buy that far below the current price (e.g. -2). */
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
};

export type PositionStatus =
  | 'waiting' // entry resting at Flash
  | 'filled' // bought, take-profit / stop-loss watching
  | 'take_profit'
  | 'stop_loss'
  | 'cancelled'
  | 'unprotected' // bought, but the take-profit / stop-loss closed without selling
  | 'failed';

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
  orderType: 'market' | 'limit';
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
  createdAt: number;
  updatedAt: number;
};

export type TemplateWithMeta = Template & { trader: Trader | null; stats: TemplateStats };

export type ApplyPlan = {
  orderType: 'market' | 'limit';
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
