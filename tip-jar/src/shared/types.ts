// Wire shapes between the tip jar widget (src/react) and its server handler (src/server).
// Amounts are decimal strings in whole units ("0.5"), exactly as the Allways Access API sends them.

export interface TipCoin {
  id: string; // Allways currency id, e.g. "sol", "btc", "arbusdc"
  symbol: string;
  network: string;
  // The live range. Absent for the payout coin, which is paid straight to the jar in any amount.
  minFromAmount?: string;
  maxFromAmount?: string;
}

export interface TipOptions {
  coins: TipCoin[]; // the payout coin first (paid directly), then every coin miners are swapping into it
  payoutCoin: TipCoin;
  payoutAddress: string;
}

// toAmount is null when no amount was asked for, or the amount sits outside the bounds.
export interface TipQuote {
  minFromAmount: string;
  maxFromAmount: string;
  toAmount: string | null;
}

// Normal order: pending → awaiting_deposit → confirming → exchanging → finished.
export type TipStatus =
  | "pending"
  | "awaiting_deposit"
  | "confirming"
  | "exchanging"
  | "finished"
  | "refunded"
  | "failed";

export interface Tip {
  id: string;
  status: TipStatus;
  from: string;
  fromAmount: string;
  depositAddress: string | null; // null until awaiting_deposit
  validUntil: number | null; // send-by deadline, unix seconds; null until awaiting_deposit
  // Set on failed: pool_lost | reserve_rejected | claim_stale | dest_unpayable | deposit_lapsed
  reason: string | null;
  // Set on refunded. A refund paid to the jar's own payout address means the tip still arrived.
  refundedTo: "jar" | "you" | null;
}

export interface TipRequest {
  from: string;
  amount: string;
  fromAddress: string;
  captcha: string | null;
}

export interface TipError {
  code: string;
  message: string;
  field?: string;
  retryAfter?: number;
  minFromAmount?: string;
  maxFromAmount?: string;
}
