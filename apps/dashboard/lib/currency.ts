// All money in the database is US dollars. The display currency is a setting;
// rupees are dollars times the configured rate.

export type Currency = "USD" | "INR";

export interface CurrencyConfig {
  currency: Currency;
  usdToInr: number;
}

export const DEFAULT_CURRENCY: CurrencyConfig = { currency: "USD", usdToInr: 83 };

export function convert(usd: number, cfg: CurrencyConfig): number {
  return cfg.currency === "INR" ? usd * cfg.usdToInr : usd;
}

export function symbol(cfg: CurrencyConfig): string {
  return cfg.currency === "INR" ? "₹" : "$";
}

/** "₹12,450.00" or "$150.00". Rupees use Indian digit grouping (12,34,567). */
export function formatMoney(usd: number | string | null | undefined, cfg: CurrencyConfig, digits = 2): string {
  const n = Number(usd);
  if (usd === null || usd === undefined || !Number.isFinite(n)) return "-";
  const v = convert(n, cfg);
  const body = v.toLocaleString(cfg.currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${symbol(cfg)}${body}`;
}

/** Compact form for big dashboard numbers: ₹1.2L / ₹3.4Cr, or $1.2K / $3.4M. */
export function formatCompact(usd: number, cfg: CurrencyConfig): string {
  const v = convert(usd, cfg);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const s = symbol(cfg);
  const f = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (cfg.currency === "INR") {
    if (abs >= 1e7) return `${sign}${s}${f(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${sign}${s}${f(abs / 1e5)}L`;
    if (abs >= 1e3) return `${sign}${s}${f(abs / 1e3)}K`;
  } else {
    if (abs >= 1e9) return `${sign}${s}${f(abs / 1e9)}B`;
    if (abs >= 1e6) return `${sign}${s}${f(abs / 1e6)}M`;
    if (abs >= 1e3) return `${sign}${s}${f(abs / 1e3)}K`;
  }
  return `${sign}${s}${f(abs)}`;
}
