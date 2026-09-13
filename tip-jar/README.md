# Tip jar

**`@venturalabs.ai/allways-tip-jar`** is a drop-in crypto tip jar for any website. Visitors tip in the coin they already hold (SOL, BTC, ETH, USDC on several chains, and more), and it lands in your wallet as **TAO** or **SOL**. The swap runs on [Allways](https://all-ways.io) through the Allways Access API, so visitors never need your coin, an exchange account, or a wallet connection. They copy an address and send.

```bash
npm install @venturalabs.ai/allways-tip-jar
```

It's two lines of code:

```tsx
// 1. Anywhere in your React app. Styles are included.
import { TipJar } from "@venturalabs.ai/allways-tip-jar/react";
<TipJar open={open} onClose={() => setOpen(false)} turnstileSiteKey="0x4AAA…" />
```

```ts
// 2. One server route, one line on your host.
export { onRequest } from "@venturalabs.ai/allways-tip-jar/cloudflare-pages"; // Cloudflare Pages: functions/api/tip/[[path]].ts
export { GET, POST } from "@venturalabs.ai/allways-tip-jar/next";            // Next.js: app/api/tip/[[...path]]/route.ts
```

The server route isn't optional: it keeps your API key secret and your payout address fixed. See [Why there's a server route](#why-theres-a-server-route).

- [Install it with one prompt](#install-it-with-one-prompt)
- [How it works](#how-it-works)
- [Why there's a server route](#why-theres-a-server-route)
- [Before you start](#before-you-start)
- [Install steps](#install-steps)
- [Environment variables](#environment-variables)
- [Hosting recipes](#hosting-recipes)
- [Customizing the widget](#customizing-the-widget)
- [Not using React](#not-using-react-the-http-contract)
- [About the Allways Access API](#about-the-allways-access-api)
- [Safety](#safety)
- [Costs and limits](#costs-and-limits)
- [Troubleshooting](#troubleshooting)

---

## Install it with one prompt

Paste this into your coding agent (Claude Code, Cursor, Codex, …) from the root of your site's repo, with the brackets filled in:

```text
Add the Allways tip jar to this site using the npm package @venturalabs.ai/allways-tip-jar.

Read its README in full first, then follow its "Install steps" section exactly:
https://github.com/e35VenturaLabs/allways-access-api-widgets/tree/main/tip-jar
(After installing, the same README is at node_modules/@venturalabs.ai/allways-tip-jar/README.md.)

- Tips should arrive as: [TAO or SOL]
- My payout address: [your TAO or SOL address]
- Where the trigger goes: [e.g. a "Tip jar" link in the footer]

Never write my API key or Turnstile secret into code, config files or chat. When you're done,
list which secrets and variables I still need to set, and where.
```

The agent does the code. You still have to create the API key, the Turnstile widget and, on some hosts, a small key-value store. See [Before you start](#before-you-start).

---

## How it works

```
Visitor's browser                Your server route (/api/tip)            Allways Access API
─────────────────                ────────────────────────────            ──────────────────
open the jar     ── options ──▶  list coins miners are swapping   ──▶   /v1/currencies, /v1/rate
type an amount   ── quote ────▶  live min/max + what it buys      ──▶   /v1/rate
"Get address"    ── POST ─────▶  captcha ✓ region ✓ budget ✓       ──▶   POST /v1/exchanges  (1 credit)
                 ◀─ deposit address + exact amount + countdown
send the coins from their own wallet  ─────────────────────────────────▶  miner swaps it into your coin
poll every 3s    ── status ───▶                                    ──▶   GET /v1/exchanges/:id
                 ◀─ "Got it. Thanks!!"                                    TAO/SOL lands at your payout address
```

- **Two halves.** The **server route** holds your API key and pins your payout address. The **widget** only ever talks to that route. The browser never sees the key, and a visitor can't redirect where tips go.
- **Paying in your own coin skips the swap.** If a visitor picks your payout coin, the widget just shows your address. There's no swap and no credit.
- **Only live coins are offered.** The coin list and each coin's min/max come from the API every time the jar opens, so it adapts on its own as miners come and go and new chains are added.
- **The visitor must send from the wallet they entered.** Allways matches the deposit to that sender address, and refunds go back to it.

### What the package exports

| Import | Use it for |
|---|---|
| `@venturalabs.ai/allways-tip-jar/react` | `<TipJar>` (styles included), the headless `useTipJar()` hook, `defaultCopy` |
| `@venturalabs.ai/allways-tip-jar/cloudflare-pages` | The whole server route on Cloudflare Pages (`onRequest`) |
| `@venturalabs.ai/allways-tip-jar/next` | The whole server route on Next.js App Router (`GET`, `POST`) |
| `@venturalabs.ai/allways-tip-jar/server` | `createTipHandler()` for any other host, plus `memoryBudget()` and `upstashBudget()` |
| `@venturalabs.ai/allways-tip-jar/styles.css` | Optional. Only for `<TipJar unstyled>` under a strict content security policy. |
| `@venturalabs.ai/allways-tip-jar/types` | Wire types shared by both halves |

React 18 or newer is a peer dependency, needed only for `/react`. The TypeScript source ships in `src/` too, if you'd rather copy it into your project and change it freely.

---

## Why there's a server route

A browser-only tip jar isn't possible with the Allways Access API as it works today, and it isn't safe to fake one. The route does four things that can't be done in the browser:

1. **It keeps the API key secret.** Creating an exchange needs your key, and the key spends your credits. Anything shipped to a browser is public: a key in your JavaScript bundle can be copied from dev tools in seconds and used to drain your credits from anywhere.
2. **It pins where tips land.** The payout address is set on the server. If the browser chose it, anyone could edit the request and send "your" tips to themselves using your credits.
3. **It enforces the safeguards.** The captcha check, the per-visitor and daily spend caps, and the region fence only mean something when they run somewhere the visitor can't edit. A check in the browser is a suggestion.
4. **It hides operator problems.** An invalid key or an empty balance shows visitors "closed", and your credit top-up address never leaves the server.

It's also why the route is small: it adds no features of its own, only the parts that have to be trusted. What would remove it is an API change, not a widget change: a browser-safe "publishable" key locked by Allways to one payout address, with the captcha and spend limits enforced on Allways' side. Until that exists, keep the route.

---

## Before you start

These need a human. An agent can't do them for you.

1. **An Allways Access API key.** Sign in at [all-ways.io/api-access](https://all-ways.io/api-access), accept the [Terms](https://docs.all-ways.io/terms), and press **Generate key**. It's shown once, so store it now. It looks like `alw_live_…`. (API access may be invite-only for a while; the page says so if it is.)
2. **Credits on that account.** Every "Get address" that succeeds costs one credit (see [Costs](#costs-and-limits)). Accounts that sign in with Google or GitHub get 2 free credits. To top up, call `GET /v1/account` with your key and send TAO to the `depositAddress` it returns. The same call shows `taoPerCredit` and `minTopUpTao`.
3. **A payout address** for the coin you want tips in:
   - `tao`, a Bittensor address (`5…`). This is the default.
   - `sol`, a Solana address.

   Every other Allways coin pairs with both of these hubs, so either gives visitors the full coin list.
4. **A Cloudflare Turnstile widget** (free, and it works on any host, not just Cloudflare). In the Cloudflare dashboard go to **Turnstile → Add widget**, add your domain, and choose **Invisible** or **Managed**. You get a public **site key** and a private **secret**. Without this, bots could burn your credits.
5. **A shared counter store**, which the route uses to cap how many addresses it hands out:
   - **Cloudflare Pages:** a KV namespace, one command.
   - **Next.js in production:** a free [Upstash Redis](https://upstash.com) database, which gives you two environment variables. `next dev` needs nothing.
   - **A single long-running Node server:** nothing; use the built-in in-memory store.

---

## Install steps

Follow these in order. They're written for an agent, but people can follow them too.

### 1. Look at the project

- **Framework:** React (Vite, Next.js, Remix, Astro with React, …) or something else. The widget is React. For any other framework, use the server route and see [Not using React](#not-using-react-the-http-contract).
- **Host:** Cloudflare Pages, Next.js (on Vercel or elsewhere), or anything else with a server. This decides which [hosting recipe](#hosting-recipes) to use.
- **Package manager:** npm, pnpm, yarn or bun. Use whichever the lockfile says.

### 2. Install the package

```bash
npm install @venturalabs.ai/allways-tip-jar
```

### 3. Add the server route

It must answer **`/api/tip`** and every sub-path under it (`/api/tip/options`, `/api/tip/quote`, `/api/tip/<id>`).

| Host | File | Contents |
|---|---|---|
| Cloudflare Pages | `functions/api/tip/[[path]].ts` | `export { onRequest } from "@venturalabs.ai/allways-tip-jar/cloudflare-pages";` |
| Next.js (App Router) | `app/api/tip/[[...path]]/route.ts` | `export { GET, POST } from "@venturalabs.ai/allways-tip-jar/next";` |
| Anything else | your server | `createTipHandler()`, see [Hosting recipes](#hosting-recipes) |

To mount it somewhere other than `/api/tip`, set `TIP_BASE_PATH` on the server and pass the same path as `endpoint` to the widget.

The route closes itself unless it has an API key, a counter store, the visitor's location and a Turnstile secret. **Don't disable any of these to get past an error.** Each missing one closes the jar on purpose (see [Safety](#safety)).

### 4. Render the widget

Put the trigger where the user asked for it. Keep `<TipJar>` mounted and toggle `open`, so a tip in progress survives closing and reopening the modal. There's no stylesheet to import; the component brings its own.

```tsx
import { useState } from "react";
import { TipJar } from "@venturalabs.ai/allways-tip-jar/react";

export function TipJarLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Tip jar</button>
      <TipJar
        open={open}
        onClose={() => setOpen(false)}
        turnstileSiteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY} // Next.js: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        defaultCoin="sol"
      />
    </>
  );
}
```

In Next.js, the widget already carries `"use client"`.

Match the site's look through the CSS variables (see [Customizing](#customizing-the-widget)). Don't fork the component.

### 5. Wire up local development

- **Vite plus Cloudflare Pages:** run the functions with `npx wrangler pages dev dist --kv TIP_RATE --port 8788`, and proxy `/api/tip` to it in `vite.config.ts` with `server: { proxy: { "/api/tip": "http://127.0.0.1:8788" } }`.
- **Next.js:** `next dev` serves the route. A local machine has no geo headers, so set `TIP_SKIP_GEO=1` in `.env.local`. It's ignored in production.
- **Captcha:** you can leave the Turnstile secret unset and set `TIP_SKIP_CAPTCHA=1` locally. Never do this in production.

### 6. Set the variables and secrets

Use the [Environment variables](#environment-variables) table. Secrets go into the host's secret store, and into a gitignored local file such as `.dev.vars` or `.env.local`. **Never** put them in committed files. Public values (the payout address and coin, the Turnstile site key) can go in committed config.

### 7. Verify

These checks cost nothing:

```bash
curl -s https://<site>/api/tip/options                    # 200 with a coins list and your payout address
curl -s "https://<site>/api/tip/quote?from=sol"           # 200 with minFromAmount / maxFromAmount
curl -s "https://<site>/api/tip/quote?from=sol&amount=0.2" # toAmount is set when 0.2 is inside the range
```

Open the jar: coins should load and the amount should prefill just above the minimum. **Don't press "Get address" as a test unless you're ready to pay.** It spends a credit, and you only get it back if the lock fails.

### 8. Report back

Tell the user which secrets and variables still need values, where each one goes, and anything you couldn't wire up.

---

## Environment variables

The Cloudflare and Next.js adapters read these names. With `createTipHandler()` you pass the same values yourself (`optionsFromEnv(env)` maps them).

| Name | Kind | Required | Default | What it does |
|---|---|---|---|---|
| `ALLWAYS_API_KEY` | **secret** | yes | none | Allways Access API key (`alw_live_…`) |
| `TIP_PAYOUT_ADDRESS` | public | yes | none | Where tips land, on the payout coin |
| `TIP_PAYOUT_COIN` | public | no | `tao` | Coin tips arrive as: `tao` or `sol` |
| `TURNSTILE_SECRET` | **secret** | in production | none | Turnstile secret key, checked on every lock |
| `TIP_RATE` | KV binding | Cloudflare | none | KV namespace for the counters |
| `UPSTASH_REDIS_REST_URL` | public | Next.js production | none | Upstash Redis REST URL for the counters |
| `UPSTASH_REDIS_REST_TOKEN` | **secret** | Next.js production | none | Upstash Redis REST token |
| `TIP_MAX_PER_IP_HOUR` | public | no | `3` | Most addresses one visitor IP can get per hour |
| `TIP_MAX_PER_DAY` | public | no | `50` | Most addresses everyone together can get per UTC day |
| `TIP_GEO_BLOCK_COUNTRIES` | public | no | `CU,IR,KP,SY,RU,BY` | Countries that can't lock (ISO 3166-1) |
| `TIP_GEO_BLOCK_REGIONS` | public | no | `UA-43,UA-40,UA-14,UA-09,US-NY` | Regions that can't lock (ISO 3166-2) |
| `TIP_BASE_PATH` | public | no | `/api/tip` | Where the route is mounted |
| `ALLWAYS_API_URL` | public | no | `https://api-allways.venturalabs.ai` | API base URL, without `/v1` |
| `TIP_SKIP_CAPTCHA` | local only | no | none | `1` locks without a captcha when no secret is set |
| `TIP_SKIP_GEO` | local only | no | none | Next.js: `1` skips the region check outside production |
| `VITE_TURNSTILE_SITE_KEY` or `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public (client build) | in production | none | Turnstile site key, passed to `<TipJar turnstileSiteKey>` |

---

## Hosting recipes

### Cloudflare Pages

1. Create `functions/api/tip/[[path]].ts`:
   ```ts
   export { onRequest } from "@venturalabs.ai/allways-tip-jar/cloudflare-pages";
   ```
2. Create the counter namespace with `npx wrangler kv namespace create TIP_RATE` and bind it in `wrangler.jsonc`. See [`examples/cloudflare-pages/wrangler.jsonc`](examples/cloudflare-pages/wrangler.jsonc).
3. Put `TIP_PAYOUT_ADDRESS` and `TIP_PAYOUT_COIN` under `vars`.
4. Set the secrets:
   ```bash
   npx wrangler pages secret put ALLWAYS_API_KEY --project-name <project>
   npx wrangler pages secret put TURNSTILE_SECRET --project-name <project>
   ```
5. Set `VITE_TURNSTILE_SITE_KEY` wherever your client build reads it, for example `.env.production`.

Visitor location comes from `request.cf` automatically.

### Next.js (App Router, on Vercel or any host)

1. Create `app/api/tip/[[...path]]/route.ts`:
   ```ts
   export { GET, POST } from "@venturalabs.ai/allways-tip-jar/next";
   ```
2. In production, create a free Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. On Vercel, the Upstash integration sets both for you.
3. Set `ALLWAYS_API_KEY`, `TURNSTILE_SECRET`, `TIP_PAYOUT_ADDRESS`, `TIP_PAYOUT_COIN` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

Visitor location comes from Vercel's `x-vercel-ip-country` headers, or Cloudflare's `cf-ipcountry` when the site sits behind Cloudflare's proxy. On a Next.js host with neither, write the route with `createTipHandler()` and your own `getLocation`.

### Anything else (`createTipHandler`)

`createTipHandler(options)` returns a standard `(Request) => Promise<Response>`. It runs anywhere with `fetch`: Cloudflare Workers, Deno, Bun, Netlify, and Node 18+. Here it is in Express:

```ts
import express from "express";
import { createTipHandler, memoryBudget, optionsFromEnv } from "@venturalabs.ai/allways-tip-jar/server";

const handler = createTipHandler({
  ...optionsFromEnv(process.env),
  budget: memoryBudget(), // one process only; use upstashBudget({ url, token }) if you run several
  // Behind Cloudflare's proxy you get country headers for free. Otherwise use a GeoIP lookup.
  getLocation: (request) => ({ country: request.headers.get("cf-ipcountry"), region: null }),
  getClientIp: (request) => request.headers.get("cf-connecting-ip"),
});

const app = express();
app.use("/api/tip", express.text({ type: "*/*" }));
app.all(["/api/tip", "/api/tip/*"], async (req, res) => {
  const response = await handler(
    new Request(`${req.protocol}://${req.get("host")}${req.originalUrl}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === "POST" ? req.body : undefined,
    }),
  );
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.send(await response.text());
});
```

Only trust a forwarded IP header when your own proxy sets it. Otherwise visitors can fake it to dodge the per-IP cap.

### `createTipHandler` options

| Option | Default | Notes |
|---|---|---|
| `apiKey` | none | Required |
| `payoutAddress` | none | Required |
| `payoutCoin` | `"tao"` | Any Allways currency id; `tao` or `sol` gives the full coin list |
| `budget` | none | Required to lock. `memoryBudget()`, `upstashBudget({ url, token })`, or anything with `get(key)` and `put(key, value, ttlSeconds)` |
| `maxPerIpHour` / `maxPerDay` | `3` / `50` | |
| `turnstileSecret` | none | Required to lock unless `skipCaptcha` |
| `skipCaptcha` | `false` | Local development only |
| `getLocation` | none | Returns `{ country, region }`. Required to lock unless `geoBlock: false` |
| `geoBlock` | Allways' list | `{ countries?, regions? }` replaces the lists. `false` turns the fence off, and you take on that compliance decision |
| `getClientIp` | `cf-connecting-ip`, then `x-real-ip` | |
| `basePath` | `"/api/tip"` | Must match where the route is mounted |
| `apiUrl` | `https://api-allways.venturalabs.ai` | |
| `fetch` | global `fetch` | Inject one for tests or special runtimes |

---

## Customizing the widget

You can make the jar look like anything. Out of the box it wears the Allways Access look (warm off-white, Allways blue, Inter and DM Mono), and there are four levels of control, from a colour tweak to your own UI.

**1. Built-in themes.** `theme="light"` (the default), `theme="dark"`, or `theme="auto"` to follow the visitor's system setting.

**2. Variables.** Override any of these from your own stylesheet. The defaults use zero specificity, so a plain `.tipjar` selector always wins:

```css
.tipjar {
  --tipjar-bg: #0b0b0f;           /* dialog background */
  --tipjar-fg: #f2f2f2;           /* text */
  --tipjar-muted: #9a9aa3;        /* labels, hints */
  --tipjar-subtle: #16161c;       /* address and amount boxes */
  --tipjar-border: #2a2a33;
  --tipjar-accent: #f2f2f2;       /* button, links */
  --tipjar-accent-fg: #0b0b0f;    /* button text */
  --tipjar-error: #ff6b6b;
  --tipjar-backdrop: rgba(0, 0, 0, 0.6);
  --tipjar-shadow: none;
  --tipjar-radius: 4px;           /* the dialog */
  --tipjar-radius-control: 4px;   /* inputs, buttons */
  --tipjar-font: "Your Font", system-ui, sans-serif;
  --tipjar-mono: "Your Mono", monospace;
}
```

The widget doesn't load web fonts. Inter and DM Mono show up if your site already loads them, and system fonts stand in otherwise.

**3. Classes.** Every element has a `tipjar__…` class (`tipjar__button`, `tipjar__input`, `tipjar__title`, `tipjar__copyable`, …), and `className` adds your own class to the dialog. Any rule you write beats the defaults, including Tailwind utilities through `@apply`. The QR code always sits on white so it scans.

**4. Start from nothing.** `unstyled` drops the built-in CSS completely, so only your styles apply. Or skip the component and build your own UI on the `useTipJar()` hook (see below).

**Wording.** Override any string with `copy`:

```tsx
<TipJar
  open={open}
  onClose={close}
  copy={{ title: "Buy me a coffee", thanks: "You're the best." }}
/>
```

`defaultCopy` lists every key. The rate-limit, captcha and region messages come from the server route.

**Strict content security policy.** If your CSP blocks inline styles, either pass `nonce={yourNonce}`, or pass `unstyled` and load `@venturalabs.ai/allways-tip-jar/styles.css` as a normal stylesheet.

**Your own UI.** `useTipJar({ endpoint, active, defaultCoin })` returns every piece of state (`phase`, `options`, `coin`, `amount`, `quote`, `tip`, `secondsLeft`, `expired`, …) and every action (`pickCoin`, `setAmount`, `setFromAddress`, `submit(captchaToken)`, `reset`). Render it with shadcn/ui, MUI, Chakra, or anything else. [`src/react/TipJar.tsx`](src/react/TipJar.tsx) is a complete worked example, and `Turnstile` is exported for your own form.

**Props:** `open`, `onClose`, `endpoint` (default `/api/tip`), `turnstileSiteKey`, `defaultCoin`, `copy`, `className`, `theme` (`light` · `dark` · `auto`), `unstyled`, `nonce`.

Please keep the "Powered by Allways" line.

---

## Not using React: the HTTP contract

The server route works with any framework. Build the UI in Vue, Svelte or plain JavaScript against these four calls. Types are in `@venturalabs.ai/allways-tip-jar/types`.

| Call | Returns |
|---|---|
| `GET /api/tip/options` | `TipOptions`: `{ coins: [{ id, symbol, network, minFromAmount?, maxFromAmount? }], payoutCoin, payoutAddress }`. The first coin is the payout coin, paid directly with no min/max. |
| `GET /api/tip/quote?from=sol[&amount=0.2]` | `TipQuote`: `{ minFromAmount, maxFromAmount, toAmount }`. `toAmount` is `null` without an amount or when the amount is out of range. |
| `POST /api/tip` with body `{ from, amount, fromAddress, captcha }` | `201 Tip`. **Spends one credit.** |
| `GET /api/tip/:id` | `Tip`: `{ id, status, from, fromAmount, depositAddress, validUntil, reason, refundedTo }` |

Every error is `{ code, message, … }`. Show `message` for `too_many`, `captcha` and `geo_blocked`. For `amount_too_low` / `amount_too_high`, show the returned `minFromAmount`/`maxFromAmount`. For `validation` with `field: "fromAddress"`, say the address looks wrong. Show a generic "try again later" for everything else, including `jar_closed`.

**Screens, driven by `status`:**

| Status | Show |
|---|---|
| none yet | Form: coin, amount (prefill about 2% above the minimum, since the rate drifts), sender address, "Get address" |
| `pending`, or `depositAddress` still null | "Generating address…" (up to about 30 s). Poll `GET /api/tip/:id` every 3 s. |
| `awaiting_deposit` | "Send exactly `fromAmount` to `depositAddress` from `<fromAddress>` within `validUntil − now`", with a QR of the plain address. Keep polling. |
| `confirming` / `exchanging` / `finished`, or `refunded` with `refundedTo: "jar"` | Thanks. The tip is on its way, and the visitor has nothing left to do. |
| `refunded` with `refundedTo: "you"` | The swap failed and the visitor was refunded (currently with a 10% bonus). |
| `failed` with `reason` `pool_lost` or `reserve_rejected` | The address expired before it was ready. Nothing was sent, so try again. |
| `failed` with `reason` `deposit_lapsed` | Time ran out before a payment arrived |
| `failed`, anything else | Something went wrong. If they already sent funds, they should get in touch. |

Show amounts to 5 decimals, round the minimum **up** and the maximum **down**, so a suggested amount is always really inside the range.

---

## About the Allways Access API

The tip jar is a thin client for the public [Allways Access API](https://api-allways.venturalabs.ai/v1/docs). A few things worth knowing:

- **One account serves all your visitors.** Every tip comes out of your account's credits and counts toward your account's rate limits. Visitors never sign up for anything.
- **The API runs its own checks on every exchange.** It screens both addresses against sanctions lists, and it applies its region rules to **the IP that calls it, which is your server**. Host your route in an allowed region (for example, not a New York data center), or every tip will fail with `geo_blocked`. The route's own region check covers the visitor.
- **Your key is bound by the Terms you accepted** when you generated it ([docs.all-ways.io/terms](https://docs.all-ways.io/terms)).
- **Rate limits are per account:** 10 new exchanges a minute, 300 status reads a minute. The public quote endpoints allow 60 a minute per server IP, which the route stays under by caching.

---

## Safety

The route refuses to spend credits unless every safeguard is in place. When one is missing, the visitor sees "The tip jar is closed for a moment" and your server log gets a line saying why (`tip jar closed: …`).

- **The key stays on the server.** The browser never receives the API key, other addresses, or transaction hashes.
- **The payout address is fixed on the server.** Visitors can't change where tips go.
- **Captcha.** Every lock needs a valid Turnstile token.
- **Spend cap.** By default, 3 addresses per IP per hour and 50 per day overall. Only successful locks count, so a visitor who retries after a lost race keeps their allowance. The count is best-effort, so a burst across instances can go a credit or two over.
- **Region fence.** Defaults to Allways Access's own blocked list, checked against the visitor's location. A request with no known country counts as blocked. Turning the fence off (`geoBlock: false`) makes compliance your decision.
- **Operator problems stay private.** An invalid key or an empty credit balance shows visitors "closed", never your top-up address.

---

## Costs and limits

- **A credit per lock.** Each successful "Get address" costs one Allways credit, whether or not the visitor pays. The credit comes back if the lock fails (`pool_lost`, `reserve_rejected`, `claim_stale`, `dest_unpayable`) or the swap is refunded. It's kept on `deposit_lapsed`, when the visitor locked but never paid. Check the live price with `taoPerCredit` on `GET /v1/account`.
- **Paying in your own coin** costs nothing and involves no swap.
- **Swap fee.** 1%, taken out of the rate. `toAmount` is already net of it.
- **Minimums and maximums** are set network-wide by Allways and by each miner's collateral, not by this widget. For example, 0.1 SOL for SOL payers. The widget always shows the live range.
- **Visitors pay their own network fees** on top of the exact amount.
- **Refunds.** If a miner fails to deliver, Allways pays out 1.1× in the swap's backing asset. When that lands at your payout address, the tip still arrived and the widget thanks the visitor. Otherwise it goes to the visitor's address.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Jar says "closed", with `tip jar closed: apiKey or payoutAddress is not set` in the log | A secret or variable is missing in this environment |
| `… no budget store …` | Cloudflare: bind `TIP_RATE`. Next.js production: set the two `UPSTASH_REDIS_REST_*` variables. |
| `… no getLocation …` | Your custom route isn't passing visitor location. Add `getLocation`. |
| `tip jar: no visitor country on this request` | The host sends no geo headers (common locally). Next.js dev: `TIP_SKIP_GEO=1`. |
| `… no turnstileSecret …` | Set `TURNSTILE_SECRET` in production, or `TIP_SKIP_CAPTCHA=1` locally |
| `… create answered 401` | The API key is wrong or was regenerated |
| `… create answered 402 insufficient_balance` | Out of credits. Top up via `GET /v1/account`. |
| Every tip fails with "Tips aren't available in your region" in production | Your server is in a region the API blocks. Move the route's hosting region (see [About the API](#about-the-allways-access-api)). |
| `… payoutCoin "x" is not an Allways currency` | `TIP_PAYOUT_COIN` is misspelled. Ids are lowercase (`tao`, `sol`). |
| The coin list only shows your payout coin | No miner is quoting right now, or `/options` is failing. Check it with curl. |
| Every lock says "The human check didn't go through" | The site key and secret come from different Turnstile widgets, or the domain isn't added to the widget |
| The modal is unstyled | `unstyled` is set, or a CSP blocked the inline style. Pass `nonce`, or load `styles.css`. |
| 404 on `/api/tip/options` | The route doesn't match sub-paths (use the catch-all file names above), or `TIP_BASE_PATH` differs from the mount path |

API reference: [`https://api-allways.venturalabs.ai/v1/docs`](https://api-allways.venturalabs.ai/v1/docs) · machine-readable: [`/v1/llms.txt`](https://api-allways.venturalabs.ai/v1/llms.txt), [`/v1/openapi.json`](https://api-allways.venturalabs.ai/v1/openapi.json)

## License

[MIT](LICENSE) © Ventura Labs
