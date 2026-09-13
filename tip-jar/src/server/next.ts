// Next.js App Router adapter (Vercel, or any host running Next). The whole route, in
// app/api/tip/[[...path]]/route.ts:
//   export { GET, POST } from "@venturalabs/allways-tip-jar/next";
// Configured by the environment (see the README's variable table). In production the spend
// budget lives in Upstash Redis (UPSTASH_REDIS_REST_URL / _TOKEN, free tier is plenty);
// `next dev` runs one process, so it counts in memory. Visitor location comes from Vercel's
// geo headers, or Cloudflare's when the site sits behind its proxy.
import { memoryBudget, upstashBudget } from "./budget.js";
import { optionsFromEnv, type TipJarEnv } from "./env.js";
import {
  createTipHandler,
  type BudgetStore,
  type VisitorLocation,
} from "./handler.js";

declare const process: { env: Record<string, string | undefined> };

const devBudget = memoryBudget();

function budget(env: Record<string, string | undefined>): BudgetStore | undefined {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
    return upstashBudget({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  // Unset in production closes the jar: serverless instances can't share an in-memory count.
  return env.NODE_ENV === "production" ? undefined : devBudget;
}

export function headerLocation(request: Request): VisitorLocation {
  const vercel = request.headers.get("x-vercel-ip-country");
  if (vercel) {
    const region = request.headers.get("x-vercel-ip-country-region");
    return { country: vercel, region: region ? `${vercel}-${region}` : null };
  }
  return { country: request.headers.get("cf-ipcountry"), region: null };
}

async function handle(request: Request): Promise<Response> {
  const env = process.env;
  const options = optionsFromEnv(env as TipJarEnv);
  // A local dev server has no geo headers; TIP_SKIP_GEO=1 lets it lock there, never in production.
  const skipGeo = env.NODE_ENV !== "production" && env.TIP_SKIP_GEO === "1";
  return createTipHandler({
    ...options,
    budget: budget(env),
    getLocation: headerLocation,
    geoBlock: skipGeo ? false : options.geoBlock,
  })(request);
}

export const GET = handle;
export const POST = handle;
