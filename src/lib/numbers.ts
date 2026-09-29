const SUFFIXES: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };

// Expands shorthand like "2.5M" into "2,500,000". Returns null when there is no suffix.
export function expandSuffix(value: string): string | null {
  const suffix = ["k", "m", "b"].find((s) => value.toLowerCase().includes(s));
  if (!suffix) return null;

  const digits = value.replace(new RegExp(suffix, "gi"), "").replaceAll(",", "");
  const expanded = Math.round(parseFloat(digits) * SUFFIXES[suffix]);
  return Number.isNaN(expanded) ? digits : expanded.toLocaleString("en-US");
}

export function parseNumber(value: string): number {
  return Number(value.replace(/,/g, ""));
}

export function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const compactFormatter = new Intl.NumberFormat("en", { notation: "compact" });

export function scoreToClass(score: number | string): string {
  const value = Number(score);
  if (Number.isNaN(value)) return "NO";
  if (value > 1750) return "S";
  if (value > 1450) return "A";
  if (value > 1250) return "B";
  if (value > 1100) return "C";
  return "D";
}

/** Token counts: full digits up to 99,999, then compact (123K, 1.2M). */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value < 100_000 ? Math.round(value).toLocaleString("en-US") : compactFormatter.format(value);
}
