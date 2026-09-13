// Every visitor-facing string, so a site can reword or translate the jar without touching the
// component: <TipJar copy={{ title: "Buy me a coffee" }} />. Only the codes a visitor can act on
// get their own words; a lost race, a refused reserve or a dead pair are the operator's problem
// and all read the same.
import type { Tip, TipError } from "../shared/types.js";
import { formatAmount } from "./format.js";
import { isThanked } from "./useTipJar.js";

export interface TipJarCopy {
  title: string;
  close: string;
  coinLabel: string;
  amountLabel: string;
  fromAddressLabel: (symbol: string) => string;
  fromAddressHint: string;
  checkingRange: string;
  range: (min: string, max: string, symbol: string) => string;
  direct: (symbol: string) => string;
  submit: string;
  generating: string;
  sendExactly: string;
  to: string;
  from: string;
  within: string;
  waiting: string;
  windowClosed: string;
  tryAgain: string;
  copy: string;
  copied: string;
  thanks: string;
  refunded: string;
  expiredBeforeReady: string;
  depositLapsed: string;
  swapFailed: string;
  badAddress: (symbol: string) => string;
  generic: string;
  poweredBy: string;
}

export const defaultCopy: TipJarCopy = {
  title: "Feeling generous?",
  close: "Close",
  coinLabel: "Crypto",
  amountLabel: "Amount",
  fromAddressLabel: (symbol) => `Your ${symbol} wallet address`,
  fromAddressHint: "The wallet you'll send from.",
  checkingRange: "Checking the live range…",
  range: (min, max, symbol) => `Send between ${min} and ${max} ${symbol}`,
  direct: (symbol) => `Send any amount of ${symbol} to`,
  submit: "Get address",
  generating: "Generating address. This can take up to 30 seconds.",
  sendExactly: "Send exactly",
  to: "to",
  from: "From",
  within: "within",
  waiting: "Waiting for your payment",
  windowClosed: "The payment window has closed.",
  tryAgain: "Try again",
  copy: "Copy",
  copied: "Copied",
  thanks: "Got it. Thanks!!",
  refunded:
    "This one couldn't go through, so you were refunded with a 10% bonus.",
  expiredBeforeReady:
    "The address expired before it was ready. Nothing was sent, so just try again.",
  depositLapsed: "Time ran out before a payment arrived.",
  swapFailed:
    "Something went wrong with this swap. If you already sent funds, get in touch.",
  badAddress: (symbol) => `That doesn't look like a ${symbol} address.`,
  generic: "We're having issues right now. Try again later.",
  poweredBy: "Powered by",
};

export function describeError(
  e: TipError,
  symbol: string,
  copy: TipJarCopy = defaultCopy,
): string {
  switch (e.code) {
    case "amount_too_low":
    case "amount_too_high":
      return `${copy.range(
        formatAmount(e.minFromAmount ?? "", "up"),
        formatAmount(e.maxFromAmount ?? "", "down"),
        symbol,
      )}.`;
    case "validation":
      return e.field === "fromAddress" ? copy.badAddress(symbol) : copy.generic;
    // Written by the server handler (src/server/handler.ts); reword them there.
    case "too_many":
    case "captcha":
    case "geo_blocked":
      return e.message;
    default:
      return copy.generic;
  }
}

export function endedMessage(tip: Tip, copy: TipJarCopy = defaultCopy): string {
  if (isThanked(tip)) return copy.thanks;
  if (tip.status === "refunded") return copy.refunded;
  if (tip.reason === "pool_lost" || tip.reason === "reserve_rejected")
    return copy.expiredBeforeReady;
  if (tip.reason === "deposit_lapsed") return copy.depositLapsed;
  return copy.swapFailed;
}
