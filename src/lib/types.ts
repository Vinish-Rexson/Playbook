export type Trader = {
  address: string;
  name: string;
  handle: string;
  bio: string;
  avatar: string; // emoji
  createdAt: number;
  demo?: boolean;
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
  | 'failed';

export type TxRef = { label: string; hash: string };

export type Application = {
  id: string;
  templateId: string;
  templateName: string;
  creator: string;
  funder: string;
  mode: 'live' | 'paper';
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
  liveUsd: number;
  paperUsd: number;
  applies: number;
};
