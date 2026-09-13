import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryBudget } from "../src/server/budget.js";
import {
  createTipHandler,
  type BudgetStore,
  type TipHandlerOptions,
} from "../src/server/handler.js";

const PAYOUT = "5PayoutAddressForTheJar";
const ID = "123e4567-e89b-12d3-a456-426614174000";

type Reply = { status: number; body: unknown };
type Override = (url: URL, init?: RequestInit) => Reply | undefined;

const exchange = (over: Record<string, unknown> = {}) => ({
  id: ID,
  status: "pending",
  from: "sol",
  to: "tao",
  fromAmount: "0.2",
  toAmount: "0.087",
  rate: "0.435",
  depositAddress: null,
  validUntil: null,
  fromAddress: "SENDER",
  toAddress: PAYOUT,
  fromTxHash: null,
  toTxHash: null,
  refundAsset: null,
  refundAddress: null,
  reason: null,
  ...over,
});

function defaultReply(url: URL, init?: RequestInit): Reply {
  if (url.hostname === "challenges.cloudflare.com")
    return { status: 200, body: { success: true } };
  if (url.pathname === "/v1/currencies")
    return {
      status: 200,
      body: [
        { id: "tao", symbol: "TAO", network: "Bittensor", pairsWith: ["sol", "btc", "dead"] },
        { id: "sol", symbol: "SOL", network: "Solana", pairsWith: ["tao"] },
        { id: "btc", symbol: "BTC", network: "Bitcoin", pairsWith: ["tao"] },
        { id: "dead", symbol: "DEAD", network: "Nowhere", pairsWith: ["tao"] },
      ],
    };
  if (url.pathname === "/v1/rate") {
    const from = url.searchParams.get("from");
    if (from === "dead")
      return { status: 422, body: { code: "no_liquidity", message: "no miner" } };
    if (Number(url.searchParams.get("amount")) < 0.1)
      return {
        status: 422,
        body: { code: "amount_too_low", message: "low", minFromAmount: "0.1", maxFromAmount: "5" },
      };
    return { status: 200, body: { toAmount: "0.087", minFromAmount: "0.1", maxFromAmount: "5" } };
  }
  if (url.pathname === "/v1/exchanges" && init?.method === "POST")
    return { status: 201, body: exchange() };
  if (url.pathname === `/v1/exchanges/${ID}`)
    return { status: 200, body: exchange({ status: "refunded", refundAddress: PAYOUT }) };
  return { status: 404, body: { code: "not_found", message: "nope" } };
}

let apis = 0;

// A fake Allways API. Each one gets its own origin, so the handler's module-level read cache
// can't leak answers between tests.
function fakeApi(override: Override = () => undefined) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  const fetch = vi.fn(async (raw: string, init?: RequestInit) => {
    const url = new URL(raw);
    calls.push({ url, init });
    const reply = override(url, init) ?? defaultReply(url, init);
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  const created = () =>
    calls.filter((c) => c.url.pathname === "/v1/exchanges" && c.init?.method === "POST");
  return { fetch, calls, created, apiUrl: `https://api-${++apis}.example` };
}

const handlerFor = (
  api: ReturnType<typeof fakeApi>,
  extra: Partial<TipHandlerOptions> = {},
) =>
  createTipHandler({
    apiKey: "alw_live_test",
    apiUrl: api.apiUrl,
    payoutAddress: PAYOUT,
    budget: memoryBudget(),
    getLocation: () => ({ country: "DE", region: null }),
    turnstileSecret: "turnstile-secret",
    fetch: api.fetch,
    ...extra,
  });

const get = (path: string) => new Request(`https://site.example${path}`);

const lock = (body: unknown = { from: "sol", amount: "0.2", fromAddress: "SENDER", captcha: "token" }) =>
  new Request("https://site.example/api/tip", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" },
  });

const read = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /options", () => {
  it("offers the payout coin first, then only coins miners are taking", async () => {
    const api = fakeApi();
    const res = await handlerFor(api)(get("/api/tip/options"));
    const { status, body } = await read(res);
    expect(status).toBe(200);
    expect(body.coins.map((c: { id: string }) => c.id)).toEqual(["tao", "sol", "btc"]);
    expect(body.coins[1]).toMatchObject({ minFromAmount: "0.1", maxFromAmount: "5" });
    expect(body.payoutCoin).toEqual({ id: "tao", symbol: "TAO", network: "Bittensor" });
    expect(body.payoutAddress).toBe(PAYOUT);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("closes without a payout address", async () => {
    const { status, body } = await read(await handlerFor(fakeApi(), { payoutAddress: undefined })(get("/api/tip/options")));
    expect(status).toBe(503);
    expect(body.code).toBe("jar_closed");
  });

  it("closes for a payout coin Allways doesn't list", async () => {
    const { status } = await read(await handlerFor(fakeApi(), { payoutCoin: "nope" })(get("/api/tip/options")));
    expect(status).toBe(503);
  });

  it("caches public reads", async () => {
    const api = fakeApi();
    const handler = handlerFor(api);
    await handler(get("/api/tip/options"));
    const first = api.calls.length;
    await handler(get("/api/tip/options"));
    expect(api.calls.length).toBe(first);
  });
});

describe("GET /quote", () => {
  it("answers bounds without an amount", async () => {
    const { status, body } = await read(await handlerFor(fakeApi())(get("/api/tip/quote?from=sol")));
    expect(status).toBe(200);
    expect(body).toEqual({ minFromAmount: "0.1", maxFromAmount: "5", toAmount: null });
  });

  it("answers what an in-range amount buys", async () => {
    const { body } = await read(await handlerFor(fakeApi())(get("/api/tip/quote?from=sol&amount=0.2")));
    expect(body.toAmount).toBe("0.087");
  });

  it("rejects the payout coin and malformed amounts", async () => {
    const handler = handlerFor(fakeApi());
    expect((await read(await handler(get("/api/tip/quote?from=tao")))).body.code).toBe("invalid_pair");
    expect((await read(await handler(get("/api/tip/quote?from=sol&amount=1e3")))).body.code).toBe("invalid_amount");
  });
});

describe("POST / (lock)", () => {
  it("locks, keeps addresses out of the answer, and charges the budget", async () => {
    const api = fakeApi();
    const handler = handlerFor(api, { maxPerIpHour: 1 });
    const { status, body } = await read(await handler(lock()));
    expect(status).toBe(201);
    expect(body).toEqual({
      id: ID,
      status: "pending",
      from: "sol",
      fromAmount: "0.2",
      depositAddress: null,
      validUntil: null,
      reason: null,
      refundedTo: null,
    });

    const [create] = api.created();
    expect(new Headers(create.init?.headers).get("x-api-key")).toBe("alw_live_test");
    expect(JSON.parse(String(create.init?.body))).toEqual({
      from: "sol",
      to: "tao",
      fromAmount: "0.2",
      fromAddress: "SENDER",
      toAddress: PAYOUT,
    });
    const verify = api.calls.find((c) => c.url.hostname === "challenges.cloudflare.com");
    expect((verify?.init?.body as FormData).get("remoteip")).toBe("1.2.3.4");

    const again = await read(await handler(lock()));
    expect(again.status).toBe(429);
    expect(again.body.code).toBe("too_many");
    expect(api.created()).toHaveLength(1);
  });

  it.each<[string, Partial<TipHandlerOptions>, number, string]>([
    ["no API key", { apiKey: undefined }, 503, "jar_closed"],
    ["no budget store", { budget: undefined }, 503, "jar_closed"],
    ["no location lookup", { getLocation: undefined }, 503, "jar_closed"],
    ["a blocked region", { getLocation: () => ({ country: "US", region: "US-NY" }) }, 403, "geo_blocked"],
    ["a blocked country", { getLocation: () => ({ country: "ir", region: null }) }, 403, "geo_blocked"],
    ["no visitor country", { getLocation: () => null }, 403, "geo_blocked"],
    ["no Turnstile secret", { turnstileSecret: undefined }, 503, "jar_closed"],
    ["the daily budget spent", { maxPerDay: 0 }, 429, "too_many"],
  ])("spends nothing with %s", async (_, options, status, code) => {
    const api = fakeApi();
    const res = await read(await handlerFor(api, options)(lock()));
    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
    expect(api.created()).toHaveLength(0);
  });

  it("locks with the fence and captcha explicitly off", async () => {
    const api = fakeApi();
    const handler = handlerFor(api, {
      getLocation: undefined,
      geoBlock: false,
      turnstileSecret: undefined,
      skipCaptcha: true,
    });
    expect((await handler(lock({ from: "sol", amount: "0.2", fromAddress: "SENDER", captcha: null }))).status).toBe(201);
  });

  it("refuses a failed captcha", async () => {
    const api = fakeApi((url) =>
      url.hostname === "challenges.cloudflare.com" ? { status: 200, body: { success: false } } : undefined,
    );
    const { status, body } = await read(await handlerFor(api)(lock()));
    expect(status).toBe(403);
    expect(body.code).toBe("captcha");
    expect(api.created()).toHaveLength(0);
  });

  it("validates the request before spending", async () => {
    const api = fakeApi();
    const handler = handlerFor(api);
    for (const body of [
      { from: "tao", amount: "1", fromAddress: "SENDER", captcha: "t" },
      { from: "sol", amount: "0.2", fromAddress: "  ", captcha: "t" },
      { from: "sol", amount: "-1", fromAddress: "SENDER", captcha: "t" },
      "not json",
    ])
      expect((await read(await handler(lock(body)))).body.code).toBe("validation");
    expect(api.created()).toHaveLength(0);
  });

  it("hides an out-of-credits answer and doesn't charge for it", async () => {
    const api = fakeApi((url, init) =>
      url.pathname === "/v1/exchanges" && init?.method === "POST"
        ? { status: 402, body: { code: "insufficient_balance", message: "empty", depositAddress: "5TopUp" } }
        : undefined,
    );
    const put = vi.fn();
    const budget: BudgetStore = { get: async () => null, put };
    const { status, body } = await read(await handlerFor(api, { budget })(lock()));
    expect(status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("5TopUp");
    expect(put).not.toHaveBeenCalled();
  });

  it("passes through what the visitor can act on", async () => {
    const api = fakeApi((url, init) =>
      url.pathname === "/v1/exchanges" && init?.method === "POST"
        ? { status: 409, body: { code: "seat_taken", message: "taken", retryAfter: 12 } }
        : undefined,
    );
    const { status, body } = await read(await handlerFor(api)(lock()));
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: "seat_taken", retryAfter: 12 });
  });
});

describe("GET /:id", () => {
  it("reports a refund paid to the jar as the jar's", async () => {
    const { status, body } = await read(await handlerFor(fakeApi())(get(`/api/tip/${ID}`)));
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "refunded", refundedTo: "jar" });
  });

  it("reports a refund paid elsewhere as the visitor's", async () => {
    const api = fakeApi((url) =>
      url.pathname === `/v1/exchanges/${ID}`
        ? { status: 200, body: exchange({ status: "refunded", refundAddress: "SENDER" }) }
        : undefined,
    );
    expect((await read(await handlerFor(api)(get(`/api/tip/${ID}`)))).body.refundedTo).toBe("you");
  });

  it("closes on a rejected key", async () => {
    const api = fakeApi(() => ({ status: 401, body: { code: "unauthorized", message: "bad key" } }));
    expect((await handlerFor(api)(get(`/api/tip/${ID}`))).status).toBe(503);
  });
});

describe("routing", () => {
  it("404s unknown routes and paths outside the base path", async () => {
    const handler = handlerFor(fakeApi());
    expect((await handler(get("/api/tip/nope"))).status).toBe(404);
    expect((await handler(get("/api/other"))).status).toBe(404);
    expect((await handler(new Request("https://site.example/api/tip/options", { method: "DELETE" }))).status).toBe(404);
  });

  it("serves a custom base path", async () => {
    const handler = handlerFor(fakeApi(), { basePath: "/tips/" });
    expect((await handler(get("/tips/options"))).status).toBe(200);
  });

  it("answers 502 when the API is unreachable", async () => {
    const handler = createTipHandler({
      payoutAddress: PAYOUT,
      apiUrl: "https://down.example",
      fetch: async () => {
        throw new Error("offline");
      },
    });
    const { status, body } = await read(await handler(get("/api/tip/options")));
    expect(status).toBe(502);
    expect(body.code).toBe("upstream");
  });
});
