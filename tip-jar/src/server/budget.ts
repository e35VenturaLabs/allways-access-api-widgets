// Spend-budget stores for createTipHandler. Cloudflare's KV store lives in cloudflare-pages.ts.
import type { BudgetStore } from "./handler.js";

// For one long-lived process (a VPS, local development). Serverless instances don't share
// memory, so there each instance would get its own budget. Use a shared store instead.
export function memoryBudget(): BudgetStore {
  const entries = new Map<string, { value: string; until: number }>();
  return {
    async get(key) {
      const e = entries.get(key);
      if (!e || e.until <= Date.now()) {
        entries.delete(key);
        return null;
      }
      return e.value;
    },
    async put(key, value, ttlSeconds) {
      if (entries.size > 10_000)
        for (const [k, e] of entries) if (e.until <= Date.now()) entries.delete(k);
      entries.set(key, { value, until: Date.now() + ttlSeconds * 1000 });
    },
  };
}

export interface UpstashBudgetOptions {
  url: string; // UPSTASH_REDIS_REST_URL
  token: string; // UPSTASH_REDIS_REST_TOKEN
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

// Upstash Redis over its REST API, with no client library, so it runs anywhere fetch does
// (Vercel, Netlify, Deno, Bun, Node). A store error fails the lock rather than skipping the budget.
export function upstashBudget({
  url,
  token,
  fetch: doFetch,
}: UpstashBudgetOptions): BudgetStore {
  const send = doFetch ?? ((u: string, init?: RequestInit) => fetch(u, init));
  const endpoint = url.replace(/\/+$/, "");
  const command = async (args: (string | number)[]): Promise<unknown> => {
    const res = await send(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Upstash answered ${res.status}`);
    return ((await res.json()) as { result?: unknown }).result;
  };
  return {
    async get(key) {
      const result = await command(["GET", key]);
      return result == null ? null : String(result);
    },
    async put(key, value, ttlSeconds) {
      await command(["SET", key, value, "EX", Math.max(1, Math.round(ttlSeconds))]);
    },
  };
}
