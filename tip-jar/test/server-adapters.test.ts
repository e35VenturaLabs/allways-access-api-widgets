import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryBudget, upstashBudget } from "../src/server/budget.js";
import { optionsFromEnv } from "../src/server/env.js";
import { GET, POST, headerLocation } from "../src/server/next.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("memoryBudget", () => {
  it("forgets a count once its time is up", async () => {
    vi.useFakeTimers();
    const budget = memoryBudget();
    await budget.put("k", "2", 60);
    expect(await budget.get("k")).toBe("2");
    vi.advanceTimersByTime(60_001);
    expect(await budget.get("k")).toBeNull();
  });
});

describe("upstashBudget", () => {
  it("speaks Redis commands over REST", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const [command] = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ result: command === "GET" ? 3 : "OK" }));
    });
    const budget = upstashBudget({ url: "https://redis.example/", token: "tok", fetch });
    expect(await budget.get("k")).toBe("3");
    await budget.put("k", "4", 3600);
    expect(fetch.mock.calls[0][0]).toBe("https://redis.example");
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer tok");
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual(["SET", "k", "4", "EX", 3600]);
  });

  it("fails rather than skipping the budget", async () => {
    const budget = upstashBudget({
      url: "https://redis.example",
      token: "tok",
      fetch: async () => new Response("nope", { status: 500 }),
    });
    await expect(budget.get("k")).rejects.toThrow("Upstash answered 500");
  });
});

describe("optionsFromEnv", () => {
  it("reads every variable", () => {
    expect(
      optionsFromEnv({
        ALLWAYS_API_KEY: "key",
        TIP_PAYOUT_ADDRESS: "addr",
        TIP_PAYOUT_COIN: "sol",
        TURNSTILE_SECRET: "secret",
        TIP_MAX_PER_IP_HOUR: "5",
        TIP_MAX_PER_DAY: "0",
        TIP_GEO_BLOCK_COUNTRIES: "IR, KP",
        TIP_GEO_BLOCK_REGIONS: "",
      }),
    ).toMatchObject({
      apiKey: "key",
      payoutAddress: "addr",
      payoutCoin: "sol",
      turnstileSecret: "secret",
      skipCaptcha: false,
      maxPerIpHour: 5,
      maxPerDay: 0,
      geoBlock: { countries: ["IR", "KP"], regions: [] },
    });
  });

  it("treats empty and garbage values as unset", () => {
    const options = optionsFromEnv({ ALLWAYS_API_KEY: "", TURNSTILE_SECRET: "", TIP_MAX_PER_DAY: "lots" });
    expect(options.apiKey).toBeUndefined();
    expect(options.turnstileSecret).toBeUndefined();
    expect(options.maxPerDay).toBeUndefined();
    expect(options.geoBlock).toEqual({ countries: undefined, regions: undefined });
  });
});

describe("next adapter", () => {
  const lock = (headers: Record<string, string> = {}) =>
    new Request("https://site.example/api/tip", {
      method: "POST",
      body: JSON.stringify({ from: "sol", amount: "0.2", fromAddress: "SENDER", captcha: null }),
      headers,
    });

  it("reads Vercel's geo headers, then Cloudflare's", () => {
    const vercel = new Request("https://x.example", {
      headers: { "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "NY" },
    });
    expect(headerLocation(vercel)).toEqual({ country: "US", region: "US-NY" });
    const cloudflare = new Request("https://x.example", { headers: { "cf-ipcountry": "DE" } });
    expect(headerLocation(cloudflare)).toEqual({ country: "DE", region: null });
    expect(headerLocation(new Request("https://x.example"))).toEqual({ country: null, region: null });
  });

  it("exports the same handler for both methods", () => {
    expect(GET).toBe(POST);
  });

  it("closes in production without a shared budget store", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLWAYS_API_KEY", "key");
    vi.stubEnv("TIP_PAYOUT_ADDRESS", "addr");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    const res = await POST(lock({ "x-vercel-ip-country": "DE" }));
    expect(res.status).toBe(503);
  });

  it("ignores TIP_SKIP_GEO in production", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLWAYS_API_KEY", "key");
    vi.stubEnv("TIP_PAYOUT_ADDRESS", "addr");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    vi.stubEnv("TIP_SKIP_GEO", "1");
    const res = await POST(lock());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("geo_blocked");
  });
});
