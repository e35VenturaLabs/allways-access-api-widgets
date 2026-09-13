"use client";
// Headless tip jar: every piece of state and every call, no markup. TipJar.tsx is one way to
// render it; build your own UI on this hook to match any design system.
import { useCallback, useEffect, useState } from "react";
import type {
  Tip,
  TipError,
  TipOptions,
  TipQuote,
  TipRequest,
  TipStatus,
} from "../shared/types.js";
import { suggestedAmount } from "./format.js";

// Once the deposit is seen the tip is on its way; the visitor has nothing left to wait for.
const RECEIVED: ReadonlySet<TipStatus> = new Set([
  "confirming",
  "exchanging",
  "finished",
]);
const ENDED: ReadonlySet<TipStatus> = new Set([...RECEIVED, "refunded", "failed"]);
const DECIMAL = /^\d+(\.\d+)?$/;
const POLL_MS = 3000;

// form → generating (rate locked, address on its way) → deposit (send now) → ended
export type TipPhase = "form" | "generating" | "deposit" | "ended";

export const isThanked = (tip: Tip) =>
  RECEIVED.has(tip.status) || tip.refundedTo === "jar";

export interface UseTipJarOptions {
  endpoint?: string; // where the server handler is mounted. Default "/api/tip".
  active?: boolean; // pass the modal's `open`: nothing loads or polls while false
  defaultCoin?: string; // preselected coin id when miners are taking it, e.g. "sol"
}

export function useTipJar({
  endpoint = "/api/tip",
  active = true,
  defaultCoin,
}: UseTipJarOptions = {}) {
  const [options, setOptions] = useState<TipOptions | null>(null);
  const [optionsError, setOptionsError] = useState<TipError | null>(null);
  const [coin, setCoin] = useState("");
  const [amount, setAmount] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [quote, setQuote] = useState<TipQuote | null>(null);
  const [quoteError, setQuoteError] = useState<TipError | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TipError | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const direct = coin !== "" && coin === options?.payoutCoin.id;
  const symbol =
    options?.coins.find((c) => c.id === coin)?.symbol ?? coin.toUpperCase();
  const tipId = tip?.id;
  const ended = tip ? ENDED.has(tip.status) : false;
  const secondsLeft = useSecondsUntil(tip?.validUntil ?? null);

  useEffect(() => {
    if (!active || options) return;
    let live = true;
    request<TipOptions>(endpoint, "/options").then(
      (o) => {
        if (!live) return;
        setOptions(o);
        setOptionsError(null);
      },
      (e) => live && setOptionsError(asError(e)),
    );
    return () => {
      live = false;
    };
  }, [active, options, endpoint]);

  // The coin list carries each coin's live range, so picking a coin fills the amount in at
  // once; the quote call that follows only adds what it is worth.
  const pickCoin = useCallback(
    (id: string) => {
      const picked = options?.coins.find((c) => c.id === id);
      setCoin(id);
      setQuoteError(null);
      setError(null);
      if (picked?.minFromAmount && picked.maxFromAmount) {
        setQuote({
          minFromAmount: picked.minFromAmount,
          maxFromAmount: picked.maxFromAmount,
          toAmount: null,
        });
        setAmount(suggestedAmount(picked.minFromAmount));
      } else {
        setQuote(null);
        setAmount("");
      }
    },
    [options],
  );

  // Start on the requested coin if miners are taking it, else the first swappable one.
  useEffect(() => {
    if (!options || options.coins.some((c) => c.id === coin)) return;
    const swappable = options.coins.filter((c) => c.id !== options.payoutCoin.id);
    const start =
      swappable.find((c) => c.id === defaultCoin) ??
      swappable[0] ??
      options.coins[0];
    if (start) pickCoin(start.id);
  }, [options, coin, defaultCoin, pickCoin]);

  // An empty amount asks for the coin's bounds and prefills a suggestion; any other amount
  // asks what it buys.
  useEffect(() => {
    if (!active || !options || !coin || direct || tipId) return;
    if (amount && !DECIMAL.test(amount)) return;
    const ctl = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const q = await request<TipQuote>(
            endpoint,
            `/quote?from=${encodeURIComponent(coin)}${amount ? `&amount=${encodeURIComponent(amount)}` : ""}`,
            { signal: ctl.signal },
          );
          setQuote(q);
          setQuoteError(null);
          if (!amount) setAmount(suggestedAmount(q.minFromAmount));
        } catch (e) {
          if (!ctl.signal.aborted) setQuoteError(asError(e));
        }
      },
      amount ? 400 : 0,
    );
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [active, options, coin, direct, amount, endpoint, tipId]);

  useEffect(() => {
    if (!active || !tipId || ended) return;
    const timer = setInterval(async () => {
      try {
        setTip(await request<Tip>(endpoint, `/${tipId}`));
      } catch {
        // Transient; the next tick retries.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active, tipId, ended, endpoint]);

  // Pass the Turnstile token (or null when you run without one). Spends one Allways credit on success.
  const submit = useCallback(
    async (captcha: string | null) => {
      setBusy(true);
      setError(null);
      try {
        const body: TipRequest = {
          from: coin,
          amount,
          fromAddress: fromAddress.trim(),
          captcha,
        };
        setTip(
          await request<Tip>(endpoint, "", {
            method: "POST",
            body: JSON.stringify(body),
          }),
        );
      } catch (e) {
        setError(asError(e));
      } finally {
        setBusy(false);
      }
    },
    [coin, amount, fromAddress, endpoint],
  );

  const reset = useCallback(() => {
    setTip(null);
    setError(null);
    pickCoin(coin);
  }, [coin, pickCoin]);

  const amountInRange = quote?.toAmount != null && DECIMAL.test(amount);
  const phase: TipPhase = !tip
    ? "form"
    : ENDED.has(tip.status)
      ? "ended"
      : tip.status === "pending" || !tip.depositAddress
        ? "generating"
        : "deposit";

  return {
    options,
    optionsError,
    coin,
    pickCoin,
    symbol,
    direct, // paying in the payout coin itself: show options.payoutAddress, no swap, no credit
    amount,
    setAmount,
    fromAddress,
    setFromAddress,
    quote,
    quoteError,
    amountInRange,
    ready: amountInRange && fromAddress.trim() !== "" && !busy,
    submit,
    busy,
    error,
    tip,
    phase,
    secondsLeft,
    expired: secondsLeft !== null && secondsLeft <= 0,
    reset,
  };
}

export type TipJarState = ReturnType<typeof useTipJar>;

class TipFailure extends Error {
  readonly body: TipError;
  constructor(body: TipError) {
    super(body.message);
    this.body = body;
  }
}

const UNREACHABLE: TipError = {
  code: "network",
  message: "Something went wrong with the tip jar. Try again later.",
};

const asError = (e: unknown): TipError =>
  e instanceof TipFailure ? e.body : UNREACHABLE;

async function request<T>(
  endpoint: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body === null)
    throw new TipFailure((body as TipError | null) ?? UNREACHABLE);
  return body as T;
}

function useSecondsUntil(unix: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (unix === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [unix]);
  return unix === null ? null : Math.max(0, Math.round(unix - now / 1000));
}
