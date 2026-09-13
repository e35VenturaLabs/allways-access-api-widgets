import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { Tip } from "../src/shared/types.js";
import { TipJar } from "../src/react/TipJar.js";
import { defaultCopy, describeError, endedMessage } from "../src/react/copy.js";
import { clock, formatAmount, shorten, suggestedAmount } from "../src/react/format.js";
import { STYLE_ELEMENT_ID, css, ensureStyles } from "../src/react/styles.js";

describe("formatAmount", () => {
  it("never rounds a range outward", () => {
    expect(formatAmount("0.00030084", "up")).toBe("0.00031");
    expect(formatAmount("0.00589999", "down")).toBe("0.00589");
    expect(formatAmount("0.1", "up")).toBe("0.1");
    expect(formatAmount("5.000000", "down")).toBe("5");
  });

  it("suggests a little above the minimum", () => {
    expect(suggestedAmount("0.1")).toBe("0.102");
  });

  it("formats the countdown and addresses", () => {
    expect(clock(588)).toBe("9:48");
    expect(clock(5)).toBe("0:05");
    expect(shorten("ER9Jt5SBfn4PDew7NPVi9gvF2cAqoMRd6dhGTLLCQhE5")).toBe("ER9Jt5…QhE5");
    expect(shorten("short")).toBe("short");
  });
});

describe("copy", () => {
  const tip = (over: Partial<Tip>): Tip => ({
    id: "id",
    status: "failed",
    from: "sol",
    fromAmount: "0.102",
    depositAddress: null,
    validUntil: null,
    reason: null,
    refundedTo: null,
    ...over,
  });

  it("thanks once the deposit is seen, or when a refund landed in the jar", () => {
    expect(endedMessage(tip({ status: "confirming" }))).toBe(defaultCopy.thanks);
    expect(endedMessage(tip({ status: "refunded", refundedTo: "jar" }))).toBe(defaultCopy.thanks);
  });

  it("explains each way a tip can end", () => {
    expect(endedMessage(tip({ status: "refunded", refundedTo: "you" }))).toBe(defaultCopy.refunded);
    expect(endedMessage(tip({ reason: "pool_lost" }))).toBe(defaultCopy.expiredBeforeReady);
    expect(endedMessage(tip({ reason: "deposit_lapsed" }))).toBe(defaultCopy.depositLapsed);
    expect(endedMessage(tip({ reason: "claim_stale" }))).toBe(defaultCopy.swapFailed);
  });

  it("only gives visitors errors they can act on", () => {
    expect(describeError({ code: "amount_too_low", message: "", minFromAmount: "0.1", maxFromAmount: "5" }, "SOL")).toBe(
      "Send between 0.1 and 5 SOL.",
    );
    expect(describeError({ code: "validation", message: "", field: "fromAddress" }, "SOL")).toBe(
      "That doesn't look like a SOL address.",
    );
    expect(describeError({ code: "too_many", message: "Slow down." }, "SOL")).toBe("Slow down.");
    expect(describeError({ code: "jar_closed", message: "internal detail" }, "SOL")).toBe(defaultCopy.generic);
  });
});

describe("styles", () => {
  it("injects once, first in <head>, with the nonce", () => {
    const children: { id: string; nonce?: string; textContent?: string }[] = [{ id: "site-css" }];
    const doc = {
      getElementById: (id: string) => children.find((c) => c.id === id) ?? null,
      createElement: () => ({ id: "" }),
      head: { prepend: (el: (typeof children)[number]) => children.unshift(el) },
    } as unknown as Document;
    ensureStyles(doc, "abc");
    ensureStyles(doc, "abc");
    expect(children).toHaveLength(2);
    expect(children[0]).toMatchObject({ id: STYLE_ELEMENT_ID, nonce: "abc", textContent: css });
  });
});

describe("<TipJar>", () => {
  it("renders on the server without touching the browser", () => {
    const html = renderToString(<TipJar open={false} onClose={() => {}} copy={{ title: "Tip me" }} />);
    expect(html).toContain('class="tipjar"');
    expect(html).toContain('data-theme="light"');
    expect(html).toContain("Tip me");
    expect(html).toContain("Powered by");
  });

  it("takes the theme and extra classes", () => {
    const html = renderToString(<TipJar open={false} onClose={() => {}} theme="auto" className="mine" />);
    expect(html).toContain('class="tipjar mine"');
    expect(html).toContain('data-theme="auto"');
  });
});

describe("default theme", () => {
  it("keeps every theme rule overridable by a plain class selector", () => {
    const selectors = css
      .replace(/\/\*.*?\*\//gs, "")
      .match(/^[^{}@\n][^{}]*(?=\{)/gm)
      ?.map((s) => s.trim())
      .filter((s) => s && !/^(from|to|\d+%)$/.test(s));
    expect(selectors?.length).toBeGreaterThan(20);
    for (const selector of selectors ?? []) expect(selector).toMatch(/^:where\(/);
  });
});
