// Amounts are shown to five decimals, and never rounded outward: a minimum rounds up and a
// maximum down, so every amount the range suggests is still inside the real one.
const DECIMALS = 5;

export function formatAmount(value: string, mode: "up" | "down"): string {
  const [whole, frac = ""] = value.split(".");
  if (frac.length <= DECIMALS) return value;
  const rest = frac.slice(DECIMALS);
  const digits =
    BigInt(whole + frac.slice(0, DECIMALS)) +
    (mode === "up" && /[1-9]/.test(rest) ? BigInt(1) : BigInt(0));
  const padded = digits.toString().padStart(DECIMALS + 1, "0");
  const out = `${padded.slice(0, -DECIMALS)}.${padded.slice(-DECIMALS)}`;
  return out.replace(/0+$/, "").replace(/\.$/, "");
}

// A little above the minimum: the range drifts with the rate between quote and lock.
export const suggestedAmount = (min: string) =>
  formatAmount((Number(min) * 1.02).toFixed(12), "up");

export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export const shorten = (address: string) =>
  address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
