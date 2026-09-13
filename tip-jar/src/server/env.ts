// The environment variables every adapter reads, so a site configures the tip jar the same way
// on any host. Budget stores and visitor location are host-specific and set by each adapter.
import type { TipHandlerOptions } from "./handler.js";

export interface TipJarEnv {
  ALLWAYS_API_KEY?: string;
  ALLWAYS_API_URL?: string;
  TIP_PAYOUT_ADDRESS?: string;
  TIP_PAYOUT_COIN?: string;
  TIP_BASE_PATH?: string;
  TURNSTILE_SECRET?: string;
  TIP_SKIP_CAPTCHA?: string;
  TIP_MAX_PER_IP_HOUR?: string;
  TIP_MAX_PER_DAY?: string;
  TIP_GEO_BLOCK_COUNTRIES?: string;
  TIP_GEO_BLOCK_REGIONS?: string;
}

export function optionsFromEnv(env: TipJarEnv): TipHandlerOptions {
  return {
    apiKey: env.ALLWAYS_API_KEY || undefined,
    apiUrl: env.ALLWAYS_API_URL || undefined,
    payoutAddress: env.TIP_PAYOUT_ADDRESS || undefined,
    payoutCoin: env.TIP_PAYOUT_COIN || undefined,
    basePath: env.TIP_BASE_PATH || undefined,
    turnstileSecret: env.TURNSTILE_SECRET || undefined,
    skipCaptcha: env.TIP_SKIP_CAPTCHA === "1",
    maxPerIpHour: number(env.TIP_MAX_PER_IP_HOUR),
    maxPerDay: number(env.TIP_MAX_PER_DAY),
    geoBlock: {
      countries: csv(env.TIP_GEO_BLOCK_COUNTRIES),
      regions: csv(env.TIP_GEO_BLOCK_REGIONS),
    },
  };
}

const number = (raw: string | undefined) => {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 0
    ? n
    : undefined;
};

// Unset keeps the default list; set (even empty) replaces it.
const csv = (raw: string | undefined) =>
  raw === undefined
    ? undefined
    : raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
