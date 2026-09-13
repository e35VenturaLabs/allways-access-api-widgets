// Cloudflare Pages Functions adapter. The whole route, in functions/api/tip/[[path]].ts:
//   export { onRequest } from "@venturalabs.ai/allways-tip-jar/cloudflare-pages";
// Configured by the environment (see the README's variable table), with a KV namespace bound
// as TIP_RATE for the spend budget. Visitor location comes from request.cf.
import { optionsFromEnv, type TipJarEnv } from "./env.js";
import {
  createTipHandler,
  type BudgetStore,
  type VisitorLocation,
} from "./handler.js";

export interface CloudflareTipJarEnv extends TipJarEnv {
  TIP_RATE?: KVNamespace;
}

export const kvBudget = (kv: KVNamespace): BudgetStore => ({
  get: (key) => kv.get(key),
  // KV refuses expirations under 60 seconds.
  put: (key, value, ttlSeconds) =>
    kv.put(key, value, { expirationTtl: Math.max(60, ttlSeconds) }),
});

export const cloudflareLocation = (request: Request): VisitorLocation => {
  const cf = request.cf as { country?: string; regionCode?: string } | undefined;
  const country = cf?.country ?? null;
  return {
    country,
    region: country && cf?.regionCode ? `${country}-${cf.regionCode}` : null,
  };
};

export const onRequest: PagesFunction<CloudflareTipJarEnv> = ({ request, env }) =>
  createTipHandler({
    ...optionsFromEnv(env),
    budget: env.TIP_RATE ? kvBudget(env.TIP_RATE) : undefined,
    getLocation: cloudflareLocation,
  })(request);
