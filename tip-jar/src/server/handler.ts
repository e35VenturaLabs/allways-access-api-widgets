// The tip jar's server half, runtime-agnostic: a (Request) => Response handler for any host
// with web-standard fetch (Cloudflare, Vercel, Netlify, Deno, Bun, Node 18+). It keeps the
// Allways API key off the browser, pins the payout address, and spends a credit only behind a
// captcha, a region fence and a spend budget. Every missing safeguard closes the jar rather
// than opening it.
//
//   GET  {basePath}/options   coins a visitor can pay with, plus the payout coin and address
//   GET  {basePath}/quote     live bounds for a coin (?from=sol), and what an amount buys (&amount=0.2)
//   POST {basePath}           lock a rate and get a deposit address (spends one Allways credit)
//   GET  {basePath}/:id       where that tip is now
import type {
  Tip,
  TipCoin,
  TipError,
  TipOptions,
  TipQuote,
  TipRequest,
} from "../shared/types.js";

// Where the per-IP and per-day lock counts live. Must be shared across every instance that
// serves the handler (Cloudflare KV, Redis, …); memoryBudget() is only right for one process.
export interface BudgetStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface VisitorLocation {
  country: string | null; // ISO 3166-1 alpha-2, e.g. "US"
  region: string | null; // ISO 3166-2, e.g. "US-NY"
}

export interface TipHandlerOptions {
  apiKey?: string; // Allways Access API key (alw_live_…). Unset: the jar is closed.
  payoutAddress?: string; // where tips land, on payoutCoin. Unset: the jar is closed.
  payoutCoin?: string; // Allways currency id tips arrive as. Default "tao"; "sol" also pairs with every coin.
  apiUrl?: string; // default DEFAULT_API_URL
  basePath?: string; // the path this handler is mounted at. Default "/api/tip".
  budget?: BudgetStore; // required to lock: every lock spends a credit
  maxPerIpHour?: number; // default 3
  maxPerDay?: number; // default 50
  turnstileSecret?: string; // Cloudflare Turnstile secret; required to lock unless skipCaptcha
  skipCaptcha?: boolean; // local development only
  // The visitor's location, from your host (request.cf, x-vercel-ip-country, …). Required to
  // lock unless geoBlock is false. A lookup that returns no country is treated as blocked.
  getLocation?: (request: Request) => VisitorLocation | null;
  geoBlock?: false | { countries?: string[]; regions?: string[] };
  // The visitor's IP for the per-IP budget. Default: cf-connecting-ip, then x-real-ip. Visitors
  // with no IP share one bucket, so a misconfigured host errs toward spending less.
  getClientIp?: (request: Request) => string | null;
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

export const DEFAULT_API_URL = "https://api-allways.venturalabs.ai";
// Allways Access's own jurisdiction fence. The API only ever sees this server's IP, so the
// fence has to run here, on the visitor's.
export const DEFAULT_BLOCKED_COUNTRIES = ["CU", "IR", "KP", "SY", "RU", "BY"];
export const DEFAULT_BLOCKED_REGIONS = ["UA-43", "UA-40", "UA-14", "UA-09", "US-NY"];

// Below every coin's minimum, so a rate for it answers with the live bounds.
const PROBE_AMOUNT = "0.000001";
const COIN_ID = /^[a-z0-9]{1,16}$/;
const DECIMAL = /^\d+(\.\d+)?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ADDRESS_LENGTH = 256;

interface Upstream<T> {
  status: number;
  body: T & Partial<TipError>;
}

interface UpstreamInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface Currency {
  id: string;
  symbol: string;
  network: string;
  pairsWith: string[];
}

type Exchange = Omit<Tip, "refundedTo"> & { refundAddress: string | null };

// Public reads are cached per process/isolate so a busy page stays inside the API's per-IP limits
// (60/min on /rate and /currencies): /options alone makes one /rate call per coin.
const memo = new Map<string, { until: number; value: Upstream<unknown> }>();
const MEMO_MAX = 500;

export function createTipHandler(
  o: TipHandlerOptions,
): (request: Request) => Promise<Response> {
  const payoutCoin = o.payoutCoin || "tao";
  const apiUrl = (o.apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");
  const basePath = (o.basePath ?? "/api/tip").replace(/\/+$/, "");
  const doFetch =
    o.fetch ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const clientIp =
    o.getClientIp ??
    ((r: Request) =>
      r.headers.get("cf-connecting-ip") ?? r.headers.get("x-real-ip"));

  async function allways<T>(
    path: string,
    init: UpstreamInit = {},
    ttlSeconds = 0,
  ): Promise<Upstream<T>> {
    const url = `${apiUrl}/v1${path}`;
    const hit = ttlSeconds ? memo.get(url) : undefined;
    if (hit && hit.until > Date.now()) return hit.value as Upstream<T>;
    const res = await doFetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
    const body = (await res.json().catch(() => ({}))) as Upstream<T>["body"];
    const value = { status: res.status, body };
    // 422 is the bounds answer for an out-of-range amount, as cacheable as a 200.
    if (ttlSeconds && (res.status === 200 || res.status === 422)) {
      if (memo.size >= MEMO_MAX) memo.clear();
      memo.set(url, { until: Date.now() + ttlSeconds * 1000, value });
    }
    return value;
  }

  async function options(): Promise<Response> {
    if (!o.payoutAddress) return closed("payoutAddress is not set");
    const currencies = await allways<Currency[]>("/currencies", {}, 300);
    if (currencies.status !== 200 || !Array.isArray(currencies.body))
      return pass(currencies);
    const byId = new Map(currencies.body.map((c) => [c.id, c]));
    const payout = byId.get(payoutCoin);
    if (!payout)
      return closed(`payoutCoin "${payoutCoin}" is not an Allways currency`);
    // Offer a coin only if miners are taking it right now, so nobody picks a dead end.
    const swappable = await Promise.all(
      payout.pairsWith.map(async (id) => {
        const c = byId.get(id);
        if (!c) return null;
        const live = await liveBounds(id);
        return live ? { ...coinOf(c), ...live } : null;
      }),
    );
    const coins: TipCoin[] = [
      coinOf(payout),
      ...swappable.flatMap((c) => (c ? [c] : [])),
    ];
    return json(
      200,
      {
        coins,
        payoutCoin: coinOf(payout),
        payoutAddress: o.payoutAddress,
      } satisfies TipOptions,
      60,
    );
  }

  // The live range for a coin, or null when no miner is taking it. A probe under every minimum
  // answers with the bounds; only a dead pair answers no_liquidity.
  async function liveBounds(
    from: string,
  ): Promise<{ minFromAmount: string; maxFromAmount: string } | null> {
    const r = await allways<unknown>(
      `/rate?from=${from}&to=${payoutCoin}&amount=${PROBE_AMOUNT}`,
      {},
      60,
    );
    const { minFromAmount, maxFromAmount, code } = r.body;
    const known =
      r.status === 200 ||
      code === "amount_too_low" ||
      code === "amount_too_high";
    return known && minFromAmount && maxFromAmount
      ? { minFromAmount, maxFromAmount }
      : null;
  }

  async function quote(q: URLSearchParams): Promise<Response> {
    const from = q.get("from") ?? "";
    const amount = q.get("amount");
    if (!COIN_ID.test(from) || from === payoutCoin)
      return fail(400, "invalid_pair", "Pick a coin to pay with.");
    if (amount !== null && !DECIMAL.test(amount))
      return fail(400, "invalid_amount", "Enter an amount like 0.25.");
    const r = await allways<{ toAmount?: string }>(
      `/rate?from=${from}&to=${payoutCoin}&amount=${amount ?? PROBE_AMOUNT}`,
      {},
      10,
    );
    const { minFromAmount, maxFromAmount, code } = r.body;
    const inBounds = r.status === 200;
    const outOfBounds = code === "amount_too_low" || code === "amount_too_high";
    if (!(inBounds || outOfBounds) || !minFromAmount || !maxFromAmount)
      return pass(r);
    const toAmount =
      amount !== null && inBounds ? (r.body.toAmount ?? null) : null;
    return json(200, {
      minFromAmount,
      maxFromAmount,
      toAmount,
    } satisfies TipQuote);
  }

  async function create(request: Request): Promise<Response> {
    if (!o.apiKey || !o.payoutAddress)
      return closed("apiKey or payoutAddress is not set");
    if (!o.budget)
      return closed("no budget store: every lock spends a credit, so the jar won't lock without one");
    const region = regionCheck(request);
    if (region === "unconfigured")
      return closed("no getLocation: pass one, or set geoBlock: false");
    if (region === "blocked")
      return fail(403, "geo_blocked", "Tips aren't available in your region.");

    const body = (await request
      .json()
      .catch(() => null)) as Partial<TipRequest> | null;
    const from = body?.from;
    const amount = body?.amount;
    const fromAddress =
      typeof body?.fromAddress === "string" ? body.fromAddress.trim() : "";
    if (
      typeof from !== "string" ||
      !COIN_ID.test(from) ||
      from === payoutCoin ||
      typeof amount !== "string" ||
      !DECIMAL.test(amount) ||
      !fromAddress ||
      fromAddress.length > MAX_ADDRESS_LENGTH
    )
      return fail(
        400,
        "validation",
        "Choose a coin, an amount, and the wallet you'll pay from.",
      );

    const captcha = await captchaPasses(body?.captcha ?? null, request);
    if (captcha === "unconfigured")
      return closed("no turnstileSecret: set one, or skipCaptcha for local development");
    if (captcha === "failed")
      return fail(403, "captcha", "The human check didn't go through. Try it again.");

    const budget = await spend(o.budget, request);
    if (budget !== "ok") return fail(429, "too_many", BUDGET_MESSAGE[budget]);

    const r = await allways<Exchange>("/exchanges", {
      method: "POST",
      headers: { "x-api-key": o.apiKey },
      body: JSON.stringify({
        from,
        to: payoutCoin,
        fromAmount: amount,
        fromAddress,
        toAddress: o.payoutAddress,
      }),
    });
    // Only a 201 spends a credit, so only a 201 uses up the budget: a visitor retrying past
    // "that rate was taken" keeps their allowance.
    if (r.status === 201) {
      await charge(o.budget, request);
      return json(201, tip(r.body));
    }
    // Out of credits or a bad key is the operator's problem, not the visitor's, and the
    // credit top-up address in a 402 stays private.
    if (r.status === 401 || r.status === 402)
      return closed(`create answered ${r.status} ${r.body.code ?? ""}`);
    return pass(r);
  }

  async function status(id: string): Promise<Response> {
    if (!o.apiKey) return closed("apiKey is not set");
    const r = await allways<Exchange>(`/exchanges/${id}`, {
      headers: { "x-api-key": o.apiKey },
    });
    if (r.status === 200) return json(200, tip(r.body));
    if (r.status === 401) return closed("status answered 401");
    return pass(r);
  }

  // Fails closed: no resolver is a misconfiguration, and no country is a block.
  function regionCheck(request: Request): "ok" | "blocked" | "unconfigured" {
    if (o.geoBlock === false) return "ok";
    if (!o.getLocation) return "unconfigured";
    const where = o.getLocation(request);
    const country = where?.country?.toUpperCase();
    if (!country) {
      console.error("tip jar: no visitor country on this request, so the lock is blocked");
      return "blocked";
    }
    const region = where?.region?.toUpperCase() ?? null;
    const countries = upper(o.geoBlock?.countries ?? DEFAULT_BLOCKED_COUNTRIES);
    const regions = upper(o.geoBlock?.regions ?? DEFAULT_BLOCKED_REGIONS);
    return countries.includes(country) ||
      (region !== null && regions.includes(region))
      ? "blocked"
      : "ok";
  }

  async function captchaPasses(
    token: string | null,
    request: Request,
  ): Promise<"ok" | "failed" | "unconfigured"> {
    if (!o.turnstileSecret) return o.skipCaptcha ? "ok" : "unconfigured";
    if (!token) return "failed";
    const form = new FormData();
    form.append("secret", o.turnstileSecret);
    form.append("response", token);
    const ip = clientIp(request);
    if (ip) form.append("remoteip", ip);
    const res = await doFetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form },
    );
    const verdict = (await res.json().catch(() => ({}))) as {
      success?: boolean;
    };
    return verdict.success === true ? "ok" : "failed";
  }

  // A best-effort spend budget. Counts race under a burst across instances, which can cost a
  // credit or two over the cap. It is a ceiling on the damage, not an exact meter.
  const budgetKeys = (request: Request) => ({
    ip: `tipjar:ip:${clientIp(request) ?? "unknown"}:${Math.floor(Date.now() / 3_600_000)}`,
    day: `tipjar:all:${new Date().toISOString().slice(0, 10)}`,
  });

  async function spend(
    store: BudgetStore,
    request: Request,
  ): Promise<"ok" | "visitor" | "day"> {
    const keys = budgetKeys(request);
    const [ip, day] = await Promise.all([store.get(keys.ip), store.get(keys.day)]);
    if (Number(ip ?? 0) >= (o.maxPerIpHour ?? 3)) return "visitor";
    if (Number(day ?? 0) >= (o.maxPerDay ?? 50)) return "day";
    return "ok";
  }

  async function charge(store: BudgetStore, request: Request): Promise<void> {
    const keys = budgetKeys(request);
    const bump = async (key: string, ttl: number) => {
      const now = Number((await store.get(key)) ?? 0);
      await store.put(key, String(now + 1), ttl);
    };
    await Promise.all([bump(keys.ip, 3600), bump(keys.day, 172_800)]);
  }

  // The API object also carries both addresses and tx hashes; the widget needs none of them.
  const tip = (e: Exchange): Tip => ({
    id: e.id,
    status: e.status,
    from: e.from,
    fromAmount: e.fromAmount,
    depositAddress: e.depositAddress,
    validUntil: e.validUntil,
    reason: e.reason,
    // A refund goes to whichever side backed the swap. Backed by the payout coin, that side is the jar.
    refundedTo:
      e.status !== "refunded"
        ? null
        : e.refundAddress === o.payoutAddress
          ? "jar"
          : "you",
  });

  return async (request) => {
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (!path.startsWith(basePath))
      return fail(404, "not_found", "No such tip jar route.");
    const route = path.slice(basePath.length).replace(/^\/+/, "");
    try {
      if (request.method === "GET" && route === "options") return await options();
      if (request.method === "GET" && route === "quote")
        return await quote(new URL(request.url).searchParams);
      if (request.method === "POST" && route === "") return await create(request);
      if (request.method === "GET" && UUID.test(route)) return await status(route);
      return fail(404, "not_found", "No such tip jar route.");
    } catch (e) {
      console.error("tip jar upstream error", e);
      return fail(502, "upstream", "Something went wrong with the tip jar. Try again later.");
    }
  };
}

const BUDGET_MESSAGE: Record<"visitor" | "day", string> = {
  visitor: "You've used the tip jar a few times already. Try again later.",
  day: "The tip jar has had a busy day. Try again tomorrow.",
};

const coinOf = (c: Currency): TipCoin => ({
  id: c.id,
  symbol: c.symbol,
  network: c.network,
});

const upper = (list: string[]) => list.map((s) => s.trim().toUpperCase());

// Forward the API's error, keeping only the fields the widget reads.
function pass(r: Upstream<unknown>): Response {
  const { code, message, field, retryAfter, minFromAmount, maxFromAmount } =
    r.body;
  return json(r.status >= 400 ? r.status : 502, {
    code: code ?? "upstream",
    message: message ?? "Allways answered unexpectedly.",
    field,
    retryAfter,
    minFromAmount,
    maxFromAmount,
  } satisfies TipError);
}

// Operator-side problems read the same to every visitor; the reason goes to the server log.
function closed(why: string): Response {
  console.error(`tip jar closed: ${why}`);
  return fail(503, "jar_closed", "The tip jar is closed for a moment. Try again later.");
}

const fail = (status: number, code: string, message: string) =>
  json(status, { code, message } satisfies TipError);

const json = (status: number, body: unknown, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });
